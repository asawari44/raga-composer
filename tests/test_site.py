import json
import runpy
from pathlib import Path

import pytest

from raga_composer.songs import SongCatalog


def test_static_build_serializes_song_source_urls(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    script = Path(__file__).resolve().parents[1] / "scripts" / "build_site.py"
    build = runpy.run_path(str(script))["build"]
    site = tmp_path / "site"
    monkeypatch.setitem(build.__globals__, "SITE_DIR", site)
    monkeypatch.setitem(build.__globals__, "DATA_DIR", site / "data")
    build()
    catalog = json.loads((site / "data" / "songs.json").read_text("utf-8"))
    assert catalog == SongCatalog.builtin().model_dump(mode="json")
    assert isinstance(catalog["songs"][0]["rights"]["source_url"], str)
    assert "data/songs.json?v=" in (site / "js" / "local-api.js").read_text("utf-8")
