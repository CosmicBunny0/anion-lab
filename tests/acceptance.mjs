// 12 acceptance tests for the anion lab. Drives the UI the way a student would.
// Run: node tests/acceptance.mjs        (uses the installed Chrome via playwright-core)
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL_ = pathToFileURL(process.cwd() + "/dist/test.html").href;
const COLORS = JSON.parse(readFileSync("data/colors.json", "utf8"));
const ROWS = JSON.parse(readFileSync("data/reactions.json", "utf8"));
const EXPLAIN = JSON.parse(readFileSync("data/explain.json", "utf8"));
const COMPARE = JSON.parse(readFileSync("data/compare.json", "utf8"));
const VIEWS = ["lab", "grid", "find", "unknown", "play", "quiz", "errors"];
mkdirSync("shots/final", { recursive: true });

const rgb = hex => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const plain = s => s.replace(/[₀-₉]/g, c => "0123456789"["₀₁₂₃₄₅₆₇₈₉".indexOf(c)]).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, c => ({ "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "−" }[c]));
class Fail extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };
const eqColor = (part, word, label) => {
  expect(part, `${label}: no element for this part`);
  expect(part.fill === rgb(COLORS[word]), `${label}: fill ${part.fill} ≠ ${word} ${COLORS[word]} (${rgb(COLORS[word])})`);
  expect(part.color === word, `${label}: data-color "${part.color}" ≠ "${word}"`);
};

async function open(page) {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(URL_ + "#lab");
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

// choose anion → reagent → condition through the UI, wait for the tube to finish, read its final state
async function run(page, anion, reagent, condition = null, { settle = 1100 } = {}) {
  const group = ROWS.find(r => r.anion === anion).group;
  await page.click(`[data-lab-group="${group}"]`);
  await page.click(`#lab-anions [data-anion="${anion}"]`);
  await page.selectOption("#lab-reagent", reagent);
  if (condition !== null) {
    const btn = page.locator(`#lab-conds button[data-cond="${condition}"]`);
    if (await btn.count()) await btn.click();
    else expect(await page.locator(`#lab-conds [data-cond="${condition}"]`).count() === 1, `condition "${condition}" not offered for ${anion} + ${reagent}`);
  }
  // record the order in which the ppt / layer / solution colors are painted while it plays
  await page.evaluate(() => {
    window.__seen = [];
    const svg = document.querySelector("#lab-tube svg");
    const mo = new MutationObserver(ms => ms.forEach(m => { if (m.attributeName === "data-color") window.__seen.push(m.target.getAttribute("data-part") + ":" + m.target.getAttribute("data-color")); }));
    mo.observe(svg, { attributes: true, subtree: true, attributeFilter: ["data-color"] });
  });
  await page.waitForSelector('#lab-tube svg[data-state="done"]', { timeout: 30000 });
  await page.waitForTimeout(settle);
  return page.evaluate(() => {
    const svg = document.querySelector("#lab-tube svg");
    const info = sel => {
      const el = svg.querySelector(sel); if (!el) return null;
      const target = el.tagName === "g" ? el.querySelector("ellipse") || el : el;
      const cs = getComputedStyle(target), gs = getComputedStyle(el);
      return { fill: cs.fill, opacity: +gs.opacity * +cs.opacity, color: el.getAttribute("data-color"), dissolved: el.getAttribute("data-dissolved") === "true", position: el.getAttribute("data-position"), hidden: !!el.closest("[hidden]") };
    };
    const res = document.querySelector("#lab-result");
    const flag = res.querySelector(".flag");
    return {
      state: svg.dataset.state,
      ppt: info('[data-part="ppt"]'), solution: info('[data-part="solution"]'), layer: info('[data-part="layer"]'),
      ring: info('[data-part="ring"]'), fumes: info('[data-part="fumes"]'), flame: info('[data-part="flame"]'), stain: info('[data-part="stain"]'),
      bubbles: !!svg.querySelector('[data-part="bubbles"] .bub'), heat: !!svg.querySelector('[data-part="heat"]'),
      pptHistory: svg.getAttribute("data-ppt-history"), layerHistory: svg.getAttribute("data-layer-history"), seen: window.__seen,
      obs: res.querySelector(".obs").dataset.raw, ref: res.querySelector("[data-ref]").textContent.trim(), text: res.innerText,
      flag: flag ? { text: flag.innerText, slide: flag.querySelector(".slide [data-raw]")?.dataset.raw, correct: flag.querySelector(".right [data-raw]")?.dataset.raw } : null,
      eq: res.querySelector(".eq")?.dataset.raw || null
    };
  });
}
async function answerAny(page) {
  if (await page.locator("#q-panel [data-tf]").count()) {
    await page.click("#q-panel [data-tf='false']");
    if (await page.locator("#q-panel [data-opt]:not([disabled])").count()) await page.click("#q-panel [data-opt]:not([disabled]) >> nth=0");
  } else if (await page.locator("#q-panel [data-ml]").count()) {
    const ls = await page.locator("#q-panel [data-ml]").all(), rs = await page.locator("#q-panel [data-mr]").all();
    for (let i = 0; i < ls.length; i++) { await page.locator("#q-panel [data-ml]").nth(i).click(); await page.locator("#q-panel [data-mr]").nth(i).click(); }
    await page.click("#q-match-done");
  } else await page.click("#q-panel [data-opt='0']");
  await page.waitForSelector("#q-fb", { timeout: 5000 });
}
const visible = p => p && !p.hidden && !p.dissolved && p.opacity > 0.5;

const TESTS = [
  ["1. S²⁻ + AgNO₃ → black ppt Ag₂S", async page => {
    const r = await run(page, "S²⁻", "AgNO₃");
    expect(/Black ppt/.test(r.obs), `observation "${r.obs}"`);
    expect(visible(r.ppt), "no visible ppt"); eqColor(r.ppt, "black", "ppt");
    expect(plain(r.text).includes(plain("Ag₂S")), "Ag₂S not named");
    expect(r.ref === "L01 · s28", `ref ${r.ref}`);
  }],
  ["2. S₂O₃²⁻ + AgNO₃ → white ppt → yellow → brown → black on standing", async page => {
    const r = await run(page, "S₂O₃²⁻", "AgNO₃", "standing");
    expect(/White ppt/.test(r.obs) && /standing/.test(r.obs) && /yellow, brown and finally black/.test(r.obs), `observation "${r.obs}"`);
    expect(r.pptHistory === "white,yellow,brown,black", `ppt colors painted: ${r.pptHistory}`);
    const order = r.seen.filter(x => x.startsWith("ppt:")).map(x => x.slice(4));
    if (order.length) expect(order.join(",") === "white,yellow,brown,black", `colors seen while playing: ${order.join(",")}`); // empty only with reduced motion (instant end state)
    eqColor(r.ppt, "black", "final ppt");
  }],
  ["3. HCO₃⁻ + BaCl₂ → no ppt cold; boil → white BaCO₃ + CO₂ bubbles", async page => {
    const cold = await run(page, "HCO₃⁻", "BaCl₂", "cold");
    expect(/No ppt/.test(cold.obs) && /cold/.test(cold.obs), `cold observation "${cold.obs}"`);
    expect(!cold.ppt, "a ppt is drawn on cold");
    const boil = await run(page, "HCO₃⁻", "BaCl₂", "boiling");
    expect(/boiling/.test(boil.obs) && /white turbidity/.test(boil.obs), `boil observation "${boil.obs}"`);
    expect(visible(boil.ppt), "no visible ppt on boiling"); eqColor(boil.ppt, "white", "ppt on boiling");
    expect(boil.bubbles, "no CO₂ bubbles"); expect(boil.heat, "boiling not shown");
    expect(plain(boil.text).includes(plain("BaCO₃")) && plain(boil.text).includes(plain("CO₂")), "BaCO₃ / CO₂ not named");
  }],
  ["4. Br⁻ + chlorine water + CHCl₃ → orange/brown bottom layer, colorless with excess", async page => {
    const r = await run(page, "Br⁻", "chlorine water + CHCl₃", "chlorine water");
    expect(/Orange or yellow or brown/.test(r.obs) && /chloroform layer/.test(r.obs), `observation "${r.obs}"`);
    expect(r.layer && r.layer.position === "bottom", "CHCl₃ layer not at the bottom");
    eqColor(r.layer, "orange", "CHCl₃ layer");
    const x = await run(page, "Br⁻", "chlorine water + CHCl₃", "excess chlorine water");
    expect(/disappears/.test(x.obs) && /HBrO₃/.test(x.obs), `excess observation "${x.obs}"`);
    expect(x.layerHistory === "orange,colorless", `layer colors painted: ${x.layerHistory}`);
    eqColor(x.layer, "colorless", "CHCl₃ layer with excess");
  }],
  ["5. I⁻ + conc. H₂SO₄ → violet fumes; Br⁻ → brown fumes", async page => {
    const i = await run(page, "I⁻", "conc. H₂SO₄");
    expect(/Violet fumes/.test(i.obs), `I⁻ observation "${i.obs}"`); expect(visible(i.fumes), "no fumes for I⁻"); eqColor(i.fumes, "violet", "I⁻ fumes");
    const b = await run(page, "Br⁻", "conc. H₂SO₄");
    expect(/Brown fumes/.test(b.obs), `Br⁻ observation "${b.obs}"`); expect(visible(b.fumes), "no fumes for Br⁻"); eqColor(b.fumes, "brown", "Br⁻ fumes");
  }],
  ["6. F⁻: no ppt with AgNO₃; white gelatinous ppt with BaCl₂", async page => {
    const a = await run(page, "F⁻", "AgNO₃");
    expect(/No ppt/.test(a.obs) && /AgF is soluble/.test(a.obs), `AgNO₃ observation "${a.obs}"`); expect(!a.ppt, "a ppt is drawn with AgNO₃");
    const b = await run(page, "F⁻", "BaCl₂");
    expect(/White gelatinous ppt/.test(b.obs), `BaCl₂ observation "${b.obs}"`); expect(visible(b.ppt), "no ppt with BaCl₂"); eqColor(b.ppt, "white", "BaF₂ ppt");
  }],
  ["7. FeCl₃: SCN⁻ blood red solution; ferrocyanide Prussian blue ppt; ferricyanide brown color", async page => {
    const s = await run(page, "SCN⁻", "FeCl₃", "");
    expect(/^Blood red color$/.test(s.obs), `SCN⁻ observation "${s.obs}"`); expect(!s.ppt, "SCN⁻ drawn as a ppt"); eqColor(s.solution, "blood red", "SCN⁻ solution");
    const f = await run(page, "[Fe(CN)₆]⁴⁻", "FeCl₃");
    expect(/Prussian blue ppt/.test(f.obs), `ferrocyanide observation "${f.obs}"`); expect(visible(f.ppt), "no Prussian blue ppt"); eqColor(f.ppt, "Prussian blue", "ferrocyanide ppt");
    const g = await run(page, "[Fe(CN)₆]³⁻", "FeCl₃");
    expect(/Brown color/.test(g.obs), `ferricyanide observation "${g.obs}"`); expect(!g.ppt, "ferricyanide drawn as a ppt"); eqColor(g.solution, "brown", "ferricyanide solution");
  }],
  ["8. AgNO₃: AsO₄³⁻ chocolate brown; PO₄³⁻ yellow", async page => {
    const a = await run(page, "AsO₄³⁻", "AgNO₃");
    expect(/Chocolate brown ppt/.test(a.obs), `arsenate observation "${a.obs}"`); expect(visible(a.ppt), "no arsenate ppt"); eqColor(a.ppt, "chocolate brown", "Ag₃AsO₄");
    const p = await run(page, "PO₄³⁻", "AgNO₃");
    expect(/^Yellow ppt\.?$/.test(p.obs), `phosphate observation "${p.obs}"`); expect(visible(p.ppt), "no phosphate ppt"); eqColor(p.ppt, "yellow", "Ag₃PO₄");
  }],
  ["9. Ammonium molybdate: AsO₄³⁻ canary yellow only after boiling; PO₄³⁻ on standing", async page => {
    const a = await run(page, "AsO₄³⁻", "ammonium molybdate", "after boiling");
    expect(/Canary yellow ppt\. after boiling/.test(a.obs), `arsenate observation "${a.obs}"`); expect(a.heat, "boiling not shown");
    expect(visible(a.ppt), "no arsenate ppt"); eqColor(a.ppt, "canary yellow", "arseno-molybdate");
    const p = await run(page, "PO₄³⁻", "ammonium molybdate", "on standing (or warming by hand)");
    expect(/Canary yellow ppt\. On standing/.test(p.obs), `phosphate observation "${p.obs}"`); expect(!p.heat, "phosphate shown as boiled");
    expect(visible(p.ppt), "no phosphate ppt"); eqColor(p.ppt, "canary yellow", "phospho-molybdate");
  }],
  ["10. Brown ring: NO₃⁻ only with conc. H₂SO₄ down the wall; NO₂⁻ already with the dilute acid", async page => {
    const d = await run(page, "NO₃⁻", "FeSO₄ + H₂SO₄ (brown ring test)", "dil. H₂SO₄");
    expect(/No Rx/.test(d.obs), `NO₃⁻ dilute observation "${d.obs}"`); expect(!d.ring, "a ring is drawn for NO₃⁻ with dil. acid");
    const c = await run(page, "NO₃⁻", "FeSO₄ + H₂SO₄ (brown ring test)", "conc. H₂SO₄ on the walls of test tube");
    expect(/Conc\. H₂SO₄ on the walls/.test(c.obs) && /Brown ring/.test(c.obs), `NO₃⁻ conc observation "${c.obs}"`); expect(visible(c.ring), "no ring for NO₃⁻ with conc. acid"); eqColor(c.ring, "brown", "NO₃⁻ ring");
    const n = await run(page, "NO₂⁻", "FeSO₄ + H₂SO₄ (brown ring test)", "dil. H₂SO₄");
    expect(/Brown ring/.test(n.obs) && /dil\. H₂SO₄/.test(n.obs), `NO₂⁻ observation "${n.obs}"`); expect(visible(n.ring), "no ring for NO₂⁻ with dil. acid"); eqColor(n.ring, "brown", "NO₂⁻ ring");
  }],
  ["11. Hepar test: slide equation next to Na₂SO₄ + 4C → Na₂S + 4CO with ⚠️", async page => {
    const r = await run(page, "SO₄²⁻", "Hepar test (Na₂CO₃ + C, fusion → silver coin)");
    expect(r.flag, "no ⚠️ box on the Hepar result");
    expect(r.flag.text.includes("⚠️"), "⚠️ missing");
    expect(r.flag.slide === "Na₂SO₄ + C → Na₂S + 4CO", `slide side: ${r.flag.slide}`);
    expect(r.flag.correct === "Na₂SO₄ + 4C → Na₂S + 4CO", `correct side: ${r.flag.correct}`);
    expect(r.eq && r.eq.includes("Na₂SO₄ + C → Na₂S + 4CO"), "the equation field does not keep the slide version");
    eqColor(r.stain, "brownish black", "stain on the silver coin");
    const side = await page.evaluate(() => { const a = document.querySelector("#lab-result .flag .slide").getBoundingClientRect(), b = document.querySelector("#lab-result .flag .right").getBoundingClientRect(); return Math.abs(a.top - b.top) < 4 && a.width > 60 && b.width > 60; });
    expect(side, "slide and corrected equations are not side by side");
    await page.click('button[data-nav="errors"]');
    const card = await page.locator('[data-err="L01 · s34"]').innerText();
    expect(card.includes("⚠️") && plain(card).includes(plain("Na₂SO₄ + 4C → Na₂S + 4CO")), "errors page card for L01 · s34 incomplete");
  }],
];

// ── v2 features ──
const V2_TESTS = [
  ["13. Compare: AgNO₃ · Group V side by side — chocolate brown / yellow / yellow, with the tip and its slide ref", async page => {
    await page.click('[data-lab-mode="compare"]');
    await page.selectOption("#cmp-set", { label: "AgNO₃ · Group V" });
    await page.waitForFunction(() => { const v = [...document.querySelectorAll("#lab-compare .cmp-tube svg")]; return v.length && v.every(x => x.dataset.state === "done"); }, null, { timeout: 30000 });
    await page.waitForTimeout(1100);
    const tubes = await page.evaluate(() => [...document.querySelectorAll("#lab-compare .cmp-tube svg")].map(svg => { const el = svg.querySelector('[data-part="ppt"]'); return { row: svg.dataset.row, fill: el && getComputedStyle(el).fill, color: el && el.getAttribute("data-color") }; }));
    expect(tubes.length === 3, `${tubes.length} tubes instead of 3`);
    const want = { "AsO₄³⁻": "chocolate brown", "AsO₃³⁻": "yellow", "PO₄³⁻": "yellow" };
    for (const t of tubes) { const a = ROWS.find(r => r.id === t.row).anion; eqColor(t, want[a], `${a} tube`); }
    const tip = await page.locator("#lab-compare [data-tip]").innerText();
    expect(tip.includes("L03 · s7") && tip.includes("chocolate brown") && /من السلايد/.test(tip), "tip text, source tag or slide ref missing");
    expect(await page.locator("#lab-compare .cmp-note [data-ref]").count() === 3, "each tube needs its own slide ref");
  }],
  ["14. 'What did I see?': canary yellow → S²⁻ CdCO₃ + AsO₄³⁻/PO₄³⁻ molybdate only; search 'Prussian' → ferro + FeCl₃ and the CN⁻ tests", async page => {
    await page.click('button[data-nav="find"]');
    await page.click('[data-find-color="canary yellow"]');
    let ids = await page.$$eval("#find-out .fres", els => els.map(e => e.dataset.row));
    let anions = new Set(ids.map(id => ROWS.find(r => r.id === id).anion));
    expect(ids.length === 3 && anions.has("S²⁻") && anions.has("AsO₄³⁻") && anions.has("PO₄³⁻"), `canary yellow gave: ${ids.join(", ")}`);
    expect(ids.every(id => /canary yellow/i.test(ROWS.find(r => r.id === id).observation)), "a result does not say canary yellow");
    await page.click("#find-clear");
    await page.fill("#find-q", "Prussian");
    ids = await page.$$eval("#find-out .fres", els => els.map(e => e.dataset.row));
    anions = new Set(ids.map(id => ROWS.find(r => r.id === id).anion));
    const ferro = ROWS.find(r => r.anion === "[Fe(CN)₆]⁴⁻" && r.reagent === "FeCl₃").id;
    expect(ids.includes(ferro) && anions.has("CN⁻") && [...anions].every(a => a === "CN⁻" || a === "[Fe(CN)₆]⁴⁻"), `'Prussian' gave: ${ids.join(", ")}`);
    expect(await page.locator("#find-out .fres [data-ref]").count() === ids.length, "a search result has no slide ref");
  }],
  ["15. ★ from the lab shows in المحفوظ and survives a reload", async page => {
    await run(page, "S²⁻", "AgNO₃");
    const id = ROWS.find(r => r.anion === "S²⁻" && r.reagent === "AgNO₃").id;
    await page.click("#lab-result [data-star]");
    expect(await page.getAttribute("#lab-result [data-star]", "aria-pressed") === "true", "star not pressed");
    for (const pass of ["before reload", "after reload"]) {
      if (pass === "after reload") await page.reload();
      await page.click('button[data-nav="find"]');
      if (await page.getAttribute("#find-saved", "aria-pressed") !== "true") await page.click("#find-saved");
      const ids = await page.$$eval("#find-out .fres", els => els.map(e => e.dataset.row));
      expect(ids.includes(id), `saved list ${pass}: ${ids.join(", ") || "empty"}`);
    }
  }],
  ["16. Two-tube gas scene: CO₃²⁻ + dil. HCl → CO₂ into lime water → white turbidity in the receiving tube", async page => {
    const r = await run(page, "CO₃²⁻", "lime water Ca(OH)₂", "CO₂ passed in");
    const scene = await page.evaluate(() => { const svg = document.querySelector("#lab-tube svg"); return { kind: svg.dataset.kind, gen: svg.querySelector(".gen")?.dataset.gen, pipe: !!svg.querySelector(".pipe"), glass: svg.querySelectorAll(".glass").length }; });
    expect(scene.kind === "transfer" && scene.pipe && scene.glass >= 2, `not a two-tube scene: ${JSON.stringify(scene)}`);
    expect(scene.gen === "CO₃²⁻ + dil. HCl", `generating tube label: ${scene.gen}`);
    expect(visible(r.ppt), "no turbidity in the receiving tube"); eqColor(r.ppt, "white", "lime water turbidity");
    expect(r.bubbles, "no gas bubbling through the lime water");
  }],
  ["17. A wrong quiz answer puts a 'weak' badge on that reaction in the grid's mastery view", async page => {
    await page.click('button[data-nav="quiz"]');
    for (let k = 0; k < 60; k++) {
      const kind = await page.evaluate(() => window.__anionLab.peekQuestion()?.kind);
      if (kind === "mcqA" || kind === "mcqB") break;
      await page.evaluate(() => window.__anionLab.skip());
      if (await page.locator("#q-new").count()) await page.click("#q-new");
    }
    const q = await page.evaluate(() => window.__anionLab.peekQuestion());
    expect(q && q.type === "mcq", "no multiple-choice question came up");
    await page.click('#q-panel [data-opt][data-right="false"] >> nth=0');
    const row = ROWS.find(r => r.id === q.rowId);
    await page.click('button[data-nav="grid"]');
    await page.click('[data-grid-mode="mastery"]');
    const cell = page.locator(`button.cell[data-anion="${row.anion}"][data-reagent="${row.reagent}"]`);
    expect(await cell.getAttribute("data-m") === "weak", `cell for ${row.anion} + ${row.reagent} shows "${await cell.getAttribute("data-m")}"`);
    expect(await cell.locator(".mbadge").count() === 1, "no badge drawn on the cell");
  }],
  ["18. Every 'ليه بيحصل كده؟' note carries its source tag; زيادة notes say 'زيادة للفهم — مش في السلايدز'", async page => {
    const problems = [];
    for (const row of ROWS) {
      await page.click(`[data-lab-group="${row.group}"]`);
      await page.click(`#lab-anions [data-anion="${row.anion}"]`);
      await page.selectOption("#lab-reagent", row.reagent);
      const idx = ROWS.filter(r => r.anion === row.anion && r.reagent === row.reagent).indexOf(row);
      if (await page.locator("#lab-conds button[data-cond-i]").count()) await page.click(`#lab-conds button[data-cond-i="${idx}"]`);
      const got = await page.evaluate(() => { const d = document.querySelector("#lab-result details.why"); return d ? { src: d.dataset.whySource, tag: d.querySelector("[data-src]")?.dataset.src, text: d.querySelector(".why-meta").textContent, ref: d.querySelector(".ref")?.textContent } : null; });
      const i = EXPLAIN.byRow[row.id];
      if (i === undefined) { if (got) problems.push(`${row.id}: shows a note but none is mapped`); continue; }
      const e = EXPLAIN.entries[i];
      if (!got) { problems.push(`${row.id}: note missing`); continue; }
      if (got.src !== e.source || got.tag !== e.source) problems.push(`${row.id}: source ${got.src}/${got.tag} ≠ ${e.source}`);
      if (e.source === "extra" && !got.text.includes("زيادة للفهم — مش في السلايدز")) problems.push(`${row.id}: زيادة label missing`);
      if (got.ref !== e.ref) problems.push(`${row.id}: ref ${got.ref} ≠ ${e.ref}`);
    }
    await page.click('[data-lab-mode="compare"]');
    for (let i = 0; i < COMPARE.length; i++) {
      await page.selectOption("#cmp-set", String(i));
      const t = await page.evaluate(() => document.querySelector("#lab-compare [data-tip] [data-src]")?.dataset.src);
      if (t !== COMPARE[i].source) problems.push(`compare ${COMPARE[i].id}: tag ${t} ≠ ${COMPARE[i].source}`);
    }
    expect(!problems.length, problems.slice(0, 12).join("\n      "));
  }]
];

async function test12(browser, results) {
  const problems = [];
  // (a) every lab result shows its own slide ref — walk all 210 rows through the UI (reduced motion = instant)
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage(); const errors = await open(page);
    const done = new Set();
    for (const row of ROWS) {
      if (done.has(row.id)) continue;
      await page.click(`[data-lab-group="${row.group}"]`);
      await page.click(`#lab-anions [data-anion="${row.anion}"]`);
      await page.selectOption("#lab-reagent", row.reagent);
      const n = await page.locator("#lab-conds button[data-cond-i]").count();
      for (let i = 0; i < Math.max(1, n); i++) {
        if (n) await page.click(`#lab-conds button[data-cond-i="${i}"]`);
        const got = await page.evaluate(() => ({ id: document.querySelector("#lab-result article").dataset.row, ref: document.querySelector("#lab-result article [data-ref]")?.textContent.trim() }));
        const want = ROWS.find(r => r.id === got.id);
        if (!want || got.ref !== want.slideRef || !/^L0[123] · s\d+$/.test(got.ref || "")) problems.push(`${got.id}: shows "${got.ref}"`);
        done.add(got.id);
      }
    }
    if (done.size !== ROWS.length) problems.push(`only ${done.size}/${ROWS.length} results reachable in the lab`);
    // quiz feedback and unknown-mode results carry a slide ref too
    await page.click('button[data-nav="quiz"]'); await answerAny(page);
    if (!(await page.locator("#q-fb [data-ref]").count())) problems.push("quiz feedback has no slide ref");
    await page.click('button[data-nav="unknown"]');
    await page.locator("#unk-panel details[open] [data-unk-test]").first().click();
    await page.click("#unk-submit");
    if (!(await page.locator("#unk-log .ref, #unk-log .note").count())) problems.push("unknown-mode result has no slide ref after answering");
    if (errors.length) problems.push("page errors: " + errors.join(" | "));
    await ctx.close();
  }
  // (b) 360×800 in both themes (+ (c) one more run with reduced motion): no horizontal scroll, screenshot every view
  for (const [tag, opts] of [["light", { colorScheme: "light" }], ["dark", { colorScheme: "dark" }], ["reduced-motion", { colorScheme: "light", reducedMotion: "reduce" }]]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, ...opts });
    const page = await ctx.newPage(); const errors = await open(page);
    for (const v of VIEWS) {
      await page.click(`button[data-nav="${v}"]`);
      if (v === "quiz") await answerAny(page);
      if (v === "find") await page.click('[data-find-color="canary yellow"]');
      if (v === "unknown") { await page.locator("#unk-panel details[open] [data-unk-test]").first().click(); }
      if (v === "lab" || v === "play") await page.waitForSelector(`#${v === "lab" ? "lab" : "play"}-tube svg[data-state="done"]`, { timeout: 30000 });
      await page.waitForTimeout(tag === "reduced-motion" ? 150 : 1100);
      const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      if (sw > 360) problems.push(`${tag}/${v}: scrollWidth ${sw}`);
      await page.screenshot({ path: `shots/final/${tag}-${v}.png`, fullPage: true });
    }
    for (const [shot, go] of [["lab-compare", async () => { await page.click('button[data-nav="lab"]'); await page.click('[data-lab-mode="compare"]'); }],
                              ["grid-mastery", async () => { await page.click('button[data-nav="grid"]'); await page.click('[data-grid-mode="mastery"]'); }]]) {
      await go();
      if (shot === "lab-compare") await page.waitForFunction(() => [...document.querySelectorAll("#lab-compare .cmp-tube svg")].every(s => s.dataset.state === "done"), null, { timeout: 30000 });
      await page.waitForTimeout(tag === "reduced-motion" ? 150 : 1100);
      const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      if (sw > 360) problems.push(`${tag}/${shot}: scrollWidth ${sw}`);
      await page.screenshot({ path: `shots/final/${tag}-${shot}.png`, fullPage: true });
    }
    if (tag === "reduced-motion") {
      await page.click('button[data-nav="lab"]');
      await page.click('[data-lab-mode="single"]');
      const instant = await page.evaluate(() => document.querySelector("#lab-tube svg").dataset.state);
      if (instant !== "done") problems.push("reduced motion: tube still animating");
    }
    if (tag === "dark") {
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      if (bg === "rgb(241, 242, 239)") problems.push("dark scheme: body still light");
    }
    if (errors.length) problems.push(`${tag}: page errors: ` + errors.join(" | "));
    await ctx.close();
  }
  expect(!problems.length, problems.join("\n      "));
}

const browser = await chromium.launch({ executablePath: CHROME });
const results = [];
for (const [name, fn] of TESTS) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: "light" });
  const page = await ctx.newPage(); const errors = await open(page);
  try { await fn(page); expect(!errors.length, "page errors: " + errors.join(" | ")); results.push([name, "PASS"]); }
  catch (e) { results.push([name, "FAIL", e.message]); await page.screenshot({ path: `shots/final/FAIL-${name.split(".")[0]}.png`, fullPage: true }); }
  await ctx.close();
}
try { await test12(browser, results); results.push(["12. Every result shows its slide ref; 360 px in both themes (+ reduced motion)", "PASS"]); }
catch (e) { results.push(["12. Every result shows its slide ref; 360 px in both themes (+ reduced motion)", "FAIL", e.message]); }

// v2 feature tests (13–18); 18 walks all 210 rows, so it runs with reduced motion (instant scenes)
const v2 = [];
for (const [name, fn] of V2_TESTS) {
  const rmOnly = name.startsWith("18.");
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: "light", ...(rmOnly ? { reducedMotion: "reduce" } : {}) });
  const page = await ctx.newPage(); const errors = await open(page);
  try { await fn(page); expect(!errors.length, "page errors: " + errors.join(" | ")); v2.push([name, "PASS"]); }
  catch (e) { v2.push([name, "FAIL", e.message]); await page.screenshot({ path: `shots/final/FAIL-${name.split(".")[0]}.png`, fullPage: true }); }
  await ctx.close();
}

// the same 11 checks once more with reduced motion (instant end state)
const rm = [];
for (const [name, fn] of TESTS) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
  const page = await ctx.newPage(); await open(page);
  try { await fn(page); rm.push("PASS"); } catch (e) { rm.push("FAIL: " + name + " — " + e.message); }
  await ctx.close();
}
await browser.close();

const passed = results.filter(r => r[1] === "PASS").length;
for (const [n, s, m] of results) console.log(`${s === "PASS" ? "✓" : "✗"} ${n}${m ? "\n      " + m : ""}`);
console.log(`\n${passed}/12 passed`);
for (const [n, st, m] of v2) console.log(`${st === "PASS" ? "✓" : "✗"} ${n}${m ? "\n      " + m : ""}`);
const v2passed = v2.filter(r => r[1] === "PASS").length;
console.log(`v2 feature tests: ${v2passed}/${V2_TESTS.length}`);
const rmFails = rm.filter(x => x !== "PASS");
console.log(`reduced-motion re-run of tests 1–11: ${rm.length - rmFails.length}/11${rmFails.length ? "\n  " + rmFails.join("\n  ") : ""}`);
writeFileSync("tests/results.json", JSON.stringify({ when: new Date().toISOString(), passed, results, v2, reducedMotion: rm }, null, 1));
process.exit(passed === 12 && v2passed === V2_TESTS.length && !rmFails.length ? 0 : 1);
