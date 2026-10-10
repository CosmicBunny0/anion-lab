// render one quiz question of each type (forced) for review: node tools/quizpeek.mjs <scheme>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const scheme = process.argv[2] || "light";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.goto(pathToFileURL(process.cwd() + "/dist/test.html").href + "#quiz");
for (const t of ["mcqA", "tf", "match", "fill"]) {
  for (let k = 0; k < 40; k++) { const kind = await page.evaluate(() => window.__anionLab.peekQuestion()?.kind); if (kind === t) break; await page.evaluate(() => window.__anionLab.skip()); if (await page.locator("#q-new").count()) await page.click("#q-new"); }
  if (t === "tf") { await page.click("[data-tf=false]"); if (await page.locator("#q-panel [data-opt='0']").count()) await page.click("#q-panel [data-opt='0']"); }
  else if (t === "match") { const ls = await page.locator("[data-ml]").all(); const rs = await page.locator("[data-mr]").all(); for (let i = 0; i < ls.length; i++) { await ls[i].click(); await rs[i].click(); } await page.click("#q-match-done"); }
  else await page.click("#q-panel [data-opt='0']");
  await page.locator("#v-quiz").screenshot({ path: `shots/quiz-${t}-${scheme}.png` });
}
console.log(errs.length ? errs : "ok");
await browser.close();
