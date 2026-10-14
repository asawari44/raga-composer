export const SWARA_NAMES = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
const NAME_TO_SEMITONE = new Map(SWARA_NAMES.map((name, index) => [name, index]));
const ALIASES = new Map([
  ["p", "P"],
  ["ni", "n"],
]);

export const HOLD = "_";
export const REST = "-";

export class NotationError extends Error {}

export class Swara {
  constructor(pitch) {
    this.pitch = pitch;
  }

  get semitone() {
    return ((this.pitch % 12) + 12) % 12;
  }

  get octave() {
    return Math.floor(this.pitch / 12);
  }

  get name() {
    return SWARA_NAMES[this.semitone];
  }

  shifted(octaves) {
    return new Swara(this.pitch + 12 * octaves);
  }

  toString() {
    if (this.octave > 0) return this.name + "'".repeat(this.octave);
    if (this.octave < 0) return this.name + ".".repeat(-this.octave);
    return this.name;
  }

  equals(other) {
    return other instanceof Swara && this.pitch === other.pitch;
  }

  static parse(token) {
    const match = /^(ni|[SrRgGmMPpdDnN])('+|\.+)?$/.exec(token);
    if (!match) throw new NotationError(`Not a swara: '${token}'`);
    const base = ALIASES.get(match[1]) ?? match[1];
    const marks = match[2] ?? "";
    const octave = marks.startsWith("'") ? marks.length : -marks.length;
    return new Swara(octave * 12 + NAME_TO_SEMITONE.get(base));
  }
}

function tokenAt(text, pos) {
  const slice = text.slice(pos);
  const note = /^(ni|[SrRgGmMPpdDnN](?:'+|\.+)?|_|-)/.exec(slice);
  return note?.[0] ?? null;
}

export function tokenize(text) {
  const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    const skip = /^[\s|,]+/.exec(text.slice(pos));
    if (skip) {
      pos += skip[0].length;
      continue;
    }
    const raw = tokenAt(text, pos);
    if (!raw) throw new NotationError(`Unexpected character '${text[pos]}' at position ${pos}`);
    tokens.push(raw === HOLD || raw === REST ? raw : Swara.parse(raw));
    pos += raw.length;
  }
  return tokens;
}

export function parsePhrase(text) {
  return tokenize(text).filter((token) => token instanceof Swara);
}

export function formatTokens(tokens) {
  return tokens.map((token) => token.toString());
}

export function swaraKey(swara) {
  return swara.pitch;
}
