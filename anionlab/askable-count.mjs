// how many quizzable rows the drill can use on a page (askable), for the report
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const f of process.argv.slice(2)) {
  const p = await b.newPage();
  await p.goto(pathToFileURL(process.cwd() + "/" + f).href + "#lab");
  const r = await p.evaluate(() => {
    const { ROWS, _t } = window.__anionLab, q = ROWS.filter(_t.isQuizzable);
    const any = q.filter(r => ["mcqA", "mcqB", "tf", "match", "fill"].some(t => _t.build(r, t, 2))).length;
    const two = q.filter(r => ["mcqA", "mcqB", "tf", "fill"].filter(t => _t.build(r, t, 2)).length >= 2).length;
    return { quizzable: q.length, anyType: any, twoDrillTypes: two };
  });
  console.log(f, JSON.stringify(r));
  await p.close();
}
await b.close();
