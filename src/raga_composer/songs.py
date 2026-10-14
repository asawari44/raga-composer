"""Rights-documented Hindi songs with timed, playable swara notation."""

from __future__ import annotations

import json
import unicodedata
from importlib import resources
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from raga_composer.notation import HOLD, REST, Swara, tokenize


class SongModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SongRights(SongModel):
    status: Literal["public-domain", "open-license"]
    license: str = Field(min_length=1, max_length=120)
    source_url: HttpUrl
    evidence_url: HttpUrl
    notes: str = Field(min_length=1, max_length=3000)

    @field_validator("source_url", "evidence_url")
    @classmethod
    def _no_credentials(cls, url: HttpUrl) -> HttpUrl:
        if url.username or url.password:
            raise ValueError("source URLs must not contain credentials")
        return url

    @model_validator(mode="after")
    def _license_matches_status(self) -> SongRights:
        if self.status == "public-domain" and self.license != "Public domain":
            raise ValueError("public-domain entries must use the Public domain license label")
        if self.status == "open-license" and self.license not in {
            "CC0-1.0",
            "CC-BY-2.0",
            "CC-BY-2.5",
            "CC-BY-3.0",
            "CC-BY-4.0",
            "CC-BY-SA-2.0",
            "CC-BY-SA-2.5",
            "CC-BY-SA-3.0",
            "CC-BY-SA-4.0",
        }:
            raise ValueError("open-license entries must identify a supported reusable license")
        return self


class SongSection(SongModel):
    name: str = Field(min_length=1, max_length=120)
    notation: str = Field(min_length=1, max_length=30000)
    notes_per_beat: int = Field(ge=1, le=8, strict=True)
    tempo: int = Field(ge=30, le=400, strict=True)

    @model_validator(mode="after")
    def _playable_notation(self) -> SongSection:
        tokens = tokenize(self.notation)
        if len(tokens) > 4096 or not any(isinstance(token, Swara) for token in tokens):
            raise ValueError("sections need 1 to 4096 slots and at least one swara")
        previous_note = False
        for token in tokens:
            if token == HOLD and not previous_note:
                raise ValueError("a hold must follow a swara or another hold")
            if isinstance(token, Swara):
                if not -36 <= token.pitch <= 48:
                    raise ValueError("song pitches must be between mandra Sa - 3 octaves and taar Sa + 4 octaves")
                previous_note = True
            elif token == REST:
                previous_note = False
        return self


class Song(SongModel):
    id: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)
    title: str = Field(min_length=1, max_length=200)
    title_hi: str = Field(default="", max_length=200)
    category: str = Field(min_length=1, max_length=80)
    language: str = Field(min_length=1, max_length=80)
    composer: str = Field(min_length=1, max_length=200)
    rights: SongRights
    sections: list[SongSection] = Field(min_length=1, max_length=40)
    sources: list[HttpUrl] = Field(min_length=1, max_length=20)

    @field_validator("sources")
    @classmethod
    def _no_source_credentials(cls, urls: list[HttpUrl]) -> list[HttpUrl]:
        if any(url.username or url.password for url in urls):
            raise ValueError("source URLs must not contain credentials")
        return urls

    @model_validator(mode="after")
    def _unique_sections(self) -> Song:
        names = [section.name.casefold() for section in self.sections]
        if len(names) != len(set(names)):
            raise ValueError("section names must be unique within a song")
        return self


class SongCatalog(SongModel):
    target_count: Literal[200] = 200
    songs: list[Song]

    @model_validator(mode="after")
    def _distinct_songs(self) -> SongCatalog:
        ids: set[str] = set()
        titles: set[str] = set()
        for song in self.songs:
            title = unicodedata.normalize("NFKC", song.title).casefold()
            if song.id in ids or title in titles:
                raise ValueError(f"duplicate song: {song.title}")
            ids.add(song.id)
            titles.add(title)
        return self

    @classmethod
    def builtin(cls) -> SongCatalog:
        path = resources.files("raga_composer").joinpath("data/songs.json")
        return cls.model_validate(json.loads(path.read_text("utf-8")))
