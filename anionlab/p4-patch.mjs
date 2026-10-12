// Prompt 4 (content fixes) on top of the live page: exact-match replacements around the data.
// Errors page: already one sorted list of 12 (no change). Distractors: NEED 3 → 2, counts per group. Drill: built on the existing streak.
// Usage: node anionlab/p4-patch.mjs <baseline.html> <out.html>
import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out] = process.argv;
let html = readFileSync(src, "utf8");
function rep(oldS, newS) {
  const n = html.split(oldS).length - 1;
  if (n !== 1) throw new Error(`expected exactly 1 match, found ${n}:\n${oldS.slice(0, 160)}`);
  html = html.replace(oldS, () => newS);
}

// ── distractors: at least 2 wrong options (3 when there are 3), group first, same reagent family only as a fallback ──
rep(`// ── where wrong options come from (MCQ both ways, True/False, Matching, and the condition blanks in Complete):
//    1) the question's own group; 2) only when the group gives fewer than 3, the same reagent family (fam) from the
//    other groups, most look-alike first; 3) otherwise no question. The "can't also be right" filters stay as they were.
const NEED = 3;`,
`// ── where wrong options come from (MCQ both ways and True/False):
//    1) the question's own group; 2) only when the group gives fewer than 2, the same reagent family (fam) from the
//    other groups, most look-alike first, up to 3; 3) fewer than 2 → no question. The "can't also be right" filters stay as they were.
//    Matching and the condition blanks in Complete keep their own rule. 3-option items work as well as 4 (Rodriguez 2005).
const NEED = 2, MAXD = 3;
const QSTATS = {};   // per group and type: questions built, how many needed the other-groups fallback, how many were skipped
function qcount(row, kind, src) {
  const g = QSTATS[row.group] || (QSTATS[row.group] = {}), c = g[kind] || (g[kind] = { built: 0, fallback: 0, skipped: 0 });
  if (!src) c.skipped++; else { c.built++; if (src === "fallback") c.fallback++; }
}`);
rep(`  const more = candidatesB(row, false).filter(c => !have.has(norm(c.s.observation))).slice(0, NEED - group.length);`,
    `  const more = candidatesB(row, false).filter(c => !have.has(norm(c.s.observation))).slice(0, MAXD - group.length);`);
rep(`// level window over a candidate list (easy = less alike), never fewer than 3
const windowed = (cands, level) => { const want = WANT(level), lo = Math.max(0, Math.min(want[0], cands.length - NEED)); return cands.slice(lo, Math.max(want[1], lo + NEED)); };`,
`// level window over a candidate list (easy = less alike); keeps 3 when there are 3, and a short list stays whole
const windowed = (cands, level) => { const want = WANT(level), lo = Math.max(0, Math.min(want[0], cands.length - MAXD)); return cands.slice(lo, Math.max(want[1], lo + MAXD)); };`);
rep(`        .map(a => best(a, famRows(a, row.reagent))).sort((x, y) => y.score - x.score).slice(0, NEED - cands.length));
      src = "fallback";
    }
    if (cands.length < NEED) return null;`,
`        .map(a => best(a, famRows(a, row.reagent))).sort((x, y) => y.score - x.score).slice(0, MAXD - cands.length));
      src = "fallback";
    }
    if (cands.length < NEED) { qcount(row, "mcqA", null); return null; }
    qcount(row, "mcqA", src);`);
rep(`  const st = stagedB(row);
  if (!st) return null;
  const chosen = shuffle(windowed(st.cands, level)).slice(0, 3);`,
`  const st = stagedB(row);
  if (!st) { qcount(row, "mcqB", null); return null; }
  qcount(row, "mcqB", st.src);
  const chosen = shuffle(windowed(st.cands, level)).slice(0, 3);`);
rep(`function buildTF(row, level) {
  const st = stagedB(row);
  if (!st) return null;`,
`function buildTF(row, level) {
  const st = stagedB(row);
  if (!st) { qcount(row, "tf", null); return null; }
  qcount(row, "tf", st.src);`);
// the condition blanks keep their v3 rule (other groups fill up to 3)
rep(`    if (pool.length < NEED) {`, `    if (pool.length < 3) {`);
rep(`      const add = [...new Set(more)].slice(0, NEED - pool.length);`, `      const add = [...new Set(more)].slice(0, 3 - pool.length);`);

// ── "راجع غلطاتي": a real drill over the missed rows ──
rep(`const QDEF = () => ({ answered: 0, correct: 0, level: 2, streak: 0, misses: 0, missedRows: {}, weakRefs: {}, rounds: 0, rowStats: {}, drill: {} });`,
    `const QDEF = () => ({ answered: 0, correct: 0, level: 2, streak: 0, misses: 0, missedRows: {}, weakRefs: {}, rounds: 0, rowStats: {}, drill: {}, drillType: {}, drillOn: false, drillPrev: null });`);
rep(`rounds: qz.rounds, rowStats: qz.rowStats, drill: qz.drill }); };`,
    `rounds: qz.rounds, rowStats: qz.rowStats, drill: qz.drill, drillType: qz.drillType, drillOn: qz.drillOn, drillPrev: qz.drillPrev }); };`);
rep(`function newRound(opts = {}) {
`, `function newRound(opts = {}) {
  if (qz.drillOn) { qz.drillOn = false; saveQ(); }
`);
rep(`function nextQuestion() {
  if (round.i >= round.list.length) {`, `function nextQuestion() {
  if (round.drill) return nextDrillQuestion();
  if (round.i >= round.list.length) {`);
rep(`    if (!q.reask) round.missed.push({ rowId: row.id, type: q.kind });
  }
  saveQ(); renderQuiz();`, `    if (!q.reask) round.missed.push({ rowId: row.id, type: q.kind });
  }
  // the form each missed row was last asked in, so the drill asks it in a new one
  q.rowIds.forEach(id => { if (qz.missedRows[id] !== undefined) qz.drillType[id] = q.kind; else delete qz.drillType[id]; });
  saveQ(); renderQuiz();`);
rep(`// rows that some question type can be built for (a few have no 3 valid wrong options under the source rule)
const ASKABLE = new Map();
const askable = id => { if (!ASKABLE.has(id)) ASKABLE.set(id, TYPES.some(t => build(ROW.get(id), t, 2))); return ASKABLE.get(id); };
const drillRows = () => Object.keys(qz.missedRows).filter(id => ROW.has(id) && isQuizzable(ROW.get(id)) && askable(id));
function startDrill() { const ids = drillRows(); if (ids.length) newRound({ pool: ids, label: "راجع غلطاتي" }); }`,
`// the drill asks each missed row in a new form every time (pharm-exam-forge): MCQ both ways, True/False, Complete; no matching,
// which grades several rows at once. A row can be drilled when at least 2 of these build, so a new form always exists.
const DRILL_TYPES = ["mcqA", "mcqB", "tf", "fill"];
const ASKABLE = new Map();
const askable = id => { if (!ASKABLE.has(id)) ASKABLE.set(id, DRILL_TYPES.filter(t => build(ROW.get(id), t, 2)).length >= 2); return ASKABLE.get(id); };
const drillRows = () => Object.keys(qz.missedRows).filter(id => ROW.has(id) && isQuizzable(ROW.get(id)) && askable(id));
// a row leaves after 2 right answers in a row on it (qz.drill, kept in the quiz key); the drill ends when none is left
function startDrill() {
  if (!drillRows().length) return;
  qz.drillOn = true; saveQ();
  round = { drill: true, list: [], i: 0, q: null, missed: [], reask: false, score: 0, total: 0, done: false, label: "راجع غلطاتي", skip: new Set() };
  nextQuestion();
}
function leaveDrill() { qz.drillOn = false; saveQ(); newRound(); }
function nextDrillQuestion() {
  const ids = drillRows().filter(id => !round.skip.has(id));
  if (!ids.length) { round.done = true; qz.drillOn = false; qz.rounds++; saveQ(); renderQuiz(); return; }
  // the row after the last one asked, so no row comes twice running while others wait
  const at = ids.indexOf(qz.drillPrev), id = ids.length > 1 ? ids[(at + 1) % ids.length] : ids[0];
  const row = ROW.get(id), last = qz.drillType[id];
  const other = last === "mcqA" ? "mcqB" : last === "mcqB" ? "mcqA" : null;   // the other MCQ direction first
  const order = (other ? [other] : []).concat(shuffle(DRILL_TYPES.filter(t => t !== last && t !== other)));
  let q = null;
  for (const t of order) { q = build(row, t, qz.level); if (q) break; }
  if (!q) { round.skip.add(id); return nextDrillQuestion(); }
  q.reask = false; q.kind = q.type === "mcq" ? (q.dir === "A" ? "mcqA" : "mcqB") : q.type;
  qz.drillPrev = id; round.q = q; q.answered = false;
  renderQuiz();
}`);
rep(`  if (e.target.closest("#q-drill")) { startDrill(); window.scrollTo(0, 0); return; }`,
    `  if (e.target.closest("#q-drill")) { if (round && round.drill && !round.done) leaveDrill(); else startDrill(); window.scrollTo(0, 0); return; }`);
rep(`ENTER.quiz = (opts = {}) => { if (opts.practice) newRound(opts.practice); else if (!round) newRound(); else renderQuiz(); };`,
    `ENTER.quiz = (opts = {}) => { if (opts.practice) newRound(opts.practice); else if (!round) { if (qz.drillOn && drillRows().length) startDrill(); else newRound(); } else renderQuiz(); };`);
rep(`  const next = \`<div class="row"><button type="button" class="btn" id="q-next">\${round.i + 1 >= round.list.length && (round.reask || !round.missed.length) ? "النتيجة" : "السؤال اللي بعده"}</button></div>\`;`,
    `  const last = round.drill ? !drillRows().filter(id => !round.skip.has(id)).length : round.i + 1 >= round.list.length && (round.reask || !round.missed.length);
  const next = \`<div class="row"><button type="button" class="btn" id="q-next">\${last ? "النتيجة" : "السؤال اللي بعده"}</button></div>\`;`);
rep(`function renderDrill() {
  const n = drillRows().length;
  $("#q-drill-row").innerHTML = \`<button type="button" class="btn ghost" id="q-drill" \${n ? "" : "disabled"} aria-describedby="q-drill-note">راجع غلطاتي\${n ? \` (\${n})\` : ""}</button>
    <p class="note" id="q-drill-note">\${n ? "أسئلة على اللي غلطت فيه بس. السؤال بيخرج من هنا لما تجاوبه صح مرتين ورا بعض." : "مفيش غلطات تراجعها دلوقتي. أي سؤال تغلط فيه هيظهر هنا."}</p>\`;
}`,
`function renderDrill() {
  const n = drillRows().length, on = !!(round && round.drill && !round.done);
  $("#q-drill-row").innerHTML = \`<button type="button" class="btn ghost" id="q-drill" \${n || on ? "" : "disabled"} aria-describedby="q-drill-note">\${on ? "اخرج من المراجعة" : \`راجع غلطاتي\${n ? \` (\${n})\` : ""}\`}</button>
    <p class="note" id="q-drill-note">\${on ? \`فاضل \${n}. السؤال بيخرج من المراجعة لما تجاوبه صح مرتين ورا بعض.\` : n ? "أسئلة على اللي غلطت فيه بس. السؤال بيخرج من هنا لما تجاوبه صح مرتين ورا بعض." : "مفيش غلطات تراجعها دلوقتي. أي سؤال تغلط فيه هيظهر هنا."}</p>\`;
}`);
rep(`    panel.innerHTML = \`<p class="big-title">خلصت الجولة: \${round.score} من \${round.total}</p>`,
    `    panel.innerHTML = \`<p class="big-title">\${round.drill ? "خلصت مراجعة غلطاتك" : "خلصت الجولة"}: \${round.score} من \${round.total}</p>\${round.drill ? \`<p>كل سؤال فيها اتجاوب صح مرتين ورا بعض.</p>\` : ""}`);
rep(`  const head = \`<p class="note" data-qtype="\${q.kind}">\${q.reask ? "إعادة لسؤال غلطت فيه، بنوع تاني · " : ""}سؤال \${round.i + 1} من \${round.list.length} · \${TYPE_LABEL[q.kind] || ""}</p>\${EN(qStem(q), "p", "q-stem")}\`;`,
    `  const streak = qz.missedRows[q.rowId] === undefined ? 2 : Math.min(2, qz.drill[q.rowId] || 0);
  const head = round.drill
    ? \`<p class="note" data-qtype="\${q.kind}" data-drill>مراجعة غلطاتك · فاضل \${drillRows().length} · صح \${streak} من 2 · <bdi dir="ltr" style="white-space:nowrap">\${TYPE_LABEL[q.kind] || ""}</bdi></p>\${EN(qStem(q), "p", "q-stem")}\`
    : \`<p class="note" data-qtype="\${q.kind}">\${q.reask ? "إعادة لسؤال غلطت فيه، بنوع تاني · " : ""}سؤال \${round.i + 1} من \${round.list.length} · \${TYPE_LABEL[q.kind] || ""}</p>\${EN(qStem(q), "p", "q-stem")}\`;`);

// ── test hooks ──
rep(`_t: { alike, famRows, norm, rowColorSet, mastery, fold, fam, similarity, isQuizzable, build } };`,
    `_t: { alike, famRows, norm, rowColorSet, mastery, fold, fam, similarity, isQuizzable, build, giveaway, NEED, MAXD, askable, drillRows, qstats: () => JSON.parse(JSON.stringify(QSTATS)), qstatsReset: () => { for (const k of Object.keys(QSTATS)) delete QSTATS[k]; }, round: () => round && { drill: !!round.drill, done: !!round.done } } };`);

writeFileSync(out, html);
console.log(`wrote ${out} (${Buffer.byteLength(html)} bytes)`);
