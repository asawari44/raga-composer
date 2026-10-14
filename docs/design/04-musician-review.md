# Musician review of Swaramala

Reviewed on October 14, 2026, using the local preview at `http://127.0.0.1:8093/raga-composer/`. I reviewed the site as a khayal and tarana student, and as a teacher checking whether I could assign it for raga study, bandish practice, and guided composition. The strongest part of Swaramala is that it gives a learner a clear, playable view of aaroh, avroh, pakad, compositions, alaap, taan, and a note editor in one place. The application is useful for orientation, especially for students who already know swara names and want to see how phrases sit on the taal grid. As a teaching tool, it needs a stronger distinction between scale legality and raga grammar, because several generated phrases are technically within the note set but do not yet sound like the raga. Composition data also needs validation against each raga definition, because some notations contain varjit swaras or movements that the same application later treats as invalid. The application should add nyas, alpa, kan, meend, and andolan guidance before teachers rely on it for intermediate or advanced riyaz.

## Musical accuracy issues

| Raga | Where | Issue | Suggested fix | Severity |
|---|---|---|---|---|
| Bageshree | Raga facts and compositions | The raga is labeled `Audav-Sampoorna`, but the note set is `S R g m D n` and marks `Pa` as varjit. The avroh is `S' n D m g R S`, with no `P`, while the composition `Kaun karat tori vinati piharwa` uses `P` and `P D`. | Decide which Bageshree tradition the app teaches. If you include alpa `P`, show it as alpa in avroh and patterns, for example `S' n D m P D m g R S`. If you exclude `P`, remove or re-source the composition cells that use `P`. | P0 |
| Bhairav | `Jago jago hua savera` | Bhairav uses komal `r`, but the antara line contains `R'`. The raga facts correctly show `S r G m P d N S'`, so the notation contradicts the raga. | Change `R'` to `r'` when the source supports komal Re. Add an import check that flags varjit swaras before a composition appears in Learn. | P0 |
| Kedar | `Kanha Re, Nand-Nandana` | Kedar uses shuddha `N`, but the composition contains komal `n`, for example `n D`. This makes the bandish contradict the raga note set `S R G m M P D N`. | Correct `n` to `N`, or add a transcription note if the source explicitly uses a nonstandard variant. Do not let the same composition open in Compose with unresolved violations. | P0 |
| Darbari Kanada | Compose and generated taans | Generated taans are too straight and scale-like, for example `d. n. S R g m P d n S' R' g'`. Darbari needs a heavier treatment of komal `g` and `d`, curved `g m R S`, and a deep `d n P` descent. Plain ladder taans weaken the Kanada identity. | Add raga-specific phrase weights and ornament metadata. Bias Darbari toward `g~m R S`, `d~n P`, `m P g m R S`, slow andolan on `g` and `d`, and fewer straight scalar runs. | P1 |
| Yaman | Compose and practice taans | The app often produces mechanically valid lines that do not resolve like a student should sing Yaman. One option for “taan in teentaal, up and down, emphasize the vadi” ends on `N.` and another ends on `D.`, even though a beginner practice taan should usually return to `S`, `G`, or the mukhda. | Add an explicit landing-note control with defaults by exercise type: `S`, `G`, and composition mukhda for Yaman. Increase the weight of `N. R G`, `G M D N`, and `P M G R S`. | P1 |
| Bhupali | Compose and practice taans | The generated taans use correct notes, but they often sound like pentatonic ladders instead of Bhupali chalan. A phrase such as `P' G' R' S' D P G D` is legal, but the raga identity needs more `G R S D. S`, `S R G`, and `P G R S`. | Add a “bhava-first” mode that favors short pakad-based turns over long scalar up-down runs, especially for beginner taans. | P1 |
| Malkauns | Overview, alaap, and taan | The facts are broadly correct, but the app does not teach the andolan on `g`, `d`, and `n`. Without ornament guidance, a learner may sing Malkauns as a plain pentatonic scale. | Add ornament labels to key swaras, for example `g~`, `d~`, and `n~`, with a glossary entry and a visual cue in alaap cards. | P1 |
| Todi | Overview, compositions, and generated phrases | The facts show the right swaras, but Todi needs andolan on `r`, `g`, and `d`, and careful treatment of `P` as alpa or descent-oriented in many gharana treatments. Generated phrases such as `M d N S' r' g'` are legal but need more slow curved intonation. | Mark `P` as alpa when appropriate, add Todi-specific ornament guidance, and reduce fast straight motion through `r g M d`. | P1 |
| Kedar | Raga facts and generated phrases | The aaroh `S m m P M P D P N D S'` makes tivra `M` look like a full step rather than a grace-oriented color around `P`. Generated phrases may overuse `M` as an independent swara. | Describe tivra `M` as a kan or sparsh around `P` in Kedar. Weight `S m m P`, `M P D P m`, and `m G m R S`, and avoid treating `M` as a stable nyas. | P1 |
| All reviewed ragas | Composition-to-Compose flow | Many compositions contain movements that the Compose validator rejects when the same material is flattened, such as `M → P` in Yaman, `S → n.` in Darbari, and `M → P` in Todi. Some are valid musical vakra or line breaks, but the app does not explain why Learn accepts them and Compose rejects them. | Run the validator at import time, but classify violations as varjit, vakra, line-break, and source exception. Show a warning in the transcription note and teach why a phrase is allowed. | P0 |
| All reviewed ragas | Alaap and taan generation | The generator uses a move graph and pakad trigrams, but it does not know nyas swaras, alpa swaras, arohi-avrohi asymmetry beyond the graph, or ornament behavior. This produces correct note lists that can miss chalan. | Extend raga data with `nyas`, `alpa`, `avoid`, `ornaments`, `phrase_weights`, and `default_landings`. Use those fields in alaap, taan, and Compose. | P1 |

## Teaching and riyaz suggestions

### Add sa-sadhana and tanpura calibration

A student needs a stable Sa before learning a raga. The current sound bar has Sa and tanpura controls, but the learning path begins with aaroh and avroh. Add a **Tune Sa** step at the start of Learn with tanpura only, a one-minute `S`, `P`, `S'`, `S`, and `S.` practice, and a reminder to choose a comfortable tonic. In the Library, save the student's preferred Sa per voice range.

### Add raga-specific paltas and alankars

Generic taans help, but a student needs paltas that teach each raga's grammar. For Yaman, practice `N. R G`, `G M D N`, and `P M G R S`. For Bhupali, practice `S R G R S`, `G P D P G`, and `G R S D. S`. Add a **Paltas** subsection under **Practice alaap and taan**, with slow, medium, and fast speeds.

### Add call-and-response practice

Students learn by imitation. Add a **Listen, then sing** mode to every overview phrase, composition line, alaap, and taan. The app should play the phrase, wait for the same number of beats, then play it again. For a static browser app, this can work without microphone analysis by using timed rests and clear beat highlighting.

### Show nyas and resting swaras

A beginner needs to know where a phrase can rest. The current facts show vadi and samvadi, but do not show nyas. Add small resting markers to swaras in the overview and generated options. For example, Yaman can mark `S`, `G`, and `N`; Malkauns can mark `S` and `m`; Darbari can mark `R` and `P` depending on the taught tradition.

### Mark alpa, varjit, and special swaras separately

The current varjit chip helps, but it cannot teach ragas such as Bageshree, Kedar, and Todi where a swara may be alpa, vakra, or grace-like. Add a **Swara roles** panel in Overview with categories for `varjit`, `alpa`, `nyas`, `andolan`, `kan`, and `vakra`. Use the same metadata in Compose so generated phrases respect the teaching notes.

### Add ornament notation

Hindustani singing cannot be represented by note names alone. Add a compact notation layer: `g~` for andolan, `(N)S` for kan, `G→M` for meend, and `GmG` for light murki or gamak patterns. The UI can start by showing ornament labels as text chips without adding audio synthesis.

### Add mukhda and sam coaching

The composition grid marks sam, tali, and khali, but the app should explicitly label the mukhda start and the sam landing. In Darbari, where `first_matra` is `9`, students need to see that the line begins before sam and returns to sam later. Add **Mukhda starts here** and **Land on sam here** badges to composition grids and performance plans.

### Add slow-to-fast lesson paths

The app has **Slower** and tempo controls, but the lesson path does not require progression. Add a three-stage riyaz plan for each phrase: vilambit listening, madhya repetition, and drut or taan speed. Store progress per raga and phrase.

## Singing-technique support

| Feature | Why it matters | Static-browser feasibility |
|---|---|---|
| Pitch reference by voice type | Students need a comfortable Sa. A common starting range is around C to D for many male voices and F to G for many female voices, but the app should let the singer decide. | Feasible. Add a voice-range selector that recommends a tonic and stores it locally. |
| Microphone sur check | Students need feedback on whether they are near Sa, Pa, and the current swara. | Feasible with the Web Audio API and pitch detection. Keep it optional, local-only, and coarse at first: in tune, high, or low. |
| Breath markers | Beginners run out of breath on long alaap and composition lines. | Feasible. Add breath icons at phrase boundaries, before long taans, and at rests. No server is needed. |
| Comfortable range warnings | Generated antara phrases can sit high for a beginner. | Feasible. Use the selected tonic and voice range to warn when a phrase goes too low or high. Offer **lower range**, **middle range**, and **higher range** filters. |
| Sustained swara timer | Kharaj and swar sadhana require duration, not only note order. | Feasible. Add a timer ring for held `S`, `m`, `P`, and `S'`, and save practice duration locally. |
| Ornament drills | Ragas such as Bhairav, Malkauns, Todi, and Darbari need controlled andolan. | Partly feasible. Show visual curves and timing guides first. Audio synthesis can remain approximate until the data model supports meend and andolan. |

## UX friction from the review

Because the requested deliverable is one file, I did not persist screenshot image files. The screenshots referenced in this section are session captures from the browser review: `session-screenshot:1280-yaman-overview`, `session-screenshot:390-yaman-compositions`, and `session-screenshot:1280-darbari-compose`.

| Screenshot reference | Friction | Suggested change |
|---|---|---|
| `session-screenshot:1280-yaman-overview` | The overview is visually clear, but the learning path becomes a horizontal scroller. A student may miss later steps such as alaap and taan. | Keep the stepper, but add a vertical checklist summary on wide screens and a compact current-step card on small screens. |
| `session-screenshot:390-yaman-compositions` | On a narrow screen, the composition card is readable, but the keyboard dock takes significant vertical space and the user sees less of the taal grid. | Collapse the keyboard dock by default in Learn on narrow screens. Keep a floating **Keyboard** button for students who need it. |
| `session-screenshot:390-yaman-compositions` | The mobile viewport shows horizontal scrolling in the learning path and composition index. This makes the path feel more like navigation than practice. | Use stacked chips or a dropdown for the learning path under 480px. |
| `session-screenshot:1280-darbari-compose` | Generated options sit beside an empty editor. This is efficient, but a student cannot tell why an option is musically strong beyond note legality and trigram percentage. | Add teacher-facing explanations: “uses `g m R S`,” “lands on `R`,” “avoids straight `g m P d`,” and “needs andolan on `g`.” |
| `session-screenshot:1280-darbari-compose` | The app says “Uses only Darbari Kanada swaras,” but that is not enough for Darbari. The phrase can still sound unidiomatic. | Replace the first success criterion with “Matches required swaras and required chalan checks.” |
| Composition grids | Students can see `X`, `0`, and tali markers, but mukhda start is not labeled separately. | Add visible mukhda badges and a short note: “Start from here to return to sam.” |
| Raga facts | Terms such as vadi, samvadi, and varjit are available, but alpa, nyas, meend, kan, and andolan are absent. | Add those terms to the glossary and facts panel, then use them in phrase cards. |
| Browse and search | Raga search works well, but it does not show accuracy confidence or whether compositions have unresolved notation issues. | Add data-quality badges such as **reviewed**, **needs transcription review**, and **has source exceptions**. |

## Prioritized top 10 changes

1. P0: Add an import-time music validation report for compositions, and block or label varjit swaras such as Bageshree `P`, Bhairav `R'`, and Kedar `n`.
2. P0: Fix Bageshree’s data model so jati, avroh, varjit status, and compositions agree about `P`.
3. P0: Add explicit mukhda-start metadata separate from the first non-empty note, then show mukhda and sam labels in every composition grid.
4. P1: Extend raga JSON with `nyas`, `alpa`, `ornaments`, `avoid`, and `phrase_weights`, and use those fields in generation.
5. P1: Add ornament guidance for Bhairav, Malkauns, Darbari Kanada, and Todi, especially andolan on komal swaras.
6. P1: Make generated taans land on pedagogically useful notes by default, such as `S`, vadi, nyas, or the composition mukhda.
7. P1: Add raga-specific paltas and alankars under **Practice alaap and taan**.
8. P1: Add **Listen, then sing** call-and-response practice with timed rests and beat highlighting.
9. P2: Add optional local microphone sur check for Sa, Pa, and the current swara.
10. P2: Improve narrow-screen Learn pages by collapsing the keyboard dock and replacing horizontal learning-path scrolling with stacked practice steps.
