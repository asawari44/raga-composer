"""Taal (rhythm cycle) definitions, including the basic tabla theka for each."""

from __future__ import annotations

from pydantic import BaseModel


class Taal(BaseModel):
    name: str
    beats: int
    vibhags: list[int]
    # Marker shown at the start of each vibhag: X = sam, 0 = khali, numbers = tali.
    markers: list[str]
    theka: list[str]


TAALS: dict[str, Taal] = {
    t.name.lower(): t
    for t in [
        Taal(
            name="Teentaal",
            beats=16,
            vibhags=[4, 4, 4, 4],
            markers=["X", "2", "0", "3"],
            theka=[
                "Dha",
                "Dhin",
                "Dhin",
                "Dha",
                "Dha",
                "Dhin",
                "Dhin",
                "Dha",
                "Dha",
                "Tin",
                "Tin",
                "Ta",
                "Ta",
                "Dhin",
                "Dhin",
                "Dha",
            ],
        ),
        Taal(
            name="Ektaal",
            beats=12,
            vibhags=[2, 2, 2, 2, 2, 2],
            markers=["X", "0", "2", "0", "3", "4"],
            theka=[
                "Dhin",
                "Dhin",
                "DhaGe",
                "TiRaKiTa",
                "Tu",
                "Na",
                "Kat",
                "Ta",
                "DhaGe",
                "TiRaKiTa",
                "Dhi",
                "Na",
            ],
        ),
        Taal(
            name="Jhaptaal",
            beats=10,
            vibhags=[2, 3, 2, 3],
            markers=["X", "2", "0", "3"],
            theka=["Dhi", "Na", "Dhi", "Dhi", "Na", "Ti", "Na", "Dhi", "Dhi", "Na"],
        ),
        Taal(
            name="Rupak",
            beats=7,
            vibhags=[3, 2, 2],
            markers=["0", "1", "2"],
            theka=["Tin", "Tin", "Na", "Dhi", "Na", "Dhi", "Na"],
        ),
        Taal(
            name="Keherwa",
            beats=8,
            vibhags=[4, 4],
            markers=["X", "0"],
            theka=["Dha", "Ge", "Na", "Ti", "Na", "Ke", "Dhi", "Na"],
        ),
        Taal(
            name="Dadra",
            beats=6,
            vibhags=[3, 3],
            markers=["X", "0"],
            theka=["Dha", "Dhi", "Na", "Dha", "Ti", "Na"],
        ),
        Taal(
            name="Chautaal",
            beats=12,
            vibhags=[2, 2, 2, 2, 2, 2],
            markers=["X", "0", "2", "0", "3", "4"],
            theka=["Dha", "Dha", "Din", "Ta", "KiTa", "Dha", "Din", "Ta", "TiTa", "KaTa", "GaDi", "GeNe"],
        ),
        Taal(
            name="Dhamar",
            beats=14,
            vibhags=[5, 2, 3, 4],
            markers=["X", "2", "0", "3"],
            theka=["Ka", "Dhi", "Ta", "Dhi", "Ta", "Dha", "-", "Ga", "Ti", "Ta", "Ti", "Ta", "Ta", "-"],
        ),
        Taal(
            name="Sooltaal",
            beats=10,
            vibhags=[2, 2, 2, 2, 2],
            markers=["X", "0", "2", "3", "0"],
            theka=["Dha", "Dha", "Din", "Ta", "KiTa", "Dha", "TiTa", "KaTa", "GaDi", "GeNe"],
        ),
        Taal(
            name="Teevra",
            beats=7,
            vibhags=[3, 2, 2],
            markers=["X", "2", "3"],
            theka=["Dha", "Din", "Ta", "TiTa", "KaTa", "GaDi", "GeNe"],
        ),
        Taal(
            name="Jhoomra",
            beats=14,
            vibhags=[3, 4, 3, 4],
            markers=["X", "2", "0", "3"],
            theka=[
                "Dhin",
                "DhaGe",
                "TiRaKiTa",
                "Dhin",
                "Dhin",
                "DhaGe",
                "TiRaKiTa",
                "Tin",
                "TaKe",
                "TiRaKiTa",
                "Dhin",
                "Dhin",
                "DhaGe",
                "TiRaKiTa",
            ],
        ),
        Taal(
            name="Tilwada",
            beats=16,
            vibhags=[4, 4, 4, 4],
            markers=["X", "2", "0", "3"],
            theka=[
                "Dha",
                "TiRaKiTa",
                "Dhin",
                "Dhin",
                "Dha",
                "Dha",
                "Tin",
                "Tin",
                "Ta",
                "TiRaKiTa",
                "Dhin",
                "Dhin",
                "Dha",
                "Dha",
                "Dhin",
                "Dhin",
            ],
        ),
        Taal(
            name="Adachautaal",
            beats=14,
            vibhags=[2, 2, 2, 2, 2, 2, 2],
            markers=["X", "2", "0", "3", "0", "4", "0"],
            theka=[
                "Dhin",
                "TiRaKiTa",
                "Dhi",
                "Na",
                "Tu",
                "Na",
                "Ka",
                "Ta",
                "TiRaKiTa",
                "Dhi",
                "Na",
                "Dhi",
                "Dhi",
                "Na",
            ],
        ),
        Taal(
            name="Deepchandi",
            beats=14,
            vibhags=[3, 4, 3, 4],
            markers=["X", "2", "0", "3"],
            theka=["Dha", "Dhin", "-", "Dha", "Dha", "Tin", "-", "Ta", "Tin", "-", "Dha", "Dha", "Dhin", "-"],
        ),
    ]
}


def get_taal(name: str) -> Taal | None:
    return TAALS.get(name.lower().replace(" ", ""))
