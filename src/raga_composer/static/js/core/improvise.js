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

function withHolds(path, slots, rng) {
  let extra = slots - path.length;
  const counts = Array(path.length).fill(0);
  const lastHold = Math.min(extra, 3);
  counts[counts.length - 1] = lastHold;
  extra -= lastHold;
  while (extra > 0) {
    const i = rng.randrange(path.length);
    if (counts[i] < 3 || i === path.length - 1) {
      counts[i] += 1;
      extra -= 1;
    }
  }
  return path.flatMap((swara, i) => [swara, ...Array(counts[i]).fill(HOLD)]);
}

class Builder {
  constructor(raga, section, rng, end = null) {
    this.raga = raga;
    this.rng = rng;
    this.end = end === null || end === undefined ? ENDS[section] : end;
    const [lo, hi] = RANGES[section];
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

  alaap(beats) {
    const slots = beats * ALAAP_NPB;
    const notes = Math.max(3, Math.floor(slots * 0.55 + 0.5));
    const contour = this.rng.choice(
      this.end === 12
        ? [CONTOURS.ASCENDING, CONTOURS.ARCH, CONTOURS.ARCH]
        : [CONTOURS.ARCH, CONTOURS.VALLEY, CONTOURS.DESCENDING, CONTOURS.ANY],
    );
    const path = this.chain(notes, [contour]);
    return path ? withHolds(path, slots, this.rng) : null;
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

function collect(make, raga, beatsOptions, count, kind, npb, rng) {
  const phrases = [];
  const seen = new Set();
  for (let attempt = 0; attempt < count * ATTEMPTS; attempt += 1) {
    if (phrases.length === count) break;
    const beats = beatsOptions[phrases.length % beatsOptions.length];
    const tokens = make(beats);
    if (!tokens) continue;
    const key = tokens.map(String);
    const joined = key.join(" ");
    if (seen.has(joined) || validate(raga, tokens).length) continue;
    seen.add(joined);
    phrases.push({ kind, beats, notes_per_beat: npb, tokens: key });
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

// `land` maps a section ("sthayi" or "antara") to the pitch its taans end on.
export function improvise(raga, taalName, taalBeats, seed = null, land = {}) {
  const resolvedSeed = seed === null || seed === undefined ? defaultSeed(raga) : seed;
  const rng = new Random(resolvedSeed);
  const shortAlaap = [4, 6, 8].filter((beats) => beats < taalBeats);
  const groups = [];
  for (const [section, label, where] of [
    ["sthayi", "Sthayi", "in the mandra and madhya saptaks, resolving to Sa"],
    ["antara", "Antara", "rising into the taar saptak, resolving to taar Sa"],
  ]) {
    const builder = new Builder(raga, section, rng);
    groups.push({
      key: `${section}-alaap`,
      title: `${label} alaap`,
      description: `Slow phrases with held notes, ${where}.`,
      items: [
        ...collect((beats) => builder.alaap(beats), raga, shortAlaap.length ? shortAlaap : [Math.max(2, Math.floor(taalBeats / 2))], 5, "short", ALAAP_NPB, rng),
        ...collect((beats) => builder.alaap(beats), raga, [taalBeats], 2, "avartan", ALAAP_NPB, rng),
      ],
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
