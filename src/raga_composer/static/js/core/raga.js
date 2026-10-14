import { parsePhrase, Swara } from "./notation.js";

export const LOWEST_PITCH = -7;
export const HIGHEST_PITCH = 19;

const PRIORITY = new Map([
  ["repeat", 0],
  ["aaroh", 1],
  ["avroh", 1],
  ["phrase", 2],
  ["aaroh-leap", 3],
  ["avroh-leap", 3],
]);

const SWARA_GROUPS = {
  Sa: [0],
  Re: [1, 2],
  Ga: [3, 4],
  Ma: [5, 6],
  Pa: [7],
  Dha: [8, 9],
  Ni: [10, 11],
};

function key(name) {
  return [...name.toLowerCase()].filter((ch) => /[a-z0-9]/.test(ch)).join("");
}

function isMonotonic(notes, ascending) {
  return notes.slice(1).every((note, index) => (ascending ? note.pitch > notes[index].pitch : note.pitch < notes[index].pitch));
}

function semitoneOrNull(text) {
  try {
    const notes = parsePhrase(text);
    return notes.length ? notes[0].semitone : null;
  } catch {
    return null;
  }
}

export class Raga {
  constructor(definition) {
    this.definition = structuredClone(definition);
    this.name = definition.name;
    this.edges = new Map();
    this._aaroh = null;
    this._avroh = null;
    this._phrases = null;
    this._semitones = null;
    this._pitches = null;
    this._phraseTrigrams = null;
    this._buildEdges();
  }

  get aaroh() {
    this._aaroh ??= parsePhrase(this.definition.aaroh);
    return this._aaroh;
  }

  get avroh() {
    this._avroh ??= parsePhrase(this.definition.avroh);
    return this._avroh;
  }

  get phrases() {
    this._phrases ??= [...(this.definition.pakad ?? []), ...(this.definition.patterns ?? [])].map(parsePhrase);
    return this._phrases;
  }

  get semitones() {
    if (!this._semitones) {
      this._semitones = new Set([...this.aaroh, ...this.avroh, ...this.phrases.flat()].map((s) => s.semitone));
    }
    return this._semitones;
  }

  get vadi() {
    return semitoneOrNull(this.definition.vadi ?? "");
  }

  get samvadi() {
    return semitoneOrNull(this.definition.samvadi ?? "");
  }

  get pitches() {
    if (!this._pitches) {
      this._pitches = [];
      for (let pitch = LOWEST_PITCH; pitch <= HIGHEST_PITCH; pitch += 1) {
        const swara = new Swara(pitch);
        if (this.semitones.has(swara.semitone)) this._pitches.push(swara);
      }
    }
    return this._pitches;
  }

  get phraseTrigrams() {
    if (!this._phraseTrigrams) {
      this._phraseTrigrams = new Set();
      for (const phrase of this.phrases) {
        for (let i = 0; i < phrase.length - 2; i += 1) {
          this._phraseTrigrams.add(`${phrase[i].semitone},${phrase[i + 1].semitone},${phrase[i + 2].semitone}`);
        }
      }
    }
    return this._phraseTrigrams;
  }

  _add(a, b, kind) {
    if (a.pitch < LOWEST_PITCH || a.pitch > HIGHEST_PITCH || b.pitch < LOWEST_PITCH || b.pitch > HIGHEST_PITCH) return;
    const current = this.edges.get(a.pitch) ?? new Map();
    const existing = current.get(b.pitch);
    if (!existing || PRIORITY.get(kind) < PRIORITY.get(existing.kind)) {
      current.set(b.pitch, { swara: b, kind });
    }
    this.edges.set(a.pitch, current);
  }

  _buildEdges() {
    const sources = [
      [this.aaroh, "aaroh", isMonotonic(this.aaroh, true) ? "aaroh-leap" : null],
      [this.avroh, "avroh", isMonotonic(this.avroh, false) ? "avroh-leap" : null],
    ];
    for (const [notes, stepKind, leapKind] of sources) {
      for (let octave = -2; octave <= 2; octave += 1) {
        const shifted = notes.map((note) => note.shifted(octave));
        for (let i = 0; i < shifted.length - 1; i += 1) this._add(shifted[i], shifted[i + 1], stepKind);
        if (leapKind) {
          for (let i = 0; i < shifted.length - 2; i += 1) this._add(shifted[i], shifted[i + 2], leapKind);
        }
      }
    }
    for (const phrase of this.phrases) {
      for (let octave = -2; octave <= 2; octave += 1) {
        const shifted = phrase.map((note) => note.shifted(octave));
        for (let i = 0; i < shifted.length - 1; i += 1) {
          this._add(shifted[i], shifted[i + 1], shifted[i].pitch === shifted[i + 1].pitch ? "repeat" : "phrase");
        }
      }
    }
    for (const pitch of this.pitches) this._add(pitch, pitch, "repeat");
  }

  move(a, b) {
    return this.edges.get(a.pitch)?.get(b.pitch)?.kind ?? null;
  }

  successors(a) {
    return [...(this.edges.get(a.pitch)?.values() ?? [])];
  }
}

export class RagaRegistry {
  constructor(definitions) {
    this.ragas = new Map();
    this.lookup = new Map();
    for (const definition of definitions) this.add(definition);
  }

  add(definition) {
    const raga = new Raga(definition);
    this.ragas.set(definition.name, raga);
    for (const item of [definition.name, ...(definition.aliases ?? [])]) this.lookup.set(key(item), definition.name);
    return raga;
  }

  get(name) {
    const canonical = this.lookup.get(key(name));
    return canonical ? this.ragas.get(canonical) ?? null : null;
  }

  all() {
    return [...this.ragas.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}

export function ragaDetailPayload(raga, compositions) {
  const notes = [...raga.semitones].map((s) => new Swara(s)).sort((a, b) => a.pitch - b.pitch);
  return {
    ...structuredClone(raga.definition),
    custom: raga.definition.custom ?? false,
    notes: notes.map(String),
    varjit: Object.entries(SWARA_GROUPS)
      .filter(([, group]) => !group.some((semitone) => raga.semitones.has(semitone)))
      .map(([name]) => name),
    compositions: compositions.filter((composition) => composition.raga.toLowerCase() === raga.name.toLowerCase()),
  };
}
