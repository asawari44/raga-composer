import hashlib
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from raga_composer import auth
from raga_composer.api import SESSION_COOKIE, create_app
from raga_composer.storage import Repository

PASSWORD = "tanpura-sa-pa"


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path))


def register(client: TestClient, name: str = "asha", password: str = PASSWORD) -> None:
    res = client.post("/api/auth/register", json={"username": name, "password": password})
    assert res.status_code == 200, res.text


def test_password_hash_round_trip_and_legacy_upgrade(tmp_path: Path) -> None:
    stored = auth.hash_password("bhairavi-1")
    assert stored.startswith("scrypt$") and not auth.needs_rehash(stored)
    assert auth.verify_password("bhairavi-1", stored)
    assert not auth.verify_password("bhairavi-2", stored)

    repo = Repository(tmp_path / "db.sqlite")
    user_id = repo.create_user("old", "x")
    assert user_id is not None
    legacy = hashlib.scrypt(b"legacy-pass", salt=bytes.fromhex("ab" * 16), n=2**14, r=8, p=1).hex()
    with repo._tx() as c:
        c.execute("UPDATE users SET password_hash=?, salt=? WHERE id=?", (legacy, "ab" * 16, user_id))
    assert repo.authenticate("old", "legacy-pass") is not None
    with repo._tx() as c:
        row = c.execute("SELECT password_hash, salt FROM users WHERE id=?", (user_id,)).fetchone()
    assert row["password_hash"].startswith("scrypt$") and row["salt"] == ""
    assert repo.authenticate("old", "legacy-pass") is not None


def test_password_policy() -> None:
    assert auth.password_problem("short", "asha")
    assert auth.password_problem("asha-rocks-1", "asha")
    assert auth.password_problem("password123", "asha")
    assert auth.password_problem("aaaaaaaaaa", "asha")
    assert auth.password_problem(PASSWORD, "asha") is None


def test_register_rejects_weak_password_and_duplicates(client: TestClient) -> None:
    res = client.post("/api/auth/register", json={"username": "asha", "password": "password123"})
    assert res.status_code == 422 and "guess" in res.json()["detail"]
    register(client)
    client.post("/api/auth/logout")
    assert client.post("/api/auth/register", json={"username": "ASHA", "password": PASSWORD}).status_code == 409


def test_session_token_is_hashed_at_rest(client: TestClient, tmp_path: Path) -> None:
    register(client)
    token = client.cookies.get(SESSION_COOKIE)
    assert token
    db = sqlite3.connect(tmp_path / "raga_composer.db")
    stored = [r[0] for r in db.execute("SELECT token_hash FROM sessions")]
    assert stored and token not in stored


def test_expired_session_is_rejected(client: TestClient, tmp_path: Path) -> None:
    register(client)
    assert client.get("/api/auth/me").json()["username"] == "asha"
    past = (datetime.now(UTC) - timedelta(seconds=1)).isoformat(timespec="seconds")
    db = sqlite3.connect(tmp_path / "raga_composer.db")
    with db:
        db.execute("UPDATE sessions SET expires_at=?", (past,))
    assert client.get("/api/auth/me").json() is None
    assert client.get("/api/lines").status_code == 401


def test_login_throttles_repeated_failures(client: TestClient) -> None:
    register(client)
    client.post("/api/auth/logout")
    for _ in range(10):
        assert client.post("/api/auth/login", json={"username": "asha", "password": "nope"}).status_code == 401
    blocked = client.post("/api/auth/login", json={"username": "Asha", "password": PASSWORD})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0


def test_change_password_signs_out_other_sessions(tmp_path: Path) -> None:
    app = create_app(tmp_path)
    phone, laptop = TestClient(app), TestClient(app)
    register(phone)
    assert laptop.post("/api/auth/login", json={"username": "asha", "password": PASSWORD}).status_code == 200

    wrong = phone.post("/api/auth/password", json={"current_password": "nope", "new_password": "raag-yaman-9"})
    assert wrong.status_code == 403
    ok = phone.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": "raag-yaman-9"})
    assert ok.status_code == 200
    assert phone.get("/api/auth/me").json()["username"] == "asha"
    assert laptop.get("/api/auth/me").json() is None
    phone.post("/api/auth/logout")
    assert phone.post("/api/auth/login", json={"username": "asha", "password": "raag-yaman-9"}).status_code == 200


def test_logout_all_ends_every_session(tmp_path: Path) -> None:
    app = create_app(tmp_path)
    a, b = TestClient(app), TestClient(app)
    register(a)
    b.post("/api/auth/login", json={"username": "asha", "password": PASSWORD})
    assert a.post("/api/auth/logout-all").json()["ended_sessions"] == 2
    assert a.get("/api/auth/me").json() is None and b.get("/api/auth/me").json() is None


def test_cross_site_writes_are_blocked_and_headers_set(client: TestClient) -> None:
    res = client.post(
        "/api/auth/login", json={"username": "asha", "password": PASSWORD}, headers={"Origin": "https://evil.example"}
    )
    assert res.status_code == 403
    page = client.get("/")
    assert page.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in page.headers["content-security-policy"]


def test_migrates_version_zero_sessions(tmp_path: Path) -> None:
    db_path = tmp_path / "raga_composer.db"
    db = sqlite3.connect(db_path)
    db.executescript(
        "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE,"
        " password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);"
        "CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER, created_at TEXT NOT NULL);"
        "INSERT INTO users VALUES (1, 'old', 'x', 'y', '2026-01-01');"
        "INSERT INTO sessions VALUES ('raw-token', 1, '2026-01-01');"
    )
    db.close()
    repo = Repository(db_path)
    assert repo.user_for_session("raw-token") is None
    assert repo.create_session(1) and repo._conn.execute("PRAGMA user_version").fetchone()[0] == 1


def test_page_and_scripts_are_revalidated(client: TestClient) -> None:
    assert client.get("/").headers["cache-control"] == "no-cache"
    assert client.get("/js/app.js").headers["cache-control"] == "no-cache"
