# Update plan — profiles, delete history, credit, content fixes, lab sounds

Live artifact: https://claude.ai/artifact/KskMe89FbDab2AezbzLvoR (read 2026-10-11, version 1791672860-86cf).
`original.html` = that version as served. Its `<body>` is byte-identical to `dist/anion-lab.html`, so the page is edited
in its own source (`src/app.js`, `src/style.css`) and rebuilt with the existing `build-page.mjs` (no new build step).
`check_data.py` guards `rows` + `colors` against `original.html` after every step.

## Findings vs the brief
| Brief says | Page has | Handling |
|---|---|---|
| 6 views | 7 (lab, grid, **find**, unknown, play, quiz, errors) | credit footer + tests cover all 7 |
| dot keys quiz, unknown | also `anionlab.v1.saved` (★ bookmarks) | bookmarks move into the profile's **settings** key (keeps the 3-key layout); migrated with the others |
| data: rows, colors, groups, anions, corrections | + `compare`, `explain` | untouched |
| `__anionLab` = ROWS, COLORS, show, version, peekQuestion, skip | + `_t` test helpers | kept; soundLog/activeSounds added |
| Unknown plays scenes | Unknown shows static swatches, no `mountScene` | no sounds there (nothing animates) |
| ~200 KB | ~270 KB | — |
| visual types ppt 87 · none 50 · solution 24 · gas 21 · fumes 13 · layer 8 · stain 4 · ring 2 · flame 1 | same; heat 27, bubbles 19 | ✓ |

## Step 1 — Profiles
- `store`: add an in-memory mirror (`MEM`) used when `localStorage` throws, plus `del()` / `raw()`.
- Keys: `anionlab:v1:profiles` → `{ list:[{id,name}], active }`; per profile `anionlab:v1:<id>:quiz|unknown|settings`.
  settings = `{ sound:false, volume:.6, saved:[] }`.
- `qz`, `unk`, `saved` become reloadable (mutated in place): `loadQuiz()`, `loadUnk()`, `loadSettings()`; `saveQ`, `saveUnk`,
  `saveSettings` write only to the active profile's keys and do nothing with no active profile.
- Sheet (`openSheet(mode)`): gate "مين بيذاكر؟" (no profiles / last profile deleted), switcher (switch, add, Step 2 actions),
  pick-only (active profile deleted, others exist). Name: trim, non-empty, ≤30, no duplicate (case-insensitive); always `esc()`.
- `switchProfile(id)`: `Sound.stopAll()`, reload state, reset quiz round, re-render current view + top bar.
- Migration on first profile: copy old dot keys (quiz, unknown, saved→settings.saved), read back, then delete them.
- Tests: 1, 3, 11.

## Step 2 — Delete history (sheet actions, active profile only, in-page confirmation)
`clearQuiz`, `clearUnknown`, `clearAll` (quiz+unknown, keeps name/settings), `deleteProfile` (3 keys + list entry → pick-only or gate).
Privacy line exactly as given. Tests: 2.

## Step 3 — Credit
Top bar: h1 + `.sub` + `.credit` ("Made by Mohammed Ayman", LTR-isolated, `--graphite`); one `footer.credit-foot` after the views
inside `#app` (sits above the nav thanks to the existing bottom padding). `<meta name="author">`. Tests: 4.

## Step 4 — Content fixes
- Errors view: one list of 9 doc + 3 extra (deduped by slide text), sorted by lecture/slide, same `.err` + `.flag` layout,
  extras keep "زيادة للفهم — مش في السلايدز"; count derived (12); drop the "معادلات تانية…" section. Test 5.
- Distractor sources (`buildMCQ` A/B, `buildTF`, `buildMatch`): stage 1 = same group; stage 2 (only if <3) = same `fam()` from
  other groups by `similarity()` desc (matching: same reagent string so the stem stays true); else return null (skip).
  Filters `alike` / own-observation / `norm` unchanged. Questions carry `q.src = "group" | "fallback"`. Test 6 counts per group.
- "راجع غلطاتي": `startDrill()` = round of `qz.missedRows` only; `qz.drill[id]` streak; 2 right in a row removes the row,
  wrong resets (applies in every round; the old single-correct removal is replaced). Disabled + note when empty. Test 7.

## Step 5 — Lab sounds
`Sound` module: one AudioContext created on the speaker tap (or first tap anywhere if saved on), master gain (quiet),
synthesized cues drip / fizz / boil / hiss / clink / trickle / roar, quiz-only right / wrong. `mountScene` schedules cues with
its own `at()` (speed-scaled) and stops them in `cancel()`; `silence()` for Play pause. Reduced motion: each cue once ~300 ms
in step order. Speaker opens a small popover (on/off + volume slider) — the slider does not fit next to name + تبديل at 360 px.
`__anionLab.soundLog`, `activeSounds()`. Tests: 8, 9.

## Verify
`tests/update.mjs` (12 tests) at 360×800 light, dark, reduced motion; old `tests/acceptance.mjs` kept as regression (opens a
profile first); `tools/quizcheck.mjs`; screenshots of every view + sheet + confirmations; a11y pass; fresh subagent diff review.
