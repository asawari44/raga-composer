import { Swara, tokenize } from "./notation.js";

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Song data is missing ${field}.`);
}

function requireUrl(value) {
  requireText(value, "a source URL");
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Song sources must use HTTP or HTTPS URLs without credentials.");
  }
}

const OPEN_LICENSES = new Set([
  "CC0-1.0", "CC-BY-2.0", "CC-BY-2.5", "CC-BY-3.0", "CC-BY-4.0",
  "CC-BY-SA-2.0", "CC-BY-SA-2.5", "CC-BY-SA-3.0", "CC-BY-SA-4.0",
]);

export function validateSongCatalog(catalog) {
  if (!catalog || catalog.target_count !== 200 || !Array.isArray(catalog.songs)) {
    throw new Error("The songs catalog has an invalid format.");
  }
  const ids = new Set();
  const titles = new Set();
  for (const song of catalog.songs) {
    for (const field of ["id", "title", "category", "language", "composer"]) requireText(song?.[field], field);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(song.id)) throw new Error(`Invalid song ID: ${song.id}`);
    const title = song.title.trim().normalize("NFKC").toLowerCase();
    if (ids.has(song.id) || titles.has(title)) throw new Error(`Duplicate song: ${song.title}`);
    ids.add(song.id);
    titles.add(title);
    if (typeof song.title_hi !== "string") throw new Error(`Missing Hindi title field: ${song.title}`);
    const rights = song.rights;
    if (!rights || !(rights.status === "public-domain" && rights.license === "Public domain")
        && !(rights.status === "open-license" && OPEN_LICENSES.has(rights.license))) {
      throw new Error(`Missing reusable license: ${song.title}`);
    }
    requireText(rights.notes, "rights evidence");
    requireUrl(rights.source_url);
    requireUrl(rights.evidence_url);
    if (!Array.isArray(song.sources) || !song.sources.length) throw new Error(`Missing sources: ${song.title}`);
    song.sources.forEach(requireUrl);
    if (!Array.isArray(song.sections) || !song.sections.length) throw new Error(`Missing notation: ${song.title}`);
    const sectionNames = new Set();
    for (const section of song.sections) {
      requireText(section?.name, "section name");
      requireText(section.notation, "notation");
      const name = section.name.trim().toLowerCase();
      if (sectionNames.has(name)) throw new Error(`Duplicate section: ${section.name}`);
      sectionNames.add(name);
      if (!Number.isInteger(section.notes_per_beat) || section.notes_per_beat < 1 || section.notes_per_beat > 8
          || !Number.isInteger(section.tempo) || section.tempo < 30 || section.tempo > 400) {
        throw new Error(`Invalid timing: ${song.title}`);
      }
      const tokens = tokenize(section.notation);
      if (tokens.length > 4096 || !tokens.some((token) => token instanceof Swara)) {
        throw new Error(`No playable melody: ${song.title}`);
      }
      let previousNote = false;
      for (const token of tokens) {
        if (token === "_" && !previousNote) throw new Error(`A hold has no preceding note: ${song.title}`);
        if (token instanceof Swara) {
          if (token.pitch < -36 || token.pitch > 48) throw new Error(`Song pitch is out of range: ${song.title}`);
          previousNote = true;
        } else if (token === "-") previousNote = false;
      }
    }
  }
  return catalog;
}

export function filterSongs(songs, query = "", category = "") {
  const text = query.trim().normalize("NFKC").toLowerCase();
  return songs.filter((song) => (!category || song.category === category)
    && [song.title, song.title_hi, song.composer, song.category]
      .some((field) => field.normalize("NFKC").toLowerCase().includes(text)));
}
