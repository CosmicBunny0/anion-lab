// generate many quiz questions of every type inside the page and check none has a second correct answer
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage();
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(pathToFileURL(process.cwd() + "/dist/test.html").href + "#quiz");
const out = await page.evaluate(() => {
  const L = window.__anionLab, { alike, famRows, norm, rowColorSet } = L._t, R = new Map(L.ROWS.map(r => [r.id, r]));
  const bad = [], seen = {};
  for (let k = 0; k < 2500; k++) {
    const q = L.peekQuestion();
    if (!q) { document.querySelector("#q-new")?.click(); continue; }
    seen[q.kind] = (seen[q.kind] || 0) + 1;
    const row = R.get(q.rowId);
    if (q.type === "mcq" && q.dir === "A") for (const o of q.opts) if (!o.right && famRows(o.key, row.reagent).some(s => alike(s, row) || norm(s.observation) === norm(row.observation))) bad.push(`mcqA ${row.id}: ${o.key} also fits`);
    if (q.type === "mcq" && q.dir === "B") for (const o of q.opts) if (!o.right && famRows(row.anion, row.reagent).some(s => norm(s.observation) === norm(o.key) || alike(s, R.get(o.via)))) bad.push(`mcqB ${row.id}: "${o.key}" also true`);
    if (q.type === "tf") {
      if (!q.truth && famRows(row.anion, row.reagent).some(s => norm(s.observation) === norm(q.shown) || alike(s, R.get(q.via)))) bad.push(`tf ${row.id}: false statement is actually true`);
      if (q.fixOpts.filter(o => o.right).length !== 1) bad.push(`tf ${row.id}: correction has ${q.fixOpts.filter(o => o.right).length} right options`);
    }
    if (q.type === "match") {
      const rs = q.left.map(id => R.get(id));
      if (new Set(rs.map(r => r.anion)).size !== rs.length) bad.push(`match ${row.id}: duplicate anion`);
      for (const a of rs) for (const b of rs) if (a !== b && (alike(a, b) || famRows(a.anion, b.reagent).some(s => alike(s, b)))) bad.push(`match ${row.id}: ${a.anion} could also take "${b.observation}"`);
    }
    if (q.type === "fill") {
      if (new Set(q.opts).size !== q.opts.length || q.opts.filter(o => o === q.answer).length !== 1) bad.push(`fill ${row.id}: options broken`);
      if (q.mode === "color") {
        if (!row.observation.toLowerCase().includes(q.answer.toLowerCase())) bad.push(`fill ${row.id}: answer not the slide word`);
        for (const o of q.opts) if (o !== q.answer && rowColorSet(row).has(o)) bad.push(`fill ${row.id}: distractor ${o} is also in this reaction`);
      } else {
        const sibs = L.ROWS.filter(s => s.anion === row.anion && s.reagent === row.reagent);
        for (const o of q.opts) if (o !== q.answer && sibs.some(s => s.condition === o && alike(s, row))) bad.push(`fill ${row.id}: condition ${o} gives the same result`);
      }
    }
    L.skip();
    document.querySelector("#q-new")?.click();
  }
  return { seen, bad: [...new Set(bad)] };
});
console.log("generated:", out.seen);
console.log(out.bad.length ? out.bad.slice(0, 20).join("\n") : "no question with a second correct answer");
if (errs.length) console.log("page errors:", errs);
await browser.close();
process.exit(out.bad.length || errs.length ? 1 : 0);
