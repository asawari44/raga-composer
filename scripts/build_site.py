"""Build the static Riyaaz your way site for GitHub Pages."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel

from raga_composer.compositions import CompositionLibrary
from raga_composer.raga import RagaRegistry
from raga_composer.songs import SongCatalog
from raga_composer.taal import TAALS

ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = ROOT / "src" / "raga_composer" / "static"
SITE_DIR = ROOT / "site"
DATA_DIR = SITE_DIR / "data"
MARKETING_DIR = STATIC_DIR / "marketing"
# Change this one value if the repository is renamed or a custom domain is used.
SITE_URL = "https://asawari44.github.io/raga-composer/"
SITE_PATH = urlparse(SITE_URL).path
HEAD_TAGS_BLOCK = re.compile(r"[ \t]*<!-- head-tags:.*?<!-- /head-tags -->\n", re.DOTALL)


def _json_default(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump()
    raise TypeError(f"Object of type {type(value).__name__} isn't JSON serializable")


def _write_json(path: Path, data: Any) -> None:
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, default=_json_default) + "\n",
        encoding="utf-8",
    )


def _render_text(text: str) -> str:
    return text.replace("{{ SITE_URL }}", SITE_URL)


def _inject_head_tags() -> None:
    head_tags = MARKETING_DIR / "head-tags.html"
    index = SITE_DIR / "index.html"
    html = index.read_text("utf-8")
    if not HEAD_TAGS_BLOCK.search(html):
        raise SystemExit("index.html is missing the <!-- head-tags --> block")
    tags = _render_text(head_tags.read_text("utf-8"))
    block = "".join(f"  {line}\n" if line else "\n" for line in tags.splitlines())
    index.write_text(HEAD_TAGS_BLOCK.sub(lambda _: block, html, count=1), encoding="utf-8")


def _copy_marketing() -> None:
    if not MARKETING_DIR.is_dir():
        return
    for source in MARKETING_DIR.rglob("*"):
        if source.is_dir():
            continue
        target = SITE_DIR / "marketing" / source.relative_to(MARKETING_DIR)
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix.lower() in {".html", ".txt", ".xml", ".webmanifest", ".json", ".svg"}:
            target.write_text(_render_text(source.read_text("utf-8")), encoding="utf-8")
        else:
            shutil.copy2(source, target)


JS_IMPORT = re.compile(r"""((?:\bfrom\s+|\bimport\s*\(\s*)["'])(\.{1,2}/[^"'?]+\.js)(["'])""")
DATA_URL = re.compile(r"""(["'])(data/[^"'?]+\.json)(["'])""")
ASSET_URL = re.compile(r"""((?:href|src)=")(\./(?:styles\.css|js/app\.js))(")""")


def _asset_version() -> str:
    """Return a short hash of every asset, so each deploy gets fresh URLs."""
    digest = hashlib.sha256()
    for path in sorted(SITE_DIR.rglob("*")):
        if path.is_file() and path.suffix in {".js", ".css", ".json", ".html"}:
            digest.update(path.relative_to(SITE_DIR).as_posix().encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()[:10]


def _bust_caches() -> None:
    """Add ?v=VERSION to CSS, module, and data URLs.

    Browsers cache JavaScript modules aggressively. Without a version, a visitor
    can get a new index.html with an old app.js after a deploy, and the app
    fails to start.
    """
    version = _asset_version()
    for js in (SITE_DIR / "js").rglob("*.js"):
        text = js.read_text("utf-8")
        text = JS_IMPORT.sub(rf"\g<1>\g<2>?v={version}\g<3>", text)
        text = DATA_URL.sub(rf"\g<1>\g<2>?v={version}\g<3>", text)
        js.write_text(text, encoding="utf-8")
    for page in ("index.html", "404.html"):
        path = SITE_DIR / page
        if path.exists():
            html = ASSET_URL.sub(rf"\g<1>\g<2>?v={version}\g<3>", path.read_text("utf-8"))
            path.write_text(html, encoding="utf-8")


def build() -> None:
    if SITE_DIR.exists():
        shutil.rmtree(SITE_DIR)
    shutil.copytree(
        STATIC_DIR,
        SITE_DIR,
        ignore=shutil.ignore_patterns(
            "__pycache__",
            "*.pyc",
            ".DS_Store",
            "marketing",
        ),
    )
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    registry = RagaRegistry.with_builtins()
    compositions = CompositionLibrary.builtin()
    _write_json(DATA_DIR / "ragas.json", [r.definition for r in registry.all()])
    _write_json(DATA_DIR / "taals.json", list(TAALS.values()))
    _write_json(DATA_DIR / "compositions.json", compositions.all())
    _write_json(DATA_DIR / "songs.json", SongCatalog.builtin())
    _copy_marketing()
    _inject_head_tags()
    shutil.move(SITE_DIR / "marketing" / "sitemap.xml", SITE_DIR / "sitemap.xml")
    (SITE_DIR / "marketing" / "head-tags.html").unlink()
    _bust_caches()
    (SITE_DIR / ".nojekyll").touch()


if __name__ == "__main__":
    build()
