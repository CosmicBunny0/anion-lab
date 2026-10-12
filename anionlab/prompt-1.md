# Anion Lab update — Prompt 1 of 5: setup + profiles

I'll paste five prompts, one after another, into this same Claude Code session (or the same folder). Each one ends with a working page published at the same link. Don't start on the next one; wait for me.

## Goal
Add device-local profiles to my existing artifact "مختبر الأنيونات" (https://claude.ai/artifact/KskMe89FbDab2AezbzLvoR), updated in place. First, set up the files Prompts 2–5 depend on.
**Done when:** `anionlab/RULES.md` and `anionlab/check_data.py` exist, T1–T4 pass, and the same URL is republished.

## Step 0 — setup (only in this prompt)
1. Create `anionlab/`. Write everything between the RULES markers below into `anionlab/RULES.md`, word for word. Each later prompt starts by re-reading it, so the rules survive a long session.
2. Follow RULES.md → "At the start of every prompt", with N = 1.
3. Write `anionlab/check_data.py <baseline.html> <new.html>`. It extracts the JSON in `<script id="anion-data" type="application/json">` from both files and exits non-zero unless every top-level key is deep-equal: rows, colors, groups, anions, corrections, compare and explain. Run it on the baseline against itself; it must pass.
4. Load `artifact-design`, and then `frontend-design` for the top bar and the sheet.

-----BEGIN RULES.md-----
# Anion Lab update — rules for Prompts 1–5

## Context
- The page is my PHC 101 study site: one self-contained HTML artifact at https://claude.ai/artifact/KskMe89FbDab2AezbzLvoR. It has an Arabic RTL UI, LTR formulas and 210 anion reactions. I study on an iPhone, and my exams are marked against the slides, so one changed reaction row is worse than a missing feature.
- Update the page in place. If you don't have the Artifact tool, or it can't read or republish this URL (for example a chat-made artifact Claude Code can't write to), stop and tell me. Don't rebuild the page anywhere else.

## Rules that win over everything else
1. Reaction data is frozen. After every change, `python3 anionlab/check_data.py anionlab/before-pN.html <new>` must pass. Don't reword any observation, color word, equation or slide ref.
2. Never retype or regenerate the data. It sits on a single line of about 143 KB, which a normal file read truncates. Edit the page only with exact-match replacements on the code around it, and never write the file back from text you read.
3. Same link. Every publish passes `url`; never pass `force`. If the publish is refused because the page changed, merge onto the version it hands you, rerun the tests and publish that. If it asks to confirm changing a publicly shared artifact, ask me.
4. Progress stays on this device: use `localStorage` only, through the page's try/catch `store` helper. Don't use an artifact database, `window.storage` or a runtime capability, even though the Artifact tool prefers them for durable state. The page promises that nobody on another device can see the history.
5. The chrome has no hue. New controls use only `--ink --graphite --rule --surface --paper --wash`. No red delete button and no colored speaker: next to a test tube, a colored button teaches a wrong color.
6. Vanilla JS inside the existing IIFE. No libraries, audio files, build step or new views.
7. I wrote the acceptance tests from memory. If one disagrees with the page's data, the data wins: keep the data and name the wrong test in your report. Never change data to make a test pass.
8. If something is ambiguous and not covered here, take the reading that changes the least, note it, and keep going. Ask only if it would change reaction data.
9. No bugs ship. Never publish while a test fails, unless it's one of my tests that contradicts the data (Rule 7). If the same test still fails after 3 rounds of fixes, stop working on it, finish the rest, don't publish, and report it with a screenshot.

## At the start of every prompt
1. Save the prompt exactly as I pasted it to `anionlab/prompt-N.md`.
2. Read the artifact (`action: "read"`, the URL, no `path`), then read it again with `path: "index.html"` to save the full file. That saved file is this prompt's baseline: copy it to `anionlab/before-pN.html` and work on a copy. I edit this page in other chats too, so never build on a copy from an earlier prompt.
3. Check the findings below against the baseline. If one is different, follow the page and say so in your report.
4. If the previous prompt ended without publishing, stop and tell me. Don't build on it.

## Findings (read on 11 Oct 2026, version 1791672860-86cf; each one is a check, not a fact)
- `index.html` is about 280 KB and 1,562 lines, with vanilla JS in one IIFE. The data JSON has rows (210), colors, groups, anions, corrections (9 doc entries, 2 notes), compare (13 sets) and explain (92 entries).
- `VIEWS` lists seven views in a fixed bottom nav: lab (with a "قارن الشبيهين" compare mode), grid (color and "حفظك" mastery modes), find (search, colors, effects, ★ saved), unknown, play, quiz and errors. `show()` runs `INIT`, `ENTER` and `LEAVE[id]`.
- Saved progress uses three dot keys through `store`: `anionlab.v1.quiz`, `anionlab.v1.unknown` and `anionlab.v1.saved` (the ★ set, `SKEY`). `qz`, `unk` and `saved` are consts, loaded once at boot.
- `qz` holds `missedRows`, `weakRefs` and `rowStats`. `rowStats` is per-row mastery written by `record()`, which both the quiz and Unknown's `submitUnknown()` call.
- Group sizes: I has 2 anions, II 4, III 4, IV 4, V 3, VI 2.
- `mountScene()` schedules every animation step through `at(ms, fn, dur)`, scaled by `speed`. It returns `{ svg, cancel }` in three places, and `{ svg, cancel() {} }` in the reduced-motion branch. Compare mode mounts 2–4 scenes at once (`lab.cctl`). Play's pause only clears the auto-advance timer.
- Visual types: ppt 87, none 50, solution 24, gas 21, fumes 13, layer 8, stain 4, ring 2, flame 1. 27 rows have `heat`, 19 have `bubbles`, and 15 are gas-transfer scenes. The one flame row is F⁻ + "borax + conc. H₂SO₄ → flame" (L02 · s14).
- `window.__anionLab` = `{ ROWS, COLORS, show, version: 1, peekQuestion, skip, _t: {…} }`.
- The header `.top` holds the h1 and `.sub`. Tokens: --paper --surface --ink --graphite --rule --wash (plus --box --box-ink). The theme follows `prefers-color-scheme`.
- The artifact viewer makes `confirm()` return false and never shows `alert()`, so every confirmation has to be built into the page.

## Skills
Load each skill when a prompt says to. Names are as your skill list shows them; if a prefix differs, match the part after the colon.
- `artifact-design` before your first edit to the page. The page's existing design is the design system here.
- `frontend-design` only for new pieces, inside Rule 5, never to restyle anything.
- `anthropic-skills:built-in-browser` only if Playwright can't run in your workspace.
- Don't use: `anthropic-skills:web-artifacts-builder` (a React rewrite), `anthropic-skills:carmack-council-plan` or `anthropic-skills:carmack-council-review` (built for Next.js and run 9–10 subagents; this is one vanilla file), `artifact-capabilities` (Rule 4), `theme-factory` (Rule 5).

## Every prompt verifies, then publishes
1. Keep one Playwright script, `anionlab/tests.mjs`, and add each prompt's tests to it. Run every test written so far at 360×800 in light and in dark (`colorScheme`), plus once with `reducedMotion: "reduce"`. Fail on any console or page error. In every view, `scrollWidth ≤ 360`.
2. If Playwright's WebKit browser is installed, run the script once more on WebKit with `devices["iPhone 13"]`; that's the closest you can get to my iPhone. It can't reproduce the silent switch or Safari clearing storage, so don't treat it as proof of either.
3. Screenshot every view the prompt touched, in both themes, and look at each one yourself. Fix overlap, clipped text, anything behind the nav and a title that wraps.
4. `check_data.py` passes against this prompt's baseline.
5. Republish with `url` only when steps 1–4 pass (Rule 9), and confirm the URL in the result is mine.
6. Report in up to 3 lines, in Egyptian Arabic with English terms and no recap of your steps: what changed · tests n/n · anything reported.
-----END RULES.md-----

## Prompt 1 work — profiles on this device
- With no profiles, an in-page sheet asks "مين بيذاكر؟" and creates a profile from a name. Trim the name, reject empty and duplicate names (case-insensitive), and allow at most 30 characters. Insert it through the page's `esc()` or as `textContent`, never as raw HTML. The sheet can't be closed until a profile exists.
- Top bar: keep the title row as it is. Add a second row under it with the active name and a "تبديل" button that opens the profile sheet, where I can switch and add profiles (Prompt 2 adds the delete actions). Leave room at the other end of that row for Prompt 5's speaker. A long name ends in an ellipsis so the row never wraps.
- Keys: the profile list and active id in `anionlab:v1:profiles`, and per profile `anionlab:v1:<id>:quiz`, `:unknown`, `:settings` and `:saved`. Generate the id; never use the name. The ★ set is per profile too, because it's part of what a person saves.
- Migration, once, into the first profile created: copy each of the three dot keys that exists, read the copy back, then delete the dot key. When there's old progress, say so in the first sheet: "نتايجك اللي فاتت هتتنقل للبروفايل ده."
- `qz`, `unk` and `saved` become reloadable. A switch reloads all three and the settings from the new profile's keys, drops any running quiz round and Unknown sample held in memory, cancels running scenes, and re-renders the current view. Nothing may ever be saved under another profile's keys.
- If storage is blocked, the page still works, with profiles and progress kept in memory for the tab. Extend `store` with `del(k)` and an in-memory fallback; don't add a second storage path.
- The sheet has `role="dialog"` and `aria-modal`, takes focus when it opens, and closes on Escape once a profile exists. The page behind it is `inert`, and every tap target is ≥44 px.

### Tests (add to tests.mjs)
- T1: Create profiles A and B. In A, answer quiz questions and star a reaction, then switch to B: B shows zero answers and no ★. Answer one question in B and switch back: A's numbers and ★ are unchanged. Reload: both profiles exist and the active one is kept.
- T2: Seed the three dot keys before load and create the first profile. It shows that progress, ★ included, and the dot keys are gone. A second new profile starts at zero.
- T3: In a fresh context with empty storage (what my iPhone may show after Safari restarts), the page opens on "مين بيذاكر؟". After a profile is created, every view renders, with no errors.
- T4: With `localStorage` stubbed to throw, the page loads, a profile can be created, the quiz works for the session, and there are no uncaught errors.

## In your report
Ask me to try this on my iPhone: create a profile, answer 2 quiz questions, force-quit Safari (and the Claude app), reopen the link, and check whether the profile is still there. On iOS the artifact runs in a cross-origin frame whose storage Safari may clear when it quits.
