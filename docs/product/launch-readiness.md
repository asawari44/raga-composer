# Launch readiness checklist

Use this checklist to decide whether the static GitHub Pages release is production ready. The current Pages URL is `https://asawari44.github.io/raga-composer/`, but it can change if the repository is renamed. Each item has a pass condition that you can verify without accounts or server-side data collection.

## Functionality

- [ ] **Static load works from the GitHub Pages subpath.** Pass condition: `https://asawari44.github.io/raga-composer/` loads the application, styles, scripts, images, and data with relative URLs and no `404` responses caused by leading `/static`, `/api`, or hard-coded repository subpaths.
- [x] **Absolute site URLs have one source.** Pass condition: Unavoidable absolute URLs, such as canonical links, Open Graph URLs, and `sitemap.xml`, use `https://asawari44.github.io/raga-composer/` from one build-time setting, such as a `SITE_URL` constant in `scripts/build_site.py`.
- [ ] **Core raga browsing works.** Pass condition: You can search, browse, and open all 93 built-in ragas, and each raga shows aaroh, avroh, pakad, patterns, and facts.
- [ ] **Generation works without a backend.** Pass condition: **Generate**, **Regenerate**, **Validate**, **As taan**, **As palta**, **Elongate**, and **Remove holds** call browser-local code and return clear errors for invalid input.
- [ ] **Composition playback works.** Pass condition: You can open a composition, play a full composition, play a section, open it in **Compose**, and perform it with alaap and taan when its taal has a theka.
- [ ] **Alaap and taan work.** Pass condition: For any raga and supported taal, the **Alaap and taan** tab renders phrases and **New set** produces a different seeded set.
- [ ] **Keyboard and instruments work.** Pass condition: The on-screen piano and computer-keyboard mapping play notes for all 13 instrument voices, respect Sa, and insert notes into the editor when **Add played notes to the line** is on.
- [ ] **Tanpura and tabla work.** Pass condition: Tanpura and tabla start and stop after a user gesture, preserve tempo and tuning controls, and keep phrase playback aligned to sam when tabla is running.
- [ ] **Recording works locally.** Pass condition: You can record browser audio, optionally include the microphone, preview the recording, and download it without signing in.
- [ ] **Local library works.** Pass condition: You can save, edit, reorder, delete, export, import, and clear saved lines in browser storage without accounts.
- [ ] **Offline reload works after caching.** Pass condition: After a first successful load, a service worker or documented browser behavior lets you continue a core practice session when the network is unavailable, or the product clearly states that offline use is not supported.

## Accessibility

- [ ] **Keyboard access meets WCAG 2.2 AA.** Pass condition: You can reach and operate every control with the keyboard, including tabs, dialogs, popovers, the raga browser, editor actions, playback controls, and recording dialogs.
- [ ] **Focus order and visibility meet WCAG 2.2 AA.** Pass condition: Focus moves in a logical order, focus remains trapped in open dialogs, and every interactive element has a visible focus indicator with sufficient contrast.
- [ ] **Names, roles, and states are correct.** Pass condition: Screen readers announce tabs, tab panels, dialogs, buttons, toggles, sliders, status messages, and the raga browser with accurate labels and state.
- [ ] **Color is not the only cue.** Pass condition: In-raga, varjit, selected, invalid, sam, tali, and khali states also use text, shape, icon, or accessible labels.
- [ ] **Contrast meets WCAG 2.2 AA.** Pass condition: Text and essential UI states meet 4.5:1 contrast for normal text and 3:1 contrast for large text and non-text controls.
- [ ] **Motion and audio respect user control.** Pass condition: No sound starts without a user action, animation is limited or respects reduced motion, and playback can stop from the keyboard.
- [ ] **Errors are announced.** Pass condition: Validation errors, API replacement errors, storage failures, and recording failures appear in visible text and live regions where appropriate.
- [ ] **Touch targets meet WCAG 2.2 AA.** Pass condition: Primary controls and dense note actions meet the 24 by 24 CSS pixel minimum target size or provide an equivalent accessible path.

## Performance

- [ ] **Initial page weight fits slow mobile connections.** Pass condition: Compressed HTML, CSS, JavaScript, data, images, and fonts needed for first interaction are under 1 MB, excluding optional audio recordings that users create.
- [ ] **First interaction is fast on slow mobile.** Pass condition: On a simulated slow 4G connection and a mid-range mobile CPU, the raga search field accepts input within 5 seconds of navigation.
- [ ] **Practice controls remain responsive.** Pass condition: Generating phrases, switching ragas, opening **All ragas**, and editing a 64-slot line each complete in under 200 ms after data load on a mid-range mobile device.
- [ ] **Audio startup is predictable.** Pass condition: After the first user gesture, tanpura, tabla, and note playback start in under 300 ms on current Chrome, Safari, Firefox, and Edge.
- [ ] **No long main-thread stalls.** Pass condition: Browser performance traces show no interaction task over 200 ms during common flows: open raga, generate, play, record, save, and import.
- [ ] **Storage use is bounded.** Pass condition: The application warns before large local recordings fill browser storage and gives users a clear way to delete saved data.

## Browser support

- [ ] **Supported browsers are explicit.** Pass condition: The release notes and help text list current Chrome, Safari, Firefox, and Edge on desktop, plus current Chrome for Android and Safari on iOS.
- [ ] **Core flows pass on each supported browser.** Pass condition: Browsing, generation, playback, saving, importing, exporting, and recording downloads pass manual smoke tests on each supported browser.
- [ ] **Unsupported features degrade clearly.** Pass condition: If a browser lacks `MediaRecorder`, IndexedDB, Web Audio, or required module support, the application shows a clear message and keeps available read-only features usable.
- [ ] **Mobile layout works.** Pass condition: The main tabs, sound bar, raga browser, notation grids, dialogs, and keyboard dock fit a 360 px wide viewport without hidden required actions.

## Privacy

- [ ] **No accounts remain in the static release.** Pass condition: The UI has no sign-in, create-account, change-password, sign-out, or server-session flows.
- [ ] **Data stays in the browser.** Pass condition: Saved lines, recordings, settings, and imports stay in IndexedDB or `localStorage`, except when the user exports or downloads files.
- [ ] **Microphone access is explicit.** Pass condition: Recording explains when the microphone is included, requests browser permission only after the user starts recording, and works with microphone capture off.
- [ ] **No invasive analytics run.** Pass condition: The production build makes no analytics, advertising, fingerprinting, or third-party tracking requests.
- [ ] **Data deletion is available.** Pass condition: Users can clear saved lines, recordings, imported packs, and settings from the application without using browser developer tools.
- [ ] **Privacy text matches behavior.** Pass condition: The application and README state what data is stored, where it is stored, how users export it, and how users delete it.

## Content accuracy and copyright

- [ ] **Raga data has review status.** Pass condition: Each raga record has a source or review status, and the UI warns that students should follow their teacher when traditions differ.
- [ ] **Generated content is framed correctly.** Pass condition: The application labels generated alaap, taan, and phrases as generated practice material, not authoritative bandish material.
- [ ] **Composition provenance is documented.** Pass condition: Each composition shows title, type, taal, composer when known, source, transcription notes, and copyright status or public-domain rationale.
- [ ] **Copyrighted material is excluded or licensed.** Pass condition: The release includes only compositions that the project can publish under a compatible license or a clear public-domain basis.
- [ ] **Lyrics are reviewed.** Pass condition: Lyrics and transliteration are checked for obvious transcription errors, offensive mistakes, and missing source attribution.
- [ ] **Taal and theka data are reviewed.** Pass condition: Each supported taal has beats, vibhags, markers, and theka verified against at least one reliable reference or musician review.

## Error handling

- [ ] **Static data failures are clear.** Pass condition: If raga, taal, or composition JSON fails to load, the application shows which file failed and suggests reloading.
- [ ] **Core validation errors are actionable.** Pass condition: Invalid notation, unknown raga names, unsupported taals, and failed imports show specific messages next to the relevant control.
- [ ] **Storage errors are recoverable.** Pass condition: If browser storage is unavailable or full, the application explains what failed and offers export, download, delete, or retry paths where possible.
- [ ] **Recording errors are recoverable.** Pass condition: Microphone denial, unsupported recording formats, and interrupted recordings show visible messages and do not leave the UI stuck in a recording state.
- [ ] **Playback errors stop safely.** Pass condition: If playback fails, the application stops scheduled audio, resets pressed buttons, and preserves the user's current line.
- [ ] **No server-shaped fallbacks remain.** Pass condition: The static release does not show `401`, sign-in, password, cookie, or session-expired messages.

## Support channel

- [ ] **Users can report issues.** Pass condition: The application links to the public GitHub Issues page or another maintained support channel with a short template for browser, device, raga, and steps to reproduce.
- [ ] **Users can report content corrections.** Pass condition: Composition and raga pages link to a correction flow that asks for source evidence and tradition notes.
- [ ] **Users can get recovery help.** Pass condition: Help text explains how to export data, import data, clear local data, recover from storage errors, and download recordings.
- [ ] **Known limits are visible.** Pass condition: Help text states that Swaramala is a practice aid, not a replacement for a teacher, and that raga and composition traditions can vary.
