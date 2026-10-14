# Design revamp plan

Three design specs describe the revamp:

- [Structure and visual system](./01-structure-and-visual-system.md)
- [Learn journey](./02-learn-journey.md)
- [Compose journey](./03-compose-journey.md)

This page merges them into one build order and records the decisions that
resolve overlaps between the specs.

## Decisions

- **Navigation.** The header has three sections: **Learn**, **Compose**, and
  **Library**. **Learn** has three local tabs: **Overview**, **Compositions**,
  and **Practice**. Perform stays inside each composition, because it performs
  one composition. The URL hashes `#overview`, `#compositions`, `#improv`,
  `#compose`, and `#library` keep working.
- **First visit.** A welcome screen offers **Learn a raga** and **Compose in a
  raga**. It appears only when the browser has no saved raga and the URL has no
  section hash.
- **Sound bar.** Sa, tempo, taal, **Tanpura**, **Tabla**, and **Record** stay
  visible. Sa octave, tanpura settings, volumes, and the microphone move into
  **Sound**.
- **Keyboard dock.** The dock starts collapsed. It opens the first time you
  open **Compose**, and it remembers your choice after you toggle it.
- **Terms.** Raga facts and headings use term buttons that open a short
  definition. A **Glossary** dialog lists every term.
- **Learning path.** Six steps per raga, stored in `localStorage` under
  `swaramala.learnProgress.v1.RAGA`. Playback marks a step done; you can also
  mark or reset steps.
- **Phrase builder.** Builder fields write the prompt text. The prompt stays
  editable, and the generator reads only the prompt, so free text keeps
  working.
- **Validation.** Each warning shows a fix: replace the note with the nearest
  raga swara, or delete it. Saving is still allowed.
- **Deferred.** Call and response, composition drafts, library tags, recording
  rename, and dark mode are P1 or P2 and aren't in this pass.

## Build order

1. Visual tokens, focus styles, and component styles.
2. Header navigation, Learn tabs, and the welcome screen.
3. Compact sound bar, collapsed keyboard dock, and mobile fixes.
4. Term help and glossary.
5. Shared playback highlighting on the swara strip and phrase notes.
6. Overview phrase cards with play, loop, slower, and **Open in Compose**.
7. Learning path with saved progress.
8. Composition line controls, taal legend, and the performance plan.
9. Practice cards for alaap and taan.
10. Phrase builder and option cards in Compose.
11. Play-in panel, editor empty state, undo, redo, and clear.
12. Validation cards with fixes, and library empty states.
