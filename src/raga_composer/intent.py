"""Turn a free-text intention into structured generation constraints.

Example: "ascending ending on S and has 16 beats" becomes
``Intention(contour="ascending", end=NoteTarget(semitone=0), beats=16)``.
"""

from __future__ import annotations

import re
from enum import StrEnum

from pydantic import BaseModel, Field

from raga_composer.notation import NotationError, Swara
from raga_composer.raga import Raga
from raga_composer.taal import TAALS


class Contour(StrEnum):
    ASCENDING = "ascending"
    DESCENDING = "descending"
    ARCH = "arch"
    VALLEY = "valley"
    ANY = "any"


class Register(StrEnum):
    MANDRA = "mandra"
    MADHYA = "madhya"
    TAAR = "taar"
    FULL = "full"


class NoteTarget(BaseModel):
    """A swara constraint. ``octave=None`` means any octave."""

    semitone: int = Field(ge=0, le=11)
    octave: int | None = Field(default=None, ge=-1, le=1)

    def label(self) -> str:
        swara = Swara((self.octave or 0) * 12 + self.semitone)
        return str(swara) if self.octave is not None else swara.name

    def matches(self, swara: Swara) -> bool:
        return swara.semitone == self.semitone and (self.octave is None or swara.octave == self.octave)


class Intention(BaseModel):
    contour: Contour = Contour.ANY
    beats: int = Field(default=8, ge=1, le=64)
    notes_per_beat: int = Field(default=1, ge=1, le=8)
    start: NoteTarget | None = None
    end: NoteTarget | None = None
    emphasize: list[int] = []
    hold_ratio: float = Field(default=0.0, ge=0.0, le=0.6)
    saptak: Register = Register.FULL
    use_pakad: bool = False
    taal: str | None = None
    count: int = Field(default=4, ge=1, le=12)
    summary: list[str] = []


_SWARA_WORDS = {
    "sa": "S",
    "re": "R",
    "ri": "R",
    "ga": "G",
    "ma": "m",
    "pa": "P",
    "dha": "D",
    "da": "D",
    "ni": "N",
}
_KOMAL_OF = {"R": "r", "G": "g", "D": "d", "N": "n"}
_NOTE_TOKEN = r"(?:ni|[SrRgGmMPpdDnN])(?:'+|\.+)?(?![A-Za-z])"
_NOTE_WORDS = r"(?:sa|re|ri|ga|ma|pa|dha|da|ni)\b"
_MODIFIER = r"(?:(?:komal|tivra|teevra|shuddha|taar|tar|upper|high|higher|mandra|lower|low|madhya|middle)\s+)*"
_NOTE_PHRASE = rf"(?P<note>{_MODIFIER}(?:{_NOTE_TOKEN}|{_NOTE_WORDS}))"

_TAAL_BEATS = {name: t.beats for name, t in TAALS.items()}
_TAAL_ALIASES = {
    "tintal": "teentaal",
    "teental": "teentaal",
    "tintaal": "teentaal",
    "ektal": "ektaal",
    "jhaptal": "jhaptaal",
    "rupaktaal": "rupak",
    "kaharwa": "keherwa",
    "keherva": "keherwa",
    "dadra": "dadra",
}
_SPEED_WORDS = {
    "dugun": 2,
    "double speed": 2,
    "tigun": 3,
    "triple speed": 3,
    "chaugun": 4,
    "quadruple speed": 4,
}


def resolve_note(phrase: str, raga: Raga) -> NoteTarget | None:
    """Resolve "taar sa", "komal ga", "S'", or "N." to a note of the raga."""
    words = phrase.strip().split()
    if not words:
        return None
    modifiers = {w.lower() for w in words[:-1]}
    head = words[-1]
    octave: int | None = None
    if modifiers & {"taar", "tar", "upper", "high", "higher"}:
        octave = 1
    elif modifiers & {"mandra", "lower", "low"}:
        octave = -1
    elif modifiers & {"madhya", "middle"}:
        octave = 0

    if head.lower() in _SWARA_WORDS:
        letter = _SWARA_WORDS[head.lower()]
        if "komal" in modifiers:
            letter = _KOMAL_OF.get(letter, letter)
        elif modifiers & {"tivra", "teevra"}:
            letter = "M" if letter == "m" else letter
        elif not modifiers & {"shuddha"}:
            letter = _closest_in_raga(letter, raga)
        swara = Swara.parse(letter)
        return NoteTarget(semitone=swara.semitone, octave=octave)

    try:
        swara = Swara.parse(head)
    except NotationError:
        return None
    has_mark = head.endswith("'") or head.endswith(".")
    return NoteTarget(semitone=swara.semitone, octave=swara.octave if has_mark else octave)


def _closest_in_raga(letter: str, raga: Raga) -> str:
    """For a bare word like "ga", pick the variant (G or g) that the raga uses."""
    variants = {"R": "Rr", "G": "Gg", "m": "mM", "D": "Dd", "N": "Nn"}.get(letter, letter)
    for v in variants:
        if Swara.parse(v).semitone in raga.semitones:
            return v
    return letter


def _find_note(text: str, verbs: str, raga: Raga) -> NoteTarget | None:
    pattern = rf"\b(?:{verbs})\s+(?:on|at|with|from|to|in|into)?\s*(?:the\s+)?{_NOTE_PHRASE}"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    raw = text[match.start("note") : match.end("note")]
    return resolve_note(raw, raga)


def parse_intention(text: str, raga: Raga, base: Intention | None = None) -> Intention:
    """Parse free text. Fields not mentioned keep the values from ``base``."""
    intent = (base or Intention()).model_copy(deep=True)
    summary: list[str] = []
    lower = text.lower()

    # Contour: check compound shapes before plain directions.
    if re.search(r"up and down|rise and fall|rising and falling|arch|aaroh[- ]avroh|up then down", lower):
        intent.contour = Contour.ARCH
    elif re.search(r"down and up|fall and rise|valley|dip|down then up", lower):
        intent.contour = Contour.VALLEY
    elif re.search(r"ascend|rising|rise|upward|going up|goes up|climb|aaroh|arohi", lower):
        intent.contour = Contour.ASCENDING
    elif re.search(r"descend|falling|fall|downward|going down|goes down|avroh|avrohi", lower):
        intent.contour = Contour.DESCENDING
    summary.append(f"contour: {intent.contour.value}")

    taal_match = re.search(r"\b(" + "|".join(list(_TAAL_BEATS) + list(_TAAL_ALIASES)) + r")\b", lower)
    if taal_match:
        name = _TAAL_ALIASES.get(taal_match.group(1), taal_match.group(1))
        intent.taal = TAALS[name].name
        intent.beats = _TAAL_BEATS[name]
        cycles = re.search(r"(\d+)\s*(?:cycles?|avartans?|avartanas?)", lower)
        if cycles:
            intent.beats = min(64, intent.beats * int(cycles.group(1)))
    beats = re.search(r"(\d+)\s*(?:beats?|matras?|counts?|maatras?)", lower)
    if beats:
        intent.beats = max(1, min(64, int(beats.group(1))))
    summary.append(f"beats: {intent.beats}" + (f" ({intent.taal})" if intent.taal else ""))

    npb = re.search(r"(\d+)\s*notes?\s*(?:per|a|each|in a|in each)\s*beat", lower)
    if npb:
        intent.notes_per_beat = max(1, min(8, int(npb.group(1))))
    else:
        for word, speed in _SPEED_WORDS.items():
            if word in lower:
                intent.notes_per_beat = speed
                break
        else:
            if re.search(r"\btaan\b|\bfast\b", lower) and intent.notes_per_beat == 1:
                intent.notes_per_beat = 2
    if intent.notes_per_beat > 1:
        summary.append(f"{intent.notes_per_beat} notes per beat")

    end = _find_note(
        text,
        r"end|ends|ending|finish|finishes|finishing|land|lands|landing|resolve|resolves|resolving|stop|stops|stopping",
        raga,
    )
    if end:
        intent.end = end
        summary.append(f"ends on {end.label()}")
    start = _find_note(text, r"start|starts|starting|begin|begins|beginning|open|opens|opening", raga)
    if start:
        intent.start = start
        summary.append(f"starts on {start.label()}")

    emph = re.search(
        r"\b(?:emphasi[sz]\w*|stress\w*|focus\w*|highlight\w*|around)\s+(?:on\s+)?(?:the\s+)?(?P<notes>.+?)(?:$|[.;]|\band\s+(?:has|is|with|end|start))",
        text,
        flags=re.IGNORECASE,
    )
    if emph:
        found: list[int] = []
        for part in re.split(r",|\band\b|&", emph.group("notes")):
            note = resolve_note(part, raga)
            if note and note.semitone in raga.semitones:
                found.append(note.semitone)
        if found:
            intent.emphasize = sorted(set(found))
    if re.search(r"\bvadi\b", lower):
        intent.emphasize = sorted({*intent.emphasize, *(n for n in (raga.vadi, raga.samvadi) if n is not None)})
    if intent.emphasize:
        summary.append("emphasis: " + " ".join(Swara(s).name for s in intent.emphasize))

    if re.search(r"no holds|without holds|no elongat|staccato", lower):
        intent.hold_ratio = 0.0
    elif re.search(r"elongat|sustain|long notes|held notes|with holds|slow|aalap|alap|meend", lower):
        intent.hold_ratio = 0.3
    if intent.hold_ratio:
        summary.append("with held notes (_)")

    if re.search(r"taar saptak|upper octave|upper register|high register|in taar", lower):
        intent.saptak = Register.TAAR
    elif re.search(r"mandra saptak|lower octave|low register|in mandra", lower):
        intent.saptak = Register.MANDRA
    elif re.search(r"madhya saptak|middle octave|middle register|in madhya", lower):
        intent.saptak = Register.MADHYA
    if intent.saptak != Register.FULL:
        summary.append(f"saptak: {intent.saptak.value}")

    if re.search(r"pakad|signature|characteristic", lower):
        intent.use_pakad = True
        summary.append("leans on the pakad")

    count = re.search(r"(\d+)\s*(?:patterns?|options?|variations?|phrases?|lines?|sequences?)", lower)
    if count:
        intent.count = max(1, min(12, int(count.group(1))))

    intent.summary = summary
    return intent
