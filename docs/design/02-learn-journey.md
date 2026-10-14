# Learn journey design spec

## Scope

This spec covers the **Overview**, **Compositions**, and **Alaap and taan** tabs for Swaramala. It makes learning a raga guided, audible, and practice-oriented. It keeps the static site, vanilla JavaScript, current audio engine, relative URLs, CSP requirements, and the existing keyboard mapping.

Designer 1 owns the global shell, navigation, and visual tokens. This spec refers to those areas only where the learn journey needs shared controls. Designer 3 owns the Compose journey. This spec keeps **Open in Compose** as a boundary action.

## Browser audit evidence

Desktop audit at `http://127.0.0.1:8092/raga-composer/`, 1280 px wide:

- **Overview** lists aaroh, avroh, pakad, and common patterns with **▶** and **Edit**, but playback does not show the current note in the phrase row or swara strip. The piano flashes, but the swara strip does not.
- Raga facts appear as compact chips in the header. They are useful, but beginners need context for **Vadi**, **Samvadi**, **Varjit**, **Thaat**, and **Time**.
- **Compositions** has a composition index, **▶ Play all**, **▶ Perform with alaap and taan**, **Open in Compose**, section-level play, and `.comp-words` before notation. It lacks line-level practice controls, section navigation inside long compositions, and a visible performance plan.
- Composition grids show vibhag markers such as `X`, `0`, `2`, and `3`, but the UI does not explain sam and khali near the grid.
- **Alaap and taan** lists many generated phrases with **▶**, **Edit**, and **Save**. The page does not show a sequence through the practice material or a repeat workflow.

Mobile audit at about 390 px wide:

- The tab row overflows horizontally; **Alaap and taan**, **Compose**, and **My library** extend past the viewport.
- The raga picker and **Browse all** push past the viewport.
- `.comp-words` can be wider than the visible area because its minimum column width is 16 rem.
- Long composition rows require horizontal scrolling. That behavior is acceptable for notation, but controls and section navigation must remain reachable before each grid.

## Design principles

- Put listening before notation reading.
- Show the current learning step, the current beat, and the current note during playback.
- Keep every generated or composed phrase reversible: students can listen, repeat, loop, save, or open it in Compose.
- Preserve all current features. If a feature moves, keep the same capability and label it clearly.
- Meet WCAG 2.2 AA: keyboard access, visible focus, clear labels, 24 px minimum targets, and sufficient contrast.

## P0 changes

### 1. Add a guided raga overview player

**Existing code touched:** `renderRagaInfo()`, `phraseRow()`, `renderNotationBar()`, `renderPiano()`, `playTokens()`, and CSS near `.phrase`, `.nkey`, and `.playing`.

Replace the single list in **Overview** with a learning card and phrase groups.

Exact heading and copy:

- Heading: **Learn the shape of Yaman**
- Helper text: `Start with the ascent and descent, then learn the pakad and common patterns. Use slow playback when you want to sing along.`
- Raga facts helper text:
  - **Thaat**: `Parent scale`
  - **Time**: `Traditional singing time`
  - **Vadi**: `Most important swara`
  - **Samvadi**: `Second important swara`
  - **Varjit**: `Notes avoided or skipped`

Wireframe:

```text
[Learning path: 1 of 6 complete] [Reset progress]

Learn the shape of Yaman
Tivra Ma, all other swaras shuddha...

[Sa strip with active playback note]

Aaroh and avroh
[▶ Play] [Loop] [Slower] [Open in Compose]
N.  R  G  M  D  N  S'
^ current note highlight during playback

Pakad
[▶ Play all] [Sing along]
1. N. R G R S       [▶] [Loop] [Open in Compose]
2. P M G R          [▶] [Loop] [Open in Compose]
3. N. R S           [▶] [Loop] [Open in Compose]

Common patterns
[pattern cards, at least five]
```

Behavior:

- **▶ Play** plays one phrase with the current tempo.
- **Loop** repeats the phrase until the student clicks **Stop loop**.
- **Slower** plays at 70% of the current tempo for that phrase only. It must not permanently change the sound bar tempo.
- **Sing along** plays the phrase twice: first normal volume, then 40% volume. It uses the same visible highlight.
- **Open in Compose** replaces **Edit** for user-facing copy, but calls the existing `loadLine()` boundary action.
- During playback, highlight:
  - The current token in the phrase row.
  - The matching swara in `#notation-keys` with `.playing`.
  - The matching piano key, using the existing `flashKey()` behavior.
- If the phrase contains a rest or hold, keep the preceding note highlight until the next note.
- If a raga has fewer than five patterns, show all of them and add the note `More patterns can be generated in Compose.`

States:

- Empty raga: keep current `Choose a raga to see its aaroh, avroh, pakad, and common patterns.`
- Loading: show `Loading raga details.` in the overview panel.
- Error: show the existing error and **Browse all ragas** action.

Accessibility:

- Use full button labels, such as **Play aaroh**, not icon-only **▶** labels. The visible label can be **▶ Play**, but `aria-label` must include the phrase type.
- Do not rely on color alone. Add `aria-current="true"` to the active token, and use a visible outline or underline.

### 2. Add a local learning path

**Existing code touched:** `renderRagaInfo()`, `showTab()`, `renderCompositions()`, `renderImprovisations()`, and a new small progress helper in `app.js`.

Add a compact learning path at the top of **Overview** and repeat it as a collapsed strip at the top of **Compositions** and **Alaap and taan**.

Steps:

1. **Listen to aaroh and avroh**
2. **Learn the pakad**
3. **Learn the bandish sthayi**
4. **Learn the antara**
5. **Practice alaap**
6. **Practice taan**

Behavior:

- Store progress in `localStorage` with key `swaramala.learnProgress.v1.<raga-name>`.
- Store a JSON object: `{ "aarohAvroh": true, "pakad": true, "sthayi": false, "antara": false, "alaap": false, "taan": false }`.
- Mark a step complete when the student finishes a related playback or clicks **Mark practiced**.
- Show progress copy: `2 of 6 steps complete`.
- Add **Reset progress** with confirmation text: `Reset learning progress for this raga?`.
- If `localStorage` is unavailable, keep the path visible for the session and show no error.

Mobile behavior:

- Render the path as a horizontal scroll list with snap points.
- Each item must have at least a 44 px height.
- Keep the current step visible after a tab change.

### 3. Rework compositions into list and detail practice

**Existing code touched:** `renderCompositions()`, `compositionLines()`, `expandBeats()`, `playComposition()`, `taalMarkers()`, `renderGrid()` only if shared grid helpers are reused, and CSS near `.comp-index`, `.composition`, `.comp-line`, and `.cbeat`.

Keep the current single-page behavior, but make each composition read like list to detail.

List card copy:

```text
Mohan murali adhar bajave
Sargam geet · Teentaal · Madhya laya
[Learn this bandish]
```

Detail header:

```text
Mohan murali adhar bajave
Sargam geet · Teentaal · Madhya laya · Traditional · Source
[▶ Play whole] [Practice sthayi] [Practice antara] [Perform with alaap and taan] [Open in Compose]
```

Behavior:

- Keep the composition index for fast jumps, but change each link label to **Learn this bandish** or **Learn this tarana** based on `comp.type`.
- Add a section navigation row inside each composition:
  - **Words**
  - **Sthayi**
  - **Antara** if present
  - **Performance plan**
- Clicking a section navigation item scrolls within the composition card, not the whole page header.
- Keep `.comp-words` before notation. Use the existing words data.
- Add line-level controls before each notation row:
  - **▶ Play line**
  - **Loop line**
  - **Mark practiced**
- Keep section-level play, but label it **▶ Play sthayi** or **▶ Play antara**.
- Keep whole-composition playback, but label it **▶ Play whole**.
- During playback, keep the current `.cbeat.playing` behavior and add `aria-current="true"` to the active beat.
- The line loop repeats until the student clicks **Stop loop**.
- When a line finishes, move focus only if the student started playback from the keyboard. Do not move focus after pointer activation.

Taal grid requirements:

- Above every grid, add a compact legend:
  - `X = sam`
  - `0 = khali`
  - `2, 3, 4 = vibhag starts`
- Keep markers in the `.mk` row of `.cbeat`.
- Emphasize sam with a stronger border and a `Sam` screen-reader label.
- Emphasize khali with a lighter border and a `Khali` screen-reader label.
- If `compositionTaal(comp)` falls back to a same-beat taal, show `Tabla uses Teentaal because Punjabi has no saved theka.` Use the actual taal names.

Mobile behavior:

- Keep line controls and section navigation outside the horizontally scrolling notation area.
- Let only `.grid-wrap` scroll horizontally.
- Reduce `.comp-words` to one column with `minmax(0, 1fr)`.
- Keep the active beat within view during playback by scrolling the `.grid-wrap` container, not the page.

States:

- No compositions: keep `No traditional compositions are recorded for RAGA yet.` Add **Practice alaap and taan** as the next action.
- Composition without notation: keep `Notation for this composition isn't available yet.` Add **Open in Compose** only if a phrase can be loaded.
- Playback error: show an inline message near the failed controls and keep the rest of the composition usable.

### 4. Make **Perform with alaap and taan** understandable

**Existing code touched:** `buildPerformance()`, `performComposition()`, `performOptions()`, and `renderCompositions()`.

Add a visible **Performance plan** panel in each composition detail. It must mirror the actual `buildPerformance()` labels so the UI does not explain a different sequence than the player uses.

Exact panel copy:

```text
Performance plan
Swaramala sings the bandish, adds alaap and taan, and returns to the mukhda at the right sam.
```

Plan item examples:

```text
1. Sthayi
2. Sthayi alaap 1 of 5
3. Return to sthayi mukhda
4. Antara
5. Return to sthayi mukhda
6. Sthayi taan 1 of 6, 8 beats
7. Antara taan 1 of 6, 16 beats
8. End on sthayi mukhda
```

Behavior:

- Show the plan before playback when the composition renders.
- When **Perform with alaap and taan** starts, highlight the current plan item as `aria-current="step"`.
- Keep the existing performance status text, but make it secondary to the visible plan.
- Use `buildPerformance()` as the source of plan labels. If needed, return a `plan.steps` array that includes `label`, `startIndex`, `beatCount`, and `kind`.
- Preserve the current musical rules:
  - After each alaap, return to the mukhda.
  - Each taan is 8 or 16 beats.
  - Before each taan, sing from the mukhda through sam.
  - Each taan ends on the mukhda.
- Add **Preview plan** for students who want to inspect the sequence without starting audio. It expands the plan panel.

Perform options copy:

- Rename **Perform options** to **Performance options**.
- Replace `After each alaap, sing` with `After each alaap, return with`.
- Keep options:
  - `half a line from the mukhda`
  - `a full line from the mukhda`
- Replace helper copy with `Taans are 8 or 16 beats. Each taan starts after the mukhda lead-in and lands back on the mukhda.`

### 5. Make alaap and taan practice sequential

**Existing code touched:** `renderImprovisations()`, `loadImprovisations()`, `playTokens()`, `saveLine()`, and CSS near `.improv`.

Add a practice header and sequence controls to **Alaap and taan**.

Exact copy:

```text
Practice alaap and taan in Yaman
Listen, repeat, then move to the next phrase. Sthayi phrases stay lower; antara phrases rise to taar Sa.
[Practice mode: Listen] [Call and response] [New set]
```

Group structure:

- **Sthayi alaap**
  - Short phrases
  - Full avartan phrases
- **Antara alaap**
  - Short phrases
  - Full avartan phrases
- **Sthayi taan**
  - **8-beat taans**
  - **16-beat taans**
- **Antara taan**
  - **8-beat taans**
  - **16-beat taans**

Phrase controls:

- **▶ Listen**
- **Repeat**
- **Loop**
- **Save**
- **Open in Compose**
- **Mark practiced**

Behavior:

- **Listen** plays once.
- **Repeat** replays the current phrase and keeps focus on the same card.
- **Loop** repeats until **Stop loop**.
- **Next phrase** appears after playback finishes.
- Mark the current practice card with `aria-current="true"`.
- Highlight the active beat using the existing `.improv-beats span.playing` style and add the swara strip highlight described for Overview.
- Completing any alaap phrase can mark learning path step 5 complete.
- Completing any taan phrase can mark learning path step 6 complete.

Call-and-response P1/P2:

- P1: Add **Call and response** mode for one phrase.
  - App cycle: play phrase once.
  - Student cycle: keep tanpura and tabla running, mute melody for one cycle, and show `Your turn`.
  - Then show **Again** and **Next phrase**.
- P2: Add a configurable silent cycle count for teachers.
  - Copy: **Silent cycles** with options `1`, `2`, and `4`.

States:

- Loading: `Generating practice phrases.`
- Error: keep the existing API error and add **Try another set**.
- No generated groups: `No practice phrases are available for this raga and taal.` Add **Change taal** guidance that points to the sound bar.

## P1 changes

### 6. Add practice history for lines and phrases

- Store practiced composition lines in `localStorage` key `swaramala.lineProgress.v1.<raga-name>.<composition-title>`.
- Use line IDs based on composition index, section index, and line index.
- Show `Practiced` on completed lines.
- Add **Show unpracticed lines** filter in each composition.

### 7. Add teacher-friendly tempo helpers

- Add **Practice tempo** choices near learning controls: `Slow`, `Medium`, and `Current tempo`.
- Map `Slow` to 70% of the sound bar tempo and `Medium` to 85%.
- Do not persist these choices unless Designer 1 adds shared preferences.

### 8. Add compact theory help

- Add **What does this mean?** details under the raga facts.
- Define aaroh, avroh, pakad, vadi, samvadi, varjit, thaat, sam, khali, sthayi, antara, alaap, and taan.
- Keep each definition to one sentence.

## P2 changes

### 9. Add optional student recording compare

- After a loop or call-and-response cycle, offer **Record my try**.
- Reuse the existing sound bar recording feature.
- Do not add pitch scoring in this phase.

### 10. Add phrase difficulty labels

- Add generated labels such as **Good first phrase**, **Wide jumps**, or **Fast turn** based on token count, octave changes, and notes per beat.
- Keep labels descriptive. Do not score students.

## Accessibility requirements

- Every icon button must have a visible text label or an `aria-label` that names the exact object, such as `Play sthayi line 2`.
- Playback state must be exposed with `aria-live="polite"` and `aria-current` on the active note, beat, or plan step.
- Looping controls must change label from **Loop** to **Stop loop**.
- Keyboard users must be able to tab through section navigation, line controls, and phrase controls without entering the horizontal notation grid cell by cell.
- Focus outlines must be visible on all controls and active practice cards.
- Touch targets must be at least 24 px, with 44 px preferred for primary mobile controls.

## Implementation notes

- Do not add inline `style` attributes in generated HTML strings. Use classes. Existing dynamic piano positioning can keep using JavaScript-set styles.
- Keep `playTokens()` as the central playback hook. Extend it with optional callbacks or metadata for swara-strip highlights, loop mode, and tempo multiplier.
- Add a small `playMode` state object rather than duplicating playback state across overview, compositions, and improvisations.
- Use CSS classes such as `.learn-path`, `.phrase-card`, `.line-practice`, `.performance-plan`, `.plan-step`, `.practice-card`, and `.is-current`.
- Keep generated text in `app.js` so the static build has no new templates or framework dependency.

## Implementation order

1. Add shared playback highlighting for phrase tokens, swara strip notes, piano keys, and `aria-current`.
2. Replace **Overview** phrase rows with guided phrase cards, loop controls, slower playback, and clearer raga fact help.
3. Add the local learning path and progress storage for one raga.
4. Add composition detail navigation, taal legend, line controls, and line loop playback.
5. Add the visible **Performance plan** and connect it to `buildPerformance()` labels.
6. Rework **Alaap and taan** into sequential practice cards with **Listen**, **Repeat**, **Loop**, **Next phrase**, and **Mark practiced**.
7. Add P1 call-and-response for one phrase and store line-level practice history.
8. Validate desktop and mobile layouts, keyboard navigation, screen-reader labels, localStorage fallback, and the static GitHub Pages build.
