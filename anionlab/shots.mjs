// Screenshots of the pieces a prompt touched, at 360×800 in light and dark.
// Run: node anionlab/shots.mjs <page.html> <prefix>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FILE = process.argv[2] || "anionlab/before-p1.html";
const PREFIX = process.argv[3] || "p1";
const URL_ = pathToFileURL(process.cwd() + "/" + FILE).href;
const OUT = "anionlab/shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const shot = async name => { await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}/${PREFIX}-${name}-${scheme}.png` }); };
  await page.goto(URL_ + "#lab");
  await page.evaluate(() => { localStorage.setItem("anionlab.v1.quiz", JSON.stringify({ answered: 7, correct: 5 })); localStorage.setItem("anionlab.v1.saved", "[]"); });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await shot("sheet-first");
  await page.fill("#prof-name", "محمد أيمن");
  await page.click("#prof-form button[type=submit]");
  await shot("lab");
  for (const n of ["Sara", "عبدالرحمن محمد عبدالعزيز السيد أحمد".slice(0, 30)]) {
    await page.click("#who-btn"); await page.fill("#prof-name", n); await page.click("#prof-form button[type=submit]");
  }
  await shot("lab-longname");
  await page.click("#who-btn");
  await page.fill("#prof-name", "sara");
  await page.click("#prof-form button[type=submit]");
  await shot("sheet-switch");
  await page.keyboard.press("Escape");
  await page.click('nav.tabs [data-nav="quiz"]');
  await shot("quiz");
  await ctx.close();
}
await browser.close();
console.log("shots in " + OUT);
