from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from raga_composer.api import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path))


def register(client: TestClient, name: str = "asha") -> None:
    res = client.post("/api/auth/register", json={"username": name, "password": "secret123"})
    assert res.status_code == 200, res.text


def test_index_and_ragas(client: TestClient) -> None:
    assert client.get("/").status_code == 200
    names = [r["name"] for r in client.get("/api/ragas").json()]
    assert "Yaman" in names
    detail = client.get("/api/ragas/eman").json()
    assert detail["name"] == "Yaman" and len(detail["patterns"]) >= 5
    assert client.get("/api/ragas/nope").status_code == 404
    assert client.get("/api/config").json()["default_tonic"] == "G#"


def test_generate_and_validate(client: TestClient) -> None:
    res = client.post("/api/generate", json={"raga": "Yaman", "text": "ascending ending on S and has 16 beats"})
    assert res.status_code == 200
    body = res.json()
    assert body["intention"]["beats"] == 16
    assert all(len(p["tokens"]) == 16 for p in body["patterns"])
    bad = client.post("/api/validate", json={"raga": "Yaman", "tokens": "S R G m"}).json()
    assert bad["violations"]
    assert client.post("/api/validate", json={"raga": "Yaman", "tokens": "S X"}).status_code == 422


def test_arrange_taan(client: TestClient) -> None:
    res = client.post("/api/arrange", json={"raga": "Yaman", "tokens": "N. R _ G M", "mode": "taan"}).json()
    assert res["tokens"] == ["N.", "R", "G", "M"]
    assert res["notes_per_beat"] == 4


def test_lines_require_sign_in_and_are_private(client: TestClient) -> None:
    line = {"raga": "Yaman", "tokens": ["N.", "R", "G", "_"], "notes_per_beat": 2}
    assert client.post("/api/lines", json=line).status_code == 401
    register(client)
    saved = client.post("/api/lines", json=line).json()
    assert saved["tokens"] == ["N.", "R", "G", "_"] and saved["violations"] == []
    assert client.patch(f"/api/lines/{saved['id']}", json={"title": "Mukhda"}).json()["title"] == "Mukhda"
    assert len(client.get("/api/lines?raga=Yaman").json()) == 1

    client.post("/api/auth/logout")
    register(client, "bina")
    assert client.get("/api/lines").json() == []
    assert client.delete(f"/api/lines/{saved['id']}").status_code == 404


def test_recordings_round_trip(client: TestClient) -> None:
    files = {"file": ("take.webm", b"fake-audio-bytes", "audio/webm")}
    assert client.post("/api/recordings", files=files).status_code == 401
    register(client)
    res = client.post("/api/recordings", files=files, data={"title": "Alaap", "raga": "Yaman", "tonic": "G#"})
    assert res.status_code == 201, res.text
    rec = res.json()
    assert rec["title"] == "Alaap" and "blob_key" not in rec
    audio = client.get(rec["audio_url"])
    assert audio.content == b"fake-audio-bytes"
    assert audio.headers["content-type"] == "audio/webm"
    bad = client.post("/api/recordings", files={"file": ("x.txt", b"x", "text/plain")})
    assert bad.status_code == 415

    client.post("/api/auth/logout")
    register(client, "bina")
    assert client.get(rec["audio_url"]).status_code == 404
    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "asha", "password": "secret123"})
    assert client.delete(f"/api/recordings/{rec['id']}").status_code == 204
    assert client.get("/api/recordings").json() == []


def test_login_rejects_bad_password(client: TestClient) -> None:
    register(client)
    res = client.post("/api/auth/login", json={"username": "asha", "password": "wrong-pass"})
    assert res.status_code == 401
