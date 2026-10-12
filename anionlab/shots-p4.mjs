// Prompt 4 screenshots at 360×800, light and dark: quiz with misses, a drill question, the drill's end, no misses, errors list.
// Montage: anionlab/shots/p4-montage-<scheme>.png. Run: node anionlab/shots-p4.mjs <page.html>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";

const FILE = process.argv[2] || "anionlab/after-p4.html";
const URL_ = pathToFileURL(process.cwd() + "/" + FILE).href;
const OUT = "anionlab/shots";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
async function answer(page, right) {
  const q = await page.evaluate(() => { const q = window.__anionLab.peekQuestion(); return { type: q.type, truth: q.truth }; });
  if (q.type === "tf") { await page.click(`#q-panel [data-tf="${right ? q.truth : !q.truth}"]`); if (right && !q.truth) await page.click('#q-panel .opts [data-opt][data-right="true"]'); }
  else await page.click(`#q-panel .opts [data-opt][data-right="${right}"] >> nth=0`);
}
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const shot = async name => { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/p4-${name}-${scheme}.png` }); };
  await page.goto(URL_ + "#quiz");
  await page.evaluate(() => document.fonts.ready);
  await page.fill("#prof-name", "Sara"); await page.click("#prof-form button[type=submit]");
  await page.waitForSelector("#sheet-host", { state: "hidden" });
  const id = await page.evaluate(() => window.__anionLab.peekState().profiles.active);
  const ids = await page.evaluate(() => { const { ROWS, _t } = window.__anionLab; return ["II", "IV"].map(g => ROWS.find(r => r.group === g && _t.isQuizzable(r) && _t.askable(r.id)).id); });
  await page.evaluate(([k, ids]) => localStorage.setItem(k, JSON.stringify({ answered: 2, correct: 0, missedRows: Object.fromEntries(ids.map(i => [i, 1])) })), [`anionlab:v1:${id}:quiz`, ids]);
  await page.reload(); await page.waitForSelector("#q-drill");
  await shot("quiz-misses");
  await page.click("#q-drill");
  await shot("drill-q");
  await answer(page, true);
  await shot("drill-fb");
  for (let i = 0; i < 6 && !(await page.evaluate(() => window.__anionLab._t.round().done)); i++) { if (await page.locator("#q-next").count()) await page.click("#q-next"); if (await page.evaluate(() => window.__anionLab._t.round().done)) break; await answer(page, true); }
  if (await page.locator("#q-next").count()) await page.click("#q-next");
  await shot("drill-done");
  await page.click("#q-new");
  await shot("no-misses");
  await page.click('nav.tabs [data-nav="errors"]');
  await shot("errors");
  await ctx.close();
}
await browser.close();
console.log("shots in " + OUT);
