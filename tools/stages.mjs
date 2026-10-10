// screenshot the lab stage + result for a list of [anion, reagent, condIndex]
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const scheme = process.argv[2] || "light", motion = process.argv[3] || "no-preference";
const cases = JSON.parse(process.argv[4]);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1.5, colorScheme: scheme, reducedMotion: motion });
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(pathToFileURL(process.cwd() + "/dist/test.html").href + "#lab");
await page.evaluate(() => document.fonts.ready);
let i = 0;
for (const [anion, reagent, ci = 0] of cases) {
  const group = await page.evaluate(a => window.__anionLab.ROWS.find(r => r.anion === a).group, anion);
  await page.click(`[data-lab-group="${group}"]`);
  await page.click(`[data-anion="${anion}"]`);
  await page.selectOption("#lab-reagent", reagent);
  if (ci) await page.click(`[data-cond-i="${ci}"]`);
  await page.waitForSelector('#lab-tube svg[data-state="done"]', { timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.locator(".stage").screenshot({ path: `shots/stage-${scheme}-${i++}.png` });
}
console.log(errs.length ? errs : "ok");
await browser.close();
