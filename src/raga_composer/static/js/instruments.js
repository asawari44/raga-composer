// Instrument voices. Each voice is a synthesis recipe interpreted by playVoice():
//
//   partials  [ratio, amplitude, detuneCents?, decaySeconds?] per oscillator
//   unison    detune copies in cents, or [cents, amplitude] pairs
//   env       a: attack, d1/l1: fast decay time and level, d2: slow decay (omit to sustain)
//   filter    sweep from f*start to f*end with time constant `time`
//   fm        modulators: frequency ratio, index, decay, and sustain index
//   keyTrack  how much faster high notes decay
//   minHold   shortest sounding time for a tap, in seconds

const INHARMONICITY = 0.00035;

function pianoPartials(count, rolloff, b = INHARMONICITY) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return [n * Math.sqrt(1 + b * n * n), 1 / n ** rolloff];
  });
}

const PIANO = { keyTrack: 0.5, release: 0.25, minHold: 0.35 };

export const INSTRUMENTS = [
  {
    ...PIANO, id: "grand", name: "Concert grand", family: "Piano", gain: 0.34,
    partials: pianoPartials(8, 1.1), unison: [-1.2, 1.2],
    env: { a: 0.003, d1: 0.35, l1: 0.45, d2: 2.2 },
    filter: { start: 14, end: 3.5, time: 0.7, q: 0.5 },
    click: { level: 0.05, freq: 2200, decay: 0.02 },
  },
  {
    ...PIANO, id: "bright-grand", name: "Bright grand", family: "Piano", gain: 0.42,
    partials: pianoPartials(10, 0.8), unison: [-1, 1.3],
    env: { a: 0.002, d1: 0.3, l1: 0.45, d2: 2.0 },
    filter: { start: 22, end: 6, time: 0.6, q: 0.6 },
    click: { level: 0.08, freq: 3500, decay: 0.015 },
  },
  {
    ...PIANO, id: "mellow-grand", name: "Mellow grand", family: "Piano", gain: 0.3,
    partials: pianoPartials(7, 1.3), unison: [-1.5, 1.5],
    env: { a: 0.004, d1: 0.45, l1: 0.5, d2: 2.6 },
    filter: { start: 7, end: 2.2, time: 0.8, q: 0.4 },
    click: { level: 0.03, freq: 1500, decay: 0.025 },
  },
  {
    ...PIANO, id: "upright", name: "Upright piano", family: "Piano", gain: 0.44,
    partials: pianoPartials(8, 1.0, 0.0006), unison: [-3, 2.5],
    env: { a: 0.003, d1: 0.25, l1: 0.4, d2: 1.6 }, release: 0.2,
    filter: { start: 9, end: 2.5, time: 0.5, q: 0.7 },
    click: { level: 0.07, freq: 1800, decay: 0.025 },
  },
  {
    ...PIANO, id: "honky-tonk", name: "Honky-tonk piano", family: "Piano", gain: 0.48,
    partials: pianoPartials(8, 0.95), unison: [-16, 15],
    env: { a: 0.003, d1: 0.25, l1: 0.4, d2: 1.4 },
    filter: { start: 12, end: 4, time: 0.4, q: 0.7 },
    click: { level: 0.08, freq: 2500, decay: 0.02 },
  },
  {
    ...PIANO, id: "felt", name: "Felt piano", family: "Piano", gain: 0.26,
    partials: pianoPartials(5, 1.6), unison: [-2, 2],
    env: { a: 0.012, d1: 0.5, l1: 0.5, d2: 2.5 }, release: 0.35,
    filter: { start: 3.5, end: 1.6, time: 0.5, q: 0.3 },
    click: { level: 0.03, freq: 600, decay: 0.04 },
  },
  {
    ...PIANO, id: "tine-ep", name: "Tine electric piano", family: "Piano", gain: 0.17,
    partials: [[1, 1], [2, 0.12], [3, 0.04]], keyTrack: 0.35, release: 0.3,
    fm: [{ ratio: 1, index: 0.9, decay: 0.35, sustain: 0.1 }],
    env: { a: 0.003, d1: 0.8, l1: 0.5, d2: 2.8 },
    tremolo: { rate: 4.2, depth: 0.3 },
    click: { level: 0.06, freq: 1800, decay: 0.03 },
  },
  {
    ...PIANO, id: "fm-ep", name: "FM electric piano", family: "Piano", gain: 0.21,
    partials: [[1, 1], [1, 0.5, 6]], keyTrack: 0.4, release: 0.3,
    fm: [
      { ratio: 1, index: 1.2, decay: 0.9, sustain: 0.15 },
      { ratio: 14, index: 0.5, decay: 0.05, sustain: 0 },
    ],
    env: { a: 0.002, d1: 0.6, l1: 0.4, d2: 2.0 },
  },
  {
    ...PIANO, id: "reed-ep", name: "Reed electric piano", family: "Piano", gain: 0.3,
    partials: [[1, 1], [2, 0.55], [3, 0.4], [4, 0.18], [5, 0.12], [6, 0.05]],
    env: { a: 0.003, d1: 0.4, l1: 0.45, d2: 1.6 },
    filter: { start: 8, end: 3, time: 0.3, q: 0.8 },
    tremolo: { rate: 5.5, depth: 0.4 },
    click: { level: 0.04, freq: 1200, decay: 0.02 },
  },
  {
    ...PIANO, id: "toy", name: "Toy piano", family: "Piano", gain: 0.4, octave: 1,
    partials: [[1, 1], [3.95, 0.45, 0, 0.25], [8.2, 0.2, 0, 0.08], [12.6, 0.08, 0, 0.04]],
    keyTrack: 0.2, release: 0.15, minHold: 0.2,
    env: { a: 0.001, d1: 0.12, l1: 0.35, d2: 0.6 },
    click: { level: 0.15, freq: 5000, decay: 0.012 },
  },
  {
    id: "harmonium", name: "Harmonium (double reed)", family: "Harmonium", gain: 0.17,
    wave: "sawtooth", partials: [[1, 1]], unison: [[0, 1], [6, 0.7]],
    env: { a: 0.05, d1: 0.3, l1: 0.85 }, release: 0.09, minHold: 0.12,
    filter: { start: 7, end: 5, time: 0.3, q: 0.8 },
    eq: [{ type: "peaking", freq: 1100, q: 1.2, gain: 5 }, { type: "highpass", freq: 110 }],
    tremolo: { rate: 3.5, depth: 0.05 },
  },
  {
    id: "harmonium-single", name: "Harmonium (single reed)", family: "Harmonium", gain: 0.11,
    wave: "sawtooth", partials: [[1, 1]],
    env: { a: 0.04, d1: 0.3, l1: 0.85 }, release: 0.08, minHold: 0.12,
    filter: { start: 9, end: 6, time: 0.3, q: 1 },
    eq: [{ type: "peaking", freq: 1400, q: 1.4, gain: 6 }, { type: "highpass", freq: 140 }],
    tremolo: { rate: 3.5, depth: 0.04 },
  },
  {
    id: "harmonium-coupler", name: "Harmonium (coupler, with bass reed)", family: "Harmonium", gain: 0.22,
    wave: "sawtooth", partials: [[1, 1]], unison: [[0, 1], [5, 0.6], [-1200, 0.65]],
    env: { a: 0.06, d1: 0.3, l1: 0.85 }, release: 0.1, minHold: 0.12,
    filter: { start: 6, end: 4.5, time: 0.3, q: 0.7 },
    eq: [{ type: "peaking", freq: 900, q: 1, gain: 4 }, { type: "highpass", freq: 70 }],
    tremolo: { rate: 3.2, depth: 0.05 },
  },
];

export const DEFAULT_INSTRUMENT = "grand";

export function getInstrument(id) {
  return INSTRUMENTS.find((i) => i.id === id) || INSTRUMENTS[0];
}

// Starts a note at time `t` and returns release(atTime). Voices with a slow
// decay (env.d2) also stop on their own once they've faded out.
export function playVoice(ctx, dest, noise, def, freq, t) {
  const f = freq * 2 ** (def.octave || 0);
  const kt = (261.6 / f) ** (def.keyTrack ?? 0);
  const amp = ctx.createGain();
  const sources = [];
  let node = amp;
  const chain = (next) => {
    node.connect(next);
    node = next;
  };

  if (def.filter) {
    const fl = ctx.createBiquadFilter();
    fl.type = def.filter.type || "lowpass";
    fl.Q.value = def.filter.q ?? 0.7;
    fl.frequency.setValueAtTime(Math.min(18000, f * def.filter.start), t);
    if (def.filter.end) {
      const end = Math.min(18000, Math.max(150, f * def.filter.end));
      fl.frequency.setTargetAtTime(end, t + 0.01, def.filter.time * kt);
    }
    chain(fl);
  }
  for (const eq of def.eq || []) {
    const fl = ctx.createBiquadFilter();
    fl.type = eq.type;
    fl.frequency.value = eq.freq;
    fl.Q.value = eq.q ?? 0.7;
    if (eq.gain !== undefined) fl.gain.value = eq.gain;
    chain(fl);
  }
  if (def.tremolo) {
    const trem = ctx.createGain();
    trem.gain.value = 1 - def.tremolo.depth / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = def.tremolo.rate;
    const depth = ctx.createGain();
    depth.gain.value = def.tremolo.depth / 2;
    lfo.connect(depth);
    depth.connect(trem.gain);
    lfo.start(t);
    sources.push(lfo);
    chain(trem);
  }
  node.connect(dest);

  const e = def.env;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(def.gain, t + e.a);
  amp.gain.setTargetAtTime(def.gain * e.l1, t + e.a, e.d1 * kt);
  if (e.d2) amp.gain.setTargetAtTime(0, t + e.a + e.d1 * kt * 2, e.d2 * kt);

  const mods = (def.fm || []).map((m) => {
    const osc = ctx.createOscillator();
    osc.frequency.value = f * m.ratio;
    const depth = ctx.createGain();
    const hz = m.index * f * m.ratio;
    depth.gain.setValueAtTime(hz, t);
    depth.gain.setTargetAtTime(hz * (m.sustain ?? 0), t, m.decay * kt);
    osc.connect(depth);
    osc.start(t);
    sources.push(osc);
    return depth;
  });

  const unison = (def.unison || [0]).map((u) => (Array.isArray(u) ? u : [u, 1]));
  const norm = 1 / (def.partials.reduce((s, p) => s + p[1], 0) * unison.reduce((s, u) => s + u[1], 0));
  for (const [ratio, level, cents = 0, decay] of def.partials) {
    for (const [uCents, uLevel] of unison) {
      const osc = ctx.createOscillator();
      osc.type = def.wave || "sine";
      osc.frequency.value = f * ratio;
      osc.detune.value = cents + uCents;
      for (const m of mods) m.connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * uLevel * norm, t);
      if (decay) g.gain.setTargetAtTime(0, t, decay * kt);
      osc.connect(g);
      g.connect(amp);
      osc.start(t);
      sources.push(osc);
    }
  }

  if (def.click && noise) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = def.click.freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(def.click.level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + def.click.decay);
    src.connect(bp);
    bp.connect(g);
    g.connect(amp);
    src.start(t);
    src.stop(t + def.click.decay + 0.02);
  }

  const naturalEnd = e.d2 ? t + e.a + e.d1 * kt * 2 + e.d2 * kt * 6 : t + 60;
  sources.forEach((s) => s.stop(naturalEnd));

  let released = false;
  return (at = ctx.currentTime) => {
    if (released) return;
    released = true;
    const when = Math.max(at, t + (def.minHold ?? 0.05), ctx.currentTime);
    if (when >= naturalEnd) return;
    amp.gain.cancelScheduledValues(when);
    amp.gain.setTargetAtTime(0, when, def.release / 3);
    const stopAt = when + def.release * 2 + 0.05;
    sources.forEach((s) => s.stop(stopAt));
  };
}
