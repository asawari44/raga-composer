"""Alaap and taan phrases for a raga, shaped for the sthayi and the antara.

Sthayi phrases stay in the mandra and madhya saptaks and resolve to madhya Sa.
Antara phrases rise into the taar saptak and resolve to taar Sa. Alaaps move
slowly (two slots per beat, with many held notes); taans move fast (four notes
per beat) and are built from rising and falling runs chained together. Every
phrase is a walk on the raga's move graph, so it always obeys the raga.
"""

from __future__ import annotations

import random
import zlib
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel

from raga_composer.generator import Generator, validate
from raga_composer.intent import Contour, Intention, NoteTarget
from raga_composer.notation import HOLD, Swara, Token
from raga_composer.raga import Raga

PhraseKind = Literal["short", "avartan", "double"]

_RANGES = {"sthayi": (-7, 9), "antara": (4, 19)}
_ENDS = {"sthayi": 0, "antara": 12}
_ALAAP_NPB = 2
_TAAN_NPB = 4
_ATTEMPTS = 40


class Phrase(BaseModel):
    kind: PhraseKind
    beats: int
    notes_per_beat: int
    tokens: list[str]


class PhraseGroup(BaseModel):
    key: str
    title: str
    description: str
    items: list[Phrase]


class Improvisations(BaseModel):
    raga: str
    taal: str
    taal_beats: int
    seed: int
    groups: list[PhraseGroup]


class ImprovisationError(ValueError):
    pass


def default_seed(raga: Raga) -> int:
    return zlib.crc32(raga.name.encode("utf-8"))


def _target(pitch: int) -> NoteTarget:
    swara = Swara(pitch)
    return NoteTarget(semitone=swara.semitone, octave=swara.octave)


class _Builder:
    def __init__(self, raga: Raga, section: str, rng: random.Random) -> None:
        self.raga = raga
        self.rng = rng
        self.range = _RANGES[section]
        self.end = _ENDS[section]
        self.emphasize = [n for n in (raga.vadi, raga.samvadi) if n is not None]
        self.live = self._live_pitches()

    def _live_pitches(self) -> frozenset[int]:
        """Pitches in range from which the final Sa can still be reached."""
        lo, hi = self.range
        nodes = [p for p in self.raga.pitches if lo <= p.pitch <= hi]
        live = {p.pitch for p in nodes if p.pitch == self.end}
        changed = True
        while changed:
            changed = False
            for p in nodes:
                if p.pitch not in live and any(v.pitch in live for v in self.raga.successors(p)):
                    live.add(p.pitch)
                    changed = True
        return frozenset(live)

    def _segment(self, n: int, contour: Contour, start: int | None, end: int | None) -> list[Swara] | None:
        intention = Intention(
            contour=contour,
            start=_target(start) if start is not None else None,
            end=_target(end) if end is not None else None,
            emphasize=self.emphasize,
            use_pakad=True,
        )
        generator = Generator(self.raga, intention, pitch_range=self.range, allowed=self.live, rng=self.rng)
        ranked = generator.ranked_paths(n, candidates=30)
        if not ranked:
            return None
        return ranked[self.rng.randrange(min(3, len(ranked)))][1]

    def chain(self, total: int, contours: list[Contour]) -> list[Swara] | None:
        """A path of ``total`` notes made of runs that follow ``contours`` and end on Sa."""
        parts = len(contours)
        sizes = [total // parts + (1 if i < total % parts else 0) for i in range(parts)]
        path: list[Swara] = []
        for i, (size, contour) in enumerate(zip(sizes, contours, strict=True)):
            last = i == parts - 1
            start = path[-1].pitch if path else None
            segment = self._segment(size + (1 if path else 0), contour, start, self.end if last else None)
            if segment is None:
                return None
            path.extend(segment[1:] if path else segment)
        return path

    def alaap(self, beats: int) -> list[Token] | None:
        slots = beats * _ALAAP_NPB
        notes = max(3, round(slots * 0.55))
        contour = self.rng.choice(
            [Contour.ASCENDING, Contour.ARCH, Contour.ARCH]
            if self.end == 12
            else [Contour.ARCH, Contour.VALLEY, Contour.DESCENDING, Contour.ANY]
        )
        path = self.chain(notes, [contour])
        return _with_holds(path, slots, self.rng) if path else None

    def taan(self, beats: int) -> list[Token] | None:
        slots = beats * _TAAN_NPB
        # The last note rings for a whole beat, so the taan lands clearly on Sa.
        notes = slots - (_TAAN_NPB - 1)
        runs = max(1, round(notes / self.rng.choice([8, 10, 12, 14])))
        first = self.rng.choice([Contour.ASCENDING, Contour.DESCENDING]) if runs > 1 else Contour.ARCH
        other = Contour.DESCENDING if first == Contour.ASCENDING else Contour.ASCENDING
        contours = [first if i % 2 == 0 else other for i in range(runs)]
        if runs > 1 and contours[-1] != Contour.DESCENDING and self.end == 0:
            contours[-1] = Contour.ANY
        path = self.chain(notes, contours)
        if path is None:
            return None
        return [*path, *([HOLD] * (_TAAN_NPB - 1))]


def _with_holds(path: list[Swara], slots: int, rng: random.Random) -> list[Token]:
    extra = slots - len(path)
    counts = [0] * len(path)
    last_hold = min(extra, 3)
    counts[-1] = last_hold
    extra -= last_hold
    while extra > 0:
        i = rng.randrange(len(path))
        if counts[i] < 3 or i == len(path) - 1:
            counts[i] += 1
            extra -= 1
    tokens: list[Token] = []
    for swara, holds in zip(path, counts, strict=True):
        tokens.append(swara)
        tokens.extend([HOLD] * holds)
    return tokens


def _collect(
    make: Callable[[int], list[Token] | None],
    raga: Raga,
    beats_options: list[int],
    count: int,
    kind: PhraseKind,
    npb: int,
    rng: random.Random,
) -> list[Phrase]:
    phrases: list[Phrase] = []
    seen: set[tuple[str, ...]] = set()
    for _ in range(count * _ATTEMPTS):
        if len(phrases) == count:
            break
        beats = beats_options[len(phrases) % len(beats_options)]
        tokens = make(beats)
        if tokens is None:
            continue
        key = tuple(str(t) for t in tokens)
        if key in seen or validate(raga, tokens):
            continue
        seen.add(key)
        phrases.append(Phrase(kind=kind, beats=beats, notes_per_beat=npb, tokens=list(key)))
    if len(phrases) < count:
        raise ImprovisationError(f"Couldn't build enough {kind} phrases for {raga.name}.")
    return phrases


def improvise(raga: Raga, taal_name: str, taal_beats: int, seed: int | None = None) -> Improvisations:
    seed = default_seed(raga) if seed is None else seed
    rng = random.Random(seed)
    short_alaap = [b for b in (4, 6, 8) if b < taal_beats] or [max(2, taal_beats // 2)]
    short_taan = [b for b in (2, 3, 4) if b < taal_beats] or [2]
    groups: list[PhraseGroup] = []
    for section, label, where in (
        ("sthayi", "Sthayi", "in the mandra and madhya saptaks, resolving to Sa"),
        ("antara", "Antara", "rising into the taar saptak, resolving to taar Sa"),
    ):
        builder = _Builder(raga, section, rng)
        groups.append(
            PhraseGroup(
                key=f"{section}-alaap",
                title=f"{label} alaap",
                description=f"Slow phrases with held notes, {where}.",
                items=[
                    *_collect(builder.alaap, raga, short_alaap, 5, "short", _ALAAP_NPB, rng),
                    *_collect(builder.alaap, raga, [taal_beats], 2, "avartan", _ALAAP_NPB, rng),
                ],
            )
        )
    for section, label, where in (
        ("sthayi", "Sthayi", "in the mandra and madhya saptaks, landing on Sa"),
        ("antara", "Antara", "reaching into the taar saptak, landing on taar Sa"),
    ):
        builder = _Builder(raga, section, rng)
        groups.append(
            PhraseGroup(
                key=f"{section}-taan",
                title=f"{label} taan",
                description=f"Fast runs at four notes per beat, {where}.",
                items=[
                    *_collect(builder.taan, raga, short_taan, 5, "short", _TAAN_NPB, rng),
                    *_collect(builder.taan, raga, [taal_beats * 2], 2, "double", _TAAN_NPB, rng),
                ],
            )
        )
    return Improvisations(raga=raga.name, taal=taal_name, taal_beats=taal_beats, seed=seed, groups=groups)
