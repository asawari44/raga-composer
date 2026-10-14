"""Raga definitions and the movement rules derived from them.

A raga is modeled as a directed graph of allowed note-to-note moves (bigrams):

* consecutive notes of the aaroh (ascending moves) and of the avroh (descending
  moves), repeated in every octave,
* one-note leaps along the aaroh or avroh when that list moves in one direction
  (that is, it isn't vakra),
* consecutive notes inside the pakad and the curated common phrases,
* repeating the same note.

Any sequence whose every consecutive pair of notes is an edge of this graph
obeys the raga's aaroh, avroh, and varjit (omitted) swaras.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import StrEnum
from functools import cached_property
from importlib import resources

from pydantic import BaseModel, Field, field_validator

from raga_composer.notation import NotationError, Swara, parse_phrase

# Playable range: shuddha Ma of the lower octave up to Pa of the upper octave.
LOWEST_PITCH = -7
HIGHEST_PITCH = 19


class MoveKind(StrEnum):
    AAROH = "aaroh"
    AVROH = "avroh"
    AAROH_LEAP = "aaroh-leap"
    AVROH_LEAP = "avroh-leap"
    PHRASE = "phrase"
    REPEAT = "repeat"


class RagaDefinition(BaseModel):
    """Raw raga data as stored in JSON or submitted by a user."""

    name: str = Field(min_length=1, max_length=60)
    aliases: list[str] = []
    thaat: str = ""
    jati: str = ""
    vadi: str = ""
    samvadi: str = ""
    time: str = ""
    description: str = ""
    aaroh: str
    avroh: str
    pakad: list[str] = []
    patterns: list[str] = []
    nyas: list[str] = []
    similar: list[str] = []
    avoid: list[str] = []
    sources: list[str] = []
    custom: bool = False

    @field_validator("aaroh", "avroh")
    @classmethod
    def _at_least_three_notes(cls, value: str) -> str:
        if len(parse_phrase(value)) < 3:
            raise ValueError("must contain at least three swaras")
        return value

    @field_validator("pakad", "patterns")
    @classmethod
    def _phrases_parse(cls, value: list[str]) -> list[str]:
        for phrase in value:
            parse_phrase(phrase)
        return value


def _is_monotonic(notes: list[Swara], ascending: bool) -> bool:
    pairs = zip(notes, notes[1:], strict=False)
    return all((b > a) if ascending else (b < a) for a, b in pairs)


@dataclass
class Raga:
    definition: RagaDefinition
    edges: dict[Swara, dict[Swara, MoveKind]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._build_edges()

    @property
    def name(self) -> str:
        return self.definition.name

    @cached_property
    def aaroh(self) -> list[Swara]:
        return parse_phrase(self.definition.aaroh)

    @cached_property
    def avroh(self) -> list[Swara]:
        return parse_phrase(self.definition.avroh)

    @cached_property
    def phrases(self) -> list[list[Swara]]:
        return [parse_phrase(p) for p in self.definition.pakad + self.definition.patterns]

    @cached_property
    def semitones(self) -> frozenset[int]:
        notes = self.aaroh + self.avroh + [s for p in self.phrases for s in p]
        return frozenset(s.semitone for s in notes)

    @cached_property
    def vadi(self) -> int | None:
        return _semitone_or_none(self.definition.vadi)

    @cached_property
    def samvadi(self) -> int | None:
        return _semitone_or_none(self.definition.samvadi)

    @cached_property
    def pitches(self) -> list[Swara]:
        return [Swara(p) for p in range(LOWEST_PITCH, HIGHEST_PITCH + 1) if p % 12 in self.semitones]

    @cached_property
    def phrase_trigrams(self) -> frozenset[tuple[int, int, int]]:
        """Interval-and-pitch-class shapes of 3-note fragments in pakad and phrases."""
        grams: set[tuple[int, int, int]] = set()
        for phrase in self.phrases:
            for a, b, c in zip(phrase, phrase[1:], phrase[2:], strict=False):
                grams.add((a.semitone, b.semitone, c.semitone))
        return frozenset(grams)

    def _add(self, a: Swara, b: Swara, kind: MoveKind) -> None:
        if not (LOWEST_PITCH <= a.pitch <= HIGHEST_PITCH):
            return
        if not (LOWEST_PITCH <= b.pitch <= HIGHEST_PITCH):
            return
        current = self.edges.setdefault(a, {})
        # Keep the most "structural" reason for a move: aaroh/avroh beat leaps and phrases.
        if b not in current or _PRIORITY[kind] < _PRIORITY[current[b]]:
            current[b] = kind

    def _build_edges(self) -> None:
        octaves = range(-2, 3)
        sources: list[tuple[list[Swara], MoveKind, MoveKind | None]] = [
            (
                self.aaroh,
                MoveKind.AAROH,
                MoveKind.AAROH_LEAP if _is_monotonic(self.aaroh, True) else None,
            ),
            (
                self.avroh,
                MoveKind.AVROH,
                MoveKind.AVROH_LEAP if _is_monotonic(self.avroh, False) else None,
            ),
        ]
        for notes, step_kind, leap_kind in sources:
            for k in octaves:
                shifted = [n.shifted(k) for n in notes]
                for a, b in zip(shifted, shifted[1:], strict=False):
                    self._add(a, b, step_kind)
                if leap_kind:
                    for a, c in zip(shifted, shifted[2:], strict=False):
                        self._add(a, c, leap_kind)
        for phrase in self.phrases:
            for k in octaves:
                shifted = [n.shifted(k) for n in phrase]
                for a, b in zip(shifted, shifted[1:], strict=False):
                    self._add(a, b, MoveKind.REPEAT if a == b else MoveKind.PHRASE)
        for p in self.pitches:
            self._add(p, p, MoveKind.REPEAT)

    def move(self, a: Swara, b: Swara) -> MoveKind | None:
        return self.edges.get(a, {}).get(b)

    def successors(self, a: Swara) -> dict[Swara, MoveKind]:
        return self.edges.get(a, {})


_PRIORITY = {
    MoveKind.REPEAT: 0,
    MoveKind.AAROH: 1,
    MoveKind.AVROH: 1,
    MoveKind.PHRASE: 2,
    MoveKind.AAROH_LEAP: 3,
    MoveKind.AVROH_LEAP: 3,
}


def _semitone_or_none(text: str) -> int | None:
    try:
        notes = parse_phrase(text)
    except NotationError:
        return None
    return notes[0].semitone if notes else None


class RagaRegistry:
    """Built-in ragas plus user-defined ones, looked up case-insensitively."""

    def __init__(self) -> None:
        self._ragas: dict[str, Raga] = {}
        self._lookup: dict[str, str] = {}

    @classmethod
    def with_builtins(cls) -> RagaRegistry:
        registry = cls()
        raw = resources.files("raga_composer.data").joinpath("ragas.json").read_text("utf-8")
        for item in json.loads(raw):
            registry.add(RagaDefinition.model_validate(item))
        return registry

    def add(self, definition: RagaDefinition) -> Raga:
        raga = Raga(definition)
        self._ragas[definition.name] = raga
        for key in [definition.name, *definition.aliases]:
            self._lookup[_key(key)] = definition.name
        return raga

    def get(self, name: str) -> Raga | None:
        canonical = self._lookup.get(_key(name))
        return self._ragas.get(canonical) if canonical else None

    def all(self) -> list[Raga]:
        return sorted(self._ragas.values(), key=lambda r: r.name)


def _key(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())
