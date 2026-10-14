import { AudioEngine, SessionRecorder, TONICS } from "./audio.js";
import { DEFAULT_INSTRUMENT, INSTRUMENTS } from "./instruments.js";
import { api, exportLibrary, importLibraryFile } from "./local-api.js";

const SWARAS = ["S", "r", "R", "g", "G", "m", "M", "P", "d", "D", "n", "N"];
const SWARA_LABELS = ["Sa", "komal Re", "Re", "komal Ga", "Ga", "Ma", "tivra Ma", "Pa", "komal Dha", "Dha", "komal Ni", "Ni"];
const WESTERN = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const PIANO_LOW = -12;
const PIANO_HIGH = 19;

// Computer keys for the swaras of one saptak, from Sa on S to taar Sa on L.
// Shuddha swaras: S D V G H M , L play S R G m P D N S'.
// Komal and tivra swaras: X C B N K play r g M d n.
// Z and period shift every key down or up an octave.
const KEY_MAP = [
  ["KeyS", "S", 0], ["KeyX", "X", 1], ["KeyD", "D", 2], ["KeyC", "C", 3], ["KeyV", "V", 4], ["KeyG", "G", 5],
  ["KeyB", "B", 6], ["KeyH", "H", 7], ["KeyN", "N", 8], ["KeyM", "M", 9], ["KeyK", "K", 10], ["Comma", ",", 11],
  ["KeyL", "L", 12],
];
const KEY_OFFSETS = Object.fromEntries(KEY_MAP.map(([code, , pitch]) => [code, pitch]));
const KEY_LABELS = Object.fromEntries(KEY_MAP.map(([code, label]) => [code, label]));
const OCTAVE_KEYS = { KeyZ: -1, Period: 1 };
// Keys are matched by the character they type, so the map follows the printed
// letters on QWERTZ and AZERTY keyboards too.
const CHAR_CODES = {
  ...Object.fromEntries(KEY_MAP.map(([code, label]) => [label.toLowerCase(), code])),
  z: "KeyZ", ".": "Period",
};

function keyCode(e) {
  const code = CHAR_CODES[e.key?.toLowerCase()];
  if (code) return code;
  // Shift changes punctuation (comma types "<" on many layouts), so fall back to the key's position.
  if (e.shiftKey && (e.code in KEY_OFFSETS || e.code in OCTAVE_KEYS)) return e.code;
  return null;
}
const KEY_ROWS = [
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period"],
];
const ROW_KEY_TEXT = { KeyA: "A", KeyF: "F", KeyJ: "J", KeyZ: "Z", Period: "." };
const KEY_OCTAVES = [-12, 0, 12];
const heldKeys = new Map();
const EXAMPLES = [
  "ascending ending on S and has 16 beats",
  "descending from taar sa ending on S, 8 beats, 2 notes per beat",
  "taan in teentaal, up and down, emphasize the vadi",
  "8 beats ending on Pa with held notes, use the pakad",
  "valley starting on G ending on G, 12 beats",
];

const GLOSSARY = {
  raga: "A melodic framework: a set of swaras, the way they move, and the phrases that give it its mood.",
  swara: "A note of Indian music: Sa, Re, Ga, Ma, Pa, Dha, and Ni.",
  thaat: "The parent scale a raga belongs to. Hindustani music groups ragas into ten thaats.",
  time: "The time of day or season when the raga is traditionally sung.",
  aaroh: "The ascending path of a raga.",
  avroh: "The descending path of a raga.",
  pakad: "A short phrase that makes the raga recognizable.",
  vadi: "The most important swara in the raga.",
  samvadi: "The second most important swara in the raga.",
  varjit: "Swaras the raga leaves out.",
  jati: "How many swaras the raga uses going up and coming down, for example five and seven.",
  bandish: "A fixed composition, with words, set to a taal.",
  tarana: "A composition sung with syllables such as ta, na, dir, and tom instead of words.",
  sthayi: "The first part of a composition. It stays mostly in the lower and middle octaves.",
  antara: "The second part of a composition. It rises toward taar Sa.",
  mukhda: "The opening phrase of the sthayi or antara. It leads to sam, and every alaap and taan returns to it.",
  taal: "The rhythmic cycle, with a fixed number of beats called matras.",
  sam: "Beat 1 of the taal cycle, marked X, where phrases resolve.",
  khali: "The unstressed, wave-of-the-hand division of the taal, marked 0.",
  tali: "A clapped division of the taal, marked with its number.",
  alaap: "A slow, unmetered exploration of the raga's swaras. Here, each alaap is fitted to the taal so it returns to the mukhda.",
  taan: "A fast run of swaras that follows the raga. Here, each taan is 8 or 16 beats and ends on the mukhda.",
  palta: "A practice pattern that repeats a figure on each step of the scale.",
  avartan: "One full cycle of the taal.",
};

const LEARN_TABS = ["overview", "compositions", "improv"];
const SECTION_OF = { overview: "learn", compositions: "learn", improv: "learn", compose: "compose", library: "library" };
const LEARN_STEPS = [
  ["aarohAvroh", "Hear aaroh and avroh", "overview"],
  ["pakad", "Learn the pakad", "overview"],
  ["sthayi", "Learn a sthayi", "compositions"],
  ["antara", "Learn an antara", "compositions"],
  ["alaap", "Practice alaap", "improv"],
  ["taan", "Practice taan", "improv"],
];

const $ = (sel) => document.querySelector(sel);
const engine = new AudioEngine();
const recorder = new SessionRecorder(engine);

const state = {
  keyOctave: 0,
  ragas: [],
  raga: null,
  taals: [],
  taal: null,
  line: [],
  npb: 1,
  selected: -1,
  violations: [],
  lastRequest: null,
  playback: null,
  improv: null,
  improvSeed: null,
  pendingRecording: null,
  history: [],
  future: [],
  loop: null,
  chosenPattern: -1,
};

// Notation helpers -----------------------------------------------------------
const TOKEN_RE = /ni|[SrRgGmMPpdDnN](?:'+|\.+)?|_|-/g;

function parseToken(raw) {
  if (raw === "_") return { text: "_", hold: true };
  if (raw === "-") return { text: "-", rest: true };
  const m = raw.match(/^(ni|[SrRgGmMPpdDnN])('+|\.+)?$/);
  if (!m) return null;
  const base = { p: "P", ni: "n" }[m[1]] ?? m[1];
  const marks = m[2] || "";
  const octave = marks.startsWith("'") ? marks.length : -marks.length;
  return { text: swaraText(octave * 12 + SWARAS.indexOf(base)), pitch: octave * 12 + SWARAS.indexOf(base) };
}

function swaraText(pitch) {
  const name = SWARAS[((pitch % 12) + 12) % 12];
  const octave = Math.floor(pitch / 12);
  return name + (octave > 0 ? "'".repeat(octave) : ".".repeat(-octave));
}

function tokenize(text) {
  return (text.match(TOKEN_RE) || []).map(parseToken).filter(Boolean);
}

// Display script for swaras. Typing always uses the Latin letters; only the
// display changes. Devanagari follows Bhatkhande notation: a line below for
// komal, a stroke above tivra Ma, a dot below for mandra, a dot above for taar,
// and ऽ for a held note.
const SCRIPTS = ["latin", "deva"];
const KOMAL = "\u0952";
const TIVRA = "\u0951";
const DEVANAGARI = {
  S: ["स", "ा"], r: ["र", "े", KOMAL], R: ["र", "े"], g: ["ग", "", KOMAL], G: ["ग", ""], m: ["म", ""], M: ["म", "", TIVRA],
  P: ["प", ""], d: ["ध", "", KOMAL], D: ["ध", ""], n: ["न", "ि", KOMAL], N: ["न", "ि"],
};

function loadScript() {
  try {
    const saved = localStorage.getItem("swaramala.script");
    return SCRIPTS.includes(saved) ? saved : "latin";
  } catch {
    return "latin";
  }
}
state.script = loadScript();

// One token, such as "N.", "S'", "M", or "_", in the chosen script.
function noteText(text, { lowDot = true } = {}) {
  if (state.script !== "deva") return text;
  if (text === "_") return "ऽ";
  const m = /^(ni|[SrRgGmMPpdDnN])('+|\.+)?$/.exec(text);
  if (!m) return text;
  const [consonant, vowel, mark = ""] = DEVANAGARI[{ p: "P", ni: "n" }[m[1]] ?? m[1]];
  const marks = m[2] || "";
  const low = marks.startsWith(".") && lowDot ? "\u093C" : "";
  const high = marks.startsWith("'") ? "\u0902".repeat(marks.length) : "";
  return consonant + low + vowel + high + mark;
}

// The same token as page content. In Devanagari, the mandra dot is drawn with
// CSS, because a nukta collides with the komal line and is hard to see.
function noteNode(text) {
  if (state.script !== "deva" || !/\.$/.test(text)) return noteText(text);
  return el("span", { class: "mandra" }, noteText(text, { lowDot: false }));
}

// A notation string, such as the beat "M D", as page content.
function notationNodes(text) {
  if (state.script !== "deva") return [text];
  const nodes = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(noteNode(m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Prose that mentions swaras, such as "G → m isn't allowed". Only standalone
// tokens change, so English words stay as they are.
const proseNotes = (text) => (state.script === "deva"
  ? text.replace(/(^|[\s(:,])([SrRgGmMPdDnN](?:'+|\.+(?=[\s,);]|$))?)(?=$|[\s,);.])/g, (_, pre, tok) => pre + noteText(tok))
  : text);

const tokensFromStrings = (list) => list.map(parseToken).filter(Boolean);
const lineText = (tokens) => tokens.map((t) => t.text).join(" ");

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    // CSSOM writes are allowed under the style-src 'self' policy; style attributes are not.
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of children.flat()) node.append(c instanceof Node ? c : document.createTextNode(c));
  return node;
}

// Term help ------------------------------------------------------------------
// A term button opens a short definition next to it. One definition is open at a time.
function term(key, label = key) {
  return el("button", { type: "button", class: "term", "aria-expanded": "false", "aria-controls": "term-pop", "data-term": key }, label);
}

function openTerm(button) {
  const pop = $("#term-pop");
  const key = button.dataset.term;
  if (!pop.hidden && pop.dataset.for === key && pop.owner === button) return closeTerm();
  closeTerm();
  pop.replaceChildren(el("strong", {}, key), el("p", {}, GLOSSARY[key] || ""));
  pop.setAttribute("aria-label", key);
  pop.dataset.for = key;
  pop.owner = button;
  pop.hidden = false;
  const r = button.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8));
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  button.setAttribute("aria-expanded", "true");
}

function closeTerm() {
  const pop = $("#term-pop");
  if (pop.hidden) return;
  pop.hidden = true;
  pop.owner?.setAttribute("aria-expanded", "false");
  pop.owner = null;
}

function bindTerms() {
  document.addEventListener("click", (e) => {
    const button = e.target.closest?.(".term");
    if (button) return openTerm(button);
    if (!e.target.closest?.("#term-pop")) closeTerm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#term-pop").hidden) {
      const owner = $("#term-pop").owner;
      closeTerm();
      owner?.focus();
    }
  });
  window.addEventListener("resize", closeTerm);
  $("#glossary-list").append(...Object.entries(GLOSSARY).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
  $("#open-glossary").addEventListener("click", () => $("#glossary-dialog").showModal());
  $("#glossary-close").addEventListener("click", () => $("#glossary-dialog").close());
  $("#glossary-dialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
}

// Learning path --------------------------------------------------------------
const progressKey = () => `swaramala.learnProgress.v1.${state.raga?.name}`;

function learnProgress() {
  try {
    return JSON.parse(localStorage.getItem(progressKey())) || {};
  } catch {
    return state.sessionProgress?.[state.raga?.name] || {};
  }
}

function markLearned(step) {
  if (!state.raga) return;
  const progress = learnProgress();
  if (progress[step]) return;
  progress[step] = true;
  try {
    localStorage.setItem(progressKey(), JSON.stringify(progress));
  } catch {
    state.sessionProgress = { ...state.sessionProgress, [state.raga.name]: progress };
  }
  const label = LEARN_STEPS.find(([k]) => k === step)?.[1];
  if (label) toast(`Marked as practiced: ${label}.`);
  renderLearnPath();
}

function renderLearnPath() {
  const box = $("#learn-path");
  box.replaceChildren();
  if (!state.raga) return;
  const progress = learnProgress();
  const done = LEARN_STEPS.filter(([k]) => progress[k]).length;
  box.append(
    el("span", { class: "lp-title" }, "Your path"),
    el("ol", {}, ...LEARN_STEPS.map(([key, label, tab], n) => el("li", {},
      el("button", {
        type: "button",
        class: "lp-step" + (progress[key] ? " done" : ""),
        "data-n": n + 1,
        title: progress[key] ? "Practiced. Click to go there." : "Click to go there. Steps are marked as practiced when you play them.",
        onclick: () => showTab(tab),
      }, label, progress[key] ? el("span", { class: "sr-only" }, " (practiced)") : "")))),
    el("span", { class: "lp-count" }, `${done} of ${LEARN_STEPS.length} practiced`),
    done ? el("button", {
      type: "button", class: "link-button", onclick: () => {
        if (!confirm(`Reset learning progress for ${state.raga.name}?`)) return;
        try { localStorage.removeItem(progressKey()); } catch { /* storage unavailable */ }
        if (state.sessionProgress) delete state.sessionProgress[state.raga.name];
        renderLearnPath();
      },
    }, "Reset") : "");
}

// Taal grid ------------------------------------------------------------------
function renderGrid(container, tokens, npb, { selectable = false, bad = new Set(), idPrefix = "" } = {}) {
  container.innerHTML = "";
  const taal = state.taal || { beats: 4, vibhags: [4], markers: [""] };
  const beats = [];
  for (let i = 0; i < tokens.length; i += npb) beats.push(tokens.slice(i, i + npb).map((t, k) => [t, i + k]));
  if (!beats.length) {
    container.append(selectable
      ? el("div", { class: "empty-state" },
        el("strong", {}, "Start with a line"),
        el("ul", {},
          el("li", {}, "Choose Use in editor on a generated option."),
          el("li", {}, "Play swaras on the keyboard or the swara strip."),
          el("li", {}, "Type notation in the box under this grid.")))
      : el("div", { class: "muted small" }, "Empty line."));
    return;
  }
  const markerName = (m) => (m === "X" ? "Sam" : m === "0" ? "Khali" : m ? `Tali ${m}` : "");
  for (let c = 0; c < beats.length; c += taal.beats) {
    const cycle = el("div", { class: "cycle" });
    let b = c;
    taal.vibhags.forEach((size, v) => {
      if (b >= beats.length) return;
      const marker = taal.markers[v] ?? "";
      const vib = el("div", { class: "vibhag" + (marker === "X" ? " sam" : "") },
        el("span", { class: "marker", title: markerName(marker) }, marker, el("span", { class: "sr-only" }, ` ${markerName(marker)}`)));
      for (let k = 0; k < size && b < beats.length; k++, b++) {
        const cell = el("div", { class: "beat" + (npb > 1 ? " multi" : "") });
        for (const [tok, idx] of beats[b]) {
          const cls = ["tok", tok.hold ? "hold" : "", tok.rest ? "rest" : "", bad.has(idx) ? "bad" : "",
            selectable && idx === state.selected ? "sel" : ""].join(" ");
          const span = el("span", { class: cls, "data-idx": idx, id: idPrefix ? `${idPrefix}-${idx}` : undefined }, noteNode(tok.text));
          if (selectable) span.addEventListener("click", () => selectToken(idx));
          cell.append(span);
        }
        vib.append(cell);
      }
      cycle.append(vib);
    });
    container.append(cycle);
  }
}

// Notation bar and piano ---------------------------------------------------------
function renderNotationBar() {
  const box = $("#notation-keys");
  box.innerHTML = "";
  const semis = new Set(state.raga?.semitones || []);
  SWARAS.forEach((s, i) => {
    const cls = "nkey" + (state.raga ? (semis.has(i) ? " in-raga" : " varjit") : "");
    box.append(el("button", { class: cls, title: SWARA_LABELS[i], "data-semi": i, onclick: (e) => pianoPress(i, { replace: e.shiftKey }) },
      el("b", {}, noteText(s)), el("small", {}, SWARA_LABELS[i])));
  });
}

function renderPiano() {
  const box = $("#piano");
  box.innerHTML = "";
  const sa = engine.saMidi();
  const semis = new Set(state.raga?.semitones || []);
  const isBlack = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
  let low = PIANO_LOW;
  let high = PIANO_HIGH;
  while (isBlack(sa + low)) low--;
  while (isBlack(sa + high)) high++;
  const whites = [];
  for (let p = low; p <= high; p++) if (!isBlack(sa + p)) whites.push(p);
  const width = 100 / whites.length;
  let whiteIndex = -1;
  for (let p = low; p <= high; p++) {
    const midi = sa + p;
    const semi = ((p % 12) + 12) % 12;
    const cls = [semis.size ? (semis.has(semi) ? "in-raga" : "varjit") : "", semi === 0 ? "sa" : ""].join(" ");
    const label = [el("span", { class: "sw" }, noteNode(swaraText(p))), el("span", { class: "wn" }, WESTERN[midi % 12] + (Math.floor(midi / 12) - 1))];
    let key;
    if (isBlack(midi)) {
      key = el("div", { class: "bkey " + cls, "data-pitch": p, style: `left:${(whiteIndex + 1) * width - width * 0.3}%;width:${width * 0.6}%` }, ...label);
    } else {
      whiteIndex++;
      key = el("div", { class: "wkey " + cls, "data-pitch": p }, ...label);
    }
    key.addEventListener("pointerdown", (e) => holdKey(e, key, p));
    const code = KEY_MAP.map(([c]) => c).find((c) => KEY_OFFSETS[c] + state.keyOctave === p);
    if (code) key.append(el("kbd", { class: "kb" }, KEY_LABELS[code]));
    box.append(key);
  }
}

function swaraKey(pitch) {
  return document.querySelector(`#notation-keys [data-semi="${((pitch % 12) + 12) % 12}"]`);
}

function flashKey(pitch, ms = 250) {
  const keys = [document.querySelector(`#piano [data-pitch="${pitch}"]`), swaraKey(pitch)];
  keys[1]?.classList.add("playing");
  setTimeout(() => keys[1]?.classList.remove("playing"), ms);
  const key = keys[0];
  if (!key) return;
  key.classList.add("active");
  setTimeout(() => key.classList.remove("active"), ms);
}

// The note sounds for as long as the key is held, which matters for sustaining
// instruments such as the harmonium.
function holdKey(event, key, pitch) {
  event.preventDefault();
  const release = startHold(pitch, event.shiftKey);
  const done = new AbortController();
  const up = () => {
    release();
    done.abort();
  };
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
    key.addEventListener(type, up, { signal: done.signal });
  }
}

// Sounds a note until the returned function is called, lights its key, and adds it to the line.
function startHold(pitch, replace) {
  const stop = engine.startNote(pitch);
  const key = () => document.querySelector(`#piano [data-pitch="${pitch}"]`);
  key()?.classList.add("active");
  swaraKey(pitch)?.classList.add("playing");
  addToLine(pitch, replace);
  return () => {
    stop();
    key()?.classList.remove("active");
    swaraKey(pitch)?.classList.remove("playing");
  };
}

function setKeyOctave(offset) {
  state.keyOctave = offset;
  const names = { "-12": "mandra", 0: "madhya", 12: "taar" };
  $("#key-octave").textContent = names[offset];
  renderPiano();
  renderKeyMap();
}

// A picture of the computer keyboard with the swara each key plays.
function renderKeyMap() {
  const box = $("#key-map");
  if (!box) return;
  const semis = new Set(state.raga?.semitones || []);
  box.replaceChildren(...KEY_ROWS.map((row, r) => el("div", { class: `km-row km-row-${r}` }, ...row.map((code) => {
    const pitch = code in KEY_OFFSETS ? KEY_OFFSETS[code] + state.keyOctave : null;
    const inRange = pitch !== null && pitch >= PIANO_LOW && pitch <= PIANO_HIGH;
    const octaveKey = { KeyZ: "Octave down", Period: "Octave up" }[code];
    const semi = ((pitch % 12) + 12) % 12;
    const cls = ["km-key", pitch === null ? (octaveKey ? "km-octave" : "km-unused") : "",
      inRange && semis.size && !semis.has(semi) ? "varjit" : "", inRange && semi === 0 ? "sa" : ""].join(" ");
    return el("div", { class: cls, title: octaveKey || "" },
      el("kbd", {}, KEY_LABELS[code] || ROW_KEY_TEXT[code]),
      el("span", {}, octaveKey ? (code === "KeyZ" ? "8va ↓" : "8va ↑") : inRange ? noteNode(swaraText(pitch)) : ""));
  }))));
}

function releaseAllKeys() {
  heldKeys.forEach((release) => release());
  heldKeys.clear();
}

function bindComputerKeyboard() {
  // Text boxes keep their keys for typing. Dropdowns, buttons, and sliders don't,
  // so picking an instrument or a taal doesn't stop the keyboard from playing.
  const typing = (e) => e.target.matches?.("input:not([type=checkbox]):not([type=range]):not([type=radio]), textarea, [contenteditable]");
  const ignore = (e) =>
    !$("#keyboard-play").checked ||
    e.ctrlKey || e.metaKey || e.altKey ||
    typing(e) ||
    document.querySelector("dialog[open]");
  document.addEventListener("keydown", (e) => {
    // Escape leaves a text box so the keys play again.
    if (e.key === "Escape" && typing(e) && !document.querySelector("dialog[open]")) {
      e.target.blur();
      return;
    }
    if (ignore(e)) return;
    const code = keyCode(e);
    if (code in OCTAVE_KEYS) {
      e.preventDefault();
      if (e.repeat) return;
      const i = KEY_OCTAVES.indexOf(state.keyOctave) + OCTAVE_KEYS[code];
      if (i >= 0 && i < KEY_OCTAVES.length) setKeyOctave(KEY_OCTAVES[i]);
      return;
    }
    if (!(code in KEY_OFFSETS)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Held notes are tracked by physical key, so keyup releases the right note.
    if (e.repeat || heldKeys.has(e.code)) return;
    const pitch = KEY_OFFSETS[code] + state.keyOctave;
    if (pitch < PIANO_LOW || pitch > PIANO_HIGH) return;
    engine.ensure();
    heldKeys.set(e.code, startHold(pitch, e.shiftKey));
  });
  document.addEventListener("keyup", (e) => {
    const release = heldKeys.get(e.code);
    if (!release) return;
    heldKeys.delete(e.code);
    release();
  });
  window.addEventListener("blur", releaseAllKeys);
  document.addEventListener("visibilitychange", releaseAllKeys);
}

function pianoPress(pitch, { replace = false } = {}) {
  engine.playNote(pitch, 0, 0.7);
  flashKey(pitch);
  addToLine(pitch, replace);
}

// Inserts after the selected note (or appends), and the selection advances so
// consecutive presses build a phrase. With replace, overwrites the selection.
function addToLine(pitch, replace) {
  if (!$("#piano-input").checked) return;
  // Piano keys don't take focus, so release the text box to let it show the new note.
  if (document.activeElement === $("#editor-text")) $("#editor-text").blur();
  const tok = { text: swaraText(pitch), pitch };
  const sel = state.selected;
  remember();
  if (replace && sel >= 0) {
    state.line[sel] = tok;
  } else {
    const at = sel >= 0 ? sel + 1 : state.line.length;
    state.line.splice(at, 0, tok);
    state.selected = at;
  }
  lineChanged();
}

// Raga --------------------------------------------------------------------------
async function loadRagas() {
  state.ragas = await api("/api/ragas");
  const list = $("#raga-list");
  list.innerHTML = "";
  for (const r of state.ragas) {
    list.append(el("option", { value: r.name }, `${r.thaat} thaat${r.custom ? " (custom)" : ""}`));
    for (const a of r.aliases) list.append(el("option", { value: a }, r.name));
  }
  renderRagaBrowser();
}

const TIME_FILTERS = ["Morning", "Afternoon", "Evening", "Night"];

// Groups the traditional singing times into four broad parts of the day.
function timeBucket(time = "") {
  if (/dawn|morning/i.test(time)) return "Morning";
  if (/midday|afternoon|of the day/i.test(time)) return "Afternoon";
  if (/sunset|evening|first quarter of the night/i.test(time)) return "Evening";
  if (/night/i.test(time)) return "Night";
  return null;
}

function renderRagaFilters() {
  const box = $("#raga-filter-chips");
  const f = state.ragaFilters;
  const chip = (label, pressed, onclick) => el("button", {
    type: "button", class: "chip", "aria-pressed": String(pressed),
    onclick: () => { onclick(); [...box.children].find((b) => b.textContent === label)?.focus(); },
  }, label);
  box.replaceChildren(
    chip("Has compositions", f.comps, () => { f.comps = !f.comps; renderRagaBrowser(); }),
    ...TIME_FILTERS.map((label) => chip(label, f.time === label, () => { f.time = f.time === label ? null : label; renderRagaBrowser(); })));
}

function renderRagaBrowser() {
  state.ragaFilters ??= { comps: false, time: null };
  renderRagaFilters();
  const filter = $("#raga-filter").value.trim().toLowerCase();
  const matches = (r) => (!filter || [r.name, r.thaat, r.time, ...r.aliases].some((v) => v?.toLowerCase().includes(filter)))
    && (!state.ragaFilters.comps || r.compositions > 0)
    && (!state.ragaFilters.time || timeBucket(r.time) === state.ragaFilters.time);
  const groups = new Map();
  for (const r of state.ragas.filter(matches)) {
    const key = r.custom ? "Your ragas" : r.thaat ? `${r.thaat} thaat` : "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const order = [...groups.keys()].sort((a, b) =>
    (a === "Your ragas" ? -1 : b === "Your ragas" ? 1 : 0) || (a === "Other") - (b === "Other") || a.localeCompare(b));
  const box = $("#raga-groups");
  box.innerHTML = "";
  for (const key of order) {
    const items = groups.get(key).sort((a, b) => a.name.localeCompare(b.name));
    box.append(el("div", { class: "raga-group" },
      el("h4", {}, `${key} (${items.length})`),
      el("div", { class: "chips" }, ...items.map((r) => el("button", {
        type: "button",
        class: "chip raga-chip" + (state.raga?.name === r.name ? " current" : ""),
        title: [r.time, r.aliases.length && `Also known as ${r.aliases.join(", ")}`,
          `${r.compositions || "No"} composition${r.compositions === 1 ? "" : "s"} with notation`].filter(Boolean).join(". "),
        onclick: async () => {
          $("#raga-dialog").close();
          if (await setRaga(r.name) && !$("#welcome").hidden) showTab("overview");
        },
      }, r.name, r.compositions ? el("span", { class: "count", title: `${r.compositions} with notation` }, r.compositions) : "")))));
  }
  if (!box.children.length) box.append(el("p", { class: "muted" }, "No ragas match. Try a name, a thaat, or a time of day, or clear the filters."));
  $("#raga-dialog-title").textContent = `All ${state.ragas.length} ragas`;
}

function openRagaDialog() {
  $("#raga-filter").value = "";
  renderRagaBrowser();
  $("#raga-dialog").showModal();
  $("#raga-filter").focus();
}

async function setRaga(name) {
  try {
    const raga = await api(`/api/ragas/${encodeURIComponent(name)}`);
    raga.semitones = [...new Set(tokenize([raga.aaroh, raga.avroh, ...raga.pakad, ...raga.patterns].join(" "))
      .filter((t) => t.pitch !== undefined).map((t) => ((t.pitch % 12) + 12) % 12))];
    state.raga = raga;
    state.heard = new Set();
    localStorage.setItem("raga", raga.name);
    $("#raga-input").value = raga.name;
    if (state.ragas.length) renderRagaBrowser();
    renderRagaInfo();
    renderLearnPath();
    renderBuilderNotes();
    renderNotationBar();
    renderPiano();
    renderKeyMap();
    validateLine();
    loadSavedLines();
    return true;
  } catch (err) {
    toast(err.message);
    showTab("overview");
    $("#raga-info").innerHTML = "";
    $("#raga-info").append(el("div", { class: "panel" }, el("p", { class: "error" }, err.message),
      el("button", { type: "button", onclick: openRagaDialog }, "Browse all ragas")));
    return false;
  }
}

// Practice playback ------------------------------------------------------------
// Plays a phrase once, slower, or in a loop until you stop it.
function withTempo(factor, fn) {
  const tempo = engine.tempo;
  engine.tempo = tempo * factor;
  try {
    return fn();
  } finally {
    engine.tempo = tempo;
  }
}

function practicePlay(tokens, npb, idPrefix, { cellFor, slow = false, loopButton = null, onDone = null, startAt = null } = {}) {
  stopPlayback();
  const loop = loopButton ? { button: loopButton } : null;
  if (loop) {
    state.loop = loop;
    loopButton.setAttribute("aria-pressed", "true");
    loopButton.textContent = "■ Stop loop";
  }
  const run = (keepLoop) => {
    const go = () => playTokens(tokens, npb, idPrefix, {
      cellFor,
      keepLoop,
      startAt: typeof startAt === "function" ? startAt() : startAt,
      onEnd: () => {
        onDone?.();
        if (loop && state.loop === loop) setTimeout(() => { if (state.loop === loop) run(true); }, 500);
        else stopPlayback();
      },
    });
    slow ? withTempo(0.7, go) : go();
  };
  run(Boolean(loop));
}

function loopToggle(start) {
  const button = el("button", { type: "button", class: "loop small", "aria-pressed": "false" }, "Loop");
  button.addEventListener("click", () => (state.loop?.button === button ? stopPlayback() : start(button)));
  return button;
}

let phraseSeq = 0;
// A phrase you can hear, slow down, loop, and open in Compose. The note that is
// sounding lights up in the phrase, on the swara strip, and on the keyboard.
function phraseCard(text, { name, onDone = null } = {}) {
  const tokens = tokenize(text);
  const id = `ph${++phraseSeq}`;
  const notes = el("span", { class: "phrase-notes", role: "img", "aria-label": `${name}: ${text}` },
    ...tokens.map((t, i) => el("span", { id: `${id}-${i}`, "aria-hidden": "true" }, noteNode(t.text))));
  const play = (opts = {}) => practicePlay(tokens, 1, id, { onDone, ...opts });
  return el("div", { class: "phrase-card" }, notes,
    el("div", { class: "phrase-actions" },
      el("button", { type: "button", class: "small", "aria-label": `Play ${name}`, onclick: () => play() }, "▶ Play"),
      el("button", { type: "button", class: "small", "aria-label": `Play ${name} slower`, title: "Play at 70% of the tempo", onclick: () => play({ slow: true }) }, "Slower"),
      loopToggle((button) => play({ loopButton: button })),
      el("button", { type: "button", class: "small", title: "Open this phrase in the Compose editor", onclick: () => loadLine(tokens, 1) }, "Open in Compose")));
}

function renderRagaHeading() {
  const r = state.raga;
  $("#raga-name").textContent = r ? `Raga ${r.name}` : "Choose a raga";
  document.title = r ? `${r.name} · Swaramala` : "Swaramala · compose Hindustani classical phrases";
  const facts = $("#raga-facts");
  facts.innerHTML = "";
  if (!r) return;
  const fact = (key, label, value) => value && facts.append(el("span", { class: "fact" }, key ? term(key, label) : el("b", {}, label), value));
  fact("thaat", "Thaat", r.thaat);
  fact("time", "Time", r.time);
  fact("vadi", "Vadi", r.vadi && noteText(r.vadi));
  fact("samvadi", "Samvadi", r.samvadi && noteText(r.samvadi));
  fact("jati", "Jati", r.jati);
  fact("varjit", "Varjit", r.varjit.length ? r.varjit.join(", ") : "None");
  if (r.aliases?.length) fact(null, "Also", r.aliases.join(", "));
}

function nextStep(tab, title, text) {
  return el("button", { class: "next-step", type: "button", onclick: () => showTab(tab) },
    el("strong", {}, `${title} →`), el("span", {}, text));
}

function heardBoth(part) {
  state.heard.add(part);
  if (state.heard.has("aaroh") && state.heard.has("avroh")) markLearned("aarohAvroh");
}

function renderRagaInfo() {
  const r = state.raga;
  renderRagaHeading();
  const box = $("#raga-info");
  box.className = "raga-info overview";
  box.innerHTML = "";
  const comps = (r.compositions || []).filter((c) => c.sections.length);
  const taranas = comps.filter((c) => /tarana/i.test(`${c.type} ${c.title}`)).length;
  const both = tokenize(`${r.aaroh} - ${r.avroh}`);
  box.append(
    el("div", { class: "panel" },
      el("h3", {}, `Learn the shape of ${r.name}`),
      r.description ? el("p", { class: "muted small" }, r.description) : "",
      el("p", { class: "hint" }, "Start with the ascent and descent, then learn the pakad and the common patterns. Use Slower or Loop when you want to sing along."),
      el("div", { class: "row between" },
        el("div", { class: "label" }, term("aaroh", "Aaroh"), " and ", term("avroh", "avroh")),
        el("button", { type: "button", class: "small", onclick: () => practicePlay(both, 1, null, { onDone: () => markLearned("aarohAvroh") }) }, "▶ Play both")),
      phraseCard(r.aaroh, { name: "aaroh", onDone: () => heardBoth("aaroh") }),
      phraseCard(r.avroh, { name: "avroh", onDone: () => heardBoth("avroh") }),
      el("div", { class: "label" }, term("pakad", "Pakad"), " (the phrases that identify the raga)"),
      ...r.pakad.map((p, i) => phraseCard(p, { name: `pakad ${i + 1}`, onDone: () => markLearned("pakad") })),
      el("div", { class: "label" }, "Common patterns"),
      ...r.patterns.map((p, i) => phraseCard(p, { name: `pattern ${i + 1}` })),
      r.patterns.length < 5 ? el("p", { class: "hint" }, "You can generate more patterns in Compose.") : ""),
    el("div", { class: "next-steps" },
      el("h3", {}, "What you can do next"),
      nextStep("compositions", "Learn a composition",
        comps.length
          ? `${comps.length} composition${comps.length === 1 ? "" : "s"} with notation and words${taranas ? `, including ${taranas} tarana${taranas === 1 ? "" : "s"}` : ""}. Play a line at a time, or perform one with alaap and taan on the tabla.`
          : `No compositions with notation are recorded for ${r.name} yet.`),
      nextStep("improv", "Practice alaap and taan",
        "Listen to short and full-cycle alaaps and 8- and 16-beat taans for the sthayi and antara, then sing them back."),
      nextStep("compose", "Compose your own line",
        "Pick a direction, a start note, and an end note. Swaramala generates options that follow the raga."),
      nextStep("library", "Open your library", "Your saved lines and recordings.")),
  );
  renderCompositions();
  state.improvSeed = null;
  loadImprovisations();
}

// Alaap and taan -------------------------------------------------------------------
const PHRASE_LABELS = { short: "Short", avartan: "Full avartan", long: "Long" };

async function loadImprovisations(seed = state.improvSeed) {
  const box = $("#improv");
  if (!state.raga) return;
  const taal = state.taal?.name || "Teentaal";
  const params = new URLSearchParams({ taal });
  if (seed !== null && seed !== undefined) params.set("seed", seed);
  const raga = state.raga.name;
  $("#improv-title").textContent = `Practice alaap and taan in ${raga}`;
  $("#improv-taal").textContent = `${taal}, ${state.taal?.beats ?? 16} beats`;
  try {
    const data = await api(`/api/ragas/${encodeURIComponent(raga)}/improvisations?${params}`);
    if (state.raga?.name !== raga) return;
    state.improv = data;
    state.improvSeed = data.seed;
    renderImprovisations();
  } catch (err) {
    box.innerHTML = "";
    box.append(el("p", { class: "error" }, err.message),
      el("button", { type: "button", onclick: () => loadImprovisations(Math.floor(Math.random() * 2 ** 31)) }, "Try another set"));
  }
}

function renderImprovisations() {
  const box = $("#improv");
  box.innerHTML = "";
  const data = state.improv;
  if (!data.groups.some((g) => g.items.length)) {
    box.append(el("p", { class: "muted" }, "No practice phrases are available for this raga and taal. Choose another taal in the sound bar."));
    return;
  }
  data.groups.forEach((group, g) => {
    const step = g === IMPROV_GROUPS.sthayiAlaap || g === IMPROV_GROUPS.antaraAlaap ? "alaap" : "taan";
    const col = el("div", { class: "improv-group" },
      el("h3", {}, group.title),
      el("p", { class: "hint" }, group.description));
    const cards = [];
    group.items.forEach((item, i) => {
      const id = `ip-${g}-${i}`;
      const tokens = tokensFromStrings(item.tokens);
      const npb = item.notes_per_beat;
      const beats = el("div", { class: "improv-beats mono" });
      for (let b = 0; b < item.beats; b++) {
        const text = item.tokens.slice(b * npb, (b + 1) * npb).join(" ");
        beats.append(el("span", { id: `${id}-${b}`, class: b % (data.taal_beats) === 0 ? "sam" : "" }, ...notationNodes(text)));
      }
      const label = `${PHRASE_LABELS[item.kind]} · ${item.beats} beats`;
      const name = `${group.title} ${i + 1}`;
      const cellFor = (k) => Math.floor(k / npb);
      // Only alaap cards lead on to the next phrase.
      const next = step === "alaap" ? el("button", { type: "button", class: "small", hidden: "" }, "Next phrase →") : null;
      const card = el("div", { class: "improv-item" });
      const listen = (opts = {}) => {
        document.querySelectorAll(".improv-item.is-current").forEach((n) => n.classList.remove("is-current"));
        card.classList.add("is-current");
        practicePlay(tokens, npb, id, {
          cellFor,
          ...opts,
          onDone: () => {
            markLearned(step);
            if (next && cards[i + 1]) next.hidden = false;
          },
        });
      };
      card.listen = listen;
      next?.addEventListener("click", () => {
        next.hidden = true;
        cards[i + 1].scrollIntoView({ behavior: "smooth", block: "nearest" });
        cards[i + 1].querySelector("button")?.focus();
        cards[i + 1].listen();
      });
      card.append(
        el("div", { class: "row improv-head" },
          el("span", { class: "muted small" }, `${i + 1}. ${label}`),
          el("button", { type: "button", class: "small", "aria-label": `Listen to ${name}`, onclick: () => listen() }, "▶ Listen"),
          el("button", { type: "button", class: "small", "aria-label": `Listen to ${name} slower`, onclick: () => listen({ slow: true }) }, "Slower"),
          loopToggle((button) => listen({ loopButton: button })),
          el("button", { type: "button", class: "small", title: "Open in the Compose editor", onclick: () => loadLine(tokens, npb) }, "Open in Compose"),
          el("button", { type: "button", class: "small", title: "Save this phrase to your library", onclick: () => saveLine(tokens, npb, `${group.title}, ${label.toLowerCase()}`) }, "Save"),
          next || ""),
        beats);
      cards.push(card);
      col.append(card);
    });
    box.append(col);
  });
}

// Compositions ----------------------------------------------------------------------
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// Flattens beat-based lines into an even grid of slots so the sequence player can
// play them: every beat gets `npb` slots, and notes inside a beat are spread evenly.
function expandBeats(lines) {
  const counts = lines.flatMap((l) => l.beats.map((b) => tokenize(b).length)).filter(Boolean);
  let npb = counts.reduce((a, c) => (a * c) / gcd(a, c), 1);
  if (npb > 12) npb = Math.max(...counts);
  const tokens = [];
  for (const line of lines) {
    for (const beat of line.beats) {
      const notes = tokenize(beat);
      const slots = Array.from({ length: npb }, () => null);
      notes.forEach((t, j) => { slots[Math.floor((j * npb) / notes.length)] = t; });
      slots.forEach((t, j) => tokens.push(t || parseToken(j === 0 && !notes.length ? "-" : notes.length ? "_" : "-")));
    }
  }
  return { tokens, npb };
}

function compositionLines(comp, sectionIndex = null) {
  return comp.sections.flatMap((s, i) => (sectionIndex === null || i === sectionIndex ? s.lines : []));
}

function togglePlay(button, tokens, npb, idPrefix, cellFor) {
  if (button.dataset.stop) return stopPlayback();
  playTokens(tokens, npb, idPrefix, { cellFor, onEnd: stopPlayback });
  button.dataset.stop = button.textContent;
  button.textContent = "■";
}

// Matches the composition's taal to one with a tabla theka, falling back to a taal
// with the same number of beats (Punjabi and Sitarkhani play with Teentaal).
function compositionTaal(comp) {
  const beats = comp.sections[0]?.lines[0]?.beats.length;
  return state.taals.find((t) => t.name.toLowerCase() === comp.taal.toLowerCase())
    || state.taals.find((t) => t.beats === beats);
}

// Switches the tabla to a taal, restarting it if it was playing so that its beat
// count stays in step with the new theka.
function switchTaal(taal) {
  engine.ensure();
  if (state.taal?.name === taal.name) return;
  const wasRunning = engine.tabla.running;
  engine.tabla.stop();
  setTaal(taal.name);
  if (wasRunning) engine.tabla.start();
}

function setTablaRunning(on) {
  engine.ensure();
  if (on && !engine.tabla.theka.length) setTaal(state.taal?.name || $("#taal").value);
  if (on && !engine.tabla.running) engine.tabla.start();
  if (!on && engine.tabla.running) engine.tabla.stop();
  $("#tabla-toggle").setAttribute("aria-pressed", String(on));
}

// Time of the next sam, or of a given matra after it, when the tabla is playing.
function tablaStartAt(matraIndex = 0) {
  if (!engine.tabla?.running) return null;
  return engine.tabla.nextSamTime() + matraIndex * (60 / engine.tempo);
}

function sectionOffset(comp, sectionIndex) {
  return comp.sections.slice(0, sectionIndex ?? 0).reduce((n, s) => n + s.lines.length * s.lines[0].beats.length, 0);
}

// The learning-path steps a section completes: the first section is the sthayi.
function sectionSteps(comp, sectionIndex) {
  const step = (si) => (/antara/i.test(comp.sections[si].name) ? "antara" : si === 0 ? "sthayi" : null);
  if (sectionIndex !== null) return [step(sectionIndex)].filter(Boolean);
  return comp.sections.map((_, si) => step(si)).filter(Boolean);
}

// Plays the whole composition, one section, or one line of a section, in time
// with the tabla when it is playing.
function playComposition(comp, index, sectionIndex, button, { lineIndex = null, loopButton = null } = {}) {
  if (button?.dataset.stop) return stopPlayback();
  const taal = compositionTaal(comp);
  if (taal) switchTaal(taal);
  let lines = compositionLines(comp, sectionIndex);
  let offset = sectionOffset(comp, sectionIndex);
  if (lineIndex !== null) {
    offset += lineIndex * lines[0].beats.length;
    lines = [lines[lineIndex]];
  }
  const { tokens, npb } = expandBeats(lines);
  const phase = taal ? ((comp.first_matra || 1) - 1) % taal.beats : 0;
  practicePlay(tokens, npb, `cb-${index}`, {
    cellFor: (i) => offset + Math.floor(i / npb),
    startAt: () => tablaStartAt(phase),
    loopButton,
    onDone: () => {
      if (lineIndex === null) sectionSteps(comp, sectionIndex).forEach(markLearned);
    },
  });
  if (button && !loopButton) {
    button.dataset.stop = button.textContent;
    button.textContent = "■ Stop";
  }
}

function openCompositionInEditor(comp, sectionIndex) {
  const { tokens, npb } = expandBeats(compositionLines(comp, sectionIndex));
  while (tokens.length && tokens[0].rest) tokens.shift();
  const known = state.taals.find((t) => t.name.toLowerCase() === comp.taal.toLowerCase());
  if (known) setTaal(known.name);
  loadLine(tokens, npb);
}

// Performance ------------------------------------------------------------------------
// Builds a full rendition on the taal: the sthayi, each sthayi alaap followed by the
// sthayi from its mukhda, the antara, each antara alaap followed by the antara from
// its mukhda, then the taans, ending on sam.
//
// The mukhda is the first sung beat of a section, which is often not the first
// beat of the line. Every return to the composition starts at the mukhda's own
// matra, and every alaap and taan ends exactly where the mukhda begins.
//
// Taans follow the composition: before each taan you sing the composition from
// the mukhda through sam, then the 8- or 16-beat taan starts at the matra that
// lets it end on the mukhda, so the taan leads straight back into the words.
const IMPROV_GROUPS = { sthayiAlaap: 0, antaraAlaap: 1, sthayiTaan: 2, antaraTaan: 3 };

const isSung = (beat) => beat.tokens.some((t) => t.pitch !== undefined);

// Beats of the composition to sing before a taan of `taanBeats`: it starts on the
// mukhda (at `mukhdaAt` in the taal), passes sam, and stops where the taan must
// start so that the taan ends on the next mukhda.
function taanLeadBeats(T, mukhdaAt, taanBeats) {
  const toSam = (T - mukhdaAt) % T || 1;
  let lead = (((-taanBeats) % T) + T) % T;
  while (lead < toSam) lead += T;
  return lead;
}

function buildPerformance(comp, index, improv, taalBeats, { returnLength = "half", alaap = true, taan = true } = {}) {
  const T = taalBeats;
  const phase = ((comp.first_matra || 1) - 1) % T;
  const antaraIndex = comp.sections.findIndex((sec, i) => i > 0 && /antara/i.test(sec.name));
  const compBeats = (si, lines, limit = Infinity) => {
    const offset = sectionOffset(comp, si);
    return lines.flatMap((line, l) => line.beats.slice(0, limit).map((beat, b) => ({
      tokens: tokenize(beat), id: `cb-${index}-${offset + l * line.beats.length + b}`,
    })));
  };
  const sthayiEnd = antaraIndex > 0 ? antaraIndex : 1;
  const sthayiFull = comp.sections.slice(0, sthayiEnd).flatMap((sec, si) => compBeats(si, sec.lines));
  const antaraFull = antaraIndex > 0 ? compBeats(antaraIndex, comp.sections[antaraIndex].lines) : null;
  // A section seen from its mukhda: `from(n)` gives n beats starting at the mukhda,
  // wrapping to the start of the section if it runs out.
  const mukhdaOf = (full, name) => {
    const m = Math.max(0, full.findIndex(isSung));
    return {
      name,
      at: (phase + m) % T,
      from: (n) => Array.from({ length: n }, (_, k) => full[(m + k) % full.length]),
    };
  };
  const sthayi = mukhdaOf(sthayiFull, "Sthayi");
  const antara = antaraFull ? mukhdaOf(antaraFull, "Antara") : sthayi;
  const improvBeats = (g, i) => {
    const item = improv.groups[g].items[i];
    const npb = item.notes_per_beat;
    return Array.from({ length: item.beats }, (_, b) => ({
      tokens: tokensFromStrings(item.tokens.slice(b * npb, (b + 1) * npb)), id: `ip-${g}-${i}-${b}`,
    }));
  };

  const timeline = [];
  const labels = [];
  const lead = phase;
  const pos = () => (timeline.length + lead) % T;
  const restUntil = (at) => { for (let n = ((at - pos()) % T + T) % T; n > 0; n--) timeline.push({ tokens: [], id: null }); };
  const put = (beats, label) => {
    labels.push({ at: timeline.length, label });
    timeline.push(...beats);
  };
  const returnBeats = returnLength === "half" ? Math.ceil(T / 2) : T;
  const lineName = returnLength === "half" ? "half-line from the mukhda" : "line from the mukhda";
  // Alaap: the phrase ends where the mukhda starts, so any gap comes before it.
  const alaapRounds = (g, section) => improv.groups[g].items.forEach((item, i) => {
    restUntil(section.at - item.beats);
    put(improvBeats(g, i), `${improv.groups[g].title} ${i + 1} of ${improv.groups[g].items.length}`);
    put(section.from(returnBeats), `${section.name} ${lineName}`);
  });
  // Taan: sing from the mukhda through sam, run the taan, and land on the mukhda.
  const taanRounds = (g, section) => {
    restUntil(section.at);
    improv.groups[g].items.forEach((item, i) => {
      put(section.from(taanLeadBeats(T, section.at, item.beats)), `${section.name} from the mukhda`);
      put(improvBeats(g, i), `${improv.groups[g].title} ${i + 1} of ${improv.groups[g].items.length} (${item.beats} beats)`);
    });
  };
  // Sing from the mukhda up to and including the next sam.
  const toSam = (section, label) => {
    restUntil(section.at);
    put(section.from(((T - section.at) % T || T) + 1), label);
  };

  restUntil(phase);
  put(sthayiFull, "Sthayi");
  if (alaap) alaapRounds(IMPROV_GROUPS.sthayiAlaap, sthayi);
  if (antaraFull) {
    restUntil(phase);
    put(antaraFull, "Antara");
    restUntil(sthayi.at);
    put(sthayi.from(returnBeats), `Sthayi ${lineName}`);
  }
  if (alaap) alaapRounds(IMPROV_GROUPS.antaraAlaap, antara);
  if (taan) {
    taanRounds(IMPROV_GROUPS.sthayiTaan, sthayi);
    if (antaraFull) toSam(sthayi, "Sthayi mukhda to sam");
    taanRounds(IMPROV_GROUPS.antaraTaan, antara);
    if (antaraFull) toSam(antara, "Antara mukhda to sam");
  }
  toSam(sthayi, "Sthayi mukhda, closing on sam");

  const counts = timeline.map((b) => b.tokens.length).filter(Boolean);
  let npb = counts.reduce((a, c) => (a * c) / gcd(a, c), 1);
  if (npb > 12) npb = Math.max(...counts);
  const tokens = [];
  const ids = [];
  for (const beat of timeline) {
    const slots = Array.from({ length: npb }, () => null);
    beat.tokens.forEach((t, j) => { slots[Math.floor((j * npb) / beat.tokens.length)] = t; });
    let last = null;
    for (const t of slots) {
      if (t) last = t;
      tokens.push(t || parseToken(last && !last.rest ? "_" : "-"));
      ids.push(beat.id);
    }
  }
  return { tokens, npb, ids, labels: labels.map((l) => ({ ...l, at: l.at * npb })), lead };
}

function performOptions() {
  return {
    returnLength: $("#perform-return").value,
    alaap: $("#perform-alaap").checked,
    taan: $("#perform-taan").checked,
  };
}

// Fetches the alaap and taan for a composition and lays out the performance.
async function performancePlan(comp, index) {
  const taal = compositionTaal(comp);
  if (!taal) throw new Error(`The ${comp.taal} taal has no tabla theka, so it can't be performed with alaap and taan.`);
  const raga = state.raga.name;
  const params = new URLSearchParams({ taal: taal.name, composition: comp.title });
  if (state.improvSeed !== null && state.improvSeed !== undefined) params.set("seed", state.improvSeed);
  const improv = await api(`/api/ragas/${encodeURIComponent(raga)}/improvisations?${params}`);
  if (state.raga?.name !== raga) return null;
  return { taal, plan: buildPerformance(comp, index, improv, taal.beats, performOptions()) };
}

// Shows the steps of a performance as a numbered list, so you can see where you are.
function renderPlanSteps(index, plan) {
  const list = document.getElementById(`plan-steps-${index}`);
  if (!list) return;
  const beats = (k) => Math.round(((plan.labels[k + 1]?.at ?? plan.tokens.length) - plan.labels[k].at) / plan.npb);
  list.replaceChildren(...plan.labels.map((l, k) => el("li", { "data-k": k }, `${l.label} · ${beats(k)} beats`)));
}

async function previewPlan(comp, index) {
  const list = document.getElementById(`plan-steps-${index}`);
  list.replaceChildren(el("li", { class: "muted" }, "Preparing the plan."));
  try {
    const result = await performancePlan(comp, index);
    if (result) renderPlanSteps(index, result.plan);
  } catch (err) {
    list.replaceChildren(el("li", { class: "error" }, err.message));
  }
}

async function performComposition(comp, index, button) {
  if (button.dataset.stop) return stopPlayback();
  let result;
  try {
    result = await performancePlan(comp, index);
  } catch (err) {
    return toast(err.message);
  }
  if (!result) return;
  const { taal, plan } = result;
  stopPlayback();
  switchTaal(taal);
  renderPlanSteps(index, plan);
  const details = document.getElementById(`plan-${index}`);
  if (details) details.open = true;
  const startedTabla = !engine.tabla.running;
  let startAt;
  if (startedTabla) {
    setTablaRunning(true);
    startAt = engine.tabla.startTime + plan.lead * (60 / engine.tempo);
  } else {
    startAt = tablaStartAt(plan.lead);
  }
  const status = document.getElementById(`perform-status-${index}`);
  let current = -1;
  playTokens(plan.tokens, plan.npb, null, {
    startAt,
    idFor: (i) => plan.ids[i],
    onIndex: (i) => {
      let k = current;
      while (k + 1 < plan.labels.length && plan.labels[k + 1].at <= i) k++;
      if (k !== current) {
        current = k;
        if (status) status.textContent = `Now: ${plan.labels[k].label}`;
        document.querySelectorAll(`#plan-steps-${index} [aria-current]`).forEach((n) => n.removeAttribute("aria-current"));
        document.querySelector(`#plan-steps-${index} [data-k="${k}"]`)?.setAttribute("aria-current", "step");
      }
    },
    onEnd: () => {
      sectionSteps(comp, null).forEach(markLearned);
      stopPlayback();
    },
  });
  state.autoTabla = startedTabla;
  button.dataset.stop = button.textContent;
  button.textContent = "■ Stop";
}

// Maps each beat index of a line to its vibhag marker (X, 0, 2, ...), taking into
// account lines that start on a matra other than sam.
function taalMarkers(comp) {
  const taal = compositionTaal(comp);
  const starts = new Map();
  if (taal) {
    const shift = (comp.first_matra || 1) - 1;
    let m = 0;
    taal.vibhags.forEach((len, i) => {
      starts.set((m - shift + taal.beats) % taal.beats, taal.markers[i]);
      m += len;
    });
  }
  return starts;
}

function renderCompositions() {
  const box = $("#compositions");
  const list = state.raga?.compositions || [];
  $("#compositions-title").textContent = state.raga ? `Compositions in ${state.raga.name}` : "Compositions";
  $("#compositions-count").textContent = list.filter((c) => c.sections.length).length || "";
  box.innerHTML = "";
  if (!state.raga) return void box.append(el("p", { class: "muted" }, "Choose a raga to see its compositions."));
  if (!list.length) {
    return void box.append(el("div", { class: "empty-state" },
      el("strong", {}, `No compositions are recorded for ${state.raga.name} yet.`),
      el("span", {}, "You can still practice its alaap and taan, or compose your own line."),
      el("button", { type: "button", onclick: () => showTab("improv") }, "Practice alaap and taan")));
  }
  if (list.length > 1) {
    box.append(el("nav", { class: "comp-index", "aria-label": "Compositions" },
      ...list.map((comp, index) => el("a", { href: `#comp-${index}`, onclick: (e) => {
        e.preventDefault();
        document.getElementById(`comp-${index}`).scrollIntoView({ behavior: "smooth", block: "start" });
      } }, el("strong", {}, comp.title), el("span", {}, [comp.type, comp.taal].filter(Boolean).join(" · "))))));
  }
  list.forEach((comp, index) => box.append(compositionCard(comp, index)));
}

function compositionCard(comp, index) {
  const markers = taalMarkers(comp);
  const taal = compositionTaal(comp);
  const meta = [comp.type, comp.taal, comp.laya && `${comp.laya} laya`, comp.composer].filter(Boolean).join(" · ");
  const source = /^https?:\/\//.test(comp.source)
    ? el("a", { href: comp.source, target: "_blank", rel: "noopener noreferrer" }, "Source")
    : el("span", {}, `Source: ${comp.source}`);
  const card = el("article", { class: "composition", id: `comp-${index}` },
    el("header", {},
      el("h3", {}, comp.title),
      el("p", { class: "meta" }, meta, " · ", source)),
    comp.notes ? el("details", { class: "comp-notes" }, el("summary", {}, "About this transcription"), el("p", { class: "hint" }, comp.notes)) : "");
  if (!comp.sections.length) {
    card.append(el("p", { class: "muted small" }, "Notation for this composition isn't available yet."));
    return card;
  }
  const jump = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const withLyrics = comp.sections.filter((section) => section.lyrics?.length);
  card.append(el("nav", { class: "comp-sections", "aria-label": `Parts of ${comp.title}` },
    withLyrics.length ? el("a", { href: `#words-${index}`, onclick: jump(`words-${index}`) }, "Words") : "",
    ...comp.sections.map((section, si) => el("a", { href: `#sec-${index}-${si}`, onclick: jump(`sec-${index}-${si}`) }, section.name)),
    taal ? el("a", { href: `#plan-${index}`, onclick: (e) => { document.getElementById(`plan-${index}`).open = true; jump(`plan-${index}`)(e); } }, "Performance plan") : ""));

  const playAll = el("button", { class: "primary", onclick: (e) => playComposition(comp, index, null, e.currentTarget) }, "▶ Play whole");
  const perform = el("button", {
    title: "Sing the composition with alaap and taan on the tabla, returning to the mukhda after each",
    onclick: (e) => performComposition(comp, index, e.currentTarget),
  }, "▶ Perform with alaap and taan");
  card.append(el("div", { class: "row wrap" }, playAll, taal ? perform : "",
    el("button", { onclick: () => openCompositionInEditor(comp, null) }, "Open in Compose"),
    el("span", { class: "perform-status muted small", id: `perform-status-${index}`, "aria-live": "polite" })));
  if (withLyrics.length) {
    card.append(el("section", { class: "comp-words", id: `words-${index}`, "aria-label": "Words" },
      ...withLyrics.map((section) => el("div", { class: "comp-words-section" },
        el("span", { class: "comp-words-name" }, section.name),
        el("p", {}, ...section.lyrics.flatMap((line, i) => (i ? [el("br"), line] : [line])))))));
  }
  const legend = el("p", { class: "taal-legend" },
    el("b", {}, "X"), " = ", term("sam"), " · ", el("b", {}, "0"), " = ", term("khali"), " · ",
    el("b", {}, "2, 3, 4"), " = ", term("tali", "tali"), ". Each box is one beat.");
  if (taal && taal.name.toLowerCase() !== comp.taal.toLowerCase()) {
    legend.append(` The tabla plays ${taal.name}, which has the same ${taal.beats} beats, because ${comp.taal} has no theka here.`);
  }
  card.append(legend);
  let beatNo = 0;
  comp.sections.forEach((section, si) => {
    const sectionName = section.name.toLowerCase();
    card.append(el("div", { class: "row wrap section-head", id: `sec-${index}-${si}` },
      el("h4", {}, section.name),
      el("button", { class: "small", onclick: (e) => playComposition(comp, index, si, e.currentTarget) }, `▶ Play ${sectionName}`),
      loopToggle((button) => playComposition(comp, index, si, null, { loopButton: button })),
      el("button", { class: "small", title: "Open this section in Compose", onclick: () => openCompositionInEditor(comp, si) }, "Open in Compose")));
    section.lines.forEach((line, li) => {
      const row = el("div", { class: "comp-line" });
      line.beats.forEach((beat, b) => {
        const marker = markers.get(b);
        const cls = ["cbeat", marker !== undefined ? "vib" : "", marker === "X" ? "sam" : "", beat.trim() ? "" : "empty"].join(" ");
        row.append(el("div", { class: cls, id: `cb-${index}-${beatNo++}` },
          el("span", { class: "mk", title: marker === "X" ? "Sam" : marker === "0" ? "Khali" : "" }, marker ?? ""),
          el("span", { class: "nt" }, ...notationNodes(beat.trim())),
          el("span", { class: "wd" }, line.words?.[b] === "_" ? "ऽ" : line.words?.[b] || "")));
      });
      const name = `${section.name} line ${li + 1}`;
      card.append(el("div", { class: "line-row" },
        el("div", { class: "line-controls", role: "group", "aria-label": name },
          el("button", { type: "button", "aria-label": `Play ${name}`, title: `Play ${name}`, onclick: (e) => playComposition(comp, index, si, e.currentTarget, { lineIndex: li }) }, `▶ ${li + 1}`),
          loopToggle((button) => playComposition(comp, index, si, null, { lineIndex: li, loopButton: button }))),
        el("div", { class: "grid-wrap" }, row)));
    });
  });
  if (taal) {
    const plan = el("details", { class: "perform-plan", id: `plan-${index}` },
      el("summary", {}, "Performance plan"),
      el("p", { class: "hint" }, "Perform plays the composition, adds alaap and taan, and returns to the mukhda each time. The current step is highlighted while it plays."),
      el("ol", { id: `plan-steps-${index}` }));
    plan.addEventListener("toggle", () => {
      if (plan.open && !document.getElementById(`plan-steps-${index}`).children.length) previewPlan(comp, index);
    });
    card.append(plan);
  }
  return card;
}

// Phrase builder ----------------------------------------------------------------------
const OCTAVE_NAMES = { "-1": "mandra ", 0: "", 1: "taar " };

// The raga's swaras across the octaves its phrases use, low to high.
function ragaNotes() {
  const r = state.raga;
  if (!r) return [];
  const pitches = new Set(tokenize([r.aaroh, r.avroh, ...r.pakad, ...r.patterns].join(" "))
    .filter((t) => t.pitch !== undefined).map((t) => t.pitch));
  return [...pitches].sort((x, y) => x - y);
}

function noteLabel(pitch) {
  const semi = ((pitch % 12) + 12) % 12;
  return `${noteText(swaraText(pitch))} (${OCTAVE_NAMES[Math.floor(pitch / 12)] ?? ""}${SWARA_LABELS[semi]})`;
}

function renderBuilderNotes() {
  const pitches = ragaNotes();
  for (const [id, fallback] of [["#b-start", ""], ["#b-end", "S"]]) {
    const select = $(id);
    const previous = select.value || fallback;
    select.replaceChildren(el("option", { value: "" }, "Any"), ...pitches.map((p) => el("option", { value: swaraText(p) }, noteLabel(p))));
    select.value = pitches.some((p) => swaraText(p) === previous) ? previous : "";
  }
  $("#b-vadi-label").textContent = state.raga?.vadi ? `Emphasize the vadi (${state.raga.vadi})` : "Emphasize the vadi";
  writeIntent();
}

// Writes the prompt from the builder fields. The generator reads only the prompt.
function writeIntent() {
  const parts = [];
  const contour = $("#b-contour").value;
  if (contour) parts.push(contour);
  if ($("#b-start").value) parts.push(`starting on ${$("#b-start").value}`);
  if ($("#b-end").value) parts.push(`ending on ${$("#b-end").value}`);
  parts.push(`${$("#beats").value} beats`);
  if (+$("#npb").value > 1) parts.push(`${$("#npb").value} notes per beat`);
  if ($("#b-pakad").checked) parts.push("use the pakad");
  if ($("#b-vadi").checked) parts.push("emphasize the vadi");
  if ($("#b-holds").checked) parts.push("with held notes");
  $("#intent").value = parts.join(", ");
}

// Generation ------------------------------------------------------------------------
async function generate({ intoEditor = false } = {}) {
  if (!state.raga) return toast("Choose a raga first.");
  const req = {
    raga: state.raga.name,
    text: $("#intent").value,
    base: { beats: +$("#beats").value, notes_per_beat: +$("#npb").value, count: +$("#count").value },
  };
  state.lastRequest = req;
  $("#generate").disabled = true;
  try {
    const res = await api("/api/generate", { json: req });
    const i = res.intention;
    $("#beats").value = i.beats;
    $("#npb").value = i.notes_per_beat;
    if (i.taal) setTaal(i.taal);
    const summary = $("#intent-summary");
    summary.innerHTML = "";
    summary.append("Swaramala understood: ", ...i.summary.map((s) => el("span", { class: "tag" }, proseNotes(s))));
    state.chosenPattern = -1;
    renderPatterns(res.patterns);
    $("#generate").textContent = "Generate new options";
    if (intoEditor && res.patterns.length) loadLine(tokensFromStrings(res.patterns[0].tokens), res.patterns[0].notes_per_beat);
  } catch (err) {
    $("#patterns").innerHTML = "";
    $("#patterns").append(el("p", { class: "error" }, err.message));
  } finally {
    $("#generate").disabled = false;
  }
}

// Plain-language reasons an option suits the raga.
function fitNotes(tokens, pattern) {
  const r = state.raga;
  const notes = tokens.filter((t) => t.pitch !== undefined);
  const semi = (p) => ((p % 12) + 12) % 12;
  const allowed = new Set(r.semitones);
  const items = [];
  const outside = notes.filter((t) => !allowed.has(semi(t.pitch)));
  if (!outside.length) items.push([`Uses only ${r.name} swaras: ${SWARAS.filter((_, k) => allowed.has(k)).map(noteText).join(" ")}.`]);
  else items.push([`Includes ${outside.map((t) => noteText(t.text)).join(", ")}, outside the raga.`, "tip"]);
  const last = notes.at(-1);
  if (last) items.push([`Ends on ${noteText(swaraText(last.pitch))}${semi(last.pitch) === 0 ? ", Sa, which gives the phrase a resting point" : ""}.`]);
  if (r.vadi) {
    const n = notes.filter((t) => SWARAS[semi(t.pitch)] === r.vadi).length;
    if (n) items.push([`Touches the vadi ${noteText(r.vadi)} ${n === 1 ? "once" : `${n} times`}.`]);
  }
  const match = /raga phrases (\d+)%/.exec(pattern.explanation.join(" "));
  if (match) {
    const pct = +match[1];
    items.push([`${pct}% of its three-note turns come from ${r.name}'s own phrases.`]);
    if (pct < 40 && !$("#b-pakad").checked) items.push(["For a more characteristic line, select Use the pakad.", "tip"]);
  }
  return items;
}

function renderPatterns(patterns) {
  state.patterns = patterns;
  const box = $("#patterns");
  box.innerHTML = "";
  if (!patterns.length) return void box.append(el("p", { class: "muted" }, "No options match. Change the start or end note, or add beats."));
  patterns.forEach((p, n) => {
    const tokens = tokensFromStrings(p.tokens);
    const grid = el("div", { class: "grid-wrap" });
    renderGrid(grid, tokens, p.notes_per_beat, { idPrefix: `pat${n}` });
    const last = tokens.filter((t) => t.pitch !== undefined).at(-1);
    box.append(el("article", { class: "pattern" + (state.chosenPattern === n ? " chosen" : ""), "aria-labelledby": `pat-title-${n}` },
      el("h3", { id: `pat-title-${n}` }, `Option ${n + 1}`, last ? ` · ends on ${noteText(last.text)}` : "",
        state.chosenPattern === n ? el("span", { class: "muted small" }, " · in the editor") : ""),
      grid,
      el("ul", { class: "fits", "aria-label": `Why option ${n + 1} fits ${state.raga.name}` },
        ...fitNotes(tokens, p).map(([text, kind]) => el("li", { class: kind || "" }, text))),
      el("div", { class: "row wrap" },
        el("button", { onclick: () => playTokens(tokens, p.notes_per_beat, `pat${n}`) }, "▶ Play"),
        el("button", { class: "primary", onclick: () => { state.chosenPattern = n; loadLine(tokens, p.notes_per_beat); renderPatterns(patterns); } }, "Use in editor"),
        el("button", { onclick: () => saveLine(tokens, p.notes_per_beat, `${state.raga.name} option ${n + 1}, ${p.tokens.length / p.notes_per_beat} beats`) }, "Save to library"),
      )));
  });
}

// Editor ---------------------------------------------------------------------------
// Undo history: each entry is a copy of the line before a change.
function snapshot() {
  return { line: state.line.map((t) => ({ ...t })), npb: state.npb, selected: state.selected };
}

function remember() {
  state.history.push(snapshot());
  if (state.history.length > 200) state.history.shift();
  state.future = [];
}

function restore(entry) {
  state.line = entry.line;
  state.npb = entry.npb;
  state.selected = entry.selected;
  $("#editor-npb").value = entry.npb;
  lineChanged();
}

function undo() {
  if (!state.history.length) return;
  state.future.push(snapshot());
  restore(state.history.pop());
}

function redo() {
  if (!state.future.length) return;
  state.history.push(snapshot());
  restore(state.future.pop());
}

function loadLine(tokens, npb) {
  if (state.line.length) remember();
  state.line = tokens.map((t) => ({ ...t }));
  state.npb = npb;
  state.selected = -1;
  $("#editor-npb").value = npb;
  lineChanged();
  showTab("compose");
  $(".editor-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function selectToken(idx) {
  state.selected = state.selected === idx ? -1 : idx;
  const t = state.line[idx];
  if (t?.pitch !== undefined) { engine.playNote(t.pitch, 0, 0.4); flashKey(t.pitch); }
  renderEditor();
}

// The raga swara nearest to a note outside the raga, preferring the same letter.
function nearestAllowed(pitch) {
  const allowed = new Set(state.raga?.semitones || []);
  const semi = (p) => ((p % 12) + 12) % 12;
  for (let d = 1; d < 6; d++) {
    const options = [pitch + d, pitch - d].filter((p) => allowed.has(semi(p)));
    const same = options.find((p) => SWARAS[semi(p)].toLowerCase() === SWARAS[semi(pitch)].toLowerCase());
    if (same !== undefined || options.length) return same ?? options[0];
  }
  return null;
}

function fixCard(v) {
  const tok = state.line[v.index];
  const actions = [];
  if (tok?.pitch !== undefined && /varjit/.test(v.message)) {
    const near = nearestAllowed(tok.pitch);
    if (near !== null) {
      actions.push(el("button", { type: "button", class: "small", onclick: () => {
        remember();
        state.line[v.index] = { text: swaraText(near), pitch: near };
        lineChanged();
      } }, `Replace with ${noteText(swaraText(near))}`));
    }
  }
  if (v.index >= 0) {
    actions.push(el("button", { type: "button", class: "small", onclick: () => { state.selected = v.index; renderEditor(); } }, "Select note"));
    actions.push(el("button", { type: "button", class: "small", onclick: () => {
      remember();
      state.line.splice(v.index, 1);
      state.selected = -1;
      lineChanged();
    } }, "Delete note"));
  }
  return el("div", { class: "fix-card", id: `fix-${v.index}` },
    el("strong", {}, v.index >= 0 ? `Note ${v.index + 1}${tok ? ` (${noteText(tok.text)})` : ""}` : "Line"), " ", proseNotes(v.message),
    actions.length ? el("div", { class: "row wrap" }, ...actions) : "");
}

function renderEditor() {
  const bad = new Set(state.violations.map((v) => v.index));
  renderGrid($("#editor-grid"), state.line, state.npb, { selectable: true, bad, idPrefix: "ed" });
  document.querySelectorAll("#editor-grid .tok.bad").forEach((n) => {
    n.setAttribute("aria-invalid", "true");
    n.setAttribute("aria-describedby", `fix-${n.dataset.idx}`);
  });
  const text = $("#editor-text");
  if (document.activeElement !== text) text.value = lineText(state.line);
  const hasSelection = state.selected >= 0 && state.selected < state.line.length;
  document.querySelectorAll("[data-needs-selection]").forEach((b) => { b.disabled = !hasSelection; });
  $("#selection-hint").hidden = hasSelection;
  $("#editor-undo").disabled = !state.history.length;
  $("#editor-redo").disabled = !state.future.length;
  $("#editor-clear").disabled = !state.line.length;
  $("#save-line").textContent = state.violations.length ? "Save with warnings" : "Save line";
  const vbox = $("#violations");
  vbox.innerHTML = "";
  if (!state.line.length) return;
  if (!state.violations.length) {
    vbox.className = "violations ok";
    vbox.textContent = state.raga ? `This line follows ${state.raga.name}.` : "";
  } else {
    vbox.className = "violations";
    state.violations.forEach((v) => vbox.append(fixCard(v)));
  }
}

let validateTimer;
function lineChanged() {
  renderEditor();
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validateLine, 200);
}

async function validateLine() {
  if (!state.raga || !state.line.length) { state.violations = []; renderEditor(); return; }
  try {
    const res = await api("/api/validate", { json: { raga: state.raga.name, tokens: lineText(state.line) } });
    state.violations = res.violations;
  } catch (err) {
    state.violations = [{ index: -1, message: err.message }];
  }
  renderEditor();
}

function editOp(op) {
  const i = state.selected;
  const line = state.line;
  if (op !== "hold" && op !== "rest" && i < 0) return toast("Select a note first.");
  remember();
  if (op === "hold" || op === "rest") {
    const at = i >= 0 ? i + 1 : line.length;
    line.splice(at, 0, op === "hold" ? { text: "_", hold: true } : { text: "-", rest: true });
    state.selected = at;
  } else if (op === "delete") {
    line.splice(i, 1);
    state.selected = Math.min(i, line.length - 1);
  } else if (op === "left" && i > 0) {
    [line[i - 1], line[i]] = [line[i], line[i - 1]];
    state.selected = i - 1;
  } else if (op === "right" && i < line.length - 1) {
    [line[i + 1], line[i]] = [line[i], line[i + 1]];
    state.selected = i + 1;
  }
  lineChanged();
}

function clearLine() {
  if (!state.line.length) return;
  remember();
  state.line = [];
  state.selected = -1;
  lineChanged();
  toast("Line cleared. Undo brings it back.");
}

async function arrange(mode) {
  if (!state.raga || !state.line.length) return toast("Load a line first.");
  try {
    const res = await api("/api/arrange", {
      json: { raga: state.raga.name, tokens: lineText(state.line), mode, notes_per_beat: +$("#taan-npb").value },
    });
    const npb = mode === "sustain" || mode === "compact" ? state.npb : res.notes_per_beat;
    loadLine(tokensFromStrings(res.tokens), npb);
  } catch (err) {
    toast(err.message);
  }
}

// Playback ---------------------------------------------------------------------------
// Silences the current sequence without ending a loop, so a loop can start its next pass.
function haltPlayback() {
  state.playback?.cancel();
  state.playback = null;
  document.querySelectorAll(".playing").forEach((n) => n.classList.remove("playing"));
  document.querySelectorAll("[aria-current=true].tok, [aria-current=true].cbeat").forEach((n) => n.removeAttribute("aria-current"));
}

function stopPlayback() {
  haltPlayback();
  if (state.autoTabla) setTablaRunning(false);
  state.autoTabla = false;
  if (state.loop) {
    state.loop.button?.setAttribute("aria-pressed", "false");
    if (state.loop.button) state.loop.button.textContent = "Loop";
    state.loop = null;
  }
  document.querySelectorAll(".perform-status").forEach((n) => { n.textContent = ""; });
  document.querySelectorAll(".perform-plan [aria-current]").forEach((n) => n.removeAttribute("aria-current"));
  document.querySelectorAll("[data-stop]").forEach((b) => { b.textContent = b.dataset.stop; delete b.dataset.stop; });
}

function playTokens(tokens, npb, idPrefix = null, { cellFor = (i) => i, idFor = null, onIndex = null, onEnd = null, startAt = null, keepLoop = false } = {}) {
  if (keepLoop) haltPlayback();
  else stopPlayback();
  const slotMs = (60 / engine.tempo / npb) * 1000;
  state.playback = engine.playSequence(tokens, npb, {
    startAt,
    onToken: (i, tok) => {
      document.querySelectorAll(".playing:not(.nkey)").forEach((n) => { n.classList.remove("playing"); n.removeAttribute("aria-current"); });
      if (i < 0) return void onEnd?.();
      onIndex?.(i);
      const id = idFor ? idFor(i) : idPrefix && `${idPrefix}-${cellFor(i)}`;
      const cell = id && document.getElementById(id);
      if (cell) {
        cell.classList.add("playing");
        cell.setAttribute("aria-current", "true");
        const wrap = cell.closest(".grid-wrap");
        if (wrap && (cell.offsetLeft < wrap.scrollLeft || cell.offsetLeft > wrap.scrollLeft + wrap.clientWidth - 40)) wrap.scrollLeft = cell.offsetLeft - 40;
      }
      if (tok.pitch !== undefined) {
        let len = 1;
        while (tokens[i + len]?.hold) len++;
        flashKey(tok.pitch, slotMs * len * 0.9);
      }
    },
  });
}

// Saved lines ------------------------------------------------------------------------
async function saveLine(tokens = state.line, npb = state.npb, title = "") {
  if (!tokens.length) return toast("The line is empty.");
  try {
    const saved = await api("/api/lines", {
      json: {
        raga: state.raga.name, title, tokens: tokens.map((t) => t.text), notes_per_beat: npb,
        taal: state.taal?.name, intention: $("#intent").value,
      },
    });
    toast(saved.violations.length ? "Saved, with raga warnings." : "Line saved.");
    loadSavedLines();
  } catch (err) {
    toast(err.message);
  }
}

async function loadSavedLines() {
  const box = $("#saved-lines");
  if (!state.raga) { box.className = "muted"; box.textContent = "Choose a raga to see saved lines."; return; }
  const lines = await api(`/api/lines?raga=${encodeURIComponent(state.raga.name)}`);
  box.className = "";
  box.innerHTML = "";
  $("#saved-title").textContent = `Saved lines in ${state.raga.name}`;
  if (!lines.length) {
    box.append(el("div", { class: "empty-state" },
      el("strong", {}, `No saved lines in ${state.raga.name} yet.`),
      el("span", {}, "Compose a phrase, then click Save line. Lines are stored in this browser."),
      el("button", { type: "button", onclick: () => showTab("compose") }, `Compose in ${state.raga.name}`)));
  }
  lines.forEach((line, n) => {
    const tokens = tokensFromStrings(line.tokens);
    const grid = el("div", { class: "grid-wrap" });
    renderGrid(grid, tokens, line.notes_per_beat, { idPrefix: `saved${line.id}` });
    const move = async (delta) => {
      const other = lines[n + delta];
      if (!other) return;
      await api(`/api/lines/${line.id}`, { method: "PATCH", json: { position: other.position } });
      await api(`/api/lines/${other.id}`, { method: "PATCH", json: { position: line.position } });
      loadSavedLines();
    };
    box.append(el("div", { class: "saved-line" },
      el("div", { class: "row between" }, el("strong", {}, line.title || `Line ${n + 1}`),
        el("span", { class: "muted small" }, `${line.taal || ""} · ${line.notes_per_beat}/beat`)),
      grid,
      el("div", { class: "row wrap" },
        el("button", { class: "small", onclick: () => playTokens(tokens, line.notes_per_beat, `saved${line.id}`) }, "▶ Play"),
        el("button", { class: "small", onclick: () => loadLine(tokens, line.notes_per_beat) }, "Open in Compose"),
        el("button", { class: "small", "aria-label": "Move up", onclick: () => move(-1), disabled: n === 0 ? "" : undefined }, "↑"),
        el("button", { class: "small", "aria-label": "Move down", onclick: () => move(1), disabled: n === lines.length - 1 ? "" : undefined }, "↓"),
        el("button", { class: "small", onclick: async () => {
          if (!confirm(`Delete ${line.title || `line ${n + 1}`}?`)) return;
          await api(`/api/lines/${line.id}`, { method: "DELETE" });
          loadSavedLines();
        } }, "Delete"),
      )));
  });
}

// Recordings --------------------------------------------------------------------------
async function loadRecordings() {
  const box = $("#recordings");
  const recs = await api("/api/recordings");
  box.className = "";
  box.innerHTML = "";
  if (!recs.length) box.append(el("p", { class: "muted" }, "No recordings yet. Click Record in the sound bar to start."));
  for (const r of recs) {
    const when = new Date(r.created_at).toLocaleString();
    box.append(el("div", { class: "recording" },
      el("strong", {}, r.title),
      el("span", { class: "muted small" }, [r.raga, r.tonic && `Sa = ${r.tonic}`, r.taal, when].filter(Boolean).join(" · ")),
      el("audio", { controls: "", preload: "none", src: r.audio_url }),
      el("button", { onclick: async () => { await api(`/api/recordings/${r.id}`, { method: "DELETE" }); loadRecordings(); } }, "Delete")));
  }
}

let recordTimer;
async function toggleRecord() {
  const btn = $("#record");
  if (recorder.recording) {
    clearInterval(recordTimer);
    btn.setAttribute("aria-pressed", "false");
    $("#record-label").textContent = "Record";
    $("#record-time").hidden = true;
    const result = await recorder.stop();
    if (result) openSaveRecording(result);
    return;
  }
  try {
    await recorder.start({ withMic: $("#record-mic").checked });
  } catch (err) {
    return toast(`Can't start recording: ${err.message}`);
  }
  btn.setAttribute("aria-pressed", "true");
  $("#record-label").textContent = "Stop";
  $("#record-time").textContent = "0:00";
  $("#record-time").hidden = false;
  const started = Date.now();
  recordTimer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    $("#record-time").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
}

function openSaveRecording(result) {
  state.pendingRecording = result;
  const dlg = $("#save-recording-dialog");
  $("#recording-preview").src = URL.createObjectURL(result.blob);
  const form = $("#save-recording-form");
  form.title.value = `${state.raga?.name || "Practice"} – ${new Date().toLocaleString()}`;
  $("#save-recording-note").textContent = "Saves in this browser. Export your library to back up recordings.";
  dlg.showModal();
}

async function handleSaveRecording(action) {
  const result = state.pendingRecording;
  const form = $("#save-recording-form");
  if (!result) return;
  if (action === "download") {
    const a = el("a", { href: URL.createObjectURL(result.blob), download: `${form.title.value || "recording"}.${result.type.split("/")[1].split(";")[0]}` });
    a.click();
    return;
  }
  if (action !== "save") { state.pendingRecording = null; return; }
  const data = new FormData();
  data.append("file", result.blob, "recording");
  data.append("title", form.title.value || "Untitled recording");
  if (state.raga) data.append("raga", state.raga.name);
  data.append("tonic", engine.tonic);
  if (state.taal) data.append("taal", state.taal.name);
  data.append("tempo", String(engine.tempo));
  data.append("duration_seconds", result.seconds.toFixed(2));
  try {
    await api("/api/recordings", { method: "POST", body: data });
    state.pendingRecording = null;
    toast("Recording saved.");
    loadRecordings();
  } catch (err) {
    toast(err.message);
    openSaveRecording(result);
  }
}

// Sound bar ---------------------------------------------------------------------------
function setTaal(name) {
  state.taal = state.taals.find((t) => t.name.toLowerCase() === name.toLowerCase()) || state.taals[0];
  $("#taal").value = state.taal.name;
  if (state.raga && state.improv && state.improv.taal !== state.taal.name) loadImprovisations();
  const theka = $("#theka");
  theka.innerHTML = "";
  let b = 0;
  state.taal.vibhags.forEach((size) => {
    for (let k = 0; k < size; k++, b++) {
      theka.append(el("span", { class: k === 0 ? "vib" : "", "data-beat": b }, state.taal.theka[b]));
    }
  });
  engine.ensure();
  engine.tabla.setTheka(state.taal.theka, state.taal.vibhags);
  engine.tabla.onBeat = (beat) => {
    document.querySelectorAll("#theka span.on").forEach((n) => n.classList.remove("on"));
    if (beat >= 0) document.querySelector(`#theka [data-beat="${beat}"]`)?.classList.add("on");
    $(".soundbar").classList.toggle("tabla-on", beat >= 0);
  };
  renderEditor();
}

function syncTanpura() {
  engine.ensure();
  const t = engine.tanpura;
  if ($("#tanpura-link").checked) {
    $("#tanpura-tonic").value = engine.tonic;
    $("#tanpura-octave").value = engine.tonicOctave;
  }
  t.tonic = $("#tanpura-tonic").value;
  t.octave = +$("#tanpura-octave").value;
  t.firstString = $("#tanpura-first").value;
}

function bindSoundbar() {
  for (const sel of ["#tonic", "#tanpura-tonic"]) {
    const s = $(sel);
    TONICS.forEach((t) => s.append(el("option", { value: t }, t)));
  }
  const savedTonic = localStorage.getItem("tonic") || "G#";
  $("#tonic").value = savedTonic;
  $("#tanpura-tonic").value = savedTonic;
  engine.tonic = savedTonic;

  const unlock = () => { engine.ensure(); syncTanpura(); setTaal($("#taal").value || "Teentaal"); };
  document.addEventListener("pointerdown", unlock, { once: true, capture: true });

  $("#tonic").addEventListener("change", (e) => {
    engine.tonic = e.target.value;
    localStorage.setItem("tonic", engine.tonic);
    syncTanpura();
    renderPiano();
  });
  $("#tonic-octave").addEventListener("change", (e) => { engine.tonicOctave = +e.target.value; syncTanpura(); renderPiano(); });
  $("#tempo").addEventListener("change", (e) => { engine.tempo = Math.min(400, Math.max(30, +e.target.value || 80)); });
  for (const id of ["#tanpura-tonic", "#tanpura-octave", "#tanpura-first"]) {
    $(id).addEventListener("change", () => { $("#tanpura-link").checked = false; syncTanpura(); });
  }
  $("#tanpura-link").addEventListener("change", syncTanpura);
  $("#tanpura-toggle").addEventListener("click", (e) => {
    syncTanpura();
    const on = !engine.tanpura.running;
    on ? engine.tanpura.start() : engine.tanpura.stop();
    e.currentTarget.setAttribute("aria-pressed", String(on));
  });
  $("#tanpura-vol").addEventListener("input", (e) => engine.setVolume("tanpuraBus", +e.target.value));

  $("#taal").addEventListener("change", (e) => {
    const wasRunning = engine.tabla.running;
    engine.tabla.stop();
    setTaal(e.target.value);
    if (wasRunning) engine.tabla.start();
  });
  $("#tabla-toggle").addEventListener("click", (e) => {
    engine.ensure();
    if (!engine.tabla.theka.length) setTaal($("#taal").value);
    const on = !engine.tabla.running;
    on ? engine.tabla.start() : engine.tabla.stop();
    e.currentTarget.setAttribute("aria-pressed", String(on));
  });
  const picker = $("#instrument");
  for (const family of [...new Set(INSTRUMENTS.map((i) => i.family))]) {
    const group = el("optgroup", { label: family });
    INSTRUMENTS.filter((i) => i.family === family).forEach((i) => group.append(el("option", { value: i.id }, i.name)));
    picker.append(group);
  }
  picker.value = INSTRUMENTS.some((i) => i.id === localStorage.getItem("instrument"))
    ? localStorage.getItem("instrument") : DEFAULT_INSTRUMENT;
  engine.setInstrument(picker.value);
  picker.addEventListener("change", () => {
    engine.setInstrument(picker.value);
    localStorage.setItem("instrument", picker.value);
    engine.playNote(0, 0, 0.6);
    picker.blur();
  });
  $("#instrument-vol").addEventListener("input", (e) => engine.setVolume("pianoBus", +e.target.value));
  $("#tabla-vol").addEventListener("input", (e) => engine.setVolume("tablaBus", +e.target.value));
  $("#record").addEventListener("click", toggleRecord);
}

// Notation script -----------------------------------------------------------------
function setScript(script, save = true) {
  state.script = SCRIPTS.includes(script) ? script : "latin";
  document.documentElement.dataset.script = state.script;
  document.querySelectorAll("[data-script]").forEach((b) => {
    if (b.tagName === "BUTTON") b.setAttribute("aria-pressed", String(b.dataset.script === state.script));
  });
  if (save) {
    try { localStorage.setItem("swaramala.script", state.script); } catch { /* storage unavailable */ }
  }
}

// Redraw every view that shows swaras, keeping the current playback state.
function rerenderNotation() {
  renderNotationBar();
  renderPiano();
  renderKeyMap();
  if (state.raga) {
    renderRagaInfo();
    renderCompositions();
    renderBuilderNotes();
    loadSavedLines();
  }
  if (state.improv) renderImprovisations();
  if (state.patterns) renderPatterns(state.patterns);
  renderEditor();
}

function bindScriptSwitch() {
  setScript(state.script, false);
  document.querySelectorAll(".script-switch [data-script]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.script === state.script) return;
    stopPlayback();
    setScript(b.dataset.script);
    rerenderNotation();
  }));
}

// Navigation and dock ---------------------------------------------------------------------
const TABS = ["overview", "compositions", "improv", "compose", "library"];

function showTab(name, { focus = false } = {}) {
  if (!TABS.includes(name)) name = "overview";
  endWelcome();
  const section = SECTION_OF[name];
  for (const tab of TABS) document.getElementById(`view-${tab}`).hidden = tab !== name;
  for (const tab of LEARN_TABS) {
    const button = document.getElementById(`tab-${tab}`);
    button.setAttribute("aria-selected", String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
  }
  $("#learn-nav").hidden = section !== "learn";
  document.querySelectorAll(".primary-nav a").forEach((a) => {
    if (a.dataset.section === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  if (section === "compose" && !localStorage.getItem("dock") && !matchMedia("(max-width: 720px)").matches) setDock(true, false);
  if (focus) document.getElementById(`tab-${name}`)?.focus();
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
}

function bindTabs() {
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelectorAll(".primary-nav a").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    showTab(a.dataset.section === "learn" ? (LEARN_TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview") : a.dataset.section);
    window.scrollTo({ top: 0 });
  }));
  $(".main-tabs").addEventListener("keydown", (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const current = LEARN_TABS.findIndex((t) => document.getElementById(`tab-${t}`).getAttribute("aria-selected") === "true");
    showTab(LEARN_TABS[(current + step + LEARN_TABS.length) % LEARN_TABS.length], { focus: true });
  });
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  // Keeps the Learn tabs just under the sticky sound bar.
  const bar = $(".soundbar");
  new ResizeObserver(() => document.documentElement.style.setProperty("--soundbar-h", `${bar.offsetHeight}px`)).observe(bar);
}

// The welcome screen shows on a first visit, before you choose a path.
function startWelcome() {
  document.body.classList.add("welcoming");
  $("#welcome").hidden = false;
}

function endWelcome() {
  if ($("#welcome").hidden) return;
  $("#welcome").hidden = true;
  document.body.classList.remove("welcoming");
}

function bindWelcome() {
  document.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", async () => {
    if (await setRaga(b.dataset.raga)) showTab(b.dataset.start === "compose" ? "compose" : "overview");
  }));
  document.querySelectorAll("[data-browse]").forEach((b) => b.addEventListener("click", openRagaDialog));
}

function setDock(open, save = true) {
  $("#dock-toggle").setAttribute("aria-expanded", String(open));
  $("#dock-body").hidden = !open;
  if (save) localStorage.setItem("dock", open ? "open" : "closed");
}

function bindDock() {
  const toggle = $("#dock-toggle");
  setDock(localStorage.getItem("dock") === "open", false);
  toggle.addEventListener("click", () => setDock(toggle.getAttribute("aria-expanded") !== "true"));
}

function bindRagaPicker() {
  // Leave the search box after opening a raga, so the computer keyboard plays notes again.
  $("#raga-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#raga-input").blur();
    if (await setRaga($("#raga-input").value.trim()) && !$("#welcome").hidden) showTab("overview");
  });
  // Picking a suggestion from the list opens the raga right away.
  $("#raga-input").addEventListener("change", (e) => {
    const value = e.target.value.trim().toLowerCase();
    if (state.ragas.some((r) => r.name.toLowerCase() === value || r.aliases.some((a) => a.toLowerCase() === value))) {
      e.target.blur();
      setRaga(e.target.value.trim()).then((ok) => ok && !$("#welcome").hidden && showTab("overview"));
    }
  });
  $("#raga-browse").addEventListener("click", openRagaDialog);
  $("#raga-dialog-close").addEventListener("click", () => $("#raga-dialog").close());
  $("#raga-filter").addEventListener("input", renderRagaBrowser);
  $("#raga-filter").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    $("#raga-groups .chip")?.click();
  });
  $("#raga-dialog").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
}

function setLoadingStatus(message, isError = false) {
  const status = $("#app-status");
  status.classList.toggle("error-state", isError);
  status.innerHTML = "";
  if (!isError) status.append(el("span", { class: "spinner", "aria-hidden": "true" }));
  status.append(el("span", {}, message));
  status.hidden = false;
}

function hideLoadingStatus() {
  $("#app-status").hidden = true;
}

function bindLibraryActions() {
  $("#export-library").addEventListener("click", async () => {
    try {
      await exportLibrary();
      toast("Library exported.");
    } catch (err) {
      toast(err.message);
    }
  });
  $("#import-library").addEventListener("click", () => $("#import-library-file").click());
  $("#import-library-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = await importLibraryFile(file);
      toast(`Imported ${result.lines} line${result.lines === 1 ? "" : "s"} and ${result.recordings} recording${result.recordings === 1 ? "" : "s"}.`);
      loadSavedLines();
      loadRecordings();
    } catch (err) {
      toast(err.message);
    }
  });
}

// Wire up -------------------------------------------------------------------------------
async function init() {
  setLoadingStatus("Loading Swaramala data.");
  const config = await api("/api/config");
  state.taals = config.taals;
  config.taals.forEach((t) => $("#taal").append(el("option", { value: t.name }, `${t.name} (${t.beats})`)));
  state.taal = state.taals[0];
  bindSoundbar();
  const theka = $("#theka");
  state.taal.theka.forEach((b, i) => theka.append(el("span", { "data-beat": i }, b)));
  document.addEventListener("click", (e) => {
    const pop = document.querySelector(".popover[open]");
    if (pop && !pop.contains(e.target)) pop.open = false;
  });

  EXAMPLES.forEach((ex) => $("#intent-examples").append(el("button", { class: "chip", onclick: () => { $("#intent").value = ex; generate(); } }, ex)));
  $("#improv-regenerate").addEventListener("click", () => loadImprovisations(Math.floor(Math.random() * 2 ** 31)));
  bindRagaPicker();
  bindTabs();
  bindDock();
  bindTerms();
  bindWelcome();
  bindScriptSwitch();
  for (const id of ["#b-contour", "#b-start", "#b-end", "#beats", "#npb", "#b-pakad", "#b-vadi", "#b-holds"]) {
    $(id).addEventListener("change", writeIntent);
  }
  $("#generate").addEventListener("click", () => generate());
  $("#intent").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } });
  document.querySelectorAll("[data-op]").forEach((b) => b.addEventListener("click", () => editOp(b.dataset.op)));
  document.querySelectorAll("[data-arrange]").forEach((b) => b.addEventListener("click", () => arrange(b.dataset.arrange)));
  $("#editor-text").addEventListener("focus", remember);
  $("#editor-text").addEventListener("input", (e) => { state.line = tokenize(e.target.value); state.selected = -1; lineChanged(); });
  $("#editor-npb").addEventListener("change", (e) => { remember(); state.npb = +e.target.value; renderEditor(); });
  $("#editor-play").addEventListener("click", () => playTokens(state.line, state.npb, "ed"));
  $("#editor-undo").addEventListener("click", undo);
  $("#editor-redo").addEventListener("click", redo);
  $("#editor-clear").addEventListener("click", clearLine);
  $("#editor-regenerate").addEventListener("click", () => generate({ intoEditor: true }));
  $("#save-line").addEventListener("click", () => saveLine(state.line, state.npb, $("#line-title").value));
  // The Compose switch and the dock setting are the same choice.
  const mirror = (from, to) => $(from).addEventListener("change", () => { $(to).checked = $(from).checked; });
  mirror("#compose-piano-input", "#piano-input");
  mirror("#piano-input", "#compose-piano-input");
  for (const id of ["#perform-return", "#perform-alaap", "#perform-taan"]) {
    $(id).addEventListener("change", () => document.querySelectorAll(".perform-plan").forEach((d) => {
      d.querySelector("ol").replaceChildren();
      if (d.open) d.dispatchEvent(new Event("toggle"));
    }));
  }
  bindLibraryActions();
  bindComputerKeyboard();
  $("#save-recording-dialog").addEventListener("close", (e) => handleSaveRecording(e.target.returnValue));
  document.addEventListener("keydown", (e) => {
    if ($("#view-compose").hidden || document.querySelector("dialog[open]")) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.target.matches("input, textarea")) {
      e.preventDefault();
      return e.shiftKey ? redo() : undo();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y" && !e.target.matches("input, textarea")) {
      e.preventDefault();
      return redo();
    }
    if (e.target.matches("input, textarea, select, button, summary")) return;
    if (e.key === "_") editOp("hold");
    if ((e.key === "Backspace" || e.key === "Delete") && state.selected >= 0) editOp("delete");
    if (e.key === " ") { e.preventDefault(); playTokens(state.line, state.npb, "ed"); }
  });

  renderNotationBar();
  renderPiano();
  renderKeyMap();
  renderEditor();
  const firstVisit = !localStorage.getItem("raga") && !TABS.includes(location.hash.slice(1));
  await loadRagas();
  await setRaga(localStorage.getItem("raga") || "Yaman");
  if (firstVisit) startWelcome();
  else showTab(location.hash.slice(1));
  await loadRecordings();
  hideLoadingStatus();
}

init().catch((err) => {
  console.error(err);
  setLoadingStatus(`Swaramala couldn't load its data. Refresh the page, or try again after the site finishes deploying. ${err.message}`, true);
});
