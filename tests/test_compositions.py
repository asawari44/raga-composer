from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from raga_composer.api import create_app
from raga_composer.compositions import Composition, CompositionLibrary, CompositionSection, taal_beats
from raga_composer.raga import RagaRegistry

LIBRARY = CompositionLibrary.builtin()
REGISTRY = RagaRegistry.with_builtins()


def line(beats: list[str], words: list[str] | None = None) -> dict:
    return {"beats": beats, "words": words or []}


def test_taal_beats() -> None:
    assert taal_beats("Teentaal") == 16
    assert taal_beats("Jhaptaal") == 10
    assert taal_beats("Chautaal") == 12
    assert taal_beats("Unknown") is None


def test_composition_rejects_wrong_beat_count() -> None:
    with pytest.raises(ValueError, match="has 3 beats"):
        Composition.model_validate(
            {
                "raga": "Yaman",
                "title": "t",
                "taal": "Dadra",
                "source": "s",
                "sections": [{"name": "Sthayi", "lines": [line(["S", "R", "G"])]}],
            }
        )


def test_composition_rejects_mismatched_words() -> None:
    with pytest.raises(ValueError, match="one entry per beat"):
        Composition.model_validate(
            {
                "raga": "Yaman",
                "title": "t",
                "taal": "Dadra",
                "source": "s",
                "sections": [{"name": "Sthayi", "lines": [line(["S"] * 6, ["a"])]}],
            }
        )


def test_composition_first_matra() -> None:
    raw = {
        "raga": "Yaman",
        "title": "t",
        "taal": "Dadra",
        "source": "s",
        "sections": [{"name": "Sthayi", "lines": [line(["S"] * 6)]}],
    }
    assert Composition.model_validate(raw).first_matra == 1
    assert Composition.model_validate({**raw, "first_matra": 4}).first_matra == 4
    with pytest.raises(ValueError, match="past the end"):
        Composition.model_validate({**raw, "first_matra": 7})
    with pytest.raises(ValueError):
        Composition.model_validate({**raw, "first_matra": 0})


def test_mukhda_first_lines_are_marked() -> None:
    marked = [c for c in LIBRARY.all() if "mukhda from matra 9" in c.notes]
    assert marked
    assert all(c.first_matra == 9 for c in marked)


def test_builtin_library_loads() -> None:
    assert LIBRARY.all(), "compositions.json should not be empty"


@pytest.mark.parametrize("comp", LIBRARY.all(), ids=lambda c: f"{c.raga}:{c.title}")
def test_every_composition_is_valid(comp: Composition) -> None:
    assert REGISTRY.get(comp.raga) is not None, f"unknown raga {comp.raga}"
    assert REGISTRY.get(comp.raga).definition.name == comp.raga
    assert comp.source.strip()
    assert comp.sections or comp.notes, "entries without notation must explain why"


def test_raga_detail_includes_compositions(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    raga = LIBRARY.all()[0].raga
    detail = client.get(f"/api/ragas/{raga}").json()
    assert detail["compositions"]
    assert detail["compositions"][0]["raga"] == raga


def test_raga_list_includes_time_and_composition_count(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    ragas = {r["name"]: r for r in client.get("/api/ragas").json()}
    yaman = ragas["Yaman"]
    assert yaman["time"]
    assert yaman["compositions"] == sum(1 for c in LIBRARY.for_raga("Yaman") if c.sections)


def test_lyrics_must_come_from_the_sung_syllables() -> None:
    line = {"beats": ["S"] * 4, "words": ["mo", "ha", "na", "_"]}
    CompositionSection.model_validate({"name": "Sthayi", "lines": [line], "lyrics": ["Mohan"]})
    with pytest.raises(ValidationError):
        CompositionSection.model_validate({"name": "Sthayi", "lines": [line], "lyrics": ["Shyam sundar"]})


def test_compositions_with_words_have_lyrics() -> None:
    for comp in (c for r in REGISTRY.all() for c in LIBRARY.for_raga(r.name)):
        for section in comp.sections:
            sung = [w for line in section.lines for w in line.words if w.strip() not in ("", "_", "ऽ")]
            if sung:
                assert section.lyrics, f"{comp.raga} / {comp.title} / {section.name} has no lyrics"
