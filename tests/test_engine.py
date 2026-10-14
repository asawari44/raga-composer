import pytest

from raga_composer.generator import Generator, arrange_palta, validate
from raga_composer.intent import Contour, Intention, NoteTarget, parse_intention
from raga_composer.notation import HOLD, Swara, tokenize
from raga_composer.raga import RagaRegistry

REGISTRY = RagaRegistry.with_builtins()
ALL_RAGAS = [r.name for r in REGISTRY.all()]


def test_notation_round_trip() -> None:
    tokens = tokenize("N. R G _ | M D N S' - p ni")
    assert [str(t) for t in tokens] == ["N.", "R", "G", "_", "M", "D", "N", "S'", "-", "P", "n"]
    assert Swara.parse("S'").pitch == 12
    assert Swara.parse("D.").pitch == -3


@pytest.mark.parametrize("name", ALL_RAGAS)
def test_builtin_ragas_have_required_content(name: str) -> None:
    raga = REGISTRY.get(name)
    assert raga is not None
    assert len(raga.definition.patterns) >= 5
    assert raga.definition.pakad
    for phrase in [raga.definition.aaroh, raga.definition.avroh, *raga.definition.pakad, *raga.definition.patterns]:
        assert validate(raga, tokenize(phrase)) == [], phrase


def test_validation_catches_varjit_and_wrong_direction() -> None:
    yaman = REGISTRY.get("Yaman")
    assert yaman is not None
    messages = [v.message for v in validate(yaman, tokenize("G m P"))]
    assert any("varjit" in m for m in messages)
    bhupali = REGISTRY.get("bhoop")
    assert bhupali is not None
    assert validate(bhupali, tokenize("S R G M"))  # Ma is varjit in Bhupali


def test_parse_example_intention() -> None:
    yaman = REGISTRY.get("Yaman")
    assert yaman is not None
    intent = parse_intention("ascending ending on S and has 16 beats", yaman)
    assert intent.contour == Contour.ASCENDING
    assert intent.beats == 16
    assert intent.end == NoteTarget(semitone=0)


def test_parse_rich_intention() -> None:
    kafi = REGISTRY.get("Kafi")
    assert kafi is not None
    intent = parse_intention("taan in teentaal, up and down, start on komal ni, end on taar sa, emphasize Pa", kafi)
    assert intent.contour == Contour.ARCH
    assert intent.beats == 16 and intent.taal == "Teentaal"
    assert intent.notes_per_beat == 2
    assert intent.start == NoteTarget(semitone=10)
    assert intent.end == NoteTarget(semitone=0, octave=1)
    assert intent.emphasize == [7]


@pytest.mark.parametrize("name", ALL_RAGAS)
@pytest.mark.parametrize(
    "text",
    [
        "ascending ending on S and has 16 beats",
        "descending ending on S, 8 beats, 2 notes per beat",
        "up and down taan in teentaal",
        "12 beats with held notes, use the pakad",
    ],
)
def test_generated_patterns_obey_raga_and_constraints(name: str, text: str) -> None:
    raga = REGISTRY.get(name)
    assert raga is not None
    intent = parse_intention(text, raga)
    patterns = Generator(raga, intent, seed=7).generate()
    assert patterns
    for p in patterns:
        tokens = tokenize(" ".join(p.tokens))
        assert len(tokens) == intent.beats * intent.notes_per_beat
        assert validate(raga, tokens) == []
        notes = [t for t in tokens if isinstance(t, Swara)]
        if intent.end:
            assert notes[-1].semitone == intent.end.semitone


def test_ascending_contour_rises() -> None:
    yaman = REGISTRY.get("Yaman")
    assert yaman is not None
    best = Generator(yaman, Intention(contour=Contour.ASCENDING, beats=16), seed=1).generate()[0]
    notes = [t for t in tokenize(" ".join(best.tokens)) if isinstance(t, Swara)]
    assert notes[-1] > notes[0]


def test_holds_fill_the_requested_beats() -> None:
    raga = REGISTRY.get("Bhupali")
    assert raga is not None
    p = Generator(raga, Intention(beats=8, hold_ratio=0.3), seed=3).generate()[0]
    assert len(p.tokens) == 8 and HOLD in p.tokens


@pytest.mark.parametrize("name", ALL_RAGAS)
def test_palta_always_validates(name: str) -> None:
    raga = REGISTRY.get(name)
    assert raga is not None
    motif = raga.aaroh[:3]
    result = arrange_palta(raga, motif)
    assert result[:3] == motif
    assert validate(raga, result) == []
