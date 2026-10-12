// README hero (1600×860) and GitHub social preview (1280×640), drawn as HTML with the site's own fonts and screenshots.
// Run after tools/readme-media.mjs: node tools/readme-art.mjs   → docs/media/hero.png, docs/social-preview.png
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { writeFileSync, unlinkSync } from "node:fs";

const media = n => pathToFileURL(process.cwd() + `/docs/media/${n}.png`).href;
const page = (w, h, phones, big) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600&family=Reem+Kufi:wght@700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
:root { --paper: #F1F2EF; --surface: #FFFFFF; --ink: #1B1D1C; --graphite: #595E5B; --rule: #D1D3CE; }
* { box-sizing: border-box; margin: 0; }
body { width: ${w}px; height: ${h}px; background: var(--paper); color: var(--ink); overflow: hidden; position: relative; font-family: "IBM Plex Sans Arabic", sans-serif; }
.copy { position: absolute; left: ${big ? 88 : 64}px; top: 0; bottom: 0; width: ${big ? 640 : 520}px; display: flex; flex-direction: column; justify-content: center; gap: ${big ? 22 : 16}px; }
.ar { font-family: "Reem Kufi", sans-serif; font-size: ${big ? 92 : 76}px; line-height: 1.05; direction: rtl; text-align: left; }
.en { font-family: "Source Serif 4", serif; font-size: ${big ? 40 : 32}px; font-weight: 600; letter-spacing: .01em; }
.rule { height: 3px; background: var(--ink); width: ${big ? 120 : 96}px; }
.pitch { font-family: "Source Serif 4", serif; font-size: ${big ? 25 : 21}px; line-height: 1.45; color: var(--graphite); max-width: ${big ? 540 : 480}px; }
.facts { display: flex; gap: 10px; flex-wrap: wrap; }
.facts span { font-family: "Source Serif 4", serif; font-size: ${big ? 19 : 16}px; border: 2px solid var(--ink); border-radius: 999px; padding: 4px 14px; }
.phones { position: absolute; right: ${big ? 64 : 40}px; top: 0; bottom: 0; display: flex; gap: ${big ? 26 : 18}px; align-items: center; }
.phone { width: ${big ? 248 : 220}px; border-radius: ${big ? 34 : 28}px; border: 3px solid var(--ink); overflow: hidden; background: var(--surface); box-shadow: 0 18px 40px rgba(27,29,28,.18); }
.phone img { display: block; width: 100%; }
.phone:nth-child(2) { transform: translateY(${big ? 46 : 36}px); }
.phone:nth-child(1) { transform: translateY(-${big ? 30 : 24}px); }
</style></head><body>
<div class="copy">
  <div class="ar">مختبر الأنيونات</div>
  <div class="en">Anion Lab</div>
  <div class="rule"></div>
  <p class="pitch">Every anion reaction from PHC&nbsp;101 (L01–L03) in a phone-sized lab: animated test tubes, the slides' exact wording, an exam-style quiz and a drill for your mistakes.</p>
  <div class="facts"><span>210 reactions</span><span>19 anions</span><span>6 groups</span><span>one HTML file</span></div>
</div>
<div class="phones">${phones.map(p => `<div class="phone"><img src="${media(p)}"></div>`).join("")}</div>
</body></html>`;

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const [file, w, h, phones, big] of [
  ["docs/media/hero.png", 1600, 860, ["lab-light", "compare-dark", "quiz-light"], true],
  ["docs/social-preview.png", 1280, 640, ["lab-light", "compare-dark"], false]
]) {
  const tmp = process.cwd() + "/docs/_art.html";
  writeFileSync(tmp, page(w, h, phones, big));
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(tmp).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: file });
  await p.close(); unlinkSync(tmp);
  console.log("wrote " + file);
}
await browser.close();
