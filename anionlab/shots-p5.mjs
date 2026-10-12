// Final visual pass at 360×800, light and dark: every view (top and bottom), the sound controls, the profile sheet
// (gate / switch / pick) and each delete confirmation. Montages: anionlab/shots/p5-<scheme>-<n>.png (5 per row).
// Run: node anionlab/shots-p5.mjs <page.html>
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const FILE = process.argv[2] || "anionlab/after-p5.html";
const URL_ = pathToFileURL(process.cwd() + "/" + FILE).href;
const OUT = "anionlab/shots";
const VIEWS = ["lab", "grid", "find", "unknown", "play", "quiz", "errors"];
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const made = { light: [], dark: [] };
for (const scheme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: scheme, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message)); page.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  const shot = async name => { await page.waitForTimeout(150); const p = `${OUT}/p5-${name}-${scheme}.png`; await page.screenshot({ path: p }); made[scheme].push(p); };
  const nav = id => page.click(`nav.tabs [data-nav="${id}"]`);
  await page.goto(URL_ + "#lab"); await page.evaluate(() => document.fonts.ready);
  await shot("gate");
  await page.fill("#prof-name", "Sara"); await page.click("#prof-form button[type=submit]"); await page.waitForSelector("#sheet-host", { state: "hidden" });
  await page.click("#spk-btn");
  for (const v of VIEWS) {
    await nav(v); await page.evaluate(() => window.scrollTo(0, 0)); await shot(`${v}-top`);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await shot(`${v}-end`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#who-btn"); await page.fill("#prof-name", "Mona"); await page.click("#prof-form button[type=submit]"); await page.waitForSelector("#sheet-host", { state: "hidden" });
  await page.click("#who-btn"); await shot("switch");
  for (const k of ["quiz", "unknown", "all", "profile"]) {
    await page.click(`#sheet-host [data-del="${k}"]`); await page.locator("#sheet-host .confirm").scrollIntoViewIfNeeded(); await shot(`confirm-${k}`);
    if (k !== "profile") await page.click("[data-confirm-no]");
  }
  await page.click("[data-confirm-yes]"); await shot("pick");
  if (errs.length) console.log(scheme + " errors: " + errs.join(" | "));
  await ctx.close();
}
await browser.close();
const py = `
import sys
from PIL import Image
paths=sys.argv[2:]; out=sys.argv[1]
ims=[Image.open(p) for p in paths]; w,h=ims[0].size
o=Image.new('RGB',(5*w+40,h),(128,128,128))
for i,im in enumerate(ims): o.paste(im,(i*(w+10),0))
o.save(out)`;
for (const s of ["light", "dark"]) for (let i = 0; i * 5 < made[s].length; i++)
  execFileSync("uv", ["run", "--no-project", "--with", "pillow", "python", "-I", "-c", py, `${OUT}/p5-${s}-${i + 1}.png`, ...made[s].slice(i * 5, i * 5 + 5)]);
console.log("montages: " + ["light", "dark"].map(s => Math.ceil(made[s].length / 5) + " " + s).join(", "));
