"""FastAPI backend: client accounts, saved GHL locations, and a proxy to the GHL v2 API.

GHL tokens are stored encrypted and only ever decrypted server-side; the
browser refers to a saved location by its row id.
"""

import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import Cookie, Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _db import get_db  # noqa: E402
from _security import (  # noqa: E402
    SESSION_COOKIE,
    SESSION_DAYS,
    InvalidToken,
    decrypt,
    encrypt,
    hash_password,
    make_session,
    read_session,
    verify_password,
)

GHL_BASE = "https://services.leadconnectorhq.com"
GHL_VERSION = "2021-07-28"
MAX_BATCH = 25
CONCURRENCY = 5
MAX_RETRIES = 5
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = FastAPI(title="GHL Contact Importer", docs_url=None, redoc_url=None, openapi_url=None)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- GHL helpers

def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token.strip()}",
        "Version": GHL_VERSION,
        "Accept": "application/json",
    }


def _error_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return f"HTTP {resp.status_code}"
    msg = body.get("message") or body.get("error") or body.get("msg")
    if isinstance(msg, list):
        msg = "; ".join(str(m) for m in msg)
    return str(msg) if msg else f"HTTP {resp.status_code}"


async def _ghl(client: httpx.AsyncClient, method: str, path: str, token: str, **kwargs) -> httpx.Response:
    """Call GHL, retrying on rate limits (429) and transient server errors."""
    resp = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.request(method, GHL_BASE + path, headers=_headers(token), **kwargs)
        except httpx.TransportError:
            if attempt == MAX_RETRIES - 1:
                raise
            await asyncio.sleep(min(2**attempt, 10))
            continue
        if resp.status_code == 429 or resp.status_code >= 500:
            retry_after = resp.headers.get("Retry-After")
            try:
                wait = float(retry_after) if retry_after else min(2**attempt, 10)
            except ValueError:
                wait = min(2**attempt, 10)
            await asyncio.sleep(wait)
            continue
        return resp
    return resp


def _raise_for_auth(resp: httpx.Response, what: str) -> None:
    if resp.status_code == 401:
        raise HTTPException(422, "GHL rejected the token, or it doesn't belong to this Location ID.")
    if resp.status_code == 403:
        raise HTTPException(422, f"Token is missing the scope needed to read {what}. {_error_message(resp)}")
    if resp.status_code >= 400:
        raise HTTPException(502, f"Couldn't load {what}: {_error_message(resp)}")


async def _fetch_account(location_id: str, token: str) -> dict:
    """Validate credentials and return the location's tags and contact custom fields."""
    async with httpx.AsyncClient(timeout=30) as client:
        tags_resp, fields_resp = await asyncio.gather(
            _ghl(client, "GET", f"/locations/{location_id}/tags", token),
            _ghl(client, "GET", f"/locations/{location_id}/customFields", token, params={"model": "contact"}),
        )
    _raise_for_auth(tags_resp, "tags (View Tags)")
    _raise_for_auth(fields_resp, "custom fields (View Custom Fields)")

    tags = sorted({t["name"] for t in tags_resp.json().get("tags", []) if t.get("name")}, key=str.lower)
    custom_fields = [
        {
            "id": f["id"],
            "name": f.get("name") or f.get("fieldKey") or f["id"],
            "fieldKey": f.get("fieldKey", ""),
            "dataType": f.get("dataType", "TEXT"),
        }
        for f in fields_resp.json().get("customFields", [])
        if f.get("id")
    ]
    custom_fields.sort(key=lambda f: f["name"].lower())
    return {"tags": tags, "customFields": custom_fields}


# ---------------------------------------------------------------- auth

def current_user(session: str | None = Cookie(None, alias=SESSION_COOKIE)) -> str:
    user_id = read_session(session)
    if not user_id:
        raise HTTPException(401, "Please sign in.")
    return user_id


def _set_session(response: Response, user_id: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        make_session(user_id),
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=bool(os.environ.get("VERCEL")),
        samesite="lax",
        path="/",
    )


def _me(user_id: str) -> dict:
    with get_db() as db:
        user = db.one("SELECT email FROM users WHERE id = %s", (user_id,))
        if not user:
            raise HTTPException(401, "Please sign in.")
        locations = db.all(
            "SELECT id, location_id, name FROM locations WHERE user_id = %s "
            "ORDER BY COALESCE(last_used_at, created_at) DESC",
            (user_id,),
        )
    return {
        "email": user["email"],
        "locations": [{"id": l["id"], "locationId": l["location_id"], "name": l["name"]} for l in locations],
    }


class Credentials(BaseModel):
    email: str = Field(..., max_length=254)
    password: str = Field(..., max_length=200)


@app.post("/api/auth/signup")
def signup(body: Credentials, response: Response):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters.")
    user_id = str(uuid.uuid4())
    with get_db() as db:
        if db.one("SELECT id FROM users WHERE email = %s", (email,)):
            raise HTTPException(409, "An account with this email already exists. Try signing in.")
        db.execute(
            "INSERT INTO users (id, email, password_hash, created_at) VALUES (%s, %s, %s, %s)",
            (user_id, email, hash_password(body.password), _now()),
        )
    _set_session(response, user_id)
    return _me(user_id)


@app.post("/api/auth/login")
def login(body: Credentials, response: Response):
    email = body.email.strip().lower()
    with get_db() as db:
        user = db.one("SELECT id, password_hash FROM users WHERE email = %s", (email,))
    if not verify_password(body.password, user["password_hash"] if user else None):
        raise HTTPException(401, "Incorrect email or password.")
    _set_session(response, user["id"])
    return _me(user["id"])


@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user_id: str = Depends(current_user)):
    return _me(user_id)


# ---------------------------------------------------------------- saved locations

class NewLocation(BaseModel):
    locationId: str = Field(..., min_length=1, max_length=100)
    token: str = Field(..., min_length=1, max_length=2000)
    name: str = Field("", max_length=100)


@app.post("/api/locations")
async def save_location(body: NewLocation, user_id: str = Depends(current_user)):
    """Validate the credentials against GHL, then save (or update the token of) a location."""
    loc, token = body.locationId.strip(), body.token.strip()
    await _fetch_account(loc, token)
    name = body.name.strip() or loc
    with get_db() as db:
        db.execute(
            "INSERT INTO locations (id, user_id, location_id, name, token_enc, created_at, last_used_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s) "
            "ON CONFLICT (user_id, location_id) DO UPDATE SET "
            "name = excluded.name, token_enc = excluded.token_enc, last_used_at = excluded.last_used_at",
            (str(uuid.uuid4()), user_id, loc, name, encrypt(token), _now(), _now()),
        )
        saved = db.one("SELECT id FROM locations WHERE user_id = %s AND location_id = %s", (user_id, loc))
    return {**_me(user_id), "savedId": saved["id"]}


@app.delete("/api/locations/{ref}")
def delete_location(ref: str, user_id: str = Depends(current_user)):
    with get_db() as db:
        db.execute("DELETE FROM locations WHERE id = %s AND user_id = %s", (ref, user_id))
    return _me(user_id)


def location_creds(
    x_location_ref: str = Header(...),
    user_id: str = Depends(current_user),
) -> tuple[str, str]:
    """Resolve the browser's saved-location reference to (locationId, token)."""
    with get_db() as db:
        row = db.one(
            "SELECT location_id, token_enc FROM locations WHERE id = %s AND user_id = %s",
            (x_location_ref, user_id),
        )
        if not row:
            raise HTTPException(404, "That location is no longer saved on your account.")
        db.execute("UPDATE locations SET last_used_at = %s WHERE id = %s", (_now(), x_location_ref))
    try:
        return row["location_id"], decrypt(row["token_enc"])
    except InvalidToken:
        raise HTTPException(422, "The saved token can't be read anymore. Please update the token for this location.")


# ---------------------------------------------------------------- import

@app.post("/api/connect")
async def connect(creds: tuple[str, str] = Depends(location_creds)):
    return await _fetch_account(*creds)


class ContactRow(BaseModel):
    row: int
    data: dict


class ImportBatch(BaseModel):
    contacts: list[ContactRow] = Field(..., max_length=MAX_BATCH)
    tags: list[str] = []


@app.post("/api/import")
async def import_batch(batch: ImportBatch, creds: tuple[str, str] = Depends(location_creds)):
    """Upsert a batch of contacts, then add the upload's tags to each one.

    Tags go through the add-tags endpoint rather than the upsert body so that
    existing contacts keep the tags they already have.
    """
    loc, token = creds
    tags = [t.strip() for t in batch.tags if t.strip()]
    sem = asyncio.Semaphore(CONCURRENCY)
    calls = 0

    async def handle(item: ContactRow, client: httpx.AsyncClient) -> dict:
        nonlocal calls
        async with sem:
            try:
                calls += 1
                resp = await _ghl(client, "POST", "/contacts/upsert", token, json={**item.data, "locationId": loc})
                if resp.status_code >= 400:
                    if resp.status_code == 401:
                        return {"row": item.row, "status": "failed", "error": "Unauthorized (token rejected)"}
                    return {"row": item.row, "status": "failed", "error": _error_message(resp)}
                body = resp.json()
                status = "created" if body.get("new") else "updated"
                contact_id = (body.get("contact") or {}).get("id")
                if tags and contact_id:
                    calls += 1
                    tag_resp = await _ghl(client, "POST", f"/contacts/{contact_id}/tags", token, json={"tags": tags})
                    if tag_resp.status_code >= 400:
                        return {
                            "row": item.row,
                            "status": "failed",
                            "error": f"Contact {status} but tagging failed: {_error_message(tag_resp)}",
                        }
                return {"row": item.row, "status": status}
            except httpx.HTTPError as exc:
                return {"row": item.row, "status": "failed", "error": f"Network error: {exc.__class__.__name__}"}

    async with httpx.AsyncClient(timeout=30) as client:
        results = await asyncio.gather(*(handle(c, client) for c in batch.contacts))
    return {"results": results, "calls": calls}
