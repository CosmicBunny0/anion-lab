// Prompt 2 screenshots at 360×800, light and dark: top bar with a long name, history section, confirmation, picker after a delete.
// Run: node anionlab/shots-p2.mjs <page.html>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";

const FILE = process.argv[2] || "anionlab/after-p2.html";
const URL_ = pathToFileURL(process.cwd() + "/" + FILE).href;
const OUT = "anionlab/shots";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const shot = async name => { await page.waitForTimeout(200); await page.screenshot({ path: `${OUT}/p2-${name}-${scheme}.png` }); };
  await page.goto(URL_ + "#lab");
  await page.evaluate(() => document.fonts.ready);
  for (const n of ["Sara", "عبدالرحمن محمد عبدالعزيز السيد أحمد".slice(0, 30)]) {
    if (!(await page.locator("#sheet-host").isVisible())) await page.click("#who-btn");
    await page.fill("#prof-name", n); await page.click("#prof-form button[type=submit]");
    await page.waitForSelector("#sheet-host", { state: "hidden" });
  }
  await shot("top-longname");
  await page.click("#who-btn");
  await page.locator("#sheet-host .hist").scrollIntoViewIfNeeded();
  await shot("history");
  await page.click('#sheet-host [data-del="profile"]');
  await page.locator("#sheet-host .confirm").scrollIntoViewIfNeeded();
  await shot("confirm");
  await page.click("[data-confirm-yes]");
  await shot("picker");
  await ctx.close();
}
await browser.close();
console.log("shots in " + OUT);
