from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from raga_composer.api import TONICS
from raga_composer.compositions import CompositionLibrary
from raga_composer.generator import arrange_sequence, validate
from raga_composer.intent import parse_intention
from raga_composer.notation import NotationError, Swara, tokenize
from raga_composer.raga import RagaRegistry
from raga_composer.taal import TAALS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tests" / "js" / "fixtures"


def dump(name: str, data: Any) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n", "utf-8")


def model(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [model(item) for item in value]
    return value


def tokens_fixture() -> list[dict[str, Any]]:
    cases = ["N. R G _ | M D N S' - p ni", "S X", "_ S", "S, R | G", "komal"]
    out: list[dict[str, Any]] = []
    for text in cases:
        try:
            out.append({"text": text, "tokens": [str(token) for token in tokenize(text)]})
        except NotationError as exc:
            out.append({"text": text, "error": str(exc)})
    return out


def raga_detail(raga_name: str, registry: RagaRegistry, library: CompositionLibrary) -> dict[str, Any]:
    raga = registry.get(raga_name)
    assert raga is not None
    notes = sorted(Swara(s) for s in raga.semitones)
    groups = {
        "Sa": (0,),
        "Re": (1, 2),
        "Ga": (3, 4),
        "Ma": (5, 6),
        "Pa": (7,),
        "Dha": (8, 9),
        "Ni": (10, 11),
    }
    return {
        **raga.definition.model_dump(mode="json"),
        "notes": [str(note) for note in notes],
        "varjit": [name for name, group in groups.items() if not set(group) & raga.semitones],
        "compositions": [c.model_dump(mode="json") for c in library.for_raga(raga.name)],
    }


def main() -> None:
    registry = RagaRegistry.with_builtins()
    library = CompositionLibrary.builtin()
    intent_cases = [
        {"raga": "Yaman", "text": "ascending ending on S and has 16 beats"},
        {"raga": "Kafi", "text": "taan in teentaal, up and down, start on komal ni, end on taar sa, emphasize Pa"},
        {"raga": "Bhupali", "text": "12 beats with held notes, use the pakad"},
        {"raga": "Malkauns", "text": "slow mandra saptak, end on Sa, 3 patterns"},
        {"raga": "Bageshri", "text": "down then up in rupak for 2 cycles with vadi"},
    ]
    validation_cases = [
        {"raga": "Yaman", "tokens": "S R G m"},
        {"raga": "Yaman", "tokens": "N. R G _ | M D N S'"},
        {"raga": "Bhupali", "tokens": "S R G M"},
        {"raga": "Malkauns", "tokens": "_ S"},
    ]
    arrange_cases = []
    for mode in ("taan", "palta", "compact", "sustain"):
        raga = registry.get("Yaman")
        assert raga is not None
        raw = "N. R _ G M"
        notes_per_beat = 4
        result = arrange_sequence(raga, tokenize(raw), mode, notes_per_beat, 3)
        arrange_cases.append(
            {
                "request": {
                    "raga": "Yaman",
                    "tokens": raw,
                    "mode": mode,
                    "notes_per_beat": notes_per_beat,
                    "motif_length": 3,
                },
                "response": {
                    "tokens": [str(token) for token in result.tokens],
                    "violations": model(result.violations),
                    "notes_per_beat": result.notes_per_beat,
                },
            }
        )

    list_ragas = [
        {
            "name": r.name,
            "thaat": r.definition.thaat,
            "time": r.definition.time,
            "aliases": r.definition.aliases,
            "custom": False,
            "compositions": sum(1 for c in library.for_raga(r.name) if c.sections),
        }
        for r in registry.all()
    ]
    dump("tokens.json", tokens_fixture())
    dump(
        "ragas.json",
        {
            "list": list_ragas,
            "details": {
                name: raga_detail(name, registry, library) for name in ["Yaman", "Bhupali", "Malkauns", "Kafi"]
            },
        },
    )
    dump(
        "intents.json",
        [
            {"request": case, "response": model(parse_intention(case["text"], registry.get(case["raga"])))}  # type: ignore[arg-type]
            for case in intent_cases
        ],
    )
    dump(
        "validation.json",
        [
            {
                "request": case,
                "response": {
                    "tokens": [str(token) for token in tokenize(case["tokens"])],
                    "violations": model(validate(registry.get(case["raga"]), tokenize(case["tokens"]))),  # type: ignore[arg-type]
                },
            }
            for case in validation_cases
        ],
    )
    dump("arrange.json", arrange_cases)
    dump("taals.json", model(list(TAALS.values())))
    dump("config.json", {"taals": model(list(TAALS.values())), "tonics": TONICS, "default_tonic": "G#"})
    dump(
        "mukhdas.json",
        [
            {"raga": c.raga, "title": c.title, "pitches": c.mukhda_pitches()}
            for c in CompositionLibrary.builtin().all()
            if c.sections
        ],
    )


if __name__ == "__main__":
    main()
