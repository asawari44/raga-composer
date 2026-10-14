// Audio engine: piano, tanpura, tabla, and recording, synthesized with Web Audio.

import { DEFAULT_INSTRUMENT, getInstrument, playVoice } from "./instruments.js";

export const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function tonicMidi(name, octave) {
  return 12 * (octave + 1) + TONICS.indexOf(name);
}

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.tonic = "G#";
    this.tonicOctave = 3;
    this.tempo = 80;
    this.instrument = getInstrument(DEFAULT_INSTRUMENT);
    this.listeners = new Set();
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    }
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // Everything that is heard is also routed to the recorder bus.
    this.recordBus = ctx.createMediaStreamDestination();
    comp.connect(this.recordBus);

    this.pianoBus = this._bus(0.8);
    this.tanpuraBus = this._bus(0.45);
    this.tablaBus = this._bus(0.8);
    this.noise = this._noiseBuffer();
    this.tanpura = new Tanpura(this);
    this.tabla = new Tabla(this);
    return ctx;
  }

  _bus(level) {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.master);
    return g;
  }

  _noiseBuffer() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  get now() {
    return this.ensure().currentTime;
  }

  saMidi(tonic = this.tonic, octave = this.tonicOctave) {
    return tonicMidi(tonic, octave);
  }

  freq(pitch, tonic = this.tonic, octave = this.tonicOctave) {
    return midiToFreq(this.saMidi(tonic, octave) + pitch);
  }

  setVolume(bus, value) {
    this.ensure();
    this[bus].gain.setTargetAtTime(value, this.ctx.currentTime, 0.05);
  }

  // Melodic instrument ------------------------------------------------------
  setInstrument(id) {
    this.instrument = getInstrument(id);
  }

  // Starts a note now (or at `when`) and returns a function that releases it.
  startNote(pitch, when = 0, dest = null) {
    const ctx = this.ensure();
    const t = Math.max(when, ctx.currentTime);
    return playVoice(ctx, dest || this.pianoBus, this.noise, this.instrument, this.freq(pitch), t);
  }

  playNote(pitch, when = 0, duration = 0.6, dest = null) {
    const ctx = this.ensure();
    const t = Math.max(when, ctx.currentTime);
    this.startNote(pitch, t, dest)(t + duration);
  }

  // Schedules a token sequence ("S", "R", "_", "-", ...) and returns timing info.
  // Notes are scheduled a little ahead of time, so long performances don't
  // create thousands of audio nodes at once.
  playSequence(tokens, notesPerBeat, { startAt = null, onToken = null } = {}) {
    const ctx = this.ensure();
    const slot = 60 / this.tempo / notesPerBeat;
    let t0 = startAt ?? ctx.currentTime + 0.12;
    if (startAt === null && this.tabla.running) t0 = this.tabla.nextSamTime();
    const end = t0 + tokens.length * slot;
    // A per-sequence gain lets cancel() silence notes that are already scheduled.
    const out = ctx.createGain();
    out.connect(this.pianoBus);
    const timers = new Set();
    const later = (time, fn) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, Math.max(0, (time - ctx.currentTime) * 1000));
      timers.add(id);
    };
    let next = 0;
    let pump = null;
    const schedule = () => {
      const horizon = ctx.currentTime + 1.5;
      while (next < tokens.length && t0 + next * slot < horizon) {
        const i = next++;
        const tok = tokens[i];
        const time = t0 + i * slot;
        if (tok.pitch !== undefined) {
          let len = 1;
          while (tokens[i + len]?.hold) len++;
          this.playNote(tok.pitch, time, len * slot * 0.95, out);
        }
        if (onToken) later(time, () => onToken(i, tok));
      }
      if (next >= tokens.length && pump !== null) {
        clearInterval(pump);
        pump = null;
        if (onToken) later(end, () => onToken(-1, null));
        later(end + 3, () => out.disconnect());
      }
    };
    pump = setInterval(schedule, 200);
    schedule();
    const cancel = () => {
      if (pump !== null) clearInterval(pump);
      pump = null;
      timers.forEach(clearTimeout);
      timers.clear();
      out.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => out.disconnect(), 200);
    };
    return { start: t0, end, cancel };
  }
}

// Tanpura ----------------------------------------------------------------------
// Four strings plucked in a loop: first string (Pa, Ma, or Ni of the lower
// octave), Sa, Sa, and kharaj Sa an octave lower.
class Tanpura {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
    this.tonic = "G#";
    this.octave = 3;
    this.firstString = "P";
    this.cycleSeconds = 4.8;
    this.wave = this._wave();
  }

  _wave() {
    const n = 40;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      // Rich spectrum with a formant bump, approximating the jawari buzz.
      imag[k] = (1 / k ** 0.75) * (1 + 0.8 * Math.exp(-((k - 9) ** 2) / 18));
    }
    return this.engine.ctx.createPeriodicWave(real, imag);
  }

  strings() {
    const first = { P: -5, m: -7, M: -6, N: -1, n: -2 }[this.firstString] ?? -5;
    return [first, 0, 0, -12];
  }

  pluck(pitch, t) {
    const ctx = this.engine.ctx;
    const f = this.engine.freq(pitch, this.tonic, this.octave);
    const dur = this.cycleSeconds * 1.1;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    // The sweeping resonance gives the slow "shimmer" of a tanpura string.
    lp.frequency.setValueAtTime(f * 18, t);
    lp.frequency.exponentialRampToValueAtTime(f * 5, t + dur * 0.5);
    lp.frequency.exponentialRampToValueAtTime(f * 2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(lp);
    lp.connect(this.engine.tanpuraBus);
    for (const detune of [-3, 3]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.wave);
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    const ctx = this.engine.ensure();
    let next = ctx.currentTime + 0.1;
    let idx = 0;
    const tick = () => {
      if (!this.running) return;
      const step = this.cycleSeconds / 4;
      while (next < ctx.currentTime + 0.3) {
        this.pluck(this.strings()[idx % 4], next);
        idx++;
        next += step;
      }
    };
    tick();
    this.timer = setInterval(tick, 50);
  }

  stop() {
    this.running = false;
    clearInterval(this.timer);
  }
}

// Tabla ------------------------------------------------------------------------
class Tabla {
  constructor(engine) {
    this.engine = engine;
    this.running = false;
    this.theka = [];
    this.beat = 0;
    this.onBeat = null;
    this.beatTimers = new Set();
    this.runToken = 0;
  }

  // Dayan (right drum) is tuned to Sa one octave above the tonic.
  get dayanFreq() {
    return this.engine.freq(12);
  }

  _ring(freq, t, decay, level, partials = [[1, 1], [2, 0.5], [3, 0.25], [4.2, 0.12]]) {
    const ctx = this.engine.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    g.connect(this.engine.tablaBus);
    for (const [m, a] of partials) {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.frequency.value = freq * m;
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  _click(t, level, freq = 3000, decay = 0.03) {
    const ctx = this.engine.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.engine.tablaBus);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  _bayan(t, level = 0.9, open = true) {
    const ctx = this.engine.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(open ? 95 : 60, t + 0.25);
    const decay = open ? 0.7 : 0.12;
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(this.engine.tablaBus);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  stroke(syllable, t, accent = 1) {
    const s = syllable.toLowerCase();
    const f = this.dayanFreq;
    const na = () => { this._ring(f, t, 0.45, 0.35 * accent); this._click(t, 0.25 * accent, 3500); };
    const tin = () => this._ring(f, t, 0.3, 0.25 * accent, [[1, 1], [2.1, 0.3]]);
    const ge = () => this._bayan(t, 0.9 * accent, true);
    const ke = () => { this._bayan(t, 0.5 * accent, false); this._click(t, 0.15 * accent, 900, 0.05); };
    switch (s) {
      case "dha": na(); ge(); break;
      case "dhin": case "dhi": case "din": tin(); ge(); break;
      case "na": case "ta": case "ne": case "te": na(); break;
      case "di": tin(); break;
      case "-": break;
      case "tin": case "ti": tin(); break;
      case "tu": this._ring(f, t, 0.5, 0.3 * accent, [[1, 1]]); break;
      case "ge": case "ga": case "ghe": ge(); break;
      case "ke": case "ka": case "kat": case "ki": ke(); break;
      case "ra": this._click(t, 0.18 * accent, 2500, 0.04); break;
      default: tin();
    }
  }

  setTheka(theka, vibhags) {
    this.theka = theka;
    this.vibhags = vibhags;
    this.beat = 0;
  }

  nextSamTime() {
    const beatDur = 60 / this.engine.tempo;
    const beatsToSam = (this.theka.length - (this.beat % this.theka.length)) % this.theka.length;
    return this.nextBeatTime + beatsToSam * beatDur;
  }

  start() {
    if (this.running || !this.theka.length) return;
    this.running = true;
    this.runToken += 1;
    const runToken = this.runToken;
    const ctx = this.engine.ensure();
    this.nextBeatTime = ctx.currentTime + 0.1;
    this.startTime = this.nextBeatTime;
    this.beat = 0;
    const tick = () => {
      if (!this.running) return;
      while (this.nextBeatTime < ctx.currentTime + 0.15) {
        const beatDur = 60 / this.engine.tempo;
        const bol = this.theka[this.beat % this.theka.length];
        // Compound bols such as "TiRaKiTa" are split into equal subdivisions.
        const parts = bol.match(/[A-Z][a-z]*/g) || [bol];
        const accent = this.beat % this.theka.length === 0 ? 1.25 : 1;
        parts.forEach((p, k) => this.stroke(p, this.nextBeatTime + (k * beatDur) / parts.length, accent));
        if (this.onBeat) {
          const beatIndex = this.beat % this.theka.length;
          const ms = (this.nextBeatTime - ctx.currentTime) * 1000;
          const timer = setTimeout(() => {
            this.beatTimers.delete(timer);
            if (this.running && this.runToken === runToken) this.onBeat(beatIndex);
          }, Math.max(0, ms));
          this.beatTimers.add(timer);
        }
        this.beat++;
        this.nextBeatTime += beatDur;
      }
    };
    tick();
    this.timer = setInterval(tick, 25);
  }

  stop() {
    this.running = false;
    this.runToken += 1;
    clearInterval(this.timer);
    this.beatTimers.forEach((timer) => clearTimeout(timer));
    this.beatTimers.clear();
    if (this.onBeat) this.onBeat(-1);
  }
}

// Recorder ---------------------------------------------------------------------
// Records everything the app plays, plus the microphone if enabled. The mic is
// routed only to the recorder, not to the speakers, to avoid feedback.
export class SessionRecorder {
  constructor(engine) {
    this.engine = engine;
    this.recorder = null;
    this.micStream = null;
  }

  get recording() {
    return this.recorder?.state === "recording";
  }

  async start({ withMic }) {
    const ctx = this.engine.ensure();
    if (withMic) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      });
      this.micSource = ctx.createMediaStreamSource(this.micStream);
      this.micSource.connect(this.engine.recordBus);
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
      .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
    this.chunks = [];
    this.recorder = new MediaRecorder(this.engine.recordBus.stream, mime ? { mimeType: mime } : {});
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.startedAt = performance.now();
    this.recorder.start(1000);
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(null);
      this.recorder.onstop = () => {
        const type = (this.recorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(this.chunks, { type });
        const seconds = (performance.now() - this.startedAt) / 1000;
        this.micSource?.disconnect();
        this.micStream?.getTracks().forEach((t) => t.stop());
        this.micStream = null;
        this.micSource = null;
        this.recorder = null;
        resolve({ blob, seconds, type });
      };
      this.recorder.stop();
    });
  }
}
