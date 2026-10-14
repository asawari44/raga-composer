import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { filterSongs, validateSongCatalog } from "../../src/raga_composer/static/js/core/songs.js";

const example = JSON.parse(await readFile(new URL("./fixtures/song-test.json", import.meta.url), "utf8"));
const catalog = () => structuredClone(example);

describe("Hindi songs catalog", () => {
  it("preserves timed notation", () => {
    assert.deepEqual(validateSongCatalog(catalog()), example);
  });

  it("searches English and Hindi titles, composers, and categories", () => {
    const songs = example.songs;
    for (const query of ["MELODY", "परीक्षण", "Test fixture", "Test"]) {
      assert.equal(filterSongs(songs, query).length, 1);
    }
    assert.equal(filterSongs(songs, "", "Test").length, 1);
    assert.equal(filterSongs(songs, "", "Meera").length, 0);
    assert.equal(filterSongs(songs, "missing").length, 0);
  });

  it("rejects invalid or unplayable notation and timing", () => {
    for (const [field, value] of [
      ["notation", "_ S"], ["notation", "S - _ R"], ["notation", "- -"], ["notation", "S X"],
      ["notation", "S'''''"], ["notation", "S ".repeat(4097)],
      ["notes_per_beat", 0], ["notes_per_beat", 9], ["notes_per_beat", true],
      ["tempo", 29], ["tempo", 401], ["tempo", 90.5],
    ]) {
      const raw = catalog();
      raw.songs[0].sections[0][field] = value;
      assert.throws(() => validateSongCatalog(raw), field);
    }
  });

  it("requires explicit supported reuse rights and safe source URLs", () => {
    for (const [field, value] of [
      ["license", "All rights reserved"], ["license", "CC-BY-NC-4.0"], ["status", "unverified"],
      ["source_url", "javascript:alert(1)"], ["evidence_url", ""], ["notes", " "],
      ["source_url", "https://user:password@example.org/notation"],
    ]) {
      const raw = catalog();
      raw.songs[0].rights[field] = value;
      assert.throws(() => validateSongCatalog(raw), field);
    }
    const raw = catalog();
    raw.songs[0].rights.status = "public-domain";
    raw.songs[0].rights.license = "Public domain";
    validateSongCatalog(raw);
  });

  it("rejects duplicate songs and sections", () => {
    const raw = catalog();
    raw.songs.push({ ...structuredClone(raw.songs[0]), id: "other", title: " TEST-ONLY MELODY " });
    assert.throws(() => validateSongCatalog(raw), /Duplicate song/);
    const duplicate = catalog();
    duplicate.songs[0].sections.push(structuredClone(duplicate.songs[0].sections[0]));
    assert.throws(() => validateSongCatalog(duplicate), /Duplicate section/);
  });

  it("allows an honest empty catalog without claiming the target is met", () => {
    assert.deepEqual(validateSongCatalog({ target_count: 200, songs: [] }), { target_count: 200, songs: [] });
    assert.throws(() => validateSongCatalog({ target_count: 0, songs: [] }));
    assert.throws(() => validateSongCatalog(null));
  });

  it("validates production data and excludes the synthetic test melody", async () => {
    const raw = JSON.parse(await readFile(new URL("../../src/raga_composer/data/songs.json", import.meta.url), "utf8"));
    validateSongCatalog(raw);
    assert.equal(raw.songs.some((song) => song.id === "test-only"), false);
  });
});
