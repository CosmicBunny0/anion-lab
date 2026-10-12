# Anion Lab update — Prompt 4 of 5: content fixes

Read `anionlab/RULES.md` and follow it, with N = 4. If it's missing, stop and tell me to run Prompt 1 first. If Prompt 3 ended without publishing, stop and tell me.

## How to treat what's already on the page
The live page was first built in another chat (v3) and already has much of what this prompt asks for. For every requirement and every test below:
- if it's already there and correct, keep it as it is and only add its test;
- if it differs, change only the difference;
- if it's missing, build it.
Never build a second copy of a feature that exists.

What I saw on the live page (version 1791789004-4374). Each one is a check, not a fact:
- The errors page already has a single list (`#err-list`), and the "زيادة للفهم — مش في السلايدز" marker exists.
- Distractors already come from the question's own group first, through `candidatesB()` and `stagedB()`, but with `const NEED = 3`: the other-groups fallback starts when the group gives fewer than 3, and the question is skipped below 3. This prompt wants 2.
- A "راجع غلطاتي" button exists (`startDrill()` → `newRound({ pool })`), and `qz` has `rowStats` (with a streak `s`) and a `drill` object. Check that it meets every drill rule below, especially that a row leaves after 2 right answers in a row on that row.

## Goal
Fix the errors page, make quiz distractors look like real exam options, and give me a drill for my mistakes.
**Done when:** T8–T10 pass, every earlier test still passes, `check_data.py` passes, and the same URL is republished.

Load `anthropic-skills:pharm-exam-forge` and follow its Ground rules and Mode A for the distractors and the drill.

## Errors page: all 12 in one list
The page must list all 12 errors in one list: the 9 from `DATA.corrections.doc`, plus the 3 rows whose `flag.source === "extra"` (L01 · s10, L01 · s16, L01 · s17 MgSO₄).
- The 3 extra ones use the same `.err` card with the slide/correct pair, and keep their "زيادة للفهم — مش في السلايدز" marker, because they aren't from my corrections table. No duplicates.
- Order all 12 by lecture and slide, and derive the header count from the list, so it reads 12.
- There's no separate "معادلات تانية لقيتها مش متوازنة" section. Keep the page's other sections.
- Change the view code only, never the data.

## Quiz distractors: same group first
This applies to `buildMCQ` (both directions) and `buildTF` (through `candidatesB`).
- Keep every existing exclusion: `alike`, `sameOutcome`, the own-observation and `famRows` checks, and `giveaway`. They stop an option that would also be a right answer.
- Take wrong options from the question's own group. Only when that gives fewer than 2, add rows from other groups in the same reagent family (`fam()`), most look-alike first. In code, that's `NEED = 2`.
- For an observation → anion question, a fallback anion must have its own row in that reagent family, and that row is the one the "why it's wrong" note shows.
- Use 3 distractors when there are 3; 2 is fine, since 3-option items work as well as 4 (Rodriguez 2005). With fewer than 2, skip the question. Never pad it with an option from an unrelated reagent. Clamp the `WANT` window so a short list isn't sliced down to nothing.
- Matching questions (one reagent across anions) and fill questions (color words) already follow this rule. Leave them as they are, unless they read `NEED` and break when it becomes 2; then keep their current behavior.
- Count, per group, the questions built, the ones that needed the fallback, and the skips. Expose the counts on `window.__anionLab._t` for the test.
- `ASKABLE` / `askable()` decide which rows the drill can use. Re-check them after the change, because more rows may become askable.

## "راجع غلطاتي"
A button in the quiz view drills only the active profile's `missedRows`, using quizzable rows only.
- A row leaves the drill, and `missedRows`, after 2 right answers in a row on that row. A wrong answer resets its streak. Each row's streak is stored in the quiz key, so it survives a reload.
- Ask each row in a new form every time (pharm-exam-forge): never the same question type twice running for one row, and try the other MCQ direction first. Use MCQ, true/false and fill questions. Leave out matching, because it grades several rows at once.
- Don't ask the same row twice in a row while other rows are waiting. Show "فاضل n" and the row's "صح x من 2".
- The drill ends when its list is empty. The same button leaves the drill early.
- When the profile has no missed rows, the button is disabled and a short note says why.

## Tests (add to tests.mjs)
- T8: The errors list has 12 entries in slide order with no duplicate, the 3 extra entries keep their marker, and the header says 12.
- T9: Build 50 questions per group in each MCQ direction, plus 50 true/false. Every wrong option comes from the question's group, or from the same reagent family only on a question flagged as a fallback, and none is a second correct answer. Print the built, fallback and skip counts per group.
- T10: Seed known missed row ids. The drill asks only those rows and never uses the same type twice running for a row. It removes a row after 2 right answers in a row and keeps it after right, wrong, right. It survives a reload mid-drill, and the button is disabled for a profile with no misses.

## Report
The usual 3 lines from RULES.md, then:
- T9's per-group counts (built / fallback / skipped), with the skip counts before and after `NEED` changed from 3 to 2.
- The exact output line of `check_data.py`.
- For each of the three sections above: already there / changed / built.
