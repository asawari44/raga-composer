# Structure and visual system spec
## Scope
This spec defines the shared shell for Swaramala:
- First-visit orientation, top-level navigation, and raga selection.
- Global chrome, sound controls, and keyboard dock behavior.
- Shared visual tokens, components, focus states, and notation grid styling.
- Inline help for Hindustani terms.
Designers 2 and 3 own the detailed Learn and Compose screens.
## Current UI audit
Desktop at 1280 px:
- The app opens to **Raga Yaman** with five peer tabs: **Overview**, **Compositions 3**, **Alaap and taan**, **Compose**, and **My library**.
- The page exposes 297 controls and 268 buttons. The first screen mixes raga search, audio controls, swara buttons, tabs, content controls, and keyboard controls.
- The header shows the brand, but not the two core jobs: learn a raga and compose in it.
- Hidden tab panels remain in the DOM. Keep `hidden`, `aria-selected`, `tabindex`, and focus management correct when the structure changes.
Mobile at 390 px:
- Header height is 107 px, sound controls height is 223 px, and the first heading starts at 344 px.
- The main tabs start at 698 px, so the visitor does not see the path choice in the first viewport.
- **Alaap and taan**, **Compose**, and **My library** overflow the tab strip.
- Keyboard help and the key map overflow horizontally.
## P0 information architecture
### Product promise
Use this promise on first visit and in the selected-raga hero:
> Learn the shape of a raga. Compose phrases that stay inside it.
Supporting line:
> Choose a raga, hear its swaras, study compositions, or generate and arrange your own line.
### Top-level model
Use two primary paths and one personal area:
- **Learn**: Understand a raga, study compositions, practice alaap and taan, and perform.
- **Compose**: Generate, arrange, play, save, and record raga-true lines.
- **Library**: Saved lines and recordings from this browser.
Keep **Learn** and **Compose** visually equal. Keep **Library** secondary.
### Navigation mapping
| Current item | New location | Notes |
| --- | --- | --- |
| **Overview** | **Learn** > **Overview** | Designer 2 owns content. |
| **Compositions** | **Learn** > **Compositions** | Keep the count badge. |
| **Alaap and taan** | **Learn** > **Practice** | Use screen copy to explain alaap and taan. |
| **Compose** | **Compose** | Designer 3 owns content. |
| **My library** | **Library** | Secondary header item and mobile bottom item. |
Header navigation: **Learn**, **Compose**, **Library**. Use `aria-current="page"` on the active item.
Learn local navigation: **Overview**, **Compositions**, **Practice**, **Perform**.
Compose local anchors, if needed: **Generate**, **Arrange**, **Play**, **Record**.
### First-visit welcome state
Show this state before a raga is selected or when the URL has no raga state.
Desktop wireframe:
```text
[logo] Swaramala     Learn  Compose  Library       [Search ragas...] [Browse]
Learn the shape of a raga. Compose phrases that stay inside it.
Choose a starting point.
[Learn a raga]                         [Compose in a raga]
Hear swaras, see aaroh/avroh,          Describe a phrase, generate,
follow bandish, and practice.          arrange, play, and save it.
[Start with Yaman]                     [Compose in Bhupali]
Browse by: [Popular] [Thaat] [Time] [Compositions available]
```
Mobile wireframe:
```text
Swaramala                              [Menu]
[Search ragas]
Learn ragas. Compose in them.
[Learn] [Compose]
Start with: [Yaman] [Bhupali] [Bhairav]
Browse by: [Thaat] [Time]
Sound  Keyboard
```
Required copy:
- Hero title: **Learn ragas. Compose in them.**
- Hero body: **Pick a raga to study its movement, hear its swaras, or build your own phrase.**
- Learn card title: **Learn a raga**
- Learn card body: **See aaroh, avroh, pakad, vadi, compositions, alaap, and taan in one guided path.**
- Learn card button: **Start with Yaman**
- Compose card title: **Compose in a raga**
- Compose card body: **Describe a phrase, generate raga-true options, arrange them, play them, and record.**
- Compose card button: **Compose in Bhupali**
### Raga selection
Keep `#raga-form`, `#raga-input`, `#raga-list`, and `#raga-browse`.
Required behavior:
- Put search in the header on desktop.
- Put search under the hero copy on mobile and first visit.
- Autocomplete by name, thaat, time, and composition count.
- Add starter buttons: **Yaman**, **Bhupali**, and **Bhairav**.
- Keep **Browse all**. In the dialog, add chips for **Popular**, **Has compositions**, time of day, and thaat.
- Each result shows name, thaat, time, and composition count.
States:
- Empty: **No raga selected. Search for a raga or start with Yaman.**
- Loading: **Loading raga data.**
- No results: **No ragas match this search. Try a name, thaat, or time of day.**
- Error: **Swaramala could not load raga data. Refresh the page or try again later.**
## P0 global chrome
### Header
Desktop:
```text
[logo] Swaramala        Learn  Compose  Library        [Search ragas...] [Browse]
```
Mobile:
```text
[logo] Swaramala                         [Menu]
[Search ragas...]
```
Rules:
- Keep `src/raga_composer/static/img/logo-mark.svg`.
- Keep the wordmark visible on all breakpoints.
- Move the tagline out of the header. Use the product promise in the hero.
- Use the mobile menu only for secondary items. Do not hide search behind it.
### Sound bar
Replace the exposed strip with a compact, progressive bar.
Always visible:
- Current Sa, such as **Sa: C3**.
- Tempo, such as **80 BPM**.
- Taal, such as **Teentaal 16**.
- **Tanpura**, **Tabla**, **Record**, and **Sound**.
Move to **Sound** drawer:
- Tonic note, octave, tempo, taal, instrument, tanpura first string, tanpura follows Sa, tanpura volume, tabla volume, instrument volume, and microphone.
Desktop:
```text
Sa C3 · 80 BPM · Teentaal 16     [Tanpura] [Tabla] [Record] [Sound]
```
Mobile:
```text
Sa C3 · 80 BPM     [Tanpura] [More]
```
Mobile **More** contains **Tabla**, **Record**, **Taal**, and **Sound**.
Implementation mapping:
- Keep `.soundbar` sticky and reduce the default height to one row.
- Reuse `#tonic`, `#tonic-octave`, `#tempo`, `#taal`, `#tanpura-toggle`, `#tabla-toggle`, `#record`, `#record-mic`, `#tanpura-vol`, `#tabla-vol`, `#instrument`, and `#instrument-vol`.
- Replace the current `details.popover` with `.settings-drawer` to avoid nested overflow.
- Show `#theka` only when tabla is on. On mobile, make it horizontally scrollable under the compact bar.
### Keyboard dock
Keep the dock as a shared tool.
Default states:
- Desktop: collapsed to a 48 px bar until the visitor clicks **Keyboard** or focuses a piano control.
- Mobile: collapsed by default and opens as a bottom sheet.
- Compose path: opens after the visitor enters **Arrange** or **Play**.
- Learn path: stays collapsed unless the visitor chooses **Practice with keyboard**.
Collapsed dock content:
- **Keyboard** toggle.
- Current instrument, such as **Piano**.
- Current octave, such as **Madhya**.
Move to dock settings:
- Instrument select, volume, **Add played notes to the line**, **Play from computer keyboard**, and **Key map**.
Implementation mapping:
- Reuse `.dock`, `#dock-toggle`, `#dock-body`, `#piano`, `#instrument`, `#instrument-vol`, `#piano-input`, `#keyboard-play`, and `#key-map`.
- Keep keyboard mapping unchanged: `S D V G H M , L`, `X C B N K`, and `Z` or `.`.
- Wrap `.keyboard-hint` and `.key-map`; do not use fixed mobile widths.
## P0 visual system
Add this token layer to `styles.css` and migrate existing rules over time:
```css
:root {
  color-scheme: light;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-serif: Georgia, "Times New Roman", serif;
  --font-devanagari: "Kohinoor Devanagari", "Noto Sans Devanagari", "Devanagari Sangam MN", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --color-bg: #fbf6ee;
  --color-surface: #fffdf9;
  --color-surface-warm: #fff4e3;
  --color-surface-raised: #ffffff;
  --color-ink: #241a12;
  --color-muted: #735f4d;
  --color-subtle: #9a8069;
  --color-line: #e7d8c5;
  --color-line-strong: #c9ad8d;
  --color-brand: #8f3f16;
  --color-brand-strong: #6e2f10;
  --color-saffron: #e4a038;
  --color-saffron-soft: #fde8bd;
  --color-success: #2f7d4f;
  --color-danger: #b3261e;
  --color-focus: #1f6feb;
  --color-shadow: rgb(36 26 18 / 14%);
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.5rem;
  --space-6: 2rem;
  --space-7: 3rem;
  --radius-sm: 0.375rem;
  --radius-md: 0.625rem;
  --radius-lg: 1rem;
  --radius-pill: 999px;
  --shadow-sm: 0 2px 8px var(--color-shadow);
  --shadow-md: 0 10px 28px var(--color-shadow);
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.5rem;
  --text-2xl: clamp(1.8rem, 4vw, 3rem);
  --line-tight: 1.2;
  --line-normal: 1.5;
  --target-min: 2.75rem;
  --shell-max: 72rem;
  --soundbar-h: 3rem;
  --dock-collapsed-h: 3rem;
}
```
Type scale:
- Hero: `--text-2xl`, serif, `--line-tight`.
- Page title: `--text-xl`, serif.
- Section heading: `--text-lg`, 650 weight.
- Body: `--text-md`, `--line-normal`.
- Helper text: `--text-sm`.
- Tala markers, badges, and key labels: `--text-xs`.
- Notation: `--font-mono`, `1.05rem` to `1.2rem`.
Button hierarchy:
- Primary: filled brand for the main path action.
- Secondary: white surface with strong border for **Browse all** and **Save line**.
- Ghost: transparent for local navigation.
- Danger: red outline or fill for destructive actions.
Cards:
- Use `1px solid var(--color-line)`, `--radius-md` or `--radius-lg`, and `--space-4` to `--space-5` padding.
- On hover, set border to `--color-saffron` and add `--shadow-sm`.
- For selected cards, use `--color-surface-warm` and `--color-brand` border.
Focus style:
```css
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
```
### Notation grid
Keep `renderGrid()`, `.cycle`, `.vibhag`, `.marker`, `.beat`, and `.tok`.
Required changes:
- Group each vibhag with a stronger left edge.
- Show `X`, `0`, and tali numbers in a marker row.
- Add accessible labels: **Sam, beat 1**, **Khali**, **Tali 2**, and **Tali 3**.
- Use `--color-saffron-soft` for the current playing beat.
- Use `--color-brand` for selected tokens.
- Use `--color-danger` with a wavy underline for invalid tokens.
- Keep `_` holds and `-` rests muted but above 4.5:1 contrast.
```css
.vibhag {
  border-inline-start: 3px solid var(--color-line-strong);
  background: #fff8ec;
  border-radius: var(--radius-sm);
}
.marker { color: var(--color-brand); font-weight: 700; }
.beat { min-width: 2.75rem; min-height: 2.75rem; align-items: center; }
.tok.sel { background: var(--color-saffron-soft); outline: 2px solid var(--color-brand); }
```
## Inline help pattern
Use term chips instead of long explanations.
```html
<button class="term-chip" type="button" aria-expanded="false" aria-controls="term-aaroh">aaroh</button>
```
Expanded content pattern:
```text
aaroh
The ascending path of a raga. In Yaman: N. R G M D N S'.
[Play example]
```
Rules:
- Keep each definition to 2 sentences or fewer.
- Include notation or a short audio action when useful.
- Open one term popover at a time.
- On mobile, open term help as a bottom sheet.
- Add a **Glossary** link in the raga hero.
Required glossary copy:
- *Aaroh*: **The ascending path of a raga.**
- *Avroh*: **The descending path of a raga.**
- *Pakad*: **A short phrase that makes the raga recognizable.**
- *Vadi*: **The most important swara in the raga.**
- *Samvadi*: **The second most important swara in the raga.**
- *Mukhda*: **The opening phrase that returns to sam.**
- *Sam*: **Beat 1 of the taal cycle, where phrases resolve.**
- *Khali*: **The unstressed division of the taal cycle, marked with 0.**
- *Tali*: **A clapped division of the taal cycle.**
- *Taan*: **A faster melodic run that follows the raga.**
## P1 shared shell components
Selected-raga hero:
```text
Raga Yaman       Evening · Kalyan thaat · 3 compositions
Tivra Ma, all other swaras shuddha. Learn the shape or compose a phrase.
[Learn] [Compose] [Play Sa]
```
Keep the swara strip, but collapse it into **Raga swaras** on mobile.
Path label examples:
- **Yaman / Learn / Overview**
- **Yaman / Compose / Arrange**
- **Yaman / Library**
Shared empty-state structure:
```text
No saved lines yet
Compose a phrase in Yaman, then save it to this browser.
[Compose in Yaman]
```
## P2 visual options
Dark mode is optional. If implemented, use `@media (prefers-color-scheme: dark)` and keep notation contrast above WCAG 2.2 AA.
```css
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --color-bg: #17110d;
    --color-surface: #211812;
    --color-surface-warm: #302014;
    --color-surface-raised: #2a1f18;
    --color-ink: #f8efe4;
    --color-muted: #d1bda6;
    --color-line: #5a4636;
    --color-brand: #f0a15f;
    --color-saffron: #f2b84b;
    --color-focus: #79b8ff;
  }
}
```
## Accessibility requirements
- Maintain WCAG 2.2 AA contrast.
- Make every target at least 24 px, and make common touch targets at least 44 px.
- Keep audio, record, drawer, and dock controls keyboard reachable.
- Use `aria-expanded` and `aria-controls` on drawers and the dock.
- Trap focus in modal dialogs and return focus to the opener.
- Keep visible labels for search, settings, and record controls.
- Do not use inline `style` attributes in HTML strings. Use classes or `el.style` for dynamic placement.
## Implementation order
1. Add tokens, focus styles, button styles, card styles, and notation grid restyling without behavior changes.
2. Convert the header to **Learn**, **Compose**, and **Library**, and map current tabs behind the new labels.
3. Add the first-visit welcome state and starter ragas.
4. Upgrade the raga browse dialog with filters and result cards.
5. Collapse the sound bar and move advanced controls into **Sound**.
6. Collapse the keyboard dock by default and fix mobile overflow.
7. Add term chips, glossary content, and shared empty states.
8. Add the selected-raga hero and path label.
9. Test desktop and mobile keyboard order, focus visibility, contrast, and screen reader names.
