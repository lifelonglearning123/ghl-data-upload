"""Password hashing, session cookies and token encryption, all keyed off APP_SECRET.

Changing APP_SECRET signs everyone out AND makes saved GHL tokens unreadable.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken  # noqa: F401  (re-exported)

SESSION_COOKIE = "session"
SESSION_DAYS = 30
_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def _secret() -> bytes:
    secret = os.environ.get("APP_SECRET")
    if not secret:
        if os.environ.get("VERCEL"):
            raise RuntimeError("APP_SECRET environment variable is not set")
        secret = "local-dev-only-secret"
    return secret.encode()


def _derive(label: bytes) -> bytes:
    return hashlib.sha256(label + b":" + _secret()).digest()


# --- GHL token encryption ---

def encrypt(value: str) -> str:
    return Fernet(base64.urlsafe_b64encode(_derive(b"token-encryption"))).encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return Fernet(base64.urlsafe_b64encode(_derive(b"token-encryption"))).decrypt(value.encode()).decode()


# --- Passwords ---

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${salt.hex()}${digest.hex()}"


_DUMMY_HASH = hash_password(secrets.token_hex(8))


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-ish time check; pass stored=None for unknown users to avoid timing leaks."""
    try:
        _, n, r, p, salt, digest = (stored or _DUMMY_HASH).split("$")
        calc = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p), dklen=len(digest) // 2
        )
    except (ValueError, TypeError):
        return False
    return stored is not None and hmac.compare_digest(calc.hex(), digest)


# --- Session cookie: base64(json).hmac ---

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def make_session(user_id: str) -> str:
    payload = _b64(json.dumps({"uid": user_id, "exp": int(time.time()) + SESSION_DAYS * 86400}).encode())
    sig = hmac.new(_derive(b"session"), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def read_session(value: str | None) -> str | None:
    if not value or "." not in value:
        return None
    payload, sig = value.rsplit(".", 1)
    expected = hmac.new(_derive(b"session"), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except ValueError:
        return None
    if data.get("exp", 0) < time.time():
        return None
    return data.get("uid")
