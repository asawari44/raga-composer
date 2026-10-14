import { filterSongs } from "./core/songs.js";

export function createSongsView({ api, el, tokenize, notationNodes, practicePlay, loopToggle, stopPlayback, setTempo }) {
  const search = document.getElementById("song-search");
  const category = document.getElementById("song-category");
  const status = document.getElementById("songs-status");
  const list = document.getElementById("songs-list");
  const previous = document.getElementById("songs-previous");
  const next = document.getElementById("songs-next");
  const pageStatus = document.getElementById("songs-page");
  const pageSize = 12;
  let page = 0;
  let catalog = null;
  let loading = false;

  const link = (url, label) => el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, label);

  function songCard(song) {
    const card = el("article", { class: "composition song-card" },
      el("h3", {}, song.title),
      song.title_hi ? el("p", { lang: "hi" }, song.title_hi) : "",
      el("p", { class: "meta" }, `${song.category} · ${song.composer} · ${song.rights.license}`));
    if (song.notes) {
      card.append(el("details", {}, el("summary", {}, "About this historical setting"),
        el("p", {}, song.notes)));
    }
    song.sections.forEach((section, index) => {
      const tokens = tokenize(section.notation);
      const id = `song-${song.id}-${index}`;
      const notes = el("div", { class: "song-notes mono", "aria-label": `${section.name} notation` },
        ...tokens.map((token, i) => el("span", { id: `${id}-${i}` }, ...notationNodes(token.text))));
      const play = (options = {}) => practicePlay(tokens, section.notes_per_beat, id, options);
      card.append(el("section", {},
        el("h4", {}, section.name),
        el("p", { class: "hint" }, `${section.notes_per_beat} slots per beat. Suggested tempo: ${section.tempo} BPM.`),
        el("div", { class: "row wrap" },
          el("button", { type: "button", class: "primary", "aria-label": `Play ${song.title}, ${section.name}`, onclick: () => play() }, "Play section"),
          el("button", { type: "button", onclick: () => play({ slow: true }) }, "Slower"),
          loopToggle((button) => play({ loopButton: button })),
          el("button", { type: "button", onclick: () => stopPlayback() }, "Stop"),
          el("button", { type: "button", onclick: () => { stopPlayback(); setTempo(section.tempo); } }, "Use suggested tempo")),
        notes));
    });
    card.append(el("details", {},
      el("summary", {}, "Sources and reuse rights"),
      el("p", {}, song.rights.notes),
      el("p", {}, link(song.rights.source_url, "Notation source"), " · ", link(song.rights.evidence_url, "Rights evidence")),
      el("ul", {}, ...song.sources.map((url, index) => el("li", {}, link(url, `Reference ${index + 1}`))))));
    return card;
  }

  function render() {
    if (!catalog) return;
    const songs = filterSongs(catalog.songs, search.value, category.value);
    const pageCount = Math.ceil(songs.length / pageSize);
    page = Math.min(page, Math.max(0, pageCount - 1));
    const start = page * pageSize;
    status.textContent = `${catalog.songs.length} playable song${catalog.songs.length === 1 ? "" : "s"} with documented reuse rights. Target: ${catalog.target_count}. ${songs.length} match your filters.`;
    list.replaceChildren(...songs.slice(start, start + pageSize).map(songCard));
    previous.disabled = page === 0;
    next.disabled = page + 1 >= pageCount;
    pageStatus.textContent = songs.length ? `Page ${page + 1} of ${pageCount}` : "No pages";
    if (!songs.length) {
      list.append(el("p", { class: "muted" }, catalog.songs.length
        ? "No songs match these filters. Try another title or category."
        : "No songs have passed the notation and reuse-rights checks yet. The 200-song target is not met. Public-domain words alone do not clear a modern melody or transcription."));
    }
  }

  async function load() {
    if (catalog || loading) return;
    loading = true;
    status.textContent = "Loading songs.";
    list.replaceChildren();
    try {
      catalog = await api("/api/songs");
      category.replaceChildren(el("option", { value: "" }, "All categories"),
        ...[...new Set(catalog.songs.map((song) => song.category))].sort()
          .map((name) => el("option", { value: name }, name)));
      render();
    } catch (error) {
      status.textContent = `Couldn't load songs. ${error.message}`;
      list.replaceChildren(el("button", { type: "button", onclick: load }, "Retry loading songs"));
    } finally {
      loading = false;
    }
  }

  const refilter = () => { stopPlayback(); page = 0; render(); };
  search.addEventListener("input", refilter);
  category.addEventListener("change", refilter);
  previous.addEventListener("click", () => { stopPlayback(); page = Math.max(0, page - 1); render(); });
  next.addEventListener("click", () => { stopPlayback(); page++; render(); });
  return { load, render };
}
