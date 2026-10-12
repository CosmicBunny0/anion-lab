// T9's 50-per-group round-robin builds without the rule checks, so a page without counters (v3) can be compared
// Run: node anionlab/probe-p4.mjs <page.html>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const p = await b.newPage();
await p.goto(pathToFileURL(process.cwd() + "/" + process.argv[2]).href + "#lab");
const out = await p.evaluate(() => {
  const { ROWS, _t } = window.__anionLab, o = {};
  const give = row => { const t = _t.fold(row.observation + " " + (row.condition || "")); return t.includes(_t.fold(row.anion)) || t.includes(row.anionName.toLowerCase()) || (row.anion === "CO₃²⁻" && /carbonate/.test(t)); };
  for (const g of ["I", "II", "III", "IV", "V", "VI"]) {
    const rows = ROWS.filter(x => x.group === g && _t.isQuizzable(x));
    for (const type of ["mcqA", "mcqB", "tf"]) {
      const c = (o[g] = o[g] || {})[type] = { built: 0, fallback: 0, skipped: 0 };
      for (let i = 0; i < 50; i++) {
        const row = rows[i % rows.length];
        if (type === "mcqA" && give(row)) continue;
        const q = _t.build(row, type, 1 + (i % 3));
        if (!q) c.skipped++; else { c.built++; if (q.src === "fallback") c.fallback++; }
      }
    }
  }
  return o;
});
for (const [g, t] of Object.entries(out)) console.log(g, Object.entries(t).map(([k, c]) => `${k} ${c.built}/${c.fallback}/${c.skipped}`).join(" · "));
await b.close();
