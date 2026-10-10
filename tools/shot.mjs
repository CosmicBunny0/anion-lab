// quick look: node tools/shot.mjs <view> [scheme] [out]
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const [view = "lab", scheme = "light", out = `shots/peek-${view}-${scheme}.png`, extra = ""] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: "reduce" });
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
await page.goto(pathToFileURL(process.cwd() + "/dist/test.html").href + "#" + view);
await page.evaluate(() => document.fonts.ready);
if (extra) await page.evaluate(extra);
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: true });
const sw = await page.evaluate(() => document.documentElement.scrollWidth);
console.log(out, "scrollWidth", sw, errs.length ? errs.join("\n") : "no errors");
await browser.close();
