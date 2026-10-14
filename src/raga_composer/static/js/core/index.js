import { CoreError } from "./errors.js";
import { arrangePalta, GenerationError, Generator, validate } from "./generator.js";
import { defaultIntention, parseIntention } from "./intent.js";
import { ImprovisationError, improvise } from "./improvise.js";
import { formatTokens, HOLD, NotationError, REST, Swara, tokenize } from "./notation.js";
import { RagaRegistry, ragaDetailPayload } from "./raga.js";
import { getTaal, taalBeats, TAALS } from "./taal.js";

export { CoreError };

const TONICS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let registry = null;
let compositions = [];

function requireData() {
  if (!registry) throw new CoreError(500, "Core data has not been loaded.");
}

function findRaga(name) {
  requireData();
  const raga = registry.get(name);
  if (!raga) throw new CoreError(404, `Unknown raga: ${name}`);
  return raga;
}

function parseTokens(raw) {
  const text = Array.isArray(raw) ? raw.join(" ") : raw;
  try {
    return tokenize(text);
  } catch (error) {
    if (error instanceof NotationError) throw new CoreError(422, error.message);
    throw error;
  }
}

export async function loadData(fetchJson) {
  const [ragas, loadedTaals, loadedCompositions] = await Promise.all([
    fetchJson("data/ragas.json"),
    fetchJson("data/taals.json").catch(() => TAALS),
    fetchJson("data/compositions.json").catch(() => []),
  ]);
  if (loadedTaals.length !== TAALS.length) {
    throw new CoreError(422, "Loaded taal data doesn't match the core taal table.");
  }
  registry = new RagaRegistry(ragas);
  compositions = loadedCompositions;
}

export function config() {
  return { taals: TAALS, tonics: TONICS, default_tonic: "G#" };
}

export function listTaals() {
  return TAALS;
}

export function listRagas() {
  requireData();
  return registry.all().map((raga) => ({
    name: raga.name,
    thaat: raga.definition.thaat,
    time: raga.definition.time,
    aliases: raga.definition.aliases,
    custom: false,
    compositions: compositions.filter((composition) => composition.raga.toLowerCase() === raga.name.toLowerCase() && composition.sections?.length).length,
  }));
}

export function ragaDetail(name) {
  return ragaDetailPayload(findRaga(name), compositions);
}

// The first sung pitch of the sthayi and of the antara, keyed by section.
export function mukhdaPitches(composition) {
  const sections = composition.sections || [];
  const antara = sections.slice(1).find((section) => /antara/i.test(section.name));
  const found = {};
  for (const [key, section] of [["sthayi", sections[0]], ["antara", antara]]) {
    if (!section) continue;
    for (const line of section.lines) {
      const swara = line.beats.flatMap((beat) => tokenize(beat)).find((token) => token instanceof Swara);
      if (swara) {
        found[key] = swara.pitch;
        break;
      }
    }
  }
  return found;
}

export function improvisations(name, { taal = "Teentaal", seed = null, composition = null } = {}) {
  const raga = findRaga(name);
  const beats = taalBeats(taal);
  if (beats === null) throw new CoreError(400, `Unknown taal: ${taal}.`);
  const known = getTaal(taal);
  let land = {};
  if (composition !== null && composition !== undefined) {
    const comp = compositions.find((c) => c.raga.toLowerCase() === raga.name.toLowerCase() && c.title === composition);
    if (!comp) throw new CoreError(404, `Unknown composition: ${composition}.`);
    land = mukhdaPitches(comp);
  }
  try {
    return improvise(raga, known ? known.name : taal, beats, seed, land);
  } catch (error) {
    if (error instanceof ImprovisationError) throw new CoreError(422, error.message);
    throw error;
  }
}

export function parseIntent({ raga, text = "", base = null }) {
  return parseIntention(text, findRaga(raga), base);
}

export function generate({ raga, text = "", base = null, seed = null }) {
  const selected = findRaga(raga);
  const intention = parseIntention(text, selected, base);
  try {
    return { intention, patterns: new Generator(selected, intention, seed).generate() };
  } catch (error) {
    if (error instanceof GenerationError) throw new CoreError(422, error.message);
    throw error;
  }
}

export function validateSequence({ raga, tokens }) {
  const parsed = parseTokens(tokens);
  const selected = findRaga(raga);
  return { tokens: formatTokens(parsed), violations: validate(selected, parsed) };
}

export function arrange({ raga, tokens, mode, notes_per_beat = 4, motif_length = 3 }) {
  if (!["taan", "palta", "compact", "sustain"].includes(mode)) {
    throw new CoreError(422, "String should match pattern '^(taan|palta|compact|sustain)$'");
  }
  const selected = findRaga(raga);
  const parsed = parseTokens(tokens);
  const swaras = parsed.filter((token) => token instanceof Swara);
  let result;
  let npb = notes_per_beat;
  if (mode === "taan") result = [...swaras];
  else if (mode === "palta") result = arrangePalta(selected, swaras.slice(0, motif_length));
  else if (mode === "sustain") {
    result = swaras.flatMap((swara) => [swara, HOLD]);
    npb = Math.max(1, npb);
  } else {
    result = parsed.filter((token) => token !== HOLD && token !== REST);
  }
  if (["taan", "palta"].includes(mode) && result.length % npb) {
    result = [...result, ...Array(npb - (result.length % npb)).fill(HOLD)];
  }
  return { tokens: formatTokens(result), violations: validate(selected, result), notes_per_beat: npb };
}

export const _test = {
  defaultIntention,
  parseTokens,
};
