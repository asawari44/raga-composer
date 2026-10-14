import { CONTOURS, noteMatches, REGISTERS } from "./intent.js";
import { HOLD, REST, Swara } from "./notation.js";
import { Random } from "./random.js";

const REGISTER_RANGES = new Map([
  [REGISTERS.FULL, [-5, 19]],
  [REGISTERS.MANDRA, [-7, 5]],
  [REGISTERS.MADHYA, [-1, 12]],
  [REGISTERS.TAAR, [7, 19]],
]);

const CANDIDATES = 80;

export class GenerationError extends Error {}

export function validate(raga, tokens) {
  const violations = [];
  let previous = null;
  tokens.forEach((token, index) => {
    if (token === REST) {
      previous = null;
      return;
    }
    if (token === HOLD) {
      if (previous === null && index === 0) violations.push({ index, message: "A hold (_) needs a note before it." });
      return;
    }
    if (!raga.semitones.has(token.semitone)) {
      violations.push({ index, message: `${token.name} is varjit (not used) in ${raga.name}.` });
      previous = null;
      return;
    }
    if (previous !== null && raga.move(previous, token) === null) {
      const ascending = token.pitch > previous.pitch;
      const direction = ascending ? "ascending" : "descending";
      const reference = ascending ? raga.definition.aaroh : raga.definition.avroh;
      violations.push({
        index,
        message: `${previous} → ${token} isn't an allowed ${direction} move in ${raga.name} (${ascending ? "aaroh" : "avroh"}: ${reference}).`,
      });
    }
    previous = token;
  });
  return violations;
}

function shape(contour, n) {
  const xs = Array.from({ length: n }, (_, i) => i / Math.max(1, n - 1));
  if (contour === CONTOURS.ASCENDING) return xs;
  if (contour === CONTOURS.DESCENDING) return xs.map((x) => 1 - x);
  if (contour === CONTOURS.ARCH) return xs.map((x) => 1 - Math.abs(2 * x - 1));
  if (contour === CONTOURS.VALLEY) return xs.map((x) => Math.abs(2 * x - 1));
  return [];
}

function correlation(a, b) {
  const n = a.length;
  if (n < 2) return 0.0;
  const ma = a.reduce((sum, x) => sum + x, 0) / n;
  const mb = b.reduce((sum, x) => sum + x, 0) / n;
  const cov = a.reduce((sum, x, i) => sum + (x - ma) * (b[i] - mb), 0);
  const va = Math.sqrt(a.reduce((sum, x) => sum + (x - ma) ** 2, 0));
  const vb = Math.sqrt(b.reduce((sum, x) => sum + (x - mb) ** 2, 0));
  return va && vb ? cov / (va * vb) : 0.0;
}

function desiredDirection(contour, position) {
  if (contour === CONTOURS.ASCENDING) return 1;
  if (contour === CONTOURS.DESCENDING) return -1;
  if (contour === CONTOURS.ARCH) return position < 0.5 ? 1 : -1;
  if (contour === CONTOURS.VALLEY) return position < 0.5 ? -1 : 1;
  return 0;
}

function roundTiesToEven(value) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
}

export class Generator {
  constructor(raga, intention, seed = null, { pitchRange = null, allowed = null, rng = null } = {}) {
    this.raga = raga;
    this.intent = intention;
    this.rng = rng ?? new Random(seed ?? 0);
    const [low, high] = pitchRange ?? REGISTER_RANGES.get(intention.saptak);
    this.nodes = raga.pitches.filter((p) => low <= p.pitch && p.pitch <= high && (allowed === null || allowed.has(p.pitch)));
    this.nodeSet = new Set(this.nodes.map((p) => p.pitch));
  }

  get totalSlots() {
    return this.intent.beats * this.intent.notes_per_beat;
  }

  noteCount() {
    const slots = this.totalSlots;
    const holds = roundTiesToEven(slots * this.intent.hold_ratio);
    return slots >= 2 ? Math.max(2, slots - holds) : 1;
  }

  reachability(n) {
    const end = this.intent.end;
    const targets = new Set(this.nodes.filter((s) => !end || noteMatches(end, s)).map((s) => s.pitch));
    const reach = [targets];
    for (let i = 1; i < n; i += 1) {
      const prev = reach.at(-1);
      const current = new Set();
      for (const u of this.nodes) {
        if (this.raga.successors(u).some((v) => this.nodeSet.has(v.swara.pitch) && prev.has(v.swara.pitch))) current.add(u.pitch);
      }
      reach.push(current);
    }
    return reach;
  }

  startWeight(s, lo, hi) {
    const span = Math.max(1, hi - lo);
    const rel = (s.pitch - lo) / span;
    if ([CONTOURS.ASCENDING, CONTOURS.ARCH].includes(this.intent.contour)) return (1 - rel) ** 3 + 0.02;
    if ([CONTOURS.DESCENDING, CONTOURS.VALLEY].includes(this.intent.contour)) return rel ** 3 + 0.02;
    return 1.0 / (1 + Math.abs(s.pitch - 4));
  }

  walk(n, reach) {
    const starts = this.nodes.filter((s) => reach[n - 1].has(s.pitch) && (!this.intent.start || noteMatches(this.intent.start, s)));
    if (!starts.length) return null;
    const lo = Math.min(...this.nodes.map((s) => s.pitch));
    const hi = Math.max(...this.nodes.map((s) => s.pitch));
    let current = this.rng.choices(starts, starts.map((s) => this.startWeight(s, lo, hi)));
    const path = [current];
    const emphasis = new Set(this.intent.emphasize);
    for (let i = 1; i < n; i += 1) {
      const remaining = n - 1 - i;
      const options = this.raga.successors(current).filter((v) => reach[remaining].has(v.swara.pitch));
      if (!options.length) return null;
      const direction = desiredDirection(this.intent.contour, i / Math.max(1, n - 1));
      let weights = options.map(({ swara, kind }) => {
        let weight = { aaroh: 3.0, avroh: 3.0, phrase: 2.5, repeat: 0.35 }[kind] ?? 1.0;
        const step = Math.sign(swara.pitch - current.pitch);
        if (direction && step) weight *= step === direction ? 3.0 : 0.45;
        if (step === 0 && path.length >= 2 && path.at(-2).pitch === current.pitch) weight = 0.0;
        if (emphasis.has(swara.semitone)) weight *= 2.2;
        else if ([this.raga.vadi, this.raga.samvadi].includes(swara.semitone)) weight *= 1.25;
        if (this.intent.use_pakad && path.length >= 2) {
          const gram = `${path.at(-2).semitone},${current.semitone},${swara.semitone}`;
          if (this.raga.phraseTrigrams.has(gram)) weight *= 4.0;
        }
        return weight;
      });
      if (!weights.some(Boolean)) weights = weights.map(() => 1.0);
      current = this.rng.choices(options, weights).swara;
      path.push(current);
    }
    return path;
  }

  score(path) {
    const notes = [];
    let score = 0.0;
    const desired = shape(this.intent.contour, path.length);
    if (desired.length) {
      const corr = correlation(path.map((p) => p.pitch), desired);
      score += 3.0 * corr;
      notes.push(`contour match ${corr.toFixed(2)}`);
    }
    if (path.length >= 3) {
      let matches = 0;
      for (let i = 0; i < path.length - 2; i += 1) {
        if (this.raga.phraseTrigrams.has(`${path[i].semitone},${path[i + 1].semitone},${path[i + 2].semitone}`)) matches += 1;
      }
      const flavor = matches / (path.length - 2);
      score += (this.intent.use_pakad ? 2.5 : 1.2) * flavor;
      notes.push(`raga phrases ${Math.round(flavor * 100)}%`);
    }
    const repeats = path.slice(1).filter((p, i) => p.pitch === path[i].pitch).length / Math.max(1, path.length - 1);
    score -= 1.5 * repeats;
    let wobbles = 0;
    for (let i = 0; i < path.length - 2; i += 1) if (path[i].pitch === path[i + 2].pitch && path[i].pitch !== path[i + 1].pitch) wobbles += 1;
    score -= (2.0 * wobbles) / Math.max(1, path.length - 2);
    if (this.intent.emphasize.length) {
      const share = path.filter((p) => this.intent.emphasize.includes(p.semitone)).length / path.length;
      score += 1.5 * share;
      notes.push(`emphasis ${Math.round(share * 100)}%`);
    }
    return [score, notes];
  }

  addHolds(path) {
    let holds = this.totalSlots - path.length;
    const counts = Array(path.length).fill(0);
    if (holds > 0) {
      counts[counts.length - 1] += 1;
      holds -= 1;
    }
    while (holds > 0) {
      const i = this.rng.randrange(path.length);
      if (counts[i] < 3) {
        counts[i] += 1;
        holds -= 1;
      }
    }
    return path.flatMap((swara, i) => [swara, ...Array(counts[i]).fill(HOLD)]);
  }

  rankedPaths(n, candidates = CANDIDATES) {
    const reach = this.reachability(n);
    const seen = new Set();
    const scored = [];
    for (let i = 0; i < candidates; i += 1) {
      const path = this.walk(n, reach);
      if (!path) break;
      const key = path.map((p) => p.pitch).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      const [score, notes] = this.score(path);
      scored.push([score, path, notes]);
    }
    return scored.sort((a, b) => b[0] - a[0]);
  }

  generate() {
    const scored = this.rankedPaths(this.noteCount());
    if (!scored.length) {
      throw new GenerationError("No sequence satisfies these constraints in this raga. Try another start or end note, a different register, or more beats.");
    }
    return scored.slice(0, this.intent.count).map(([score, path, explanation]) => ({
      tokens: this.addHolds(path).map(String),
      notes_per_beat: this.intent.notes_per_beat,
      score: Math.round(score * 1000) / 1000,
      explanation,
    }));
  }
}

export function arrangePalta(raga, motif, top = 12) {
  if (motif.length < 2) return [...motif];
  const ladder = (notes) => {
    const semis = new Set(notes.map((n) => n.semitone));
    return raga.pitches.filter((p) => semis.has(p.semitone));
  };
  const shifted = (seq, steps, k) => {
    const out = [];
    for (const s of seq) {
      const index = steps.findIndex((step) => step.pitch === s.pitch);
      if (index < 0 || index + k < 0 || index + k >= steps.length) return null;
      out.push(steps[index + k]);
    }
    return out;
  };
  const appendIfValid = (result, seq) => {
    if (validate(raga, [result.at(-1), ...seq]).length) return false;
    result.push(...seq);
    return true;
  };
  const result = [...motif];
  const up = ladder(raga.aaroh);
  const down = ladder(raga.avroh);
  let lastUp = [...motif];
  for (let k = 1; k < up.length; k += 1) {
    const cand = shifted(motif, up, k);
    if (!cand || Math.max(...cand.map((s) => s.pitch)) > top) break;
    if (appendIfValid(result, cand)) lastUp = cand;
    if (Math.max(...cand.map((s) => s.pitch)) === top) break;
  }
  const floor = Math.min(...motif.map((s) => s.pitch));
  const rev = [...lastUp].reverse();
  for (let k = 1; k < down.length; k += 1) {
    const cand = shifted(rev, down, -k);
    if (!cand || Math.min(...cand.map((s) => s.pitch)) < floor) break;
    appendIfValid(result, cand);
  }
  if (result.at(-1).pitch !== motif[0].pitch && raga.move(result.at(-1), motif[0])) result.push(motif[0]);
  return result;
}
