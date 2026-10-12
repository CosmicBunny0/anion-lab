// Prompt 3 screenshots at 360×800, light and dark: top bar, every view scrolled to the bottom (footer credit),
// the switcher (heading focused) and the picker after deleting the active profile. Montage: anionlab/shots/p3-montage-<scheme>.png
// Run: node anionlab/shots-p3.mjs <page.html>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";

const FILE = process.argv[2] || "anionlab/after-p3.html";
const URL_ = pathToFileURL(process.cwd() + "/" + FILE).href;
const OUT = "anionlab/shots";
const VIEWS = ["lab", "grid", "find", "unknown", "play", "quiz", "errors"];
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const shot = async name => { await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/p3-${name}-${scheme}.png` }); };
  await page.goto(URL_ + "#lab");
  await page.evaluate(() => document.fonts.ready);
  for (const n of ["Sara", "Mona"]) {
    if (!(await page.locator("#sheet-host").isVisible())) await page.click("#who-btn");
    await page.fill("#prof-name", n); await page.click("#prof-form button[type=submit]");
    await page.waitForSelector("#sheet-host", { state: "hidden" });
  }
  await shot("top");
  for (const v of VIEWS) {
    await page.click(`nav.tabs [data-nav="${v}"]`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await shot(`end-${v}`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.focus("#who-btn"); await page.keyboard.press("Enter");   // keyboard open shows where focus lands
  await shot("switcher");
  await page.click('#sheet-host [data-del="profile"]'); await page.click("[data-confirm-yes]");
  await shot("picker");
  await ctx.close();
}
await browser.close();
console.log("shots in " + OUT);
