"""Tiny DB layer: Postgres (Neon) in production, SQLite for local dev.

Files in api/ starting with "_" are not deployed as their own Vercel functions.
Write SQL with %s placeholders; they're converted for SQLite.
"""

import os
import sqlite3
from contextlib import contextmanager

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
LOCAL_DB_PATH = os.environ.get(
    "LOCAL_DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "local-dev.db")
)

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        location_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token_enc TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        UNIQUE (user_id, location_id)
    )""",
]

_schema_ready = False


class Db:
    def __init__(self, conn):
        self.conn = conn
        self.is_sqlite = isinstance(conn, sqlite3.Connection)

    def execute(self, sql: str, params: tuple = ()):
        if self.is_sqlite:
            sql = sql.replace("%s", "?")
        cur = self.conn.cursor()
        cur.execute(sql, params)
        return cur

    def all(self, sql: str, params: tuple = ()) -> list[dict]:
        cur = self.execute(sql, params)
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

    def one(self, sql: str, params: tuple = ()) -> dict | None:
        rows = self.all(sql, params)
        return rows[0] if rows else None


@contextmanager
def get_db():
    global _schema_ready
    if DATABASE_URL:
        import psycopg

        conn = psycopg.connect(DATABASE_URL, autocommit=True)
    else:
        conn = sqlite3.connect(LOCAL_DB_PATH, isolation_level=None)
        conn.execute("PRAGMA foreign_keys = ON")
    db = Db(conn)
    try:
        if not _schema_ready:
            for stmt in SCHEMA:
                db.execute(stmt)
            _schema_ready = True
        yield db
    finally:
        conn.close()
