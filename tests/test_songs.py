import json
from copy import deepcopy
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from raga_composer.api import create_app
from raga_composer.notation import Swara, tokenize
from raga_composer.songs import SongCatalog

FIXTURE = Path(__file__).parent / "js" / "fixtures" / "song-test.json"


def example() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text("utf-8"))


def test_song_catalog_preserves_pitch_duration_and_timing() -> None:
    raw = example()
    catalog = SongCatalog.model_validate(raw)
    assert catalog.model_dump(mode="json") == raw
    assert catalog.songs[0].sections[0].notation == "N. S _ R - G M P S' _"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("notation", "_ S"),
        ("notation", "S - _ R"),
        ("notation", "- -"),
        ("notation", "S X"),
        ("notation", "S'''''"),
        ("notation", "S " * 4097),
        ("notes_per_beat", 0),
        ("notes_per_beat", 9),
        ("notes_per_beat", True),
        ("tempo", 29),
        ("tempo", 401),
        ("tempo", 90.5),
    ],
)
def test_invalid_playback_data_is_rejected(field: str, value: Any) -> None:
    raw = example()
    raw["songs"][0]["sections"][0][field] = value
    with pytest.raises(ValidationError):
        SongCatalog.model_validate(raw)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("license", "All rights reserved"),
        ("license", "CC-BY-NC-4.0"),
        ("status", "unverified"),
        ("evidence_url", ""),
        ("source_url", "javascript:alert(1)"),
        ("source_url", "https://user:password@example.org/notation"),
        ("notes", " "),
    ],
)
def test_missing_or_unsupported_rights_are_rejected(field: str, value: str) -> None:
    raw = example()
    raw["songs"][0]["rights"][field] = value
    with pytest.raises(ValidationError):
        SongCatalog.model_validate(raw)


def test_duplicate_songs_and_sections_are_rejected() -> None:
    raw = example()
    duplicate = deepcopy(raw["songs"][0])
    duplicate["id"] = "different-id"
    duplicate["title"] = " TEST-ONLY MELODY "
    raw["songs"].append(duplicate)
    with pytest.raises(ValidationError, match="duplicate song"):
        SongCatalog.model_validate(raw)
    raw = example()
    raw["songs"][0]["sections"] *= 2
    with pytest.raises(ValidationError, match="section names"):
        SongCatalog.model_validate(raw)


def test_public_domain_evidence_is_explicit() -> None:
    raw = example()
    raw["songs"][0]["rights"].update(status="public-domain", license="Public domain")
    SongCatalog.model_validate(raw)
    raw["songs"][0]["rights"]["license"] = "CC0-1.0"
    with pytest.raises(ValidationError):
        SongCatalog.model_validate(raw)


def test_api_and_static_data_route_match_catalog(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    catalog = SongCatalog.model_validate(example())
    monkeypatch.setattr(SongCatalog, "builtin", classmethod(lambda cls: catalog))
    client = TestClient(create_app(tmp_path))
    for path in ("/api/songs", "/data/songs.json"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == catalog.model_dump(mode="json")


def test_builtin_catalog_counts_only_published_playable_songs() -> None:
    catalog = SongCatalog.builtin()
    assert catalog.target_count == 200
    assert all(song.id != "test-only" for song in catalog.songs)


def test_1914_pilgrimage_song_matches_printed_bars() -> None:
    song = next(song for song in SongCatalog.builtin().songs if song.id == "ganga-jamuna-tirath-kar-le-1914")
    assert [section.name for section in song.sections] == ["Solo", "Chorus"]
    # Sixteenth-note slots from page 23, example 9. Sa is the chosen C reference.
    bars = [
        ["m", "m", "m", "m", "m", "_", "m", "m"],
        ["G", "_", "G", "G", "G", "_", "G", "_"],
        ["R", "_", "G", "G", "G", "_", "R", "R"],
        ["S", "_", "S", "S", "S", "_", "S", "_"],
        ["R", "_", "G", "G", "G", "_", "R", "R"],
        ["S", "_", "S", "S", "S", "_", "-", "-"],
    ]
    actual = [str(token) for section in song.sections for token in tokenize(section.notation)]
    assert actual == [slot for bar in bars for slot in bar]
    assert [len(tokenize(section.notation)) for section in song.sections] == [32, 16]
    assert all(section.notes_per_beat == 4 and section.tempo == 120 for section in song.sections)
    pitches = {
        token.pitch for section in song.sections for token in tokenize(section.notation) if isinstance(token, Swara)
    }
    assert pitches == {0, 2, 4, 5}
    assert (
        sum(len(tokenize(section.notation)) / section.notes_per_beat * 60 / section.tempo for section in song.sections)
        == 6
    )


def test_live_catalog_api_includes_historical_notation(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    catalog = SongCatalog.builtin().model_dump(mode="json")
    assert client.get("/api/songs").json() == catalog
    assert client.get("/data/songs.json").json() == catalog
