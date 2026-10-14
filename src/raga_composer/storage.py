"""Persistence: SQLite for metadata and the local filesystem for audio.

Both sit behind small interfaces (``Repository`` and ``BlobStore``) so that a
hosted deployment can swap them for PostgreSQL and object storage (for example,
Cloud SQL and Cloud Storage) without touching the API layer.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Protocol

from raga_composer.auth import burn_time, hash_password, needs_rehash, verify_password

SCHEMA_VERSION = 1
SESSION_IDLE = timedelta(days=30)
SESSION_MAX_AGE = timedelta(days=90)
SESSION_TOUCH_INTERVAL = timedelta(minutes=10)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raga TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    tokens TEXT NOT NULL,
    notes_per_beat INTEGER NOT NULL DEFAULT 1,
    taal TEXT,
    intention TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS custom_ragas (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL COLLATE NOCASE,
    definition TEXT NOT NULL,
    PRIMARY KEY (user_id, name)
);
CREATE TABLE IF NOT EXISTS recordings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    raga TEXT,
    tonic TEXT,
    taal TEXT,
    tempo INTEGER,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_seconds REAL,
    blob_key TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _token_hash(token: str) -> str:
    # Only a hash of the session token is stored, so a leaked database can't be
    # used to impersonate signed-in users.
    return hashlib.sha256(token.encode()).hexdigest()


class BlobStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def get(self, key: str) -> bytes | None: ...
    def delete(self, key: str) -> None: ...


class LocalBlobStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if self.root.resolve() not in path.parents:
            raise ValueError("Invalid blob key")
        return path

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.exists() else None

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)


class Repository:
    def __init__(self, db_path: Path | str) -> None:
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._conn.execute("PRAGMA busy_timeout = 5000")
        self._migrate()
        self._lock = threading.Lock()

    def _migrate(self) -> None:
        version = self._conn.execute("PRAGMA user_version").fetchone()[0]
        with self._conn:
            if version < 1:
                # Version 0 stored raw session tokens without expiry. Drop them;
                # users sign in again once.
                self._conn.execute("DROP TABLE IF EXISTS sessions")
            self._conn.executescript(SCHEMA)
            self._conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    @contextmanager
    def _tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock, self._conn:
            yield self._conn

    # Users and sessions -------------------------------------------------
    def create_user(self, username: str, password: str) -> int | None:
        digest = hash_password(password)
        try:
            with self._tx() as c:
                cur = c.execute(
                    "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?,?,'',?)",
                    (username, digest, _now()),
                )
                return cur.lastrowid
        except sqlite3.IntegrityError:
            return None

    def authenticate(self, username: str, password: str) -> dict[str, Any] | None:
        with self._tx() as c:
            row = c.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if row is None:
            burn_time(password)
            return None
        if not verify_password(password, row["password_hash"], row["salt"]):
            return None
        if needs_rehash(row["password_hash"]):
            self.set_password(row["id"], password)
        return {"id": row["id"], "username": row["username"]}

    def check_password(self, user_id: int, password: str) -> bool:
        with self._tx() as c:
            row = c.execute("SELECT password_hash, salt FROM users WHERE id = ?", (user_id,)).fetchone()
        return row is not None and verify_password(password, row["password_hash"], row["salt"])

    def set_password(self, user_id: int, password: str) -> None:
        with self._tx() as c:
            c.execute("UPDATE users SET password_hash = ?, salt = '' WHERE id = ?", (hash_password(password), user_id))

    def create_session(self, user_id: int, user_agent: str = "") -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        with self._tx() as c:
            c.execute("DELETE FROM sessions WHERE expires_at <= ?", (now.isoformat(timespec="seconds"),))
            c.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent)"
                " VALUES (?,?,?,?,?,?)",
                (
                    _token_hash(token),
                    user_id,
                    now.isoformat(timespec="seconds"),
                    now.isoformat(timespec="seconds"),
                    (now + SESSION_IDLE).isoformat(timespec="seconds"),
                    user_agent[:200],
                ),
            )
        return token

    def user_for_session(self, token: str) -> dict[str, Any] | None:
        """Returns the session's user, sliding the idle expiry forward on use."""
        key = _token_hash(token)
        now = datetime.now(UTC)
        with self._tx() as c:
            row = c.execute(
                "SELECT u.id, u.username, s.created_at, s.last_seen_at, s.expires_at"
                " FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
                (key,),
            ).fetchone()
            if row is None:
                return None
            if datetime.fromisoformat(row["expires_at"]) <= now:
                c.execute("DELETE FROM sessions WHERE token_hash = ?", (key,))
                return None
            if now - datetime.fromisoformat(row["last_seen_at"]) >= SESSION_TOUCH_INTERVAL:
                hard_limit = datetime.fromisoformat(row["created_at"]) + SESSION_MAX_AGE
                c.execute(
                    "UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?",
                    (
                        now.isoformat(timespec="seconds"),
                        min(now + SESSION_IDLE, hard_limit).isoformat(timespec="seconds"),
                        key,
                    ),
                )
        return {"id": row["id"], "username": row["username"]}

    def delete_session(self, token: str) -> None:
        with self._tx() as c:
            c.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))

    def delete_user_sessions(self, user_id: int) -> int:
        with self._tx() as c:
            return c.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,)).rowcount

    # Saved lines ----------------------------------------------------------
    def add_line(self, user_id: int, data: dict[str, Any]) -> dict[str, Any]:
        with self._tx() as c:
            pos = c.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM lines WHERE user_id=? AND raga=?",
                (user_id, data["raga"]),
            ).fetchone()[0]
            cur = c.execute(
                "INSERT INTO lines (user_id, raga, title, tokens, notes_per_beat, taal, intention,"
                " position, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    user_id,
                    data["raga"],
                    data.get("title", ""),
                    " ".join(data["tokens"]),
                    data.get("notes_per_beat", 1),
                    data.get("taal"),
                    data.get("intention", ""),
                    pos,
                    _now(),
                ),
            )
            line_id = cur.lastrowid
        line = self.get_line(user_id, int(line_id or 0))
        assert line is not None
        return line

    def get_line(self, user_id: int, line_id: int) -> dict[str, Any] | None:
        with self._tx() as c:
            row = c.execute("SELECT * FROM lines WHERE id=? AND user_id=?", (line_id, user_id)).fetchone()
        return _line(row) if row else None

    def list_lines(self, user_id: int, raga: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM lines WHERE user_id=?"
        params: list[Any] = [user_id]
        if raga:
            query += " AND raga = ? COLLATE NOCASE"
            params.append(raga)
        with self._tx() as c:
            rows = c.execute(query + " ORDER BY raga, position, id", params).fetchall()
        return [_line(r) for r in rows]

    def update_line(self, user_id: int, line_id: int, data: dict[str, Any]) -> dict[str, Any] | None:
        fields: dict[str, Any] = {}
        for key in ("title", "notes_per_beat", "taal", "position"):
            if data.get(key) is not None:
                fields[key] = data[key]
        if data.get("tokens") is not None:
            fields["tokens"] = " ".join(data["tokens"])
        if fields:
            sets = ", ".join(f"{k}=?" for k in fields)
            with self._tx() as c:
                c.execute(
                    f"UPDATE lines SET {sets} WHERE id=? AND user_id=?",
                    [*fields.values(), line_id, user_id],
                )
        return self.get_line(user_id, line_id)

    def delete_line(self, user_id: int, line_id: int) -> bool:
        with self._tx() as c:
            cur = c.execute("DELETE FROM lines WHERE id=? AND user_id=?", (line_id, user_id))
        return cur.rowcount > 0

    # Custom ragas -----------------------------------------------------------
    def save_custom_raga(self, user_id: int, name: str, definition: dict[str, Any]) -> None:
        with self._tx() as c:
            c.execute(
                "INSERT OR REPLACE INTO custom_ragas (user_id, name, definition) VALUES (?,?,?)",
                (user_id, name, json.dumps(definition)),
            )

    def list_custom_ragas(self, user_id: int) -> list[dict[str, Any]]:
        with self._tx() as c:
            rows = c.execute("SELECT definition FROM custom_ragas WHERE user_id=?", (user_id,)).fetchall()
        return [json.loads(r["definition"]) for r in rows]

    # Recordings -------------------------------------------------------------
    def add_recording(self, user_id: int, data: dict[str, Any]) -> dict[str, Any]:
        with self._tx() as c:
            cur = c.execute(
                "INSERT INTO recordings (user_id, title, raga, tonic, taal, tempo, mime_type,"
                " size_bytes, duration_seconds, blob_key, created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (
                    user_id,
                    data["title"],
                    data.get("raga"),
                    data.get("tonic"),
                    data.get("taal"),
                    data.get("tempo"),
                    data["mime_type"],
                    data["size_bytes"],
                    data.get("duration_seconds"),
                    data["blob_key"],
                    _now(),
                ),
            )
            rec_id = cur.lastrowid
        rec = self.get_recording(user_id, int(rec_id or 0))
        assert rec is not None
        return rec

    def get_recording(self, user_id: int, rec_id: int) -> dict[str, Any] | None:
        with self._tx() as c:
            row = c.execute("SELECT * FROM recordings WHERE id=? AND user_id=?", (rec_id, user_id)).fetchone()
        return dict(row) if row else None

    def list_recordings(self, user_id: int) -> list[dict[str, Any]]:
        with self._tx() as c:
            rows = c.execute("SELECT * FROM recordings WHERE user_id=? ORDER BY id DESC", (user_id,)).fetchall()
        return [dict(r) for r in rows]

    def delete_recording(self, user_id: int, rec_id: int) -> dict[str, Any] | None:
        rec = self.get_recording(user_id, rec_id)
        if rec:
            with self._tx() as c:
                c.execute("DELETE FROM recordings WHERE id=? AND user_id=?", (rec_id, user_id))
        return rec


def _line(row: sqlite3.Row) -> dict[str, Any]:
    data = dict(row)
    data["tokens"] = data["tokens"].split()
    data.pop("user_id", None)
    return data
