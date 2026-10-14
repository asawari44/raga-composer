# Swaramala

![Swaramala logo](src/raga_composer/static/img/favicon.svg)

Swaramala (स्वरमाला, "a garland of swaras") helps you compose Hindustani classical phrases. You choose a raga,
describe the phrase you want in plain words, and the app generates patterns that
obey the raga's aaroh, avroh, and varjit swaras. You can then arrange a pattern as
a taan, add held notes, play it on a piano with tanpura and tabla, save it, and
record your practice to your account.

## Using the app

The page has four parts:

- **Top bar**: search for a raga, or click **Browse all** to filter the 93
  ragas by name, thaat, or time. The number next to a raga is how many
  compositions with notation it has.
- **Sound bar**: stays at the top while you scroll. It holds the scale (Sa),
  tempo, **Tanpura** and **Tabla** with the taal, **Sound settings** (tanpura
  tuning and volumes), and **Record**. The tabla theka appears while the tabla
  plays.
- **Raga summary and tabs**: the raga's facts and swaras, a **How to read the
  notation** guide, and five tabs: **Overview** (aaroh, avroh, pakad, and
  patterns), **Compositions**, **Alaap and taan**, **Compose** (generate and
  arrange a line), and **My library** (saved lines and recordings). The tab is
  kept in the URL, so you can bookmark `/#compositions`, for example.
- **Keyboard dock**: the swara keyboard and instrument picker at the bottom of
  the window. Click **Keyboard** to hide or show it.

## Playing from the computer keyboard

When **Play from computer keyboard** is on, the keys play swaras in the
current scale. Click **Key map** in the keyboard dock to see every key.

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
  Adachautaal, and Deepchandi. Phrase playback starts on the next sam when the tabla is playing.
  All sounds are synthesized in the browser, so there are no sample files.
- **Instruments**: the keyboard plays 10 piano voices (concert, bright, and
  mellow grand; upright; honky-tonk; felt; tine, FM, and reed electric pianos;
  and toy piano) and 3 harmonium voices (double reed, single reed, and coupler
  with a bass reed). Keys sound for as long as you hold them. Voice presets
  live in `static/js/instruments.js`.
- **Compositions**: each raga shows its published compositions from
  published notation, laid out one taal cycle per row with sam, tali, and khali
  marked and the words under the notes. **Play** plays a composition or a single
  section on the selected piano or harmonium, highlights the current beat, and
  switches the tabla to the composition's taal when the app has it. **Open in
  Compose** loads it into the line editor. Compositions include khayals,
  dhrupads, taranas, sargam and lakshan geets, bhajans, and gats, in
  Teentaal and other taals. See [Compositions](#compositions) for sources
  and limits.
- **Perform with alaap and taan**: plays a composition on the tabla together
  with the raga's alaap and taan, in the composition's taal. The order is the
  sthayi; each sthayi alaap followed by the sthayi's first line; the antara and
  a return to the sthayi; each antara alaap followed by the antara's first
  line; then the sthayi and antara taans in the same way; and a closing line
  that lands on sam. You choose whether each return plays the first half or the
  full first line, and whether to include alaap, taan, or both. Each phrase is
  placed so that it ends where the line begins, so the line always starts on its
  own matra. The current phrase shows next to the button, and the beats
  highlight in both the composition and the **Alaap and taan** panel. If the
  tabla is off, the performance starts it and stops it at the end.
- **Alaap and taan**: for each raga, in the taal selected for the tabla, the
  app generates 5 short and 2 full-avartan alaaps for the sthayi and for the
  antara, and 5 short and 2 double-avartan taans for each. Sthayi phrases stay
  in the mandra and madhya saptaks and resolve to Sa; antara phrases rise into
  the taar saptak and resolve to taar Sa. Alaaps move at two slots per beat
  with held notes; taans move at four notes per beat and end on a held Sa.
  Every phrase is a walk on the raga's move graph, so it obeys the raga.
  The same raga and taal give the same phrases; **Regenerate** draws a new set.
- **Accounts**: sign in to save lines and recordings. **Record** captures
  everything the app plays plus your microphone. From the account menu you can
  change your password or sign out on every device.

## Sign-in security

- Passwords are hashed with scrypt in a versioned format. Older hashes are
  upgraded the next time the user signs in.
- New passwords need at least 8 characters and can't contain the username or be
  a common password.
- Sessions use a random token in an `HttpOnly`, `SameSite=Lax` cookie. The
  database stores only a SHA-256 hash of the token. Sessions expire after 30
  days without use, and after 90 days in any case.
- After 10 failed sign-ins for one account, or 30 from one address, within 15
  minutes, the server returns `429` with a `Retry-After` header. Registrations
  are limited to 10 per address per hour. The counters live in memory, so they
  suit a single server process.
- Changing your password signs out every other session.
- The server rejects cross-site `POST`, `PUT`, `PATCH`, and `DELETE` requests to
  `/api/`, and sends a Content Security Policy and other security headers.

| Environment variable | Effect |
|---|---|
| `COOKIE_SECURE=1` | Marks the session cookie `Secure`. Set this behind HTTPS. |
| `TRUST_PROXY=1` | Uses `X-Forwarded-For` for the client address. Set this only behind a trusted proxy. |

## Run locally

Requirements: Python 3.11 or later and [uv](https://docs.astral.sh/uv/).

```sh
make install
make run          # http://127.0.0.1:8000
PORT=8077 make run
```

Data is stored in `var/` (SQLite database and recording files). To use another
location, set `RAGA_DATA_DIR`.

```sh
make test         # pytest
make check        # ruff + mypy
make format
```

## Architecture

```
Browser (static HTML/CSS/ES modules, Web Audio, MediaRecorder)
   │  JSON over HTTP, session cookie
   ▼
FastAPI app (raga_composer.api)
   ├── Domain (pure Python, no I/O)
   │     notation.py   swara parsing and formatting
   │     raga.py       raga definitions → graph of allowed note moves
   │     intent.py     free text → structured Intention
   │     generator.py  constrained generation, validation, palta arrangement
   │     taal.py       taal cycles and tabla thekas
   │     compositions.py  traditional bandishes and their notation
   │     improvise.py  alaap and taan phrases for the sthayi and antara
   └── Storage (storage.py)
         Repository   SQLite: users, sessions, lines, custom ragas, recordings
         BlobStore    local filesystem for audio
```

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

### Why this architecture

- **A single Python service** keeps the music logic in one testable place and
  serves the UI, so local development needs one command.
- **Domain code without I/O** can be reused by a CLI, a notebook, or a separate
  worker without changes.
- **A frontend without a build step** keeps the project small. Audio runs in the
  browser, so the server never processes audio in real time.
- **Storage interfaces** let you replace SQLite and local files with managed
  services without touching the API.

### Path to hosting

1. Build the included `Dockerfile` and deploy it to a container platform such as
   Cloud Run.
2. Replace `Repository` with a PostgreSQL implementation (for example, Cloud SQL)
   and add migrations with Alembic.
3. Replace `LocalBlobStore` with an object storage implementation (for example,
   Cloud Storage) and serve recordings with signed URLs.
4. Set `COOKIE_SECURE=1` behind HTTPS, and `TRUST_PROXY=1` behind a trusted
   proxy. If you run more than one instance, move the sign-in throttle counters
   to a shared store such as Redis. Optionally, add sign-in through an identity
   provider (OAuth or OIDC).
5. If the UI grows, move it to a separate SPA served from a CDN. The JSON API
   doesn't need to change.

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
Signed-in users can also add custom ragas with `POST /api/ragas`.
