// README media: phone screenshots of the built page (dist/test.html) and frames of three reactions for a GIF.
// Run: npm run build && node tools/readme-media.mjs   → docs/media/*.png, docs/media/frames/*.png
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { mkdirSync, rmSync } from "node:fs";

const URL_ = pathToFileURL(process.cwd() + "/dist/test.html").href;
const OUT = "docs/media";
rmSync(OUT + "/frames", { recursive: true, force: true });
mkdirSync(OUT + "/frames", { recursive: true });
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });

async function fresh(scheme, motion = "reduce") {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: motion });
  const page = await ctx.newPage();
  await page.goto(URL_ + "#lab");
  await page.evaluate(() => document.fonts.ready);
  await page.fill("#prof-name", "محمد"); await page.click("#prof-form button[type=submit]");
  await page.waitForSelector("#sheet-host", { state: "hidden" });
  return { ctx, page };
}
async function openRow(page, pick) {
  const r = await page.evaluate(src => { const { ROWS } = window.__anionLab; const row = ROWS.find(new Function("r", "return " + src)); const sib = ROWS.filter(x => x.anion === row.anion && x.reagent === row.reagent); return { id: row.id, g: row.group, a: row.anion, rg: row.reagent, i: sib.indexOf(row), n: sib.length }; }, pick);
  await page.click('nav.tabs [data-nav="lab"]');
  await page.click(`[data-lab-group="${r.g}"]`); await page.click(`#lab-anions [data-anion="${r.a}"]`); await page.selectOption("#lab-reagent", r.rg);
  if (r.n > 1) await page.click(`#lab-conds [data-cond-i="${r.i}"]`);
  return r.id;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const scrollTo = (page, sel, off = 12) => page.evaluate(([s, o]) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - o); }, [sel, off]);

// ── screenshots ──
for (const scheme of ["light", "dark"]) {
  const { ctx, page } = await fresh(scheme);
  await openRow(page, `r.anion === "S²⁻" && r.reagent === "Cr₂O₇²⁻"`);
  await shot(page, `lab-top-${scheme}`);
  await scrollTo(page, "#lab-anions", 70); await shot(page, `lab-${scheme}`);
  await page.click('[data-lab-mode="compare"]'); await page.selectOption("#cmp-set", "12");
  await scrollTo(page, "#lab-compare", 8); await shot(page, `compare-${scheme}`);
  await page.click('[data-lab-mode="single"]');
  await page.click('nav.tabs [data-nav="grid"]'); await page.click('[data-grid-group="II"]');
  await scrollTo(page, ".gtable", 8); await shot(page, `grid-${scheme}`);
  await page.click('nav.tabs [data-nav="find"]'); await page.click('[data-find-color="canary yellow"]');
  await scrollTo(page, "#find-out", 8); await shot(page, `find-${scheme}`);
  await page.click('nav.tabs [data-nav="unknown"]'); await page.click('#unk-panel details[open] [data-unk-test] >> nth=0');
  await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, `unknown-${scheme}`);
  await page.click('nav.tabs [data-nav="quiz"]');
  for (let i = 0; i < 12; i++) { const t = await page.evaluate(() => window.__anionLab.peekQuestion().type); if (t === "mcq") break; await page.evaluate(() => window.__anionLab.skip()); }
  await page.click('#q-panel .opts [data-opt][data-right="false"] >> nth=0');
  await scrollTo(page, "#q-panel", 8); await shot(page, `quiz-${scheme}`);
  await page.click('nav.tabs [data-nav="errors"]'); await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, `errors-${scheme}`);
  await page.click('nav.tabs [data-nav="play"]'); await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, `play-${scheme}`);
  await page.click("#who-btn"); await shot(page, `profiles-${scheme}`);
  await ctx.close();
}

// ── frames of three reactions, the stage only, motion on ──
{
  const { ctx, page } = await fresh("light", "no-preference");
  let n = 0;
  for (const pick of [`r.id === "I-co32-dil-hcl-base"`, `r.anion === "S²⁻" && r.reagent === "Cr₂O₇²⁻"`, `r.visual.type === "ring" && r.anion === "NO₃⁻"`]) {
    const id = await openRow(page, pick);
    await scrollTo(page, ".stage", 6);
    const stage = page.locator("#lab-single .stage");
    const t0 = Date.now();
    while (Date.now() - t0 < 4800) {
      await stage.screenshot({ path: `${OUT}/frames/f${String(n++).padStart(4, "0")}.png` });
      if (await page.locator(`#lab-tube svg[data-row="${id}"][data-state="done"]`).count() && Date.now() - t0 > 3200) break;
    }
    for (let k = 0; k < 8; k++) await stage.screenshot({ path: `${OUT}/frames/f${String(n++).padStart(4, "0")}.png` });   // hold the result
  }
  console.log(n + " frames");
  await ctx.close();
}
await browser.close();
console.log("media in " + OUT);
