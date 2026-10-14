import { Generator, validate } from "./generator.js";
import { CONTOURS, defaultIntention } from "./intent.js";
import { HOLD, Swara } from "./notation.js";
import { crc32, Random } from "./random.js";

const RANGES = {
  sthayi: [-7, 9],
  antara: [4, 19],
};
const ENDS = {
  sthayi: 0,
  antara: 12,
};
const ALAAP_NPB = 2;
// Badhat: each alaap explores a little more of the saptak than the one before.
// Every stage is [lowest pitch, highest pitch, notes]. The last two are longer.
const ALAAP_STAGES = {
  sthayi: [[-5, 4, 4], [-7, 5, 5], [-7, 7, 6], [-5, 9, 7], [-3, 11, 8], [-7, 11, 10], [-7, 12, 12]],
  antara: [[4, 12, 4], [5, 14, 5], [7, 14, 6], [7, 16, 7], [9, 17, 8], [7, 19, 10], [4, 19, 12]],
};
const SHORT_ALAAPS = 5;
const TAAN_NPB = 4;
const SHORT_TAAN_BEATS = 8;
const LONG_TAAN_BEATS = 16;
const ATTEMPTS = 40;

export class ImprovisationError extends Error {}

export function defaultSeed(raga) {
  return crc32(raga.name);
}

function target(pitch) {
  const swara = new Swara(pitch);
  return { semitone: swara.semitone, octave: swara.octave };
}

// Free-time holds: most notes are brief, resting notes (nyas) linger, and the
// final note rings longest. The phrase is padded to whole beats.
function freeHolds(path, nyas, rng) {
  const tokens = [];
  path.forEach((swara, i) => {
    let holds = rng.choice([0, 0, 1, 1, 2]);
    if (i > 0 && nyas.has(swara.semitone)) holds += rng.choice([1, 2]);
    if (i === path.length - 1) holds = 3 + rng.randrange(3);
    tokens.push(swara, ...Array(holds).fill(HOLD));
  });
  if (tokens.length % ALAAP_NPB) tokens.push(...Array(ALAAP_NPB - (tokens.length % ALAAP_NPB)).fill(HOLD));
  return tokens;
}

class Builder {
  constructor(raga, section, rng, end = null, range = null) {
    this.raga = raga;
    this.rng = rng;
    this.end = end === null || end === undefined ? ENDS[section] : end;
    const [lo, hi] = range || RANGES[section];
    this.range = [Math.min(lo, this.end), Math.max(hi, this.end)];
    this.emphasize = [raga.vadi, raga.samvadi].filter((n) => n !== null);
    this.live = this.livePitches();
  }

  livePitches() {
    const [lo, hi] = this.range;
    const nodes = this.raga.pitches.filter((p) => lo <= p.pitch && p.pitch <= hi);
    const live = new Set(nodes.filter((p) => p.pitch === this.end).map((p) => p.pitch));
    let changed = true;
    while (changed) {
      changed = false;
      for (const p of nodes) {
        if (!live.has(p.pitch) && this.raga.successors(p).some((v) => live.has(v.swara.pitch))) {
          live.add(p.pitch);
          changed = true;
        }
      }
    }
    return live;
  }

  segment(n, contour, start, end) {
    const intention = {
      ...defaultIntention(),
      contour,
      start: start === null ? null : target(start),
      end: end === null ? null : target(end),
      emphasize: this.emphasize,
      use_pakad: true,
    };
    const generator = new Generator(this.raga, intention, null, { pitchRange: this.range, allowed: this.live, rng: this.rng });
    const ranked = generator.rankedPaths(n, 30);
    if (!ranked.length) return null;
    return ranked[this.rng.randrange(Math.min(3, ranked.length))][1];
  }

  chain(total, contours) {
    const parts = contours.length;
    const sizes = contours.map((_, i) => Math.floor(total / parts) + (i < total % parts ? 1 : 0));
    const path = [];
    for (let i = 0; i < contours.length; i += 1) {
      const last = i === contours.length - 1;
      const start = path.length ? path.at(-1).pitch : null;
      const segment = this.segment(sizes[i] + (path.length ? 1 : 0), contours[i], start, last ? this.end : null);
      if (!segment) return null;
      path.push(...(path.length ? segment.slice(1) : segment));
    }
    return path;
  }

  // A free alaap of about `notes` notes. It isn't fitted to the taal.
  alaap(notes) {
    const sthayi = this.end < ENDS.antara;
    const long = notes >= 10;
    const contours = long
      ? (sthayi ? [CONTOURS.ASCENDING, CONTOURS.DESCENDING] : [CONTOURS.ARCH, CONTOURS.ASCENDING])
      : [this.rng.choice(sthayi
        ? [CONTOURS.VALLEY, CONTOURS.ARCH, CONTOURS.DESCENDING, CONTOURS.ANY]
        : [CONTOURS.ASCENDING, CONTOURS.ARCH, CONTOURS.ARCH])];
    const path = this.chain(notes + this.rng.randrange(2), contours);
    if (!path) return null;
    const nyas = new Set([0, 7, ...this.emphasize]);
    return freeHolds(path, nyas, this.rng);
  }

  taan(beats) {
    const slots = beats * TAAN_NPB;
    const notes = slots - (TAAN_NPB - 1);
    const runs = Math.max(1, Math.floor(notes / this.rng.choice([8, 10, 12, 14]) + 0.5));
    const first = runs > 1 ? this.rng.choice([CONTOURS.ASCENDING, CONTOURS.DESCENDING]) : CONTOURS.ARCH;
    const other = first === CONTOURS.ASCENDING ? CONTOURS.DESCENDING : CONTOURS.ASCENDING;
    const contours = Array.from({ length: runs }, (_, i) => (i % 2 === 0 ? first : other));
    if (runs > 1 && contours.at(-1) !== CONTOURS.DESCENDING && this.end < ENDS.antara) contours[contours.length - 1] = CONTOURS.ANY;
    const path = this.chain(notes, contours);
    return path ? [...path, ...Array(TAAN_NPB - 1).fill(HOLD)] : null;
  }
}

function collect(make, raga, beatsOptions, count, kind, npb, rng, seen = new Set()) {
  const phrases = [];
  for (let attempt = 0; attempt < count * ATTEMPTS; attempt += 1) {
    if (phrases.length === count) break;
    const beats = beatsOptions[phrases.length % beatsOptions.length];
    const tokens = make(beats);
    if (!tokens) continue;
    const key = tokens.map(String);
    const joined = key.join(" ");
    if (seen.has(joined) || validate(raga, tokens).length) continue;
    seen.add(joined);
    phrases.push({ kind, beats: Math.ceil(key.length / npb), notes_per_beat: npb, tokens: key });
  }
  if (phrases.length < count) throw new ImprovisationError(`Couldn't build enough ${kind} phrases for ${raga.name}.`);
  return phrases;
}

// Five 8-beat and two 16-beat taans, landing on `land` when the raga allows it.
function taans(raga, section, rng, land) {
  const ends = land === null || land === undefined ? [null] : [land, null];
  for (const end of ends) {
    const builder = new Builder(raga, section, rng, end);
    try {
      return [
        ...collect((beats) => builder.taan(beats), raga, [SHORT_TAAN_BEATS], 5, "short", TAAN_NPB, rng),
        ...collect((beats) => builder.taan(beats), raga, [LONG_TAAN_BEATS], 2, "long", TAAN_NPB, rng),
      ];
    } catch (error) {
      if (!(error instanceof ImprovisationError) || end === null) throw error;
    }
  }
  throw new Error("unreachable");
}

// Seven free alaaps that widen step by step. The short ones rest on the section's
// Sa; the long ones end on `land`, the mukhda's first note, when the raga allows it.
function alaaps(raga, section, rng, land) {
  const seen = new Set();
  return ALAAP_STAGES[section].map(([lo, hi, notes], i) => {
    const kind = i < SHORT_ALAAPS ? "short" : "long";
    const ends = kind === "long" && land !== null && land !== undefined ? [land, null] : [null];
    const ranges = [[lo, hi], null];
    for (const end of ends) {
      for (const range of ranges) {
        const builder = new Builder(raga, section, rng, end, range);
        try {
          return collect(() => builder.alaap(notes), raga, [0], 1, kind, ALAAP_NPB, rng, seen)[0];
        } catch (error) {
          if (!(error instanceof ImprovisationError)) throw error;
        }
      }
    }
    throw new ImprovisationError(`Couldn't build enough alaap phrases for ${raga.name}.`);
  });
}

// `land` maps a section ("sthayi" or "antara") to the pitch its taans end on.
export function improvise(raga, taalName, taalBeats, seed = null, land = {}) {
  const resolvedSeed = seed === null || seed === undefined ? defaultSeed(raga) : seed;
  const rng = new Random(resolvedSeed);
  const groups = [];
  for (const [section, label, where] of [
    ["sthayi", "Sthayi", "in the mandra and madhya saptaks, resting on Sa"],
    ["antara", "Antara", "rising into the taar saptak, resting on taar Sa"],
  ]) {
    const items = alaaps(raga, section, rng, land?.[section]);
    const final = items.at(-1).tokens.filter((t) => t !== HOLD && t !== "-").at(-1);
    const lead = land?.[section] !== undefined && Swara.parse(final).pitch === land[section]
      ? ` The long ones end on ${final}, the first note of the ${section} mukhda.`
      : "";
    groups.push({
      key: `${section}-alaap`,
      title: `${label} alaap`,
      description: `Free, unmetered phrases with held notes that widen step by step, ${where}.${lead}`,
      items,
    });
  }
  for (const [section, label, where, home] of [
    ["sthayi", "Sthayi", "in the mandra and madhya saptaks", "Sa"],
    ["antara", "Antara", "reaching into the taar saptak", "taar Sa"],
  ]) {
    const items = taans(raga, section, rng, land?.[section]);
    const final = items[0].tokens.filter((t) => t !== HOLD && t !== "-").at(-1);
    const landing = land?.[section] !== undefined && Swara.parse(final).pitch === land[section]
      ? `landing on ${final}, the first note of the ${section} mukhda`
      : `landing on ${home}`;
    groups.push({
      key: `${section}-taan`,
      title: `${label} taan`,
      description: `Fast runs at four notes per beat, 8 or 16 beats long, ${where}, ${landing}.`,
      items,
    });
  }
  return { raga: raga.name, taal: taalName, taal_beats: taalBeats, seed: resolvedSeed, groups };
}
