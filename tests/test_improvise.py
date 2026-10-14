from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from raga_composer.api import create_app
from raga_composer.generator import validate
from raga_composer.improvise import improvise
from raga_composer.notation import tokenize
from raga_composer.raga import RagaRegistry
from raga_composer.taal import TAALS

REGISTRY = RagaRegistry.with_builtins()
EXPECTED = {
    "sthayi-alaap": {"short": 5, "avartan": 2},
    "antara-alaap": {"short": 5, "avartan": 2},
    "sthayi-taan": {"short": 5, "double": 2},
    "antara-taan": {"short": 5, "double": 2},
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
            if item.kind == "double":
                assert item.beats == 32
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
