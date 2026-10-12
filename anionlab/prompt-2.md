Before this prompt: the live page (v3) was built in another chat and already has much of what's below.
For every requirement and test: if it's already there and correct, keep it and only add its test;
if it differs, change only the difference; if it's missing, build it. Never duplicate a feature.
Also fix one thing left from Prompt 1: a long profile name must not push "PHC 101 · … Groups I–VI"
onto two lines. Truncate the name with an ellipsis. Keep the other Prompt 1 differences as they are.

# Anion Lab update — Prompt 2 of 5: delete history

Read `anionlab/RULES.md` and follow it, with N = 2. If it's missing, stop and tell me to run Prompt 1 first.

## Goal
Add per-profile delete actions to the profile sheet from Prompt 1.
**Done when:** T5 and T6 pass, every earlier test still passes, and the same URL is republished.

## Work
Load `frontend-design` for the new buttons and the confirmation, inside Rule 5.

| Button | What it deletes from the active profile |
|---|---|
| "امسح نتايج الكويز" | its quiz key: totals, level, mistakes, weak spots, and the grid's "حفظك" marks, which live in that key |
| "امسح سجل الـ Unknown" | its unknown key |
| "امسح كل سجلي" | the quiz and unknown keys; the name, ★ and sound settings stay |
| "امسح البروفايل ده" | all four keys and its entry in the profile list |

- Each button opens an in-page confirmation (not `confirm()`; see Findings). It names what will be deleted, says it can't be undone, and has two buttons: "أيوه، امسح" and "لا، ارجع". Only the active profile is touched.
- After the active profile is deleted, open the switcher on the first remaining profile. If none is left, ask "مين بيذاكر؟" again.
- The delete buttons look like the rest of the page: outlined or dashed in `--graphite` or `--ink`, with no color.
- Add this line to the sheet, exactly: "السجل محفوظ على الجهاز ده بس، ومحدش على جهاز تاني يقدر يشوفه."
- Under it, in `--graphite`, add: "على الآيفون ممكن يتمسح لو قفلت Safari خالص أو مسحت بيانات المتصفح." When storage is blocked in the current browser, show this instead: "المتصفح ده مانع الحفظ، فالسجل هيفضل لحد ما تقفل الصفحة بس."

### Tests (add to tests.mjs)
- T5: "امسح كل سجلي" in A resets A's quiz and Unknown, keeps A's name, ★ and settings, and leaves every one of B's keys byte-identical.
- T6: Compare all `anionlab:*` keys before and after each action. Each of the four buttons deletes exactly its own keys of the active profile and nothing else. "لا، ارجع" deletes nothing. Deleting the last profile brings back "مين بيذاكر؟".
