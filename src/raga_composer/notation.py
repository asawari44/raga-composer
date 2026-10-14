"""Swara notation: parsing and formatting.

Notation used throughout the app:

* ``S r R g G m M P d D n N`` are the 12 swaras of one octave. Lowercase means
  komal (flat), ``M`` is tivra (sharp) Ma, ``m`` is shuddha Ma.
* ``p`` is accepted as an alias for ``P`` and ``ni`` as an alias for ``n``.
* A trailing ``'`` marks the upper (taar) octave: ``S'``, ``R'``.
* A trailing ``.`` marks the lower (mandra) octave: ``N.``, ``D.``.
* ``_`` extends (holds) the previous note for one more slot.
* ``-`` is a rest. ``|`` and ``,`` are visual separators and are ignored.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

SWARA_NAMES: tuple[str, ...] = ("S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N")
_NAME_TO_SEMITONE = {name: i for i, name in enumerate(SWARA_NAMES)}
_ALIASES = {"p": "P", "ni": "n"}

HOLD = "_"
REST = "-"

_TOKEN_RE = re.compile(r"ni|[SrRgGmMPpdDnN](?:'+|\.+)?|_|-")
_SKIP_RE = re.compile(r"[\s|,]+")


class NotationError(ValueError):
    """Raised when a notation string can't be parsed."""


@dataclass(frozen=True, order=True)
class Swara:
    """A pitch: a semitone (0-11) within an octave (-1 mandra, 0 madhya, 1 taar)."""

    pitch: int

    @property
    def semitone(self) -> int:
        return self.pitch % 12

    @property
    def octave(self) -> int:
        return self.pitch // 12

    @property
    def name(self) -> str:
        return SWARA_NAMES[self.semitone]

    def shifted(self, octaves: int) -> Swara:
        return Swara(self.pitch + 12 * octaves)

    def __str__(self) -> str:
        if self.octave > 0:
            return self.name + "'" * self.octave
        if self.octave < 0:
            return self.name + "." * (-self.octave)
        return self.name

    @classmethod
    def parse(cls, token: str) -> Swara:
        match = re.fullmatch(r"(ni|[SrRgGmMPpdDnN])('+|\.+)?", token)
        if not match:
            raise NotationError(f"Not a swara: {token!r}")
        base = _ALIASES.get(match.group(1), match.group(1))
        marks = match.group(2) or ""
        octave = len(marks) if marks.startswith("'") else -len(marks)
        return cls(octave * 12 + _NAME_TO_SEMITONE[base])


Token = Swara | str  # a Swara, HOLD, or REST


def tokenize(text: str) -> list[Token]:
    """Parse a notation string such as ``"N. R G _ | M D N S'"`` into tokens."""
    tokens: list[Token] = []
    pos = 0
    while pos < len(text):
        skip = _SKIP_RE.match(text, pos)
        if skip:
            pos = skip.end()
            continue
        match = _TOKEN_RE.match(text, pos)
        if not match:
            raise NotationError(f"Unexpected character {text[pos]!r} at position {pos}")
        raw = match.group(0)
        tokens.append(raw if raw in (HOLD, REST) else Swara.parse(raw))
        pos = match.end()
    return tokens


def parse_phrase(text: str) -> list[Swara]:
    """Parse a phrase that contains only swaras."""
    swaras = [t for t in tokenize(text) if isinstance(t, Swara)]
    return swaras


def format_tokens(tokens: list[Token]) -> list[str]:
    return [str(t) for t in tokens]
