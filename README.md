# Riyaaz your way

![Riyaaz your way logo](src/raga_composer/static/img/favicon.svg)

Riyaaz your way (रियाज़, "practice") helps you compose and practice Hindustani classical phrases. You choose a raga,
describe the phrase you want in plain words, and the app generates patterns that
obey the raga's aaroh, avroh, and varjit swaras. You can then arrange a pattern as
a taan, add held notes, play it on a piano with tanpura and tabla, save it, and
record your practice in your browser.

## Using the app

On your first visit, a welcome screen offers two starting points: **Learn a
raga** and **Compose in a raga**. After that, Riyaaz your way opens the last raga you
used.

The page has these parts:

- **Header**: the three sections, **Learn**, **Compose**, and **Library**, and
  the raga search. Click **Browse** to filter the 93 ragas by name, thaat, time
  of day, or whether they have compositions.
- **Sound bar**: the scale (Sa), tempo, taal, **Tanpura**, **Tabla**, and
  **Record**. Click **Sound** for the tanpura tuning and the volumes. On wide
  screens the bar stays at the top while you scroll.
- **Raga summary**: the raga's facts and swaras. Click an underlined term, such
  as **Vadi**, for a short definition, or click **Glossary** for every term.
  Next to the swaras, **Notes in** switches the notation between Latin letters
  (`S R G`) and Devanagari (सा रे ग) in Bhatkhande style: a line below for komal,
  a stroke above tivra Ma, a dot below for mandra, a dot above for taar, and ऽ
  for a held note. You always type with the Latin letters.
- **Learn**: three tabs and a learning path.
  - **Overview**: aaroh, avroh, pakad, and common patterns. Each phrase has
    **Play**, **Slower**, **Loop**, and **Open in Compose**.
  - **Compositions**: words and notation on the taal grid. You can play or loop
    a whole composition, one section, or one line, and preview the performance
    plan before you click **Perform with alaap and taan**.
  - **Practice alaap and taan**: practice cards that you can play, slow down,
    loop, or save. Alaap cards also have **Next phrase**.
  - The learning path marks a step as practiced when you play it. Progress is
    saved per raga in this browser.
- **Compose**: choose a contour, start and end swaras, beats, and options, or
  type a prompt. Click **Generate options**, then **Use in editor** on the
  option you like. The editor has undo and redo (Cmd+Z and Cmd+Shift+Z, or
  Ctrl+Z and Ctrl+Y), explains any note that breaks the raga, and offers a fix.
- **Library**: saved lines and recordings, with export and import.
- **Keyboard dock**: the instrument picker is always visible. Click
  **Keyboard** to show or hide the swara keyboard. The URL keeps the current
  view, so you can bookmark `/#compositions`, for example.

## Playing from the computer keyboard

When **Play from the computer keyboard** is on, the keys play swaras in the
current scale. Open **Keyboard settings** in the keyboard dock to see every key.

| Keys | Swaras |
|---|---|
| `S` `D` `V` `G` `H` `M` `,` `L` | `S` `R` `G` `m` `P` `D` `N` `S'` (shuddha) |
| `X` `C` `B` `N` `K` | `r` `g` `M` `d` `n` (komal and tivra) |

`Z` and `.` shift every key down or up an octave, between mandra, madhya, and
taar. Hold `Shift` while you play to replace the selected note instead of
inserting one.

Keys don't play while a text box has focus, so you can type. Press `Escape`
to leave the text box and play again. Keys are matched by the letter they
type, so the map follows the printed letters on QWERTZ and AZERTY keyboards.

## Features

- **Notation**: `S r R g G m M P d D n N`, with `S'` for taar saptak, `N.`
  for mandra saptak, `_` to hold a note, and `-` for a rest. Lowercase means
  komal and `M` is tivra Ma. `p` and `ni` are accepted as aliases for `P` and `n`.
- **Static site**: GitHub Pages serves HTML, CSS, JavaScript modules, images,
  and JSON data. The browser runs the music logic and stores your saved lines
  and recordings in IndexedDB. Use **Export library** to download a backup, and
  use **Import library** to restore it in another browser.
- **Raga reference**: thaat, jati, vadi and samvadi, time, varjit swaras, aaroh,
  avroh, pakad, and at least five common patterns for each of 93 built-in ragas
  across all ten thaats. **Browse all** lists them grouped by thaat. The
  raga data comes from general references; have a musician review it before
  you rely on it for teaching.
- **Intention-driven generation**: describe what you want, for example
  `ascending ending on S and has 16 beats`, `taan in teentaal, up and down,
  emphasize the vadi`, or `8 beats ending on Pa with held notes, use the pakad`.
  The app shows how it understood the text.
- **Arranging**: select notes and add `_` holds or rests, move or delete notes,
  type notation directly, or arrange the line as a taan (2 to 8 notes per beat),
  a palta (alankar) taan, or an elongated line. The line is checked against the
  raga as you edit.
- **Sound**: an on-screen piano labeled in swaras, a selectable scale for Sa
  (default `G#`), a tanpura with its own scale and first-string tuning, and a
  tabla playing the basic theka of 14 taals: Teentaal, Ektaal, Jhaptaal, Rupak,
  Keherwa, Dadra, Chautaal, Dhamar, Sooltaal, Teevra, Jhoomra, Tilwada,
  Adachautaal, and Deepchandi. Phrase playback starts on the next sam when the
  tabla is playing. All sounds are synthesized in the browser, so there are no
  sample files.
- **Instruments**: the keyboard plays 10 piano voices (concert, bright, and
  mellow grand; upright; honky-tonk; felt; tine, FM, and reed electric pianos;
  and toy piano) and 3 harmonium voices (double reed, single reed, and coupler
  with a bass reed). Keys sound for as long as you hold them. Voice presets
  live in `src/raga_composer/static/js/instruments.js`.
- **Compositions**: each raga shows its published compositions from published
  notation, laid out one taal cycle per row with sam, tali, and khali marked
  and the words under the notes. **Play** plays a composition or a single
  section on the selected piano or harmonium, highlights the current beat, and
  switches the tabla to the composition's taal when the app has it. **Open in
  Compose** loads it into the line editor. Compositions include khayals,
  dhrupads, taranas, sargam and lakshan geets, bhajans, and gats, in Teentaal
  and other taals. See [Compositions](#compositions) for sources and limits.
- **Perform with alaap and taan**: plays a composition on the tabla together
  with the raga's alaap and taan, in the composition's taal. The order is the
  sthayi; each sthayi alaap followed by the sthayi from its mukhda; the antara
  and a return to the sthayi; each antara alaap followed by the antara from its
  mukhda; then the sthayi taans and the antara taans; and the sthayi mukhda
  landing on sam. The *mukhda* is the first sung beat of a section, which is
  often a few matras before sam. Every alaap and taan ends exactly where the
  mukhda begins, so the words always start on their own matra.
  - **Alaaps**: after each alaap, you choose whether to sing half a line or a
    full line from the mukhda.
  - **Taans**: each taan is 8 or 16 beats and follows the composition. Before
    each taan, you sing from the mukhda through sam. The taan starts at the
    matra that lets it end on the mukhda, and it lands on the mukhda's first
    note, so it leads straight back into the words.

  You also choose whether to include alaap, taan, or both. The current phrase
  shows next to the button, and the beats highlight in both the composition and
  the **Alaap and taan** panel. If the tabla is off, the performance starts it
  and stops it at the end.
- **Alaap and taan**: for each raga, the app generates 7 free alaaps for the
  sthayi and 7 for the antara. Alaaps aren't fitted to the taal: each one
  widens the range a little (badhat), lingers on resting notes, and ends on a
  long note. It also generates 5 short (8-beat) and 2 long (16-beat) taans for
  each section in the taal selected for the tabla. Sthayi phrases stay in the
  mandra and madhya saptaks and resolve to Sa; antara phrases rise into the
  taar saptak and resolve to taar Sa. In **Perform**, the two long alaaps and
  the taans end on the first note of the composition's mukhda instead, when
  the raga allows it, and each alaap's last note is held until the mukhda.
  Every phrase is a walk on the raga's move graph, so it obeys the raga.
  The same raga and taal give the same phrases; **Regenerate** draws a new set.
- **Browser library**: **My library** stores saved lines and recordings in the
  current browser. No account or server receives this data. Browser storage can
  be cleared by browser settings, so export your library when you want a backup.

## Run locally

Requirements: Python 3.11 or later and [uv](https://docs.astral.sh/uv/).

```sh
make install
make site
make serve-site   # http://127.0.0.1:8000/raga-composer/
```

`make site` copies `src/raga_composer/static/` to `site/` and writes
`site/data/ragas.json`, `site/data/taals.json`, and
`site/data/compositions.json` from the Python package data. `site/` is ignored
by Git.

```sh
make test         # pytest
make check        # ruff + mypy
make format
```

The FastAPI server remains available for Python reference work:

```sh
make run          # http://127.0.0.1:8000
PORT=8077 make run
```

## Architecture

```text
GitHub Pages
   └── site/
       ├── index.html, 404.html, styles.css, images
       ├── js/          static ES modules
       └── data/        ragas, taals, and compositions as JSON

Browser
   ├── Web Audio and MediaRecorder for playback and recording
   ├── js/core/ for raga rules, generation, validation, arrange, and improvisation
   ├── js/local-api.js for the old API-shaped frontend adapter
   └── IndexedDB for saved lines and recordings

Python package
   ├── scripts/build_site.py exports runtime data
   └── Reference domain code
         notation.py   swara parsing and formatting
         raga.py       raga definitions → graph of allowed note moves
         intent.py     free text → structured Intention
         generator.py  constrained generation, validation, palta arrangement
         taal.py       taal cycles and tabla thekas
         compositions.py  traditional bandishes and their notation
         improvise.py  alaap and taan phrases for the sthayi and antara
```

### Deployment

The `Pages` workflow builds the static site on pushes to `main`, uploads
`site/` with `actions/upload-pages-artifact`, and deploys it with
`actions/deploy-pages`. The published URL is
`https://asawari44.github.io/raga-composer/`.

If the GitHub repository is renamed, the Pages URL changes with the repository
name. Update the `SITE_URL` constant in `scripts/build_site.py`, then rebuild
the site. The application uses relative URLs for runtime assets and data, so a
repository rename doesn't require changes in `index.html` or the JavaScript
modules.

The `CI` workflow runs on pull requests and pushes. It installs dependencies
with `uv sync`, then runs `ruff`, `mypy`, `pytest`, and `node --test tests/js`
when `tests/js` exists.

### How the raga is enforced

Each raga becomes a directed graph of allowed note-to-note moves: consecutive
aaroh notes (ascending moves), consecutive avroh notes (descending moves),
one-note leaps when the aaroh or avroh isn't vakra, moves found inside the pakad
and common patterns, and repeats. These moves are repeated in every octave. A
sequence obeys the raga when each consecutive pair of notes is an edge of the
graph. This handles varjit swaras, different swaras in ascent and descent (such
as `N` up and `n` down in Khamaj), and vakra movement.

The generator runs a weighted random walk over this graph. A backward
reachability table ensures that each walk ends on the requested note after
exactly the requested number of notes. The walk prefers moves in the requested
direction, emphasized swaras, the vadi and samvadi, and pakad fragments. The
generator samples many candidates and ranks them by contour match and raga
flavor. Because every move is an edge of the graph, every result obeys the raga.

## Compositions

`src/raga_composer/data/compositions.json` holds published compositions with
notation: traditional bandishes, khayals, dhrupads, taranas, sargam and lakshan
geets, bhajans, and instrumental gats. They're traditional, uncredited, or by
composers such as Sadarang, Manrang, and Vishnu Digambar Paluskar. Film songs
and compositions by living or recently deceased composers are left out because
they're still under copyright.

Every notated entry was transcribed from a page that publishes the full
swaralipi, and its `source` field links to that page. Most come from
[Vishwamohini](https://vishwamohini.com) and
[Saraswati Sangeet Sadhana](https://saraswatisangeetsadhana.in). The
transcription follows these rules:

- Each line is one avartan of the taal. Each beat holds the notes played evenly
  inside it, and empty beats before the first note are pickup beats.
- `first_matra` gives the matra of each line's first beat. It defaults to 1
  (sam). Sources that write each line from the mukhda, for example from matra 9
  of Teentaal, use `first_matra: 9`, and the app shifts the sam and khali marks
  and the playback to match.
- Kan swaras (grace notes) are left out, so meend and gamak aren't reproduced.
- The notation isn't checked against the raga's move rules, because
  traditional compositions sometimes use phrases outside the simplified rules.

If no open source with notation could be found for a raga, its entry has no
sections and its `notes` field says so. The app doesn't invent notation for
these ragas. Check any composition against a teacher or a printed source, such
as Bhatkhande's *Kramik Pustak Malika*, before you rely on it.

## Adding a raga

Add an entry to `src/raga_composer/data/ragas.json` with `aaroh`, `avroh`,
`pakad`, and at least five `patterns`, written in the notation described earlier.
The tests check that every phrase is consistent with the raga's rules.
