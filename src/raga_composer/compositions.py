"""Traditional compositions (bandishes) with their notation.

Each line is one avartan of the taal: a list of beats, where each beat holds
zero or more space-separated tokens played evenly inside that beat.
"""

from __future__ import annotations

import json
import unicodedata
from difflib import SequenceMatcher
from importlib import resources

from pydantic import BaseModel, Field, model_validator

from raga_composer.notation import Swara, tokenize
from raga_composer.taal import get_taal

# Taals that appear in compositions but have no tabla theka in the app.
EXTRA_TAAL_BEATS = {
    "punjabi": 16,
    "sitarkhani": 16,
}


def taal_beats(name: str) -> int | None:
    taal = get_taal(name)
    if taal:
        return taal.beats
    return EXTRA_TAAL_BEATS.get(name.lower().replace(" ", "").replace("-", ""))


class CompositionLine(BaseModel):
    beats: list[str]
    words: list[str] = []

    @model_validator(mode="after")
    def _check(self) -> CompositionLine:
        for beat in self.beats:
            if beat.strip():
                tokenize(beat)
        if self.words and len(self.words) != len(self.beats):
            raise ValueError("words must have one entry per beat")
        return self


# Share of the lyrics' letters that must appear, in order, in the sung syllables.
LYRICS_MIN_COVERAGE = 0.85


def _letters(text: str) -> str:
    """Keep only letters and vowel signs, dropping holds (ऽ, _) and punctuation."""
    return "".join(
        ch for ch in unicodedata.normalize("NFC", text.lower()) if unicodedata.category(ch)[0] in "LM" and ch != "ऽ"
    )


def lyrics_coverage(lyrics: list[str], syllables: list[str]) -> float:
    """Return the share of the lyrics' letters found, in order, in the syllables.

    Lyrics may drop repeated lines and the inherent vowel ("adhar" for
    "a dha ra"), so they only need to be covered by the syllables, not equal them.
    """
    text, sung = _letters(" ".join(lyrics)), _letters(" ".join(syllables))
    if not text:
        return 1.0
    matcher = SequenceMatcher(None, text, sung, autojunk=False)
    return sum(block.size for block in matcher.get_matching_blocks()) / len(text)


class CompositionSection(BaseModel):
    name: str
    lines: list[CompositionLine] = Field(min_length=1)
    # The words of the section as poetry, one entry per line of the text.
    lyrics: list[str] = []

    @model_validator(mode="after")
    def _check_lyrics(self) -> CompositionSection:
        if self.lyrics:
            syllables = [w for line in self.lines for w in line.words]
            coverage = lyrics_coverage(self.lyrics, syllables)
            if coverage < LYRICS_MIN_COVERAGE:
                raise ValueError(f"{self.name}: lyrics don't match the sung syllables ({coverage:.0%})")
        return self


class Composition(BaseModel):
    raga: str
    title: str
    type: str = ""
    taal: str
    laya: str = ""
    composer: str = "Traditional"
    source: str
    notes: str = ""
    # The taal matra (1-based) of the first beat in every line. Sources often
    # start each line at the mukhda, for example on matra 9 of Teentaal.
    first_matra: int = Field(default=1, ge=1)
    sections: list[CompositionSection] = []

    @model_validator(mode="after")
    def _beats_match_taal(self) -> Composition:
        beats = taal_beats(self.taal)
        if beats is None:
            return self
        if self.first_matra > beats:
            raise ValueError(f"{self.title}: first_matra {self.first_matra} is past the end of {self.taal}")
        for section in self.sections:
            for i, line in enumerate(section.lines, 1):
                if len(line.beats) != beats:
                    raise ValueError(
                        f"{self.title}: {section.name} line {i} has {len(line.beats)} beats; {self.taal} has {beats}"
                    )
        return self

    def mukhda_pitches(self) -> dict[str, int]:
        """The first sung pitch of the sthayi and of the antara, keyed by section."""
        antara = next((s for s in self.sections[1:] if "antara" in s.name.lower()), None)
        found: dict[str, int] = {}
        for key, section in (("sthayi", self.sections[0] if self.sections else None), ("antara", antara)):
            if section is None:
                continue
            for line in section.lines:
                pitch = next((t.pitch for beat in line.beats for t in tokenize(beat) if isinstance(t, Swara)), None)
                if pitch is not None:
                    found[key] = pitch
                    break
        return found


class CompositionLibrary:
    def __init__(self, items: list[Composition]) -> None:
        self._by_raga: dict[str, list[Composition]] = {}
        for item in items:
            self._by_raga.setdefault(item.raga.lower(), []).append(item)

    @classmethod
    def builtin(cls) -> CompositionLibrary:
        path = resources.files("raga_composer.data").joinpath("compositions.json")
        if not path.is_file():
            return cls([])
        return cls([Composition.model_validate(c) for c in json.loads(path.read_text("utf-8"))])

    def for_raga(self, raga_name: str) -> list[Composition]:
        return self._by_raga.get(raga_name.lower(), [])

    def all(self) -> list[Composition]:
        return [c for items in self._by_raga.values() for c in items]
