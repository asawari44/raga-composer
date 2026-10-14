# Product roadmap

Swaramala helps you compose and practice Hindustani classical music in your browser. The static release runs on GitHub Pages at `https://asawari44.github.io/raga-composer/`, does not require accounts, and keeps your data in the browser unless you export it. The URL can change if the repository is renamed, so the application should use relative URLs everywhere and keep unavoidable absolute URLs in one build-time setting.

## Target users and top jobs

| User | Top jobs |
|---|---|
| Beginning vocal student | Learn a raga's swaras, aaroh, avroh, pakad, and common movements; practice with tanpura and tabla; hear whether a phrase stays in raga. |
| Intermediate student | Build riyaz routines, generate taans and paltas, save useful lines, record practice, and share progress with a teacher. |
| Instrumentalist | Try raga-true phrases on a swara-labeled keyboard, transpose Sa, practice with tabla, and export notation or audio. |
| Teacher | Prepare raga-specific practice material, send homework, review notation or recordings, and avoid account setup for students. |
| Curious listener or self-learner | Browse ragas, listen to compositions, understand notation, and explore the basics without installing software. |

## Competitive scan

| Product | What it does well | Gap that Swaramala can fill |
|---|---|---|
| [iTablaPro](https://www.upasani.org/home/iTablaPro.html) | Provides high-quality tabla, tanpura, swarmandal, and practice accompaniment across many taals. | It focuses on accompaniment, not raga-aware composition, notation editing, or homework packs. |
| [iTanpura](http://upasani.org/home/itanpura.html) and shruti box apps | Provide a reliable drone for daily riyaz. | They do not teach phrase construction or validate raga movement. |
| [Riyaz](https://riyazapp.com/) | Tracks vocal range, accuracy, breath control, and progress. | It focuses on vocal coaching and guided lessons, not browser-based raga composition or teacher-owned notation packs. |
| [SwarShala](https://www.swarclassical.com/SwarShala/) | Offers Indian music notation, virtual instruments, tutorials, and recording in a full software suite. | It is broader and heavier than a static web application; Swaramala can stay free, shareable, and focused. |
| Sur Sadhana and [Sadhana AI](https://sadhana-ai.com/) | Emphasize practice support, pitch or timing analysis, and guided riyaz. | They validate singing, while Swaramala can validate generated notation and composition structure. |
| Vishwamohini and other raga reference tools | Help you look up raga information and examples. | They usually do not combine reference, generation, notation editing, playback, and recording in one browser workflow. |
| [Raag Hindustani](https://raag-hindustani.com/) | Explains Hindustani concepts from first principles with notation examples. | It is a learning reference, not an interactive practice workspace. |
| [Flat](https://flat.io/) | Provides collaborative Western notation, sharing, classroom flows, and community. | It does not model Hindustani swara notation, raga movement, taals, or tanpura and tabla practice. |
| [MuseScore](https://musescore.org/) | Provides powerful free notation, playback, import, export, and score sharing. | It is not optimized for raga grammar, Indian notation, or lightweight mobile practice in the browser. |
| [Yousician](https://yousician.com/) | Listens to students and gives instant accuracy and timing feedback with lesson plans. | It does not cover Hindustani raga grammar, taals, or bandish workflows. |

## Ranked next features

### 1. Shareable practice packs

**Problem:** Students need a way to send a line, riyaz plan, or bandish excerpt to a teacher without accounts or a server.

**User story:** As a student, you can export a practice pack that contains the raga, taal, saved lines, notes per beat, and optional recording references, so your teacher can import it in their browser.

**First-version scope:** Add export and import for saved lines and practice notes as a JSON file. Include a printable text summary and a shareable file name that includes the raga and date. Keep recordings as separate downloaded audio files, not embedded in JSON.

**Acceptance criteria:**

- You can export the current raga's saved lines, titles, notes per beat, taal, Sa, tempo, and practice notes.
- You can import a pack into a different browser profile and see the same saved lines in **My library**.
- The import flow validates the JSON schema, reports unsupported fields, and never overwrites existing lines without confirmation.
- The exported file contains no cookies, device identifiers, microphone permission state, or browser metadata.
- The printable summary includes the raga name, taal, Sa, tempo, and each line in notation.

**Measure success without invasive tracking:** Count voluntary user feedback that includes exported pack files, support requests about failed imports, and teacher interviews. Use local-only diagnostics in the export confirmation, such as number of lines exported, without sending data anywhere.

**Effort:** M

**Risks:**

- Users may expect audio recordings to travel inside the pack.
- JSON imports can confuse users if the schema error messages are too technical.
- Teachers may want batch management across students, which needs a backend and stays out of scope.

### 2. Guided riyaz sessions

**Problem:** Learners often know they should practice daily but do not know what to practice next in a specific raga.

**User story:** As a learner, you can start a 15-minute riyaz session that sequences tanpura, slow swara practice, pakad repetition, generated alaap, taan, and a saved composition.

**First-version scope:** Add static, client-side session templates for 5, 15, and 30 minutes. Templates adapt to the selected raga and taal, show the current step, play reference phrases, and let you mark steps complete. Store only local completion history.

**Acceptance criteria:**

- You can choose a 5, 15, or 30-minute session for any built-in raga.
- Each session includes warmup, pakad, phrase practice, and rhythm practice.
- The session uses the selected Sa, tempo, and taal.
- The interface works without network access after the page and data load.
- Completion history stays in the browser and can be cleared from the privacy controls.

**Measure success without invasive tracking:** Invite users to export a local practice summary and share it with feedback. Track only issue reports, teacher comments, and opt-in survey answers.

**Effort:** M

**Risks:**

- A generic routine may not match every gharana, teacher, or voice type.
- Session timers may create pressure instead of helping practice.
- The first version can overemphasize generated phrases if it does not anchor practice in known compositions.

### 3. Pitch monitor for vocal practice

**Problem:** Singers need feedback on whether they hold Sa and land on the intended swara, especially when practicing alone.

**User story:** As a singer, you can turn on a local pitch monitor that shows your detected swara relative to Sa while you practice with tanpura.

**First-version scope:** Add a microphone-based pitch display that runs locally through Web Audio. Show current frequency, nearest swara, cents offset, and a confidence state. Do not grade full performances in the first version.

**Acceptance criteria:**

- The pitch monitor starts only after explicit microphone permission.
- The display maps pitch to the selected Sa and octave.
- The display shows when the signal is too quiet or unstable.
- The feature works with tanpura and tabla playback without sending audio to a server.
- You can record practice with or without pitch monitor visible.

**Measure success without invasive tracking:** Use opt-in feedback prompts that ask whether the monitor helped tune Sa and key phrases. Review support messages about calibration, latency, and device compatibility.

**Effort:** L

**Risks:**

- Browser audio latency and microphone quality vary widely.
- Polyphonic sources, tanpura, and tabla can reduce detection accuracy.
- Users may interpret pitch display as a teacher-grade assessment.

### 4. Ear training and raga recognition drills

**Problem:** Learners need to hear and identify swaras, intervals, pakads, and raga-specific movements, not only read them.

**User story:** As a student, you can practice short listening drills in the current raga and get immediate feedback on swara, phrase direction, and pakad recognition.

**First-version scope:** Add local drills for swara identification, aaroh or avroh direction, vadi and samvadi landing, and pakad recognition. Generate questions from existing raga data and store scores locally.

**Acceptance criteria:**

- You can run at least four drill types from the selected raga.
- Each drill plays audio before showing notation.
- Feedback explains the correct answer using raga terms.
- Scores stay in the browser and can be cleared.
- Drills do not require accounts or network calls after static assets load.

**Measure success without invasive tracking:** Ask teachers and students to submit anonymized drill-export summaries if they choose. Review qualitative feedback about whether drills match lesson needs.

**Effort:** M

**Risks:**

- Generated drills can reinforce shallow recognition if they do not use musically meaningful phrases.
- Some ragas need nuanced ornamentation that current synthesized playback may not express.
- Score summaries can invite comparison across learners, which the product should avoid in the first version.

### 5. Notation sharing and print view

**Problem:** Students and teachers need clean notation outside the application, especially for class notes, WhatsApp messages, email, and printed homework.

**User story:** As a teacher, you can create or edit a line, then export it as readable text, image, or print layout with raga and taal context.

**First-version scope:** Add a print-friendly layout and copy formats for swara notation, beat grid, and plain text. Defer PDF generation unless browser print output is not reliable.

**Acceptance criteria:**

- You can copy a line as plain notation, beat-grid text, and teacher note text.
- You can print a raga overview, saved line, generated phrase, or composition section.
- Printed output includes raga, taal, Sa, tempo, notes per beat, and date.
- Print and copy flows work on desktop and mobile browsers.
- Copyright notes stay visible when printing compositions.

**Measure success without invasive tracking:** Count support messages and opt-in feedback about whether printed or copied notation works in common teacher workflows. Inspect only files users choose to send.

**Effort:** S

**Risks:**

- Browser print output can differ by device.
- Teachers may want editable PDF or image exports, which can add complexity.
- Copy formats can become confusing if you offer too many choices.

## Not now

- **Accounts and cloud sync:** The static release has no backend. Add accounts only if users need cross-device sync more than privacy and deployment simplicity.
- **Teacher dashboards:** Teachers need homework workflows, but a dashboard requires accounts, permissions, storage, and support operations.
- **Social publishing:** Public sharing needs moderation, copyright review, abuse reporting, and user identity.
- **Marketplace or paid lessons:** Monetization adds trust, tax, support, and content liability before the core practice loop proves value.
- **Full AI grading:** Pitch and timing feedback can help, but teacher-like grading needs accuracy, explainability, and careful framing.
- **Mobile native applications:** The static web application should prove the workflows before you maintain platform-specific releases.
- **Full DAW features:** Multi-track production overlaps with SwarShala, MuseScore, and other tools. Swaramala should stay focused on raga-aware practice.
