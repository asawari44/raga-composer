"""Constrained pattern generation and validation.

Generation is a weighted random walk on the raga's move graph (see
``raga.Raga``). A backward reachability table guarantees that every walk ends
on the requested note in exactly the requested number of notes, and the move
graph guarantees that the raga's aaroh and avroh are obeyed. Many candidates
are sampled and ranked by how well they match the requested contour and how
much raga flavor (pakad fragments, vadi/samvadi, emphasis) they carry.
"""

from __future__ import annotations

import math
import random
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import BaseModel

from raga_composer.intent import Contour, Intention, Register
from raga_composer.notation import HOLD, REST, Swara, Token
from raga_composer.raga import Raga

_REGISTER_RANGES = {
    Register.FULL: (-5, 19),
    Register.MANDRA: (-7, 5),
    Register.MADHYA: (-1, 12),
    Register.TAAR: (7, 19),
}
_CANDIDATES = 80


class Violation(BaseModel):
    index: int
    message: str


class GeneratedPattern(BaseModel):
    tokens: list[str]
    notes_per_beat: int
    score: float
    explanation: list[str]


@dataclass(frozen=True)
class Arrangement:
    tokens: list[Token]
    violations: list[Violation]
    notes_per_beat: int


class GenerationError(ValueError):
    pass


def validate(raga: Raga, tokens: Sequence[Token]) -> list[Violation]:
    """Return every place where a sequence breaks the raga's rules."""
    violations: list[Violation] = []
    previous: Swara | None = None
    for i, token in enumerate(tokens):
        if token == REST:
            previous = None
            continue
        if token == HOLD:
            if previous is None and i == 0:
                violations.append(Violation(index=i, message="A hold (_) needs a note before it."))
            continue
        assert isinstance(token, Swara)
        if token.semitone not in raga.semitones:
            violations.append(Violation(index=i, message=f"{token.name} is varjit (not used) in {raga.name}."))
            previous = None
            continue
        if previous is not None and raga.move(previous, token) is None:
            direction = "ascending" if token > previous else "descending"
            reference = raga.definition.aaroh if token > previous else raga.definition.avroh
            violations.append(
                Violation(
                    index=i,
                    message=(
                        f"{previous} → {token} isn't an allowed {direction} move in "
                        f"{raga.name} ({'aaroh' if token > previous else 'avroh'}: {reference})."
                    ),
                )
            )
        previous = token
    return violations


def _shape(contour: Contour, n: int) -> list[float]:
    xs = [i / max(1, n - 1) for i in range(n)]
    match contour:
        case Contour.ASCENDING:
            return xs
        case Contour.DESCENDING:
            return [1 - x for x in xs]
        case Contour.ARCH:
            return [1 - abs(2 * x - 1) for x in xs]
        case Contour.VALLEY:
            return [abs(2 * x - 1) for x in xs]
        case _:
            return []


def _correlation(a: Sequence[float], b: Sequence[float]) -> float:
    n = len(a)
    if n < 2:
        return 0.0
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b, strict=True))
    va = math.sqrt(sum((x - ma) ** 2 for x in a))
    vb = math.sqrt(sum((y - mb) ** 2 for y in b))
    return cov / (va * vb) if va and vb else 0.0


def _desired_direction(contour: Contour, position: float) -> int:
    match contour:
        case Contour.ASCENDING:
            return 1
        case Contour.DESCENDING:
            return -1
        case Contour.ARCH:
            return 1 if position < 0.5 else -1
        case Contour.VALLEY:
            return -1 if position < 0.5 else 1
        case _:
            return 0


class Generator:
    def __init__(
        self,
        raga: Raga,
        intention: Intention,
        seed: int | None = None,
        *,
        pitch_range: tuple[int, int] | None = None,
        allowed: frozenset[int] | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self.raga = raga
        self.intent = intention
        self.rng = rng or random.Random(seed)
        low, high = pitch_range or _REGISTER_RANGES[intention.saptak]
        self.nodes = [p for p in raga.pitches if low <= p.pitch <= high and (allowed is None or p.pitch in allowed)]
        self.node_set = set(self.nodes)

    @property
    def total_slots(self) -> int:
        return self.intent.beats * self.intent.notes_per_beat

    def _note_count(self) -> int:
        slots = self.total_slots
        holds = round(slots * self.intent.hold_ratio)
        return max(2, slots - holds) if slots >= 2 else 1

    def _reachability(self, n: int) -> list[set[Swara]]:
        """reach[k] = nodes from which a valid end note is reachable in exactly k moves."""
        end = self.intent.end
        targets = {s for s in self.nodes if end is None or end.matches(s)}
        reach = [targets]
        for _ in range(1, n):
            prev = reach[-1]
            reach.append(
                {u for u in self.nodes if any(v in prev for v in self.raga.successors(u) if v in self.node_set)}
            )
        return reach

    def _start_weight(self, s: Swara, lo: int, hi: int) -> float:
        span = max(1, hi - lo)
        rel = (s.pitch - lo) / span
        prefer_low = self.intent.contour in (Contour.ASCENDING, Contour.ARCH)
        prefer_high = self.intent.contour in (Contour.DESCENDING, Contour.VALLEY)
        if prefer_low:
            return (1 - rel) ** 3 + 0.02
        if prefer_high:
            return rel**3 + 0.02
        return 1.0 / (1 + abs(s.pitch - 4))  # near the middle of madhya saptak

    def _walk(self, n: int, reach: list[set[Swara]]) -> list[Swara] | None:
        starts = [s for s in reach[n - 1] if self.intent.start is None or self.intent.start.matches(s)]
        if not starts:
            return None
        lo = min(s.pitch for s in self.nodes)
        hi = max(s.pitch for s in self.nodes)
        current = self.rng.choices(starts, [self._start_weight(s, lo, hi) for s in starts])[0]
        path = [current]
        emphasis = set(self.intent.emphasize)
        for i in range(1, n):
            remaining = n - 1 - i
            options = [(v, kind) for v, kind in self.raga.successors(current).items() if v in reach[remaining]]
            if not options:
                return None
            direction = _desired_direction(self.intent.contour, i / max(1, n - 1))
            weights: list[float] = []
            for v, kind in options:
                w = {"aaroh": 3.0, "avroh": 3.0, "phrase": 2.5, "repeat": 0.35}.get(kind.value, 1.0)
                step = (v > current) - (v < current)
                if direction and step:
                    w *= 3.0 if step == direction else 0.45
                if step == 0 and len(path) >= 2 and path[-2] == current:
                    w = 0.0  # no note three times in a row
                if v.semitone in emphasis:
                    w *= 2.2
                elif v.semitone in (self.raga.vadi, self.raga.samvadi):
                    w *= 1.25
                if self.intent.use_pakad and len(path) >= 2:
                    gram = (path[-2].semitone, current.semitone, v.semitone)
                    if gram in self.raga.phrase_trigrams:
                        w *= 4.0
                weights.append(w)
            if not any(weights):
                weights = [1.0] * len(options)
            current = self.rng.choices([o[0] for o in options], weights)[0]
            path.append(current)
        return path

    def _score(self, path: list[Swara]) -> tuple[float, list[str]]:
        notes: list[str] = []
        score = 0.0
        shape = _shape(self.intent.contour, len(path))
        if shape:
            corr = _correlation([p.pitch for p in path], shape)
            score += 3.0 * corr
            notes.append(f"contour match {corr:.2f}")
        grams = list(zip(path, path[1:], path[2:], strict=False))
        if grams:
            flavor = sum((a.semitone, b.semitone, c.semitone) in self.raga.phrase_trigrams for a, b, c in grams) / len(
                grams
            )
            score += (2.5 if self.intent.use_pakad else 1.2) * flavor
            notes.append(f"raga phrases {flavor:.0%}")
        repeats = sum(a == b for a, b in zip(path, path[1:], strict=False)) / max(1, len(path) - 1)
        score -= 1.5 * repeats
        # Penalize back-and-forth wobbles such as N D N D.
        wobbles = sum(a == c and a != b for a, b, c in zip(path, path[1:], path[2:], strict=False))
        score -= 2.0 * wobbles / max(1, len(path) - 2)
        if self.intent.emphasize:
            share = sum(p.semitone in self.intent.emphasize for p in path) / len(path)
            score += 1.5 * share
            notes.append(f"emphasis {share:.0%}")
        return score, notes

    def _add_holds(self, path: list[Swara]) -> list[Token]:
        holds = self.total_slots - len(path)
        counts = [0] * len(path)
        if holds > 0:
            counts[-1] += 1
            holds -= 1
        while holds > 0:
            i = self.rng.randrange(len(path))
            if counts[i] < 3:
                counts[i] += 1
                holds -= 1
        tokens: list[Token] = []
        for swara, extra in zip(path, counts, strict=True):
            tokens.append(swara)
            tokens.extend([HOLD] * extra)
        return tokens

    def ranked_paths(self, n: int, candidates: int = _CANDIDATES) -> list[tuple[float, list[Swara], list[str]]]:
        """Sample walks of exactly ``n`` notes and return them best first."""
        reach = self._reachability(n)
        seen: set[tuple[int, ...]] = set()
        scored: list[tuple[float, list[Swara], list[str]]] = []
        for _ in range(candidates):
            path = self._walk(n, reach)
            if path is None:
                break
            key = tuple(p.pitch for p in path)
            if key in seen:
                continue
            seen.add(key)
            score, notes = self._score(path)
            scored.append((score, path, notes))
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored

    def generate(self) -> list[GeneratedPattern]:
        scored = self.ranked_paths(self._note_count())
        if not scored:
            raise GenerationError(
                "No sequence satisfies these constraints in this raga. "
                "Try another start or end note, a different register, or more beats."
            )
        return [
            GeneratedPattern(
                tokens=[str(t) for t in self._add_holds(path)],
                notes_per_beat=self.intent.notes_per_beat,
                score=round(score, 3),
                explanation=notes,
            )
            for score, path, notes in scored[: self.intent.count]
        ]


def arrange_palta(raga: Raga, motif: list[Swara], top: int = 12) -> list[Swara]:
    """Build an alankar-style taan from a short motif.

    The motif climbs one aaroh note at a time until it reaches ``top`` (taar Sa by
    default), then the reversed motif walks down one avroh note at a time back to
    where it started. Repetitions that would break the raga's rules are skipped,
    so the result always validates.
    """
    if len(motif) < 2:
        return list(motif)

    def ladder(notes: list[Swara]) -> list[Swara]:
        semis = {n.semitone for n in notes}
        return [p for p in raga.pitches if p.semitone in semis]

    def shifted(seq: list[Swara], steps: list[Swara], k: int) -> list[Swara] | None:
        index = {s: i for i, s in enumerate(steps)}
        out: list[Swara] = []
        for s in seq:
            if s not in index or not 0 <= index[s] + k < len(steps):
                return None
            out.append(steps[index[s] + k])
        return out

    def append_if_valid(result: list[Swara], seq: list[Swara]) -> bool:
        if validate(raga, result[-1:] + seq):
            return False
        result += seq
        return True

    result = list(motif)
    up, down = ladder(raga.aaroh), ladder(raga.avroh)
    last_up = list(motif)
    for k in range(1, len(up)):
        cand = shifted(motif, up, k)
        if cand is None or max(cand) > Swara(top):
            break
        if append_if_valid(result, cand):
            last_up = cand
        if max(cand) == Swara(top):
            break

    floor = min(motif)
    rev = list(reversed(last_up))
    for k in range(1, len(down)):
        cand = shifted(rev, down, -k)
        if cand is None or min(cand) < floor:
            break
        append_if_valid(result, cand)
    if result[-1] != motif[0] and raga.move(result[-1], motif[0]):
        result.append(motif[0])
    return result


def arrange_sequence(
    raga: Raga,
    tokens: Sequence[Token],
    mode: str,
    notes_per_beat: int,
    motif_length: int,
) -> Arrangement:
    swaras = [token for token in tokens if isinstance(token, Swara)]
    npb = notes_per_beat
    if mode == "taan":
        result: list[Token] = list(swaras)
    elif mode == "palta":
        result = list(arrange_palta(raga, swaras[:motif_length]))
    elif mode == "sustain":
        result = [item for swara in swaras for item in (swara, HOLD)]
        npb = max(1, npb)
    else:  # compact: drop holds and rests, keep layout
        result = [token for token in tokens if token not in (HOLD, REST)]
    if mode in ("taan", "palta") and len(result) % npb:
        result += [HOLD] * (npb - len(result) % npb)
    return Arrangement(tokens=result, violations=validate(raga, result), notes_per_beat=npb)
