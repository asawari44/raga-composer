from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from raga_composer.api import create_app
from raga_composer.compositions import Composition, CompositionLibrary
from raga_composer.generator import validate
from raga_composer.improvise import improvise
from raga_composer.notation import tokenize
from raga_composer.raga import RagaRegistry
from raga_composer.taal import TAALS

REGISTRY = RagaRegistry.with_builtins()
UNREACHABLE_MUKHDAS: set[str] = set()
EXPECTED = {
    "sthayi-alaap": {"short": 5, "avartan": 2},
    "antara-alaap": {"short": 5, "avartan": 2},
    "sthayi-taan": {"short": 5, "long": 2},
    "antara-taan": {"short": 5, "long": 2},
}


@pytest.mark.parametrize("raga", REGISTRY.all(), ids=lambda r: r.name)
def test_every_raga_gets_valid_alaap_and_taan(raga) -> None:  # type: ignore[no-untyped-def]
    result = improvise(raga, "Teentaal", 16)
    assert [g.key for g in result.groups] == list(EXPECTED)
    for group in result.groups:
        counts: dict[str, int] = {}
        for item in group.items:
            counts[item.kind] = counts.get(item.kind, 0) + 1
            tokens = tokenize(" ".join(item.tokens))
            assert not validate(raga, tokens), f"{group.key}: {' '.join(item.tokens)}"
            assert len(item.tokens) == item.beats * item.notes_per_beat
            last_note = [t for t in item.tokens if t not in ("_", "-")][-1]
            assert last_note == ("S" if group.key.startswith("sthayi") else "S'")
            if item.kind == "avartan":
                assert item.beats == 16
            if group.key.endswith("taan"):
                assert item.beats == (8 if item.kind == "short" else 16)
        assert counts == EXPECTED[group.key]
        assert len({tuple(i.tokens) for i in group.items}) == len(group.items)


@pytest.mark.parametrize("taal", TAALS.values(), ids=lambda t: t.name)
@pytest.mark.parametrize("name", ["Yaman", "Malkauns", "Jogiya", "Bilaskhani Todi", "Kaunsi Kanada"])
def test_other_taals(name: str, taal) -> None:  # type: ignore[no-untyped-def]
    raga = REGISTRY.get(name)
    assert raga is not None
    result = improvise(raga, taal.name, taal.beats)
    full = [i for g in result.groups for i in g.items if i.kind == "avartan"]
    assert all(i.beats == taal.beats for i in full)
    taans = [i for g in result.groups if g.key.endswith("taan") for i in g.items]
    assert {i.beats for i in taans} == {8, 16}


COMPOSITIONS = [c for c in CompositionLibrary.builtin().all() if c.sections]


@pytest.mark.parametrize("comp", COMPOSITIONS, ids=lambda c: f"{c.raga}-{c.title}")
def test_taans_lead_into_each_composition(comp: Composition) -> None:
    raga = REGISTRY.get(comp.raga)
    assert raga is not None
    land = comp.mukhda_pitches()
    assert "sthayi" in land
    result = improvise(raga, comp.taal, 16, land=land)
    landed = 0
    for group in result.groups:
        if not group.key.endswith("taan"):
            continue
        section = group.key.split("-")[0]
        for item in group.items:
            assert item.beats in (8, 16)
            assert not validate(raga, tokenize(" ".join(item.tokens)))
            last = [t for t in item.tokens if t not in ("_", "-")][-1]
            home = 0 if section == "sthayi" else 12
            assert tokenize(last)[0].pitch in (land.get(section, home), home)
            landed += section in land and tokenize(last)[0].pitch == land[section]
    # Most compositions start on a note the raga's taans can reach.
    assert landed or comp.title in UNREACHABLE_MUKHDAS


def test_most_taans_land_on_the_mukhda() -> None:
    hits = total = 0
    for comp in COMPOSITIONS:
        raga = REGISTRY.get(comp.raga)
        assert raga is not None
        land = comp.mukhda_pitches()
        result = improvise(raga, comp.taal, 16, land=land)
        for group in result.groups[2:]:
            section = group.key.split("-")[0]
            if section not in land:
                continue
            total += 1
            last = [t for t in group.items[0].tokens if t not in ("_", "-")][-1]
            hits += tokenize(last)[0].pitch == land[section]
    assert hits / total > 0.9


def test_seed_is_stable_and_changes_output() -> None:
    raga = REGISTRY.get("Bhupali")
    assert raga is not None
    first = improvise(raga, "Teentaal", 16)
    assert improvise(raga, "Teentaal", 16) == first
    other = improvise(raga, "Teentaal", 16, seed=first.seed + 1)
    assert other.groups != first.groups


def test_improvisations_endpoint(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path))
    res = client.get("/api/ragas/Bhupali/improvisations", params={"taal": "Jhaptaal", "seed": 7})
    assert res.status_code == 200
    body = res.json()
    assert body["taal"] == "Jhaptaal" and body["taal_beats"] == 10 and body["seed"] == 7
    assert len(body["groups"]) == 4
    assert client.get("/api/ragas/Bhupali/improvisations", params={"taal": "Nope"}).status_code == 400
    assert client.get("/api/ragas/Nope/improvisations").status_code == 404
    comp = next(c for c in COMPOSITIONS if c.raga == "Bhupali")
    res = client.get("/api/ragas/Bhupali/improvisations", params={"composition": comp.title})
    assert res.status_code == 200
    land = comp.mukhda_pitches()["sthayi"]
    last = [t for t in res.json()["groups"][2]["items"][0]["tokens"] if t not in ("_", "-")][-1]
    assert tokenize(last)[0].pitch == land
    missing = client.get("/api/ragas/Bhupali/improvisations", params={"composition": "Nope"})
    assert missing.status_code == 404
