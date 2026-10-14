"""Alaap and taan phrases for a raga, shaped for the sthayi and the antara.

Sthayi phrases stay in the mandra and madhya saptaks and resolve to madhya Sa.
Antara phrases rise into the taar saptak and resolve to taar Sa. Alaaps are
free and unmetered: seven phrases per section that widen step by step (badhat),
with brief notes, lingering resting notes, and a long final note. They aren't
fitted to the taal. Taans move fast (four notes per beat) and are built from
rising and falling runs chained together; they're 8 or 16 beats long. When a
composition is given, its taans and its two long alaaps land on the first note
of the sthayi or antara mukhda, so each leads back into the composition. Every phrase is a walk on the raga's
move graph, so it always obeys the raga.
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

PhraseKind = Literal["short", "long"]

_RANGES = {"sthayi": (-7, 9), "antara": (4, 19)}
_ENDS = {"sthayi": 0, "antara": 12}
_ALAAP_NPB = 2
# Badhat: each alaap explores a little more of the saptak than the one before.
# Every stage is (lowest pitch, highest pitch, notes). The last two are longer.
_ALAAP_STAGES = {
    "sthayi": [(-5, 4, 4), (-7, 5, 5), (-7, 7, 6), (-5, 9, 7), (-3, 11, 8), (-7, 11, 10), (-7, 12, 12)],
    "antara": [(4, 12, 4), (5, 14, 5), (7, 14, 6), (7, 16, 7), (9, 17, 8), (7, 19, 10), (4, 19, 12)],
}
_SHORT_ALAAPS = 5
_TAAN_NPB = 4
_SHORT_TAAN_BEATS = 8
_LONG_TAAN_BEATS = 16
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
    def __init__(
        self,
        raga: Raga,
        section: str,
        rng: random.Random,
        end: int | None = None,
        span: tuple[int, int] | None = None,
    ) -> None:
        self.raga = raga
        self.rng = rng
        self.end = _ENDS[section] if end is None else end
        lo, hi = span or _RANGES[section]
        self.range = (min(lo, self.end), max(hi, self.end))
        self.emphasize = [n for n in (raga.vadi, raga.samvadi) if n is not None]
        self.live = self._live_pitches()

    def _live_pitches(self) -> frozenset[int]:
        """Pitches in range from which the final note can still be reached."""
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
        """A path of ``total`` notes made of runs that follow ``contours`` and end on the final note."""
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

    def alaap(self, notes: int) -> list[Token] | None:
        """A free alaap of about ``notes`` notes. It isn't fitted to the taal."""
        sthayi = self.end < _ENDS["antara"]
        if notes >= 10:
            contours = [Contour.ASCENDING, Contour.DESCENDING] if sthayi else [Contour.ARCH, Contour.ASCENDING]
        else:
            contours = [
                self.rng.choice(
                    [Contour.VALLEY, Contour.ARCH, Contour.DESCENDING, Contour.ANY]
                    if sthayi
                    else [Contour.ASCENDING, Contour.ARCH, Contour.ARCH]
                )
            ]
        path = self.chain(notes + self.rng.randrange(2), contours)
        if path is None:
            return None
        return _free_holds(path, {0, 7, *self.emphasize}, self.rng)

    def taan(self, beats: int) -> list[Token] | None:
        slots = beats * _TAAN_NPB
        # The last note rings for a whole beat, so the taan lands clearly.
        notes = slots - (_TAAN_NPB - 1)
        runs = max(1, round(notes / self.rng.choice([8, 10, 12, 14])))
        first = self.rng.choice([Contour.ASCENDING, Contour.DESCENDING]) if runs > 1 else Contour.ARCH
        other = Contour.DESCENDING if first == Contour.ASCENDING else Contour.ASCENDING
        contours = [first if i % 2 == 0 else other for i in range(runs)]
        if runs > 1 and contours[-1] != Contour.DESCENDING and self.end < _ENDS["antara"]:
            contours[-1] = Contour.ANY
        path = self.chain(notes, contours)
        if path is None:
            return None
        return [*path, *([HOLD] * (_TAAN_NPB - 1))]


def _free_holds(path: list[Swara], nyas: set[int], rng: random.Random) -> list[Token]:
    """Brief notes, lingering resting notes (nyas), and a long final note, padded to whole beats."""
    tokens: list[Token] = []
    for i, swara in enumerate(path):
        holds = rng.choice([0, 0, 1, 1, 2])
        if i > 0 and swara.semitone in nyas:
            holds += rng.choice([1, 2])
        if i == len(path) - 1:
            holds = 3 + rng.randrange(3)
        tokens.append(swara)
        tokens.extend([HOLD] * holds)
    if len(tokens) % _ALAAP_NPB:
        tokens.extend([HOLD] * (_ALAAP_NPB - len(tokens) % _ALAAP_NPB))
    return tokens


def _collect(
    make: Callable[[int], list[Token] | None],
    raga: Raga,
    beats_options: list[int],
    count: int,
    kind: PhraseKind,
    npb: int,
    rng: random.Random,
    seen: set[tuple[str, ...]] | None = None,
) -> list[Phrase]:
    phrases: list[Phrase] = []
    seen = set() if seen is None else seen
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
        beats = -(-len(key) // npb)
        phrases.append(Phrase(kind=kind, beats=beats, notes_per_beat=npb, tokens=list(key)))
    if len(phrases) < count:
        raise ImprovisationError(f"Couldn't build enough {kind} phrases for {raga.name}.")
    return phrases


def _alaaps(raga: Raga, section: str, rng: random.Random, land: int | None) -> list[Phrase]:
    """Seven free alaaps that widen step by step.

    The short ones rest on the section's Sa; the long ones end on ``land``, the
    mukhda's first note, when the raga allows it.
    """
    seen: set[tuple[str, ...]] = set()
    items: list[Phrase] = []
    for i, (lo, hi, notes) in enumerate(_ALAAP_STAGES[section]):
        kind: PhraseKind = "short" if i < _SHORT_ALAAPS else "long"
        ends = [land, None] if kind == "long" and land is not None else [None]
        item = None
        for end in ends:
            for span in ((lo, hi), None):
                builder = _Builder(raga, section, rng, end, span)

                def make(_beats: int, b: _Builder = builder, n: int = notes) -> list[Token] | None:
                    return b.alaap(n)

                try:
                    item = _collect(make, raga, [0], 1, kind, _ALAAP_NPB, rng, seen)[0]
                except ImprovisationError:
                    continue
                break
            if item is not None:
                break
        if item is None:
            raise ImprovisationError(f"Couldn't build enough alaap phrases for {raga.name}.")
        items.append(item)
    return items


def _taans(raga: Raga, section: str, rng: random.Random, land: int | None) -> list[Phrase]:
    """Five 8-beat and two 16-beat taans, landing on ``land`` when the raga allows it."""
    for end in dict.fromkeys([land, None]):
        builder = _Builder(raga, section, rng, end)
        try:
            return [
                *_collect(builder.taan, raga, [_SHORT_TAAN_BEATS], 5, "short", _TAAN_NPB, rng),
                *_collect(builder.taan, raga, [_LONG_TAAN_BEATS], 2, "long", _TAAN_NPB, rng),
            ]
        except ImprovisationError:
            if end is None:
                raise
    raise AssertionError("unreachable")


def improvise(
    raga: Raga,
    taal_name: str,
    taal_beats: int,
    seed: int | None = None,
    land: dict[str, int] | None = None,
) -> Improvisations:
    """Alaaps and taans for ``raga``. ``land`` maps a section to the pitch its taans end on."""
    seed = default_seed(raga) if seed is None else seed
    rng = random.Random(seed)
    land = land or {}
    groups: list[PhraseGroup] = []
    for section, label, where in (
        ("sthayi", "Sthayi", "in the mandra and madhya saptaks, resting on Sa"),
        ("antara", "Antara", "rising into the taar saptak, resting on taar Sa"),
    ):
        alaap_items = _alaaps(raga, section, rng, land.get(section))
        final = next(t for t in reversed(alaap_items[-1].tokens) if t not in ("_", "-"))
        lead = ""
        if section in land and Swara.parse(final).pitch == land[section]:
            lead = f" The long ones end on {final}, the first note of the {section} mukhda."
        groups.append(
            PhraseGroup(
                key=f"{section}-alaap",
                title=f"{label} alaap",
                description=f"Free, unmetered phrases with held notes that widen step by step, {where}.{lead}",
                items=alaap_items,
            )
        )
    for section, label, where, home in (
        ("sthayi", "Sthayi", "in the mandra and madhya saptaks", "Sa"),
        ("antara", "Antara", "reaching into the taar saptak", "taar Sa"),
    ):
        items = _taans(raga, section, rng, land.get(section))
        final = next(t for t in reversed(items[0].tokens) if t not in ("_", "-"))
        if section in land and Swara.parse(final).pitch == land[section]:
            landing = f"landing on {final}, the first note of the {section} mukhda"
        else:
            landing = f"landing on {home}"
        groups.append(
            PhraseGroup(
                key=f"{section}-taan",
                title=f"{label} taan",
                description=f"Fast runs at four notes per beat, 8 or 16 beats long, {where}, {landing}.",
                items=items,
            )
        )
    return Improvisations(raga=raga.name, taal=taal_name, taal_beats=taal_beats, seed=seed, groups=groups)
