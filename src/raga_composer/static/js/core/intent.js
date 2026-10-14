import { Swara } from "./notation.js";
import { TAALS } from "./taal.js";

export const CONTOURS = {
  ASCENDING: "ascending",
  DESCENDING: "descending",
  ARCH: "arch",
  VALLEY: "valley",
  ANY: "any",
};

export const REGISTERS = {
  MANDRA: "mandra",
  MADHYA: "madhya",
  TAAR: "taar",
  FULL: "full",
};

const SWARA_WORDS = new Map([
  ["sa", "S"],
  ["re", "R"],
  ["ri", "R"],
  ["ga", "G"],
  ["ma", "m"],
  ["pa", "P"],
  ["dha", "D"],
  ["da", "D"],
  ["ni", "N"],
]);
const KOMAL_OF = new Map([
  ["R", "r"],
  ["G", "g"],
  ["D", "d"],
  ["N", "n"],
]);
const TAAL_BEATS = new Map(TAALS.map((taal) => [taal.name.toLowerCase(), taal.beats]));
const TAAL_ALIASES = new Map([
  ["tintal", "teentaal"],
  ["teental", "teentaal"],
  ["tintaal", "teentaal"],
  ["ektal", "ektaal"],
  ["jhaptal", "jhaptaal"],
  ["rupaktaal", "rupak"],
  ["kaharwa", "keherwa"],
  ["keherva", "keherwa"],
  ["dadra", "dadra"],
]);
const SPEED_WORDS = new Map([
  ["dugun", 2],
  ["double speed", 2],
  ["tigun", 3],
  ["triple speed", 3],
  ["chaugun", 4],
  ["quadruple speed", 4],
]);

export function defaultIntention() {
  return {
    contour: CONTOURS.ANY,
    beats: 8,
    notes_per_beat: 1,
    start: null,
    end: null,
    emphasize: [],
    hold_ratio: 0.0,
    saptak: REGISTERS.FULL,
    use_pakad: false,
    taal: null,
    count: 4,
    summary: [],
  };
}

function cloneBase(base) {
  return base ? { ...defaultIntention(), ...structuredClone(base) } : defaultIntention();
}

function closestInRaga(letter, raga) {
  const variants = { R: "Rr", G: "Gg", m: "mM", D: "Dd", N: "Nn" }[letter] ?? letter;
  for (const variant of variants) {
    if (raga.semitones.has(Swara.parse(variant).semitone)) return variant;
  }
  return letter;
}

export function noteLabel(target) {
  const swara = new Swara((target.octave ?? 0) * 12 + target.semitone);
  return target.octave === null || target.octave === undefined ? swara.name : swara.toString();
}

export function noteMatches(target, swara) {
  return swara.semitone === target.semitone && (target.octave === null || target.octave === undefined || swara.octave === target.octave);
}

export function resolveNote(phrase, raga) {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const modifiers = new Set(words.slice(0, -1).map((word) => word.toLowerCase()));
  const head = words.at(-1);
  let octave = null;
  if ([...modifiers].some((word) => ["taar", "tar", "upper", "high", "higher"].includes(word))) octave = 1;
  else if ([...modifiers].some((word) => ["mandra", "lower", "low"].includes(word))) octave = -1;
  else if ([...modifiers].some((word) => ["madhya", "middle"].includes(word))) octave = 0;

  if (SWARA_WORDS.has(head.toLowerCase())) {
    let letter = SWARA_WORDS.get(head.toLowerCase());
    if (modifiers.has("komal")) letter = KOMAL_OF.get(letter) ?? letter;
    else if (modifiers.has("tivra") || modifiers.has("teevra")) letter = letter === "m" ? "M" : letter;
    else if (!modifiers.has("shuddha")) letter = closestInRaga(letter, raga);
    const swara = Swara.parse(letter);
    return { semitone: swara.semitone, octave };
  }

  try {
    const swara = Swara.parse(head);
    const hasMark = head.endsWith("'") || head.endsWith(".");
    return { semitone: swara.semitone, octave: hasMark ? swara.octave : octave };
  } catch {
    return null;
  }
}

function findNote(text, verbs, raga) {
  const noteToken = "(?:ni|[SrRgGmMPpdDnN])(?:'+|\\.+)?(?![A-Za-z])";
  const noteWords = "(?:sa|re|ri|ga|ma|pa|dha|da|ni)\\b";
  const modifier = "(?:(?:komal|tivra|teevra|shuddha|taar|tar|upper|high|higher|mandra|lower|low|madhya|middle)\\s+)*";
  const pattern = new RegExp(`\\b(?:${verbs})\\s+(?:on|at|with|from|to|in|into)?\\s*(?:the\\s+)?(?<note>${modifier}(?:${noteToken}|${noteWords}))`, "i");
  const match = pattern.exec(text);
  return match?.groups?.note ? resolveNote(match.groups.note, raga) : null;
}

function pythonSearch(pattern, lower) {
  return new RegExp(pattern, "i").test(lower);
}

export function parseIntention(text, raga, base = null) {
  const intent = cloneBase(base);
  const summary = [];
  const lower = text.toLowerCase();

  if (pythonSearch("up and down|rise and fall|rising and falling|arch|aaroh[- ]avroh|up then down", lower)) intent.contour = CONTOURS.ARCH;
  else if (pythonSearch("down and up|fall and rise|valley|dip|down then up", lower)) intent.contour = CONTOURS.VALLEY;
  else if (pythonSearch("ascend|rising|rise|upward|going up|goes up|climb|aaroh|arohi", lower)) intent.contour = CONTOURS.ASCENDING;
  else if (pythonSearch("descend|falling|fall|downward|going down|goes down|avroh|avrohi", lower)) intent.contour = CONTOURS.DESCENDING;
  summary.push(`contour: ${intent.contour}`);

  const taalPattern = [...TAAL_BEATS.keys(), ...TAAL_ALIASES.keys()].join("|");
  const taalMatch = new RegExp(`\\b(${taalPattern})\\b`, "i").exec(lower);
  if (taalMatch) {
    const name = TAAL_ALIASES.get(taalMatch[1]) ?? taalMatch[1];
    const taal = TAALS.find((item) => item.name.toLowerCase() === name);
    intent.taal = taal.name;
    intent.beats = TAAL_BEATS.get(name);
    const cycles = /(\d+)\s*(?:cycles?|avartans?|avartanas?)/.exec(lower);
    if (cycles) intent.beats = Math.min(64, intent.beats * Number(cycles[1]));
  }
  const beats = /(\d+)\s*(?:beats?|matras?|counts?|maatras?)/.exec(lower);
  if (beats) intent.beats = Math.max(1, Math.min(64, Number(beats[1])));
  summary.push(`beats: ${intent.beats}${intent.taal ? ` (${intent.taal})` : ""}`);

  const npb = /(\d+)\s*notes?\s*(?:per|a|each|in a|in each)\s*beat/.exec(lower);
  if (npb) intent.notes_per_beat = Math.max(1, Math.min(8, Number(npb[1])));
  else {
    let found = false;
    for (const [word, speed] of SPEED_WORDS) {
      if (lower.includes(word)) {
        intent.notes_per_beat = speed;
        found = true;
        break;
      }
    }
    if (!found && /\btaan\b|\bfast\b/.test(lower) && intent.notes_per_beat === 1) intent.notes_per_beat = 2;
  }
  if (intent.notes_per_beat > 1) summary.push(`${intent.notes_per_beat} notes per beat`);

  const end = findNote(text, "end|ends|ending|finish|finishes|finishing|land|lands|landing|resolve|resolves|resolving|stop|stops|stopping", raga);
  if (end) {
    intent.end = end;
    summary.push(`ends on ${noteLabel(end)}`);
  }
  const start = findNote(text, "start|starts|starting|begin|begins|beginning|open|opens|opening", raga);
  if (start) {
    intent.start = start;
    summary.push(`starts on ${noteLabel(start)}`);
  }

  const emph = /\b(?:emphasi[sz]\w*|stress\w*|focus\w*|highlight\w*|around)\s+(?:on\s+)?(?:the\s+)?(?<notes>.+?)(?:$|[.;]|\band\s+(?:has|is|with|end|start))/i.exec(text);
  if (emph?.groups?.notes) {
    const found = [];
    for (const part of emph.groups.notes.split(/,|\band\b|&/i)) {
      const note = resolveNote(part, raga);
      if (note && raga.semitones.has(note.semitone)) found.push(note.semitone);
    }
    if (found.length) intent.emphasize = [...new Set(found)].sort((a, b) => a - b);
  }
  if (/\bvadi\b/.test(lower)) intent.emphasize = [...new Set([...intent.emphasize, raga.vadi, raga.samvadi].filter((n) => n !== null))].sort((a, b) => a - b);
  if (intent.emphasize.length) summary.push(`emphasis: ${intent.emphasize.map((s) => new Swara(s).name).join(" ")}`);

  if (/no holds|without holds|no elongat|staccato/.test(lower)) intent.hold_ratio = 0.0;
  else if (/elongat|sustain|long notes|held notes|with holds|slow|aalap|alap|meend/.test(lower)) intent.hold_ratio = 0.3;
  if (intent.hold_ratio) summary.push("with held notes (_)");

  if (/taar saptak|upper octave|upper register|high register|in taar/.test(lower)) intent.saptak = REGISTERS.TAAR;
  else if (/mandra saptak|lower octave|low register|in mandra/.test(lower)) intent.saptak = REGISTERS.MANDRA;
  else if (/madhya saptak|middle octave|middle register|in madhya/.test(lower)) intent.saptak = REGISTERS.MADHYA;
  if (intent.saptak !== REGISTERS.FULL) summary.push(`saptak: ${intent.saptak}`);

  if (/pakad|signature|characteristic/.test(lower)) {
    intent.use_pakad = true;
    summary.push("leans on the pakad");
  }

  const count = /(\d+)\s*(?:patterns?|options?|variations?|phrases?|lines?|sequences?)/.exec(lower);
  if (count) intent.count = Math.max(1, Math.min(12, Number(count[1])));

  intent.summary = summary;
  return intent;
}
