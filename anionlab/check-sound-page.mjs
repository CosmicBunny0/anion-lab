// smoke test for the sound-check page at 360 px, light and dark: no errors, no sideways scroll, 44 px targets,
// no AudioContext before a tap, each button plays, and the page still works when AudioContext is missing
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const URL_ = pathToFileURL(process.cwd() + "/anionlab/sound-check.html").href;
const b = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
let bad = 0; const fail = m => { bad++; console.log("FAIL " + m); };
for (const scheme of ["light", "dark", "noaudio"]) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, colorScheme: scheme === "dark" ? "dark" : "light" });
  await ctx.addInitScript(no => {
    window.__made = 0;
    if (no) { delete window.AudioContext; delete window.webkitAudioContext; return; }
    const A = window.AudioContext; window.AudioContext = class extends A { constructor(...a) { super(...a); window.__made++; window.__ctx = this; } };
  }, scheme === "noaudio");
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(URL_); await p.evaluate(() => document.fonts.ready);
  if (await p.evaluate(() => window.__made)) fail(scheme + ": AudioContext made before a tap");
  if (await p.evaluate(() => document.documentElement.scrollWidth) > 360) fail(scheme + ": sideways scroll");
  for (const el of await p.locator("button, #vol").all()) { const bb = await el.boundingBox(); if (bb.height < 44 || bb.width < 44) fail(`${scheme}: ${Math.round(bb.width)}×${Math.round(bb.height)} target`); }
  await p.screenshot({ path: `anionlab/shots/p5a-${scheme}.png`, fullPage: true });
  for (const cue of ["drip", "fizz", "clink", "right"]) for (const w of ["old", "new"]) await p.click(`[data-cue="${cue}"] [data-play="${w}"]`);
  await p.click("#all"); await p.waitForTimeout(300); await p.fill("#vol", "0.4"); await p.click("#stop");
  if (scheme !== "noaudio") {
    if (await p.evaluate(() => window.__made) !== 1) fail(scheme + ": expected exactly one AudioContext");
    if ((await p.getAttribute("#vol", "aria-valuetext")) !== "40%") fail(scheme + ": aria-valuetext");
  } else if (!(await p.textContent("#status")).includes("مش شغال")) fail("noaudio: no message");
  if (errs.length) fail(scheme + ": " + errs.join(" | "));
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} problem(s)` : "sound-check page: all checks ok");
process.exit(bad ? 1 : 0);
