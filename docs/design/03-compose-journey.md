# Compose journey design spec

## Scope

This spec covers the **Compose** and **My library** journeys for Swaramala. It makes composing approachable for a beginner-to-intermediate Hindustani music student while preserving power-user notation entry.

Designer 1 owns the global shell, navigation, and visual tokens. Designer 2 owns the **Learn** journey. This spec references those areas only where the compose journey connects to them.

## Current UI evidence

Audited October 14, 2026, on the local preview at `http://127.0.0.1:8092/raga-composer/`.

### Desktop audit, 1280 px

- **Compose** starts with a blank free-text field labeled only by placeholder text: `For example: ascending ending on S and has 16 beats`.
- Example chips help, but they replace the whole request and don't teach which attributes matter.
- The form exposes **Beats**, **Notes per beat**, and **How many**, but not direction, start note, end note, pakad, or vadi emphasis.
- Generated options appear as unlabeled grids with repeated **▶ Play**, **Arrange**, and **Save line** actions. The options don't have names, comparison criteria, or a clear selected state.
- Each candidate shows a terse explanation such as `raga phrases 57%`, which doesn't tell a student why the line obeys Yaman.
- **Arrange the line** contains useful tools, but the mental model is hidden in one paragraph. The empty state says `Empty line. Generate a pattern or click piano keys.`
- Validation can say `Obeys Yaman.`, but violations list messages without an inline fix action or a nearby explanation of allowed swaras.
- **My library** says browser storage only and supports export/import, but saved lines have limited organization. There is no composition-building area for sthayi and antara sections.

### Mobile audit, 390 px

- Generated option grids become hard to scan because beat labels, notes, and actions stack without an option header.
- The bottom keyboard is harder to discover. The `#keyboard-hint` is hidden under `@media (max-width: 1100px)`, so the computer-key mapping is not visible on phones.
- **Add played notes to the line** and **Play from computer keyboard** live in the sticky dock, but the relationship to the editor is not visible from the compose panel.
- The key map exists in a `<details>` popover, but students must know to open **Key map** before learning the mapping.

## Design goals

- Never start from a blank compose prompt.
- Let students describe musical intent in familiar terms before they learn prompt syntax.
- Keep the same free-text `#intent` value as the source of truth so existing generation logic continues to work.
- Make each generated option auditable: what it is, how it differs, how it sounds, and why it is raga-true.
- Make arranging feel like editing notation, not operating a technical grid.
- Keep keyboard and on-screen instrument input discoverable at the moment students need it.
- Keep all data local to the browser. No accounts, servers, or sync.

## P0 changes

### P0.1 Replace the blank prompt with a guided phrase builder

Keep `#intent`, `#beats`, `#npb`, `#count`, and `generate()` as the compatibility layer. Add a guided builder before the free-text field. The builder writes to `#intent`; it also reads `#intent` when possible.

#### Layout

```text
1 Describe your phrase
[Preset chips: Pakad phrase] [Taan] [Landing phrase] [Question-answer]

Direction        Start note       End note
[Ascending v]    [Any v]          [Sa (S) v]

Length           Notes per beat   Generate
[16 beats]       [2 v]            [Generate 4 options]

[ ] Use pakad     [ ] Emphasize vadi (G)     [ ] End with nyas

Power user
[ ascending ending on S, 16 beats, 2 notes per beat, use the pakad ]
```

#### Controls and copy

- Heading: **Describe your phrase**.
- Helper text: `Choose a few musical details. Swaramala writes the prompt for you.`
- **Direction** options:
  - **Any shape** -> no contour phrase.
  - **Ascending** -> `ascending`.
  - **Descending** -> `descending`.
  - **Up and down** -> `up and down`.
  - **Valley** -> `valley`.
  - **Arch** -> `arch`.
- **Start note**: **Any**, then the raga's available notes from the swara strip, including octave variants where relevant.
- **End note**: **Any**, **Sa (S)**, **Vadi (G)**, **Samvadi (N)**, and available notes.
- **Length**: numeric stepper bound to `#beats`.
- **Notes per beat**: select bound to `#npb`.
- **How many**: move into the primary button label: **Generate 4 options**. Keep the existing `#count` control in an overflow row named **Option count** for users who need it.
- Checkboxes:
  - **Use pakad** -> `use the pakad`.
  - **Emphasize vadi (G)** -> `emphasize the vadi` using the current raga's vadi.
  - **End with nyas** -> `ending with a resting note`.
- Free-text disclosure label: **Power user prompt**.
- Free-text helper text: `You can edit the generated prompt. The builder updates when it recognizes your words.`

#### Text synchronization

Create a small phrase-intent model in `js/app.js` near `generate()`:

```js
state.intentBuilder = {
  contour: "ascending",
  start: "any",
  end: "S",
  beats: 16,
  notesPerBeat: 2,
  usePakad: true,
  emphasizeVadi: false,
  endNyas: false,
};
```

- On builder change, render a prompt string into `#intent`.
- On `#intent` input, parse known phrases and update matching controls without deleting unknown free text.
- If parsing is partial, show: `Builder read 4 details. Free-text additions stay in the prompt.`
- If parsing fails, keep the builder unchanged and show: `Power-user prompt active.`
- Preserve Enter-to-generate behavior in `#intent`.

#### Generated prompt examples

- `ascending from G ending on S, 16 beats, 2 notes per beat, use the pakad`
- `up and down ending on the vadi G, 8 beats, emphasize the vadi`
- `descending from S' ending on S, 12 beats, 1 note per beat`

### P0.2 Redesign generated options as comparable candidate cards

Replace the current unlabeled list in `renderPatterns()` with cards that have a stable option number, summary, score explanation, and one primary choice.

#### Card layout

```text
Option 1 · Landing on Sa
[notation grid]

Why it fits Yaman
✓ Uses only Yaman swaras: N. R G M D N S'
✓ Includes pakad movement: N R G, R S
△ Phrase match: 57%. Try **Use pakad** for a more characteristic line.

[▶ Play] [Use in editor] [Save to library]
```

#### Behavior

- **▶ Play** auditions only this option and highlights cells as today.
- **Use in editor** replaces **Arrange**. It loads the option into the editor and scrolls to **Arrange your line**.
- **Save to library** replaces **Save line**. If the line has no title, save it as `Yaman option 1, 16 beats`.
- Add **Compare options** as a sticky mini-table after generation on desktop:

```text
Option   Shape        Ends on   Pakad   Phrase match   Notes per beat
1        ascending    S         yes     57%            2
2        arch         M         no      43%            2
```

- On mobile, show the same data as chips inside each card.
- Add a selected state after **Use in editor**: `Using option 1 in the editor`.
- Keep **Regenerate** near the candidate list and rename it to **Regenerate options**. It must preserve builder settings and request a fresh seed if the engine supports it.

#### Explanation copy

Use student-facing language, not engine terms.

- `Uses only Yaman swaras: S R G M P D N`.
- `Avoids varjit swaras: r, g, m, d, n`.
- `Touches the vadi G twice.`
- `Ends on Sa, which gives the phrase a resting point.`
- `Matches 57% of known Yaman phrase movements.`

### P0.3 Make the arrange editor read like a notation editor

Rename the section to **Arrange your line** and split the editor into three visible zones: notation, selected-note tools, and whole-line transformations.

#### Empty state

Replace `Empty line. Generate a pattern or click piano keys.` with:

```text
Start with a line
- Choose **Use in editor** from a generated option.
- Play notes on the keyboard dock.
- Type notation, such as `N. R G _ M D N S'`.
```

Show this in `#editor-grid` before a line exists.

#### Notation grid

- Add beat group headers: **Beat 1**, **Beat 2**, **Beat 3**, **Beat 4**.
- Keep click-to-select behavior.
- Add a visible insertion marker after the selected cell: `Next note goes here`.
- Add a compact toolbar above the grid:
  - **Undo** and **Redo**. P1 if history is too large for the first pass, but reserve the UI now.
  - **Play line**.
  - **Clear line**.
- Maintain current tokens:
  - `_` means hold.
  - `-` means rest.
  - Swara notation keeps current spelling.

#### Selected-note tools

Keep the existing operations and clarify labels:

- **Hold `_`**: `Add hold after selected note`.
- **Rest `-`**: `Add rest after selected note`.
- **Delete note**.
- **Move left**.
- **Move right**.

If no note is selected, disable note-specific actions and show: `Select a note to edit it.`

#### Whole-line tools

Keep current `arrange(mode)` behavior and relabel with helper text:

- **As taan**: `Increase density with the selected taan speed.`
- **As palta**: `Turn the line into a repeated practice pattern.`
- **Elongate**: `Add holds to stretch the phrase.`
- **Remove holds**: `Remove `_` tokens and tighten timing.`

Move **Notes per beat** next to the grid title, not under the text input. Changing it updates `state.npb`, re-renders beat grouping, and validates the line.

#### Typing notation

- Keep `#editor-text` visible under the grid.
- Label it **Type notation** instead of relying on placeholder text.
- On invalid syntax, show an inline error below the field: `Swaramala doesn't recognize "Q". Use S R G m P D N, _ for hold, or - for rest.`
- Add **Apply typed line** for users who paste a line and expect an explicit commit.
- Keep live parsing for current behavior, but don't replace the grid while the user is midway through an invalid token.

### P0.4 Add validation that teaches and fixes

Keep `validateLine()` and `#violations`, but render each issue as a fixable card.

```text
Note 5: `r` is not in Yaman
Yaman uses shuddha Re (`R`) instead of komal Re (`r`).
[Replace with R] [Delete note] [Keep with warning]
```

#### Rules

- Highlight invalid notes in the grid with a visible outline and `aria-invalid="true"`.
- Focus the first invalid cell after validation if the user clicks **Review warnings**.
- Include the raga name and allowed notes in every message.
- Save with warnings remains allowed, but **Save line** changes to **Save with warnings** while violations exist.
- When no issues exist, show: `This line obeys Yaman.`

#### Fix suggestions

- For komal versus shuddha mismatch, suggest the nearest allowed spelling: `r` -> `R`, `g` -> `G`, `d` -> `D`, `n` -> `N`, `M` -> `m` when the raga doesn't allow tivra Ma.
- For a note outside the raga, suggest **Delete note** and the nearest allowed neighbor.
- For unknown tokens, suggest **Delete token**.

### P0.5 Make playing notes in discoverable inside Compose

The bottom dock can remain global, but **Compose** needs a local reminder tied to the editor.

#### Add a play-in panel above the editor grid

```text
Play notes in
[Instrument: Harmonium v] [Add played notes to line: On]
Computer keys
S D V G H M , L  ->  S R G m P D N S'
X C B N K        ->  r g M d n
Z / .            ->  octave down / up
[Show full keyboard map]
```

#### Behavior

- Reuse `#instrument`, `#piano-input`, `#keyboard-play`, `#key-map`, and `renderKeyMap()`.
- The local **Add played notes to line** switch mirrors `#piano-input`.
- If the switch is off, show: `Played notes sound but don't change the line.`
- If the editor text field has focus and the user presses a mapped key, show: `Press Esc to leave typing mode and play notes from the computer keyboard.`
- On mobile, keep the legend visible as a horizontal scroll row. Don't hide the essential mapping.
- Keep the dock's full on-screen piano and harmonium keys. The local panel is a discoverability layer, not a duplicate instrument.

## P1 changes

### P1.1 Add undo and redo

Add `state.editorHistory` and `state.editorFuture` around every `lineChanged()` source:

- candidate load
- typed line apply
- piano press
- selected-note operation
- whole-line arrangement
- notes-per-beat change
- clear line

Copy: **Undo** and **Redo**. Disable when unavailable. Keyboard shortcuts: `Cmd+Z`, `Ctrl+Z`, `Cmd+Shift+Z`, and `Ctrl+Y` when focus is not in `#intent` or `#editor-text`.

### P1.2 Add library organization

Extend **My library** so saved lines can become named sections.

```text
Saved lines
[Search lines] [Filter: All ragas v] [Sort: Recent v]

Yaman · Evening practice
[▶] [Open in Compose] [Add to sthayi] [Add to antara] [Rename] [Delete]
```

- Add inline title editing.
- Add tags: **Alaap**, **Taan**, **Pakad**, **Sthayi**, **Antara**, and **Practice**.
- Keep browser storage only.
- Export/import includes tags and section placement.

### P1.3 Build a composition from saved lines

Add a **Composition draft** panel in **My library**.

```text
Composition draft
Title [ Evening Yaman study ]
Sthayi
[Line card] [Line card]
Antara
[Line card]
[▶ Play draft] [Export draft JSON] [Clear draft]
```

- A line can be added from **Compose** after saving: **Add to sthayi** and **Add to antara**.
- Reorder lines with **Move up** and **Move down**.
- Store drafts in browser storage with the library.
- Export draft as JSON in the existing export file.

### P1.4 Improve recordings

In **Recordings**, add:

- Inline rename.
- Raga, taal, tonic, duration, and created date metadata.
- **Attach to draft** when a composition draft exists.
- **Download audio** as a distinct action from export/import.

## P2 changes

### P2.1 Add phrase recipes

Add recipe cards that set builder fields:

- **Pakad practice**: use pakad, 8 beats, 2 notes per beat.
- **Taan burst**: up and down, 16 beats, 4 notes per beat.
- **Nyas landing**: descending, end on Sa, 8 beats.
- **Vadi focus**: emphasize vadi, 12 beats.

### P2.2 Add teacher-friendly share text

Because there are no accounts, export a text summary for a line:

```text
Raga: Yaman
Line: N. R G M D N S'
Notes per beat: 2
Intent: ascending ending on S, 8 beats
Warnings: none
```

Copy action: **Copy lesson note**.

## Accessibility requirements

- Every builder control has a persistent label, not only placeholder text.
- Candidate cards use headings, such as **Option 1**, so screen reader users can jump between options.
- The notation grid keeps 24 px minimum targets and visible focus indicators.
- Invalid notes expose `aria-invalid="true"` and an `aria-describedby` reference to the validation card.
- The key legend uses text, not color alone.
- All popovers and disclosures work with keyboard input and close with `Esc`.
- Buttons that mutate a line announce status through an `aria-live="polite"` region, for example `Added R after beat 2`.

## Implementation notes

- Update `src/raga_composer/static/index.html` inside `#view-compose`, `#view-library`, and the existing keyboard dock only.
- Update `src/raga_composer/static/js/app.js` functions: `generate()`, `renderPatterns()`, `loadLine()`, `renderEditor()`, `validateLine()`, `editOp()`, `arrange()`, `pianoPress()`, `addToLine()`, `saveLine()`, `loadSavedLines()`, `loadRecordings()`, `renderKeyMap()`, and initialization near the current event listeners.
- Update `src/raga_composer/static/styles.css` with class-based styling only. Don't add inline `style` attributes in HTML strings.
- Preserve CSP, relative URLs, static hosting, and vanilla JavaScript.
- Don't redesign the generation, validation, audio, or storage engines. Adapt their inputs and outputs to clearer UI.

## Implementation order

1. Ship the guided builder that writes and reads `#intent`, while preserving the existing free-text generation path.
2. Replace generated options with labeled candidate cards and clearer raga explanations.
3. Add the compose-local key legend and **Add played notes to line** mirror.
4. Improve editor empty state, labels, selected-note tool states, and **Clear line**.
5. Add validation cards with one-click fixes and save-with-warning states.
6. Add notes-per-beat placement and beat headers in the grid.
7. Add undo and redo history.
8. Add library search, tags, inline rename, and richer export/import metadata.
9. Add composition drafts for sthayi and antara.
10. Add recording rename, metadata, draft attachment, and audio download.
