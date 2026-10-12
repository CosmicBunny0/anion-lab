// Anion Lab acceptance tests, Prompts 1–5. Each prompt adds its tests to TESTS.
// Baseline since Prompt 1: v3 (artifact version 1791738185-52b7, built in another chat). Selectors follow its markup.
// Run: node anionlab/tests.mjs <page.html> [--webkit]     (ONLY=T1,T3 to run some)
// Every test runs at 360×800 in light, in dark, and once with reduced motion; any console or page error fails it.
// SPEC lines are differences from a prompt's spec that the user chose to keep (they never fail a run).
import { chromium, webkit, devices } from "playwright-core";
import { pathToFileURL } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FILE = process.argv[2] || "anionlab/after-p5.html";
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);
const URL_ = pathToFileURL(process.cwd() + "/" + FILE).href;
const VIEWS = ["lab", "grid", "find", "unknown", "play", "quiz", "errors"];
const SHOTS = "anionlab/shots";
mkdirSync(SHOTS, { recursive: true });

class Fail extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };
const specNotes = new Set();
const spec = (cond, msg) => { if (!cond) specNotes.add(msg); };

// ───────── helpers ─────────
async function openPage(ctx, hash = "lab") {
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") page.errors.push("console: " + m.text()); });
  await page.goto(URL_ + "#" + hash);
  await page.waitForSelector("#who-name");
  return page;
}
const sheetOpen = page => page.locator("#sheet-host").isVisible();
const profState = page => page.evaluate(() => { const p = window.__anionLab.peekState().profiles; return { active: p.active, list: p.list.map(x => ({ id: x.id, name: x.name })) }; });
const whoName = async page => (await page.textContent("#who-name")).trim();
async function addProfile(page, name) {
  if (!(await sheetOpen(page))) await page.click("#who-btn");
  await page.fill("#prof-name", name);
  await page.click("#prof-form button[type=submit]");
  await page.waitForSelector("#sheet-host", { state: "hidden" });
  if (SOUND_ON && (await page.getAttribute("#spk-btn", "aria-pressed")) !== "true" && await page.isVisible("#spk-btn")) await page.click("#spk-btn");
}
async function pickProfile(page, name) {
  await page.click("#who-btn");
  await page.locator("[data-prof-id]").filter({ has: page.locator(".prof-name", { hasText: new RegExp(`^${name}$`) }) }).click();
  await page.waitForSelector("#sheet-host", { state: "hidden" });
}
const nav = (page, id) => page.click(`nav.tabs [data-nav="${id}"]`);
async function quizTotals(page) {
  await nav(page, "quiz");
  const m = (await page.textContent("#q-stats")).match(/(\d+)\/(\d+)/);
  return { correct: +m[1], answered: +m[2] };
}
async function answerOne(page) {
  const q = await page.evaluate(() => { const q = window.__anionLab.peekQuestion(); return q && { type: q.type, n: q.left ? q.left.length : 0 }; });
  expect(q, "no quiz question on screen");
  if (q.type === "mcq" || q.type === "fill") await page.click("#q-panel [data-opt]:not([disabled])");
  else if (q.type === "tf") {
    await page.click('#q-panel [data-tf="false"]');
    const fix = page.locator("#q-panel .opts [data-opt]:not([disabled])");
    if (await fix.count()) await fix.first().click();
  } else if (q.type === "match") {
    for (let i = 0; i < q.n; i++) { await page.locator("#q-panel [data-ml]").nth(i).click(); await page.locator("#q-panel [data-mr]").nth(i).click(); }
    await page.click("#q-match-done");
  }
  await page.click("#q-next");
}
async function answerQuiz(page, n) { await nav(page, "quiz"); for (let i = 0; i < n; i++) await answerOne(page); }
async function savedCount(page) {
  await nav(page, "find");
  return +(await page.textContent("#find-saved")).match(/\((\d+)\)/)[1];
}
async function labStar(page) {   // the ★ on the lab result card: [rowId, pressed]
  await nav(page, "lab");
  const b = page.locator("#lab-result .star");
  return [await b.getAttribute("data-star"), (await b.getAttribute("aria-pressed")) === "true"];
}
async function playUnknown(page) {   // one Unknown sample: one test, then submit
  await nav(page, "unknown");
  await page.click(`#unk-panel details[open] [data-unk-test][aria-pressed="false"]:not([disabled]) >> nth=0`);
  await page.click("#unk-submit");
  await page.click("#unk-next");
}
const anionKeys = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("anionlab:")) o[k] = localStorage.getItem(k); } return o; });
function keyDiff(a, b) {   // { removed, added, changed } between two anionlab:* snapshots
  const ks = new Set([...Object.keys(a), ...Object.keys(b)]), d = { removed: [], added: [], changed: [] };
  for (const k of ks) { if (!(k in b)) d.removed.push(k); else if (!(k in a)) d.added.push(k); else if (a[k] !== b[k]) d.changed.push(k); }
  for (const x of Object.values(d)) x.sort();
  return d;
}
const same = (x, y) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());
async function askDelete(page, kind) {   // opens the sheet if needed, then one delete button's confirmation
  if (!(await sheetOpen(page))) await page.click("#who-btn");
  await page.click(`#sheet-host [data-del="${kind}"]`);
  await page.waitForSelector("#sheet-host [data-confirm-yes]");
}
const activeId = page => page.evaluate(() => document.activeElement && document.activeElement.id);
const CREDIT = "Made by Mohammed Aymen";
async function answerQ(page, right) {   // answers the question on screen right or wrong, then moves on
  const q = await page.evaluate(() => { const q = window.__anionLab.peekQuestion(); return { type: q.type, truth: q.truth }; });
  if (q.type === "tf") {
    await page.click(`#q-panel [data-tf="${right ? q.truth : !q.truth}"]`);
    if (right && !q.truth) await page.click('#q-panel .opts [data-opt][data-right="true"]');
  } else await page.click(`#q-panel .opts [data-opt][data-right="${right}"] >> nth=0`);
  await page.click("#q-next");
}
let T9_COUNTS = null, T15_OUT = null, SOUND_ON = false;
// counts every AudioContext the page constructs (both names), for the sound tests
const SPY = () => {
  window.__acs = [];
  for (const k of ["AudioContext", "webkitAudioContext"]) {
    const A = window[k]; if (typeof A !== "function") continue;
    window[k] = class extends A { constructor(...a) { super(...a); window.__acs.push(this); } };
  }
};
async function soundOn(page) {
  if ((await page.getAttribute("#spk-btn", "aria-pressed")) !== "true") await page.click("#spk-btn");
  await page.waitForFunction(() => window.__acs && window.__acs.some(c => c.state === "running"));
}
const BOIL = "I-hco3-bacl2-boiling";
async function openRow(page, id) {   // through the UI: group → anion → reagent → condition
  const r = await page.evaluate(id => { const { ROWS } = window.__anionLab, row = ROWS.find(x => x.id === id), sib = ROWS.filter(x => x.anion === row.anion && x.reagent === row.reagent); return { g: row.group, a: row.anion, rg: row.reagent, i: sib.indexOf(row), n: sib.length }; }, id);
  await nav(page, "lab");
  if (await page.locator('[data-lab-mode="single"][aria-selected="false"]').count()) await page.click('[data-lab-mode="single"]');
  await page.click(`[data-lab-group="${r.g}"]`);
  await page.click(`#lab-anions [data-anion="${r.a}"]`);
  await page.selectOption("#lab-reagent", r.rg);
  if (r.n > 1) await page.click(`#lab-conds [data-cond-i="${r.i}"]`);
}
async function cuesOf(page, id) {   // the distinct cues a lab scene logged, in the order they first played
  await openRow(page, id);
  await page.waitForSelector(`#lab-tube svg[data-row="${id}"][data-state="done"]`, { timeout: 30000 });
  await page.waitForTimeout(150);
  return page.evaluate(id => [...new Set(window.__anionLab.soundLog.filter(e => e.rowId === id).map(e => e.cue))], id);
}
const activeNow = page => page.evaluate(() => window.__anionLab.activeSounds());
const reduced = page => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
const storageDump = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
async function noHorizontalScroll(page, where) {
  const w = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
  expect(w <= 360, `${where}: page is ${w}px wide (> 360)`);
}
async function everyViewRenders(page, label) {
  for (const id of VIEWS) {
    await nav(page, id);
    await page.waitForSelector(`#v-${id}:not([hidden]) .vhead h2`);
    expect((await page.locator(`#v-${id}`).innerText()).trim().length > 40, `${label}: view ${id} is empty`);
    await noHorizontalScroll(page, `${label} · ${id}`);
  }
}
async function tapTargets(page, sel, where) {
  for (const el of await page.locator(sel).all()) {
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    expect(b.height >= 44 && b.width >= 44, `${where}: tap target ${Math.round(b.width)}×${Math.round(b.height)} < 44px (${await el.evaluate(e => e.outerHTML.slice(0, 80))})`);
  }
}

// ───────── tests ─────────
const TESTS = {
  // T1: profiles keep separate quiz numbers and ★; a reload keeps both profiles and the active one
  async T1(ctx) {
    const page = await openPage(ctx);
    expect(await sheetOpen(page), "first visit should open the profile sheet");
    await addProfile(page, "A");
    expect(await whoName(page) === "A", "top bar should show A");
    await answerQuiz(page, 3);
    const a1 = await quizTotals(page);
    expect(a1.answered === 3, `A answered ${a1.answered}, expected 3`);
    await nav(page, "lab");
    await page.click("#lab-result .star");
    const [rowId, pressedA] = await labStar(page);
    expect(pressedA, "A's star did not stick");
    expect(await savedCount(page) === 1, "A should have 1 saved");
    const idA = (await profState(page)).active;
    const before = await storageDump(page);
    const aKeys = Object.keys(before).filter(k => k.startsWith(`anionlab:v1:${idA}:`));
    expect(aKeys.length >= 2, `A's keys missing: ${aKeys}`);
    spec(`anionlab:v1:${idA}:saved` in before, "Prompt 1 keys: ★ lives inside :settings (settings.saved), not its own :saved key");

    await addProfile(page, "B");
    expect(await whoName(page) === "B", "top bar should show B");
    const b0 = await quizTotals(page);
    expect(b0.answered === 0 && b0.correct === 0, `B starts at ${b0.correct}/${b0.answered}, expected 0/0`);
    expect(await savedCount(page) === 0, "B should have no ★");
    const [rowB, pressedB] = await labStar(page);
    expect(rowB === rowId && !pressedB, "B sees A's ★ in the lab");
    await answerQuiz(page, 1);
    expect((await quizTotals(page)).answered === 1, "B should have 1 answer");
    const mid = await storageDump(page);
    for (const k of aKeys) expect(mid[k] === before[k], `B's session changed A's key ${k}`);

    await pickProfile(page, "A");
    expect(await whoName(page) === "A", "top bar should show A again");
    const a2 = await quizTotals(page);
    expect(a2.answered === a1.answered && a2.correct === a1.correct, `A changed: ${a2.correct}/${a2.answered} vs ${a1.correct}/${a1.answered}`);
    expect((await labStar(page))[1], "A lost its ★");
    expect(await savedCount(page) === 1, "A should still have 1 saved");

    const after = await storageDump(page);
    const idB = (await profState(page)).list.find(p => p.name === "B").id;
    expect(JSON.parse(after[`anionlab:v1:${idA}:quiz`]).answered === 3, "A's stored quiz is not 3");
    expect(JSON.parse(after[`anionlab:v1:${idB}:quiz`]).answered === 1, "B's stored quiz is not 1");
    expect(!Object.keys(after).some(k => k.startsWith("anionlab.v1.")), "an old dot key was written");
    expect(Object.keys(after).every(k => k === "anionlab:v1:profiles" || k.startsWith(`anionlab:v1:${idA}:`) || k.startsWith(`anionlab:v1:${idB}:`)), `unexpected keys: ${Object.keys(after)}`);

    await page.reload();
    await page.waitForSelector("#who-name");
    expect(!(await sheetOpen(page)), "sheet should not open after reload when a profile exists");
    const p = await profState(page);
    expect(p.list.map(x => x.name).join() === "A,B" && p.active === idA, `after reload: ${JSON.stringify(p)}`);
    expect(await whoName(page) === "A", "reload lost the active profile");
    expect((await quizTotals(page)).answered === 3, "reload lost A's answers");
    return page;
  },

  // T2: the three old dot keys move into the first profile, then disappear; the next profile starts at zero
  async T2(ctx) {
    const page = await openPage(ctx);
    await page.evaluate(() => {
      localStorage.setItem("anionlab.v1.quiz", JSON.stringify({ answered: 7, correct: 5, level: 2, streak: 1, misses: 0, missedRows: {}, weakRefs: { "L01 · s10": 2 }, rounds: 1, rowStats: { "I-co32-dil-hcl-base": { r: 2, w: 0, s: 2, last: true, t: 1 } } }));
      localStorage.setItem("anionlab.v1.unknown", JSON.stringify({ played: 4, correct: 3, points: 27, queue: [], weak: {}, cur: null }));
      localStorage.setItem("anionlab.v1.saved", JSON.stringify(["I-co32-dil-hcl-base", "II-s2-lead-acetate-h2s-gas"]));
    });
    await page.reload();
    await page.waitForSelector("#who-name");
    expect(await sheetOpen(page), "sheet should open");
    spec((await page.locator("#sheet-host").innerText()).includes("نتايجك اللي فاتت هتتنقل للبروفايل ده."), "Prompt 1: the first sheet doesn't say \"نتايجك اللي فاتت هتتنقل للبروفايل ده.\" when old progress exists");
    await addProfile(page, "Old");
    const s = await storageDump(page);
    for (const k of ["anionlab.v1.quiz", "anionlab.v1.unknown", "anionlab.v1.saved"]) expect(!(k in s), `${k} still there`);
    const q = await quizTotals(page);
    expect(q.correct === 5 && q.answered === 7, `quiz shows ${q.correct}/${q.answered}, expected 5/7`);
    expect(await savedCount(page) === 2, "★ not migrated");
    await nav(page, "unknown");
    const u = await page.textContent("#unk-stats");
    expect(/عينات: 4/.test(u) && /صح: 3/.test(u) && /نقط: 27/.test(u), `unknown stats: ${u}`);
    await nav(page, "grid");
    await page.click('[data-grid-mode="mastery"]');
    expect(await page.locator('#grid-body button.cell[data-anion="CO₃²⁻"][data-reagent="dil. HCl"][data-m="known"]').count() === 1, "mastery not migrated");

    await addProfile(page, "New");
    const q2 = await quizTotals(page);
    expect(q2.answered === 0 && q2.correct === 0, `second profile starts at ${q2.correct}/${q2.answered}`);
    expect(await savedCount(page) === 0, "second profile has ★");
    await nav(page, "unknown");
    expect(/عينات: 0/.test(await page.textContent("#unk-stats")), "second profile has Unknown progress");
    return page;
  },

  // T3: empty storage opens on "مين بيذاكر؟"; the sheet validates; every view renders after a profile exists
  async T3(ctx) {
    const page = await openPage(ctx, "quiz");
    expect(await sheetOpen(page), "sheet should open on empty storage");
    expect((await page.textContent("#sheet-title")).trim() === "مين بيذاكر؟", "wrong sheet title");
    expect((await page.locator("#sheet-host [role=dialog]").getAttribute("aria-modal")) === "true", "dialog needs aria-modal");
    expect(await page.evaluate(() => document.querySelector("#sheet-host").contains(document.activeElement)), "focus is not in the sheet");
    expect(await page.evaluate(() => document.querySelector("#app").inert && document.querySelector("nav.tabs").inert), "page behind is not inert");
    await page.keyboard.press("Escape");
    expect(await sheetOpen(page), "Escape closed the sheet before a profile exists");
    await page.mouse.click(20, 790);
    expect(await sheetOpen(page), "tapping outside closed the sheet before a profile exists");
    expect(await page.locator("#sheet-host [data-sheet-close]").count() === 0, "close button shown before a profile exists");
    await tapTargets(page, "#sheet-host button, #sheet-host input", "first sheet");

    await page.fill("#prof-name", "   ");
    await page.click("#prof-form button[type=submit]");
    expect((await page.textContent("#prof-err")).includes("اكتب اسم"), "empty name accepted");
    await page.evaluate(() => { document.querySelector("#prof-name").value = "x".repeat(31); });
    await page.click("#prof-form button[type=submit]");
    expect((await page.textContent("#prof-err")).includes("30"), "31-char name accepted");
    expect(await sheetOpen(page), "sheet closed on an invalid name");
    await page.fill("#prof-name", "  <b>Sara</b>  ");
    await page.click("#prof-form button[type=submit]");
    await page.waitForSelector("#sheet-host", { state: "hidden" });
    expect(await whoName(page) === "<b>Sara</b>", "name not trimmed or not shown as text");
    expect(await page.locator("#who-name b").count() === 0, "name was inserted as HTML");

    await page.click("#who-btn");
    expect(await page.locator("#sheet-host [data-sheet-close]").count() === 1, "close button missing once a profile exists");
    await page.fill("#prof-name", "<B>SARA</B>");
    await page.click("#prof-form button[type=submit]");
    expect((await page.textContent("#prof-err")).includes("فيه بروفايل"), "duplicate (case-insensitive) accepted");
    expect(await page.locator("#sheet-host [data-prof-id] b").count() === 0, "name in the list was inserted as HTML");
    await tapTargets(page, "#sheet-host button, #sheet-host input", "switch sheet");
    await page.keyboard.press("Escape");
    expect(!(await sheetOpen(page)), "Escape should close once a profile exists");
    expect(await page.evaluate(() => !document.querySelector("#app").inert), "page stayed inert");

    await addProfile(page, "W".repeat(30));   // wider than the room it gets: must end in an ellipsis, not wrap
    expect(await page.evaluate(() => { const n = document.querySelector("#who-name"); return n.scrollWidth > n.clientWidth && getComputedStyle(n).textOverflow === "ellipsis" && getComputedStyle(n).whiteSpace === "nowrap"; }), "a long name is not cut with an ellipsis");
    const subLines = await page.evaluate(() => { const s = document.querySelector(".top .sub"); return Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight)); });
    expect(subLines === 1, `a long name pushed "PHC 101 · … Groups I–VI" onto ${subLines} lines`);
    const [h1, who] = [await page.locator(".top h1").boundingBox(), await page.locator("#who-btn").boundingBox()];
    expect(h1.x >= who.x + who.width || who.x >= h1.x + h1.width, "the title and the name button overlap");
    spec(who.y >= h1.y + h1.height, "Prompt 1 top bar: name + تبديل sit in the title row (one button), not in a second row under it");
    await noHorizontalScroll(page, "long name");
    await tapTargets(page, "#who-btn", "top bar");
    await everyViewRenders(page, "T3");
    return page;
  },

  // T4: localStorage throws: the page still works for the session
  async T4(ctx) {
    await ctx.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });
    });
    const page = await openPage(ctx);
    expect(await sheetOpen(page), "sheet should open");
    await addProfile(page, "Solo");
    await answerQuiz(page, 2);
    expect((await quizTotals(page)).answered === 2, "quiz did not count in memory");
    await nav(page, "lab");
    await page.click("#lab-result .star");
    expect(await savedCount(page) === 1, "★ not kept in memory");
    await addProfile(page, "Two");
    expect((await quizTotals(page)).answered === 0, "second in-memory profile not at zero");
    await pickProfile(page, "Solo");
    expect((await quizTotals(page)).answered === 2, "switching back lost in-memory answers");
    await page.click("#who-btn");
    expect((await page.textContent("#sheet-host [data-storage-note]")).trim() === "المتصفح ده مانع الحفظ، فالسجل هيفضل لحد ما تقفل الصفحة بس.", "blocked storage: wrong note under the history line");
    await page.keyboard.press("Escape");
    await everyViewRenders(page, "T4");
    return page;
  },

  // T5: "امسح كل سجلي" in A resets A's quiz and Unknown, keeps A's name, ★ and settings; B's keys stay byte-identical
  async T5(ctx) {
    const page = await openPage(ctx);
    await addProfile(page, "B");
    await answerQuiz(page, 1); await playUnknown(page);
    await nav(page, "lab"); await page.click("#lab-result .star");
    await addProfile(page, "A");
    await answerQuiz(page, 2); await playUnknown(page);
    await nav(page, "lab"); await page.click('[data-lab-group="II"]'); await page.click("#lab-result .star");
    const { list, active: idA } = await profState(page), idB = list.find(p => p.name === "B").id;
    const before = await anionKeys(page);
    expect(`anionlab:v1:${idA}:quiz` in before && `anionlab:v1:${idA}:unknown` in before, "A has no quiz / unknown keys to delete");

    await page.click("#who-btn");
    expect((await page.textContent("#sheet-host")).includes("السجل محفوظ على الجهاز ده بس، ومحدش على جهاز تاني يقدر يشوفه."), "missing the device-only line");
    expect((await page.textContent("#sheet-host [data-storage-note]")).trim() === "على الآيفون ممكن يتمسح لو قفلت Safari خالص أو مسحت بيانات المتصفح.", "missing the iPhone line under it");
    await askDelete(page, "all");
    const box = (await page.textContent("#sheet-host .confirm")).replace(/\s+/g, " ");
    expect(box.includes("A") && box.includes("مش هينفع ترجّعه"), `confirmation doesn't name A or say it can't be undone: ${box}`);
    expect((await page.textContent("[data-confirm-yes]")).trim() === "أيوه، امسح" && (await page.textContent("[data-confirm-no]")).trim() === "لا، ارجع", "confirmation buttons are not أيوه، امسح / لا، ارجع");
    await page.click("[data-confirm-yes]");
    await page.keyboard.press("Escape");
    await page.waitForSelector("#sheet-host", { state: "hidden" });

    const after = await anionKeys(page);
    const d = keyDiff(before, after);
    expect(same(d.removed, [`anionlab:v1:${idA}:quiz`, `anionlab:v1:${idA}:unknown`]) && !d.added.length && !d.changed.length, `"امسح كل سجلي" changed ${JSON.stringify(d)}`);
    for (const k of Object.keys(before).filter(k => k.startsWith(`anionlab:v1:${idB}:`))) expect(after[k] === before[k], `B's key ${k} changed`);
    expect(await whoName(page) === "A", "A's name changed");
    const q = await quizTotals(page);
    expect(q.answered === 0 && q.correct === 0, `A's quiz not reset: ${q.correct}/${q.answered}`);
    await nav(page, "unknown");
    expect(/عينات: 0/.test(await page.textContent("#unk-stats")), "A's Unknown not reset");
    expect(await savedCount(page) === 1, "A lost its ★");
    return page;
  },

  // T6: each delete button removes exactly its own keys of the active profile; "لا، ارجع" removes nothing;
  //     deleting the active profile opens the switcher on the first one left; deleting the last asks "مين بيذاكر؟"
  async T6(ctx) {
    const page = await openPage(ctx);
    await addProfile(page, "B");
    await answerQuiz(page, 1); await playUnknown(page);
    await nav(page, "lab"); await page.click("#lab-result .star");
    await addProfile(page, "A");
    const { list, active: idA } = await profState(page), idB = list.find(p => p.name === "B").id;
    const fill = async () => { await answerQuiz(page, 1); await playUnknown(page); if (!(await labStar(page))[1]) await page.click("#lab-result .star"); };
    const K = (id, part) => `anionlab:v1:${id}:${part}`;
    await fill();

    // the buttons: outlined in --graphite or --ink, no hue
    await page.click("#who-btn");
    const tok = await page.evaluate(() => { const c = getComputedStyle(document.documentElement); return ["--graphite", "--ink"].map(t => c.getPropertyValue(t).trim()); });
    const tokRgb = tok.map(h => h.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16)).join());
    for (const b of await page.locator("#sheet-host [data-del]").all()) {
      const st = await b.evaluate(e => { const c = getComputedStyle(e); return { color: c.borderTopColor, style: c.borderTopStyle, bg: c.backgroundColor }; });
      const rgb = st.color.match(/\d+/g).map(Number).slice(0, 3).join();
      expect(["solid", "dashed"].includes(st.style) && tokRgb.includes(rgb), `delete button border is ${st.style} ${st.color}, not --graphite / --ink`);
      const bg = st.bg.match(/\d+/g).map(Number).slice(0, 3);
      expect(Math.max(...bg) - Math.min(...bg) <= 8, `delete button has a colored background ${st.bg}`);
    }
    await tapTargets(page, "#sheet-host button", "delete buttons");

    // "لا، ارجع" deletes nothing
    for (const kind of ["quiz", "unknown", "all", "profile"]) {
      const before = await anionKeys(page);
      await askDelete(page, kind);
      await page.click("[data-confirm-no]");
      const d = keyDiff(before, await anionKeys(page));
      expect(!d.removed.length && !d.added.length && !d.changed.length, `"لا، ارجع" on ${kind} changed ${JSON.stringify(d)}`);
    }
    await page.keyboard.press("Escape");

    const expectDelete = async (kind, removed, changed = []) => {
      const before = await anionKeys(page);
      for (const k of removed) expect(k in before, `${kind}: ${k} wasn't there to delete`);
      await askDelete(page, kind);
      await page.click("[data-confirm-yes]");
      const d = keyDiff(before, await anionKeys(page));
      expect(same(d.removed, removed) && same(d.changed, changed) && !d.added.length, `${kind} should remove ${removed} and change [${changed}], but: ${JSON.stringify(d)}`);
    };
    await expectDelete("quiz", [K(idA, "quiz")]);
    await page.keyboard.press("Escape");
    await fill();
    await expectDelete("unknown", [K(idA, "unknown")]);
    await page.keyboard.press("Escape");
    await fill();
    await expectDelete("all", [K(idA, "quiz"), K(idA, "unknown")]);
    await page.keyboard.press("Escape");
    await fill();
    const aKeys = Object.keys(await anionKeys(page)).filter(k => k.startsWith(`anionlab:v1:${idA}:`));
    await expectDelete("profile", aKeys, ["anionlab:v1:profiles"]);
    const p1 = await profState(page);
    expect(p1.list.length === 1 && p1.list[0].id === idB, `A still listed: ${JSON.stringify(p1)}`);
    expect(await sheetOpen(page), "the switcher should open after deleting the active profile");
    expect(await page.locator("#sheet-host [data-prof-id]").count() === 1 && await page.evaluate(id => !!document.activeElement && document.activeElement.dataset.profId === id, idB), "the switcher isn't on the first remaining profile");
    await page.click(`#sheet-host [data-prof-id="${idB}"]`);
    await page.waitForSelector("#sheet-host", { state: "hidden" });
    expect(await whoName(page) === "B" && (await quizTotals(page)).answered === 1, "B's progress didn't survive A's deletion");

    await nav(page, "lab");
    const bKeys = Object.keys(await anionKeys(page)).filter(k => k.startsWith(`anionlab:v1:${idB}:`));
    await expectDelete("profile", bKeys, ["anionlab:v1:profiles"]);
    expect(await sheetOpen(page) && (await page.textContent("#sheet-title")).trim() === "مين بيذاكر؟", "deleting the last profile should ask مين بيذاكر؟ again");
    expect(!Object.keys(await anionKeys(page)).some(k => k !== "anionlab:v1:profiles"), "a deleted profile left keys behind");
    return page;
  },

  // T6a (Prompt 2 leftover): the name field takes focus only on "مين بيذاكر؟"; with a profile on the device the sheet focuses its heading
  async T6a(ctx) {
    const page = await openPage(ctx);
    expect(await activeId(page) === "prof-name", "\"مين بيذاكر؟\" should focus the name field");
    await addProfile(page, "A");
    for (let i = 0; i < 2; i++) {   // by tap, then by keyboard
      if (i === 0) await page.click("#who-btn"); else { await page.focus("#who-btn"); await page.keyboard.press("Enter"); }
      await page.waitForSelector("#sheet-host [data-del]");
      expect(await activeId(page) === "sheet-title", `switcher focused #${await activeId(page)}, not its heading`);
      await page.click("#prof-name");   // tapping "add profile" focuses the field
      expect(await activeId(page) === "prof-name", "tapping the name field didn't focus it");
      await page.keyboard.press("Escape");
      await page.waitForSelector("#sheet-host", { state: "hidden" });
    }
    return page;
  },

  // T6b (Prompt 2 leftover): after the active profile is deleted, nothing closes the sheet and nothing is written until a profile is picked
  async T6b(ctx) {
    const page = await openPage(ctx);
    await addProfile(page, "B");
    await addProfile(page, "A");
    await answerQuiz(page, 1); await playUnknown(page);
    await nav(page, "unknown");   // the view that would start a new sample if anything could save
    await askDelete(page, "profile");
    await page.click("[data-confirm-yes]");
    await page.waitForSelector("#sheet-host [data-prof-id]");
    const frozen = await storageDump(page);
    await page.keyboard.press("Escape");
    await page.mouse.click(180, 40);   // backdrop, above the sheet
    await page.mouse.click(180, 790);  // where the nav was
    expect(await page.locator("#sheet-host [data-sheet-close]").count() === 0, "the picker has a close button");
    expect(await page.locator("#sheet-host form, #sheet-host input").count() === 0, "the picker still offers adding a profile");
    const btns = await page.locator("#sheet-host button").evaluateAll(bs => bs.map(b => b.dataset.profId || b.outerHTML.slice(0, 60)));
    expect(btns.length === 1 && btns[0] === (await profState(page)).list[0].id, `the picker has buttons other than the remaining profiles: ${btns}`);
    await page.waitForTimeout(800);
    expect(await sheetOpen(page), "the picker closed before a profile was picked");
    const now = await storageDump(page);
    expect(JSON.stringify(now) === JSON.stringify(frozen), "storage changed before a profile was picked");
    await page.click("#sheet-host [data-prof-id]");
    await page.waitForSelector("#sheet-host", { state: "hidden" });
    expect(await whoName(page) === "B", "picking B didn't make B active");
    return page;
  },

  // T7: the credit, exactly "Made by Mohammed Aymen", under the h1 and as a footer above the nav in every view; meta author too
  async T7(ctx) {
    const page = await openPage(ctx);
    await addProfile(page, "A");
    expect(await page.evaluate(() => { const m = document.querySelector('meta[name="author"]'); return m && m.content; }) === "Mohammed Aymen", "meta[name=author] is not \"Mohammed Aymen\"");
    expect(await page.locator("#app > footer").count() === 1 && await page.evaluate(() => { const f = document.querySelector("#app > footer"); return !f.nextElementSibling && f.previousElementSibling.matches("section.view"); }), "need one <footer> after the view sections inside #app");
    const graphite = await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--graphite)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
    for (const id of VIEWS) {
      await nav(page, id);
      await page.waitForSelector(`#v-${id}:not([hidden]) .vhead h2`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(100);
      const foot = await page.evaluate(() => {
        const f = document.querySelector("#app > footer"), t = f.querySelector("[dir=ltr]") || f, r = t.getBoundingClientRect(), n = document.querySelector("nav.tabs").getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: f.textContent.trim(), bottom: r.bottom, top: r.top, navTop: n.top, onTop: !!hit && f.contains(hit), dir: t.getAttribute("dir"), color: getComputedStyle(t).color };
      });
      expect(foot.text === CREDIT, `${id}: footer reads "${foot.text}"`);
      expect(foot.top >= 0 && foot.bottom <= foot.navTop && foot.onTop, `${id}: footer credit is hidden or under the nav (bottom ${foot.bottom}, nav top ${foot.navTop})`);
      expect(foot.dir === "ltr" && foot.color === graphite, `${id}: footer credit is not LTR in --graphite (${foot.dir}, ${foot.color})`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const top = await page.evaluate(() => {
        const c = document.querySelector(".top .credit"), r = c.getBoundingClientRect(), h = document.querySelector(".top h1").getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: c.textContent.trim(), visible: r.height > 0 && r.top >= 0 && !!hit && c.contains(hit), underH1: r.top >= h.bottom - 1, dir: c.getAttribute("dir"), color: getComputedStyle(c).color };
      });
      expect(top.text === CREDIT, `${id}: top-bar credit reads "${top.text}"`);
      expect(top.visible && top.underH1 && top.dir === "ltr" && top.color === graphite, `${id}: top-bar credit not visible under the h1, LTR, in --graphite: ${JSON.stringify(top)}`);
    }
    return page;
  },

  // T8: the errors page lists all 12 in one list, in slide order, no duplicates; the 3 extra ones keep their marker; the header says 12
  async T8(ctx) {
    const page = await openPage(ctx, "errors");
    await addProfile(page, "A");
    await nav(page, "errors");
    const e = await page.evaluate(() => {
      const items = [...document.querySelectorAll("#err-list > .err")].map(x => ({ ref: x.dataset.err, key: x.dataset.key, src: x.dataset.src, marker: (x.querySelector(".extra") || {}).textContent || "", pair: !!x.querySelector(".pair .slide") && !!x.querySelector(".pair .right") }));
      return { items, head: document.querySelector("#v-errors .vhead").textContent, lists: document.querySelectorAll("#v-errors #err-list").length, secs: [...document.querySelectorAll("#v-errors h3.sec")].map(h => h.textContent.trim()), text: document.querySelector("#v-errors").textContent };
    });
    expect(e.lists === 1 && e.items.length === 12, `expected one list of 12, got ${e.lists} list(s) with ${e.items.length}`);
    expect(new Set(e.items.map(x => x.key)).size === 12, "duplicate entries in the errors list");
    const n = ref => { const m = /L(\d+)\s*·\s*s(\d+)/.exec(ref); return +m[1] * 1000 + +m[2]; };
    expect(e.items.every((x, i) => !i || n(e.items[i - 1].ref) <= n(x.ref)), `not in slide order: ${e.items.map(x => x.ref).join(", ")}`);
    const extra = e.items.filter(x => x.src === "extra");
    expect(extra.length === 3 && extra.map(x => x.ref).join() === "L01 · s10,L01 · s16,L01 · s17", `extra entries: ${extra.map(x => x.ref)}`);
    expect(extra.every(x => x.marker.trim() === "زيادة للفهم — مش في السلايدز") && e.items.filter(x => x.src === "doc").every(x => !x.marker), "the زيادة marker is missing on an extra entry or shown on a doc entry");
    expect(e.items.every(x => x.pair), "an entry lacks the slide / correct pair");
    expect(/عدد الأخطاء: 12\b/.test(e.head), `header doesn't say 12: ${e.head.slice(0, 80)}`);
    expect(!e.text.includes("معادلات تانية لقيتها مش متوازنة"), "the separate extra-equations section is still there");
    expect(e.secs.includes("ملاحظتين من نفس الصفحة") && e.secs.includes("عن الأسامي الإنجليزي"), `other sections missing: ${e.secs}`);
    return page;
  },

  // T9: 50 questions per group in each MCQ direction + 50 True/False: wrong options from the question's group, or the same reagent
  //     family on a fallback question only; never a second right answer; 2–3 wrong options. Counts per group are printed.
  async T9(ctx) {
    const page = await openPage(ctx);
    const r = await page.evaluate(() => {
      const { ROWS, _t } = window.__anionLab, ROW = new Map(ROWS.map(x => [x.id, x]));
      const group = a => ROWS.find(x => x.anion === a).group;
      const notRight = (row, s) => !_t.famRows(row.anion, row.reagent).some(o => _t.norm(o.observation) === _t.norm(s.observation) || _t.alike(o, s));
      const okSource = (row, q, s) => s.group === row.group || (q.src === "fallback" && _t.fam(s.reagent) === _t.fam(row.reagent));
      const bad = [], tally = {};
      _t.qstatsReset();
      for (const g of ["I", "II", "III", "IV", "V", "VI"]) {
        const rows = ROWS.filter(x => x.group === g && _t.isQuizzable(x));
        for (const type of ["mcqA", "mcqB", "tf"]) {
          const c = (tally[g] = tally[g] || {})[type] = { built: 0, fallback: 0, skipped: 0, giveaway: 0 };
          for (let i = 0; i < 50; i++) {
            const row = rows[i % rows.length];
            if (type === "mcqA" && _t.giveaway(row)) { c.giveaway++; continue; }
            const q = _t.build(row, type, 1 + (i % 3));
            if (!q) { c.skipped++; continue; }
            c.built++; if (q.src === "fallback") c.fallback++;
            const where = `${type} ${row.id}`;
            if (type === "mcqA") {
              const wrong = q.opts.filter(o => !o.right);
              if (wrong.length < 2 || wrong.length > 3) bad.push(`${where}: ${wrong.length} wrong options`);
              for (const o of wrong) {
                const via = ROW.get(o.via);
                if (via.anion !== o.key) bad.push(`${where}: why-note row ${o.via} isn't ${o.key}'s`);
                if (!(group(o.key) === g || (q.src === "fallback" && _t.fam(via.reagent) === _t.fam(row.reagent)))) bad.push(`${where}: ${o.key} is from group ${group(o.key)} without a same-family row`);
                if (_t.famRows(o.key, row.reagent).some(s => _t.alike(s, row) || _t.norm(s.observation) === _t.norm(row.observation))) bad.push(`${where}: ${o.key} is also right`);
              }
            } else {
              const wrongRows = type === "mcqB" ? q.opts.filter(o => !o.right).map(o => ROW.get(o.via))
                : [...(q.via ? [ROW.get(q.via)] : []), ...q.fixOpts.filter(o => !o.right).map(o => ROW.get(o.via))];
              if (type === "mcqB" && (wrongRows.length < 2 || wrongRows.length > 3)) bad.push(`${where}: ${wrongRows.length} wrong options`);
              if (type === "tf" && q.fixOpts.filter(o => !o.right).length < 2) bad.push(`${where}: correction has < 2 wrong options`);
              for (const s of wrongRows) {
                if (s.anion === row.anion) bad.push(`${where}: option from the same anion`);
                if (!okSource(row, q, s)) bad.push(`${where}: ${s.id} is from group ${s.group}, ${q.src === "fallback" ? "other reagent family" : "not a fallback question"}`);
                if (!notRight(row, s)) bad.push(`${where}: ${s.id} is also right`);
              }
            }
          }
        }
      }
      return { bad: [...new Set(bad)].slice(0, 12), tally, page: _t.qstats(), need: _t.NEED };
    });
    expect(r.need === 2, `NEED is ${r.need}, expected 2`);
    expect(!r.bad.length, "wrong options break the rule: " + r.bad.join(" | "));
    for (const [g, types] of Object.entries(r.tally)) for (const [t, c] of Object.entries(types)) {
      const p = (r.page[g] || {})[t] || { built: 0, fallback: 0, skipped: 0 };
      expect(p.built === c.built && p.fallback === c.fallback && p.skipped === c.skipped, `page counts for ${g} ${t} (${JSON.stringify(p)}) differ from the test's (${JSON.stringify(c)})`);
    }
    T9_COUNTS = r.tally;
    return page;
  },

  // T10: "راجع غلطاتي" drills only the seeded missed rows, a new form each time, a row leaves after 2 right in a row,
  //      stays after right-wrong-right, survives a reload mid-drill; disabled for a profile with no misses
  async T10(ctx) {
    const page = await openPage(ctx);
    await addProfile(page, "A");
    const { active: idA } = await profState(page);
    const seeded = await page.evaluate(() => {
      const { ROWS, _t } = window.__anionLab, out = [];
      for (const g of ["II", "III", "IV"]) out.push(ROWS.find(r => r.group === g && _t.isQuizzable(r) && _t.askable(r.id)).id);
      return out;
    });
    const QK = `anionlab:v1:${idA}:quiz`;
    await page.evaluate(([k, ids]) => localStorage.setItem(k, JSON.stringify({ answered: 3, correct: 0, missedRows: Object.fromEntries(ids.map(id => [id, 1])) })), [QK, seeded]);
    await page.reload(); await page.waitForSelector("#who-name");
    await nav(page, "quiz");
    expect((await page.textContent("#q-drill")).includes("(3)") && await page.isEnabled("#q-drill"), "drill button should be enabled with 3 rows");
    await page.click("#q-drill");
    expect((await page.evaluate(() => window.__anionLab._t.round())).drill, "the drill didn't start");
    await page.click("#q-drill");   // the same button leaves early
    expect(!(await page.evaluate(() => window.__anionLab._t.round())).drill, "the button didn't leave the drill");
    await page.click("#q-drill");

    const [r1, r2, r3] = seeded, plan = { [r1]: [true, true], [r2]: [true, false, true, true], [r3]: [true, true] };
    const asked = { [r1]: [], [r2]: [], [r3]: [] };
    let prevRow = null, reloaded = false;
    for (let step = 0; step < 20; step++) {
      const st = await page.evaluate(() => { const a = window.__anionLab, q = a.peekQuestion(), r = a._t.round(); return { round: r, rowId: q && q.rowId, kind: q && q.kind, left: a._t.drillRows().length, head: (document.querySelector("#q-panel [data-drill]") || {}).textContent || "" }; });
      if (st.round.done) break;
      expect(st.round.drill, "fell out of the drill");
      expect(seeded.includes(st.rowId), `the drill asked ${st.rowId}, which wasn't missed`);
      expect(st.kind !== "match", "the drill used a matching question");
      expect(!(st.left > 1 && st.rowId === prevRow), "the same row was asked twice running while others waited");
      const ks = asked[st.rowId];
      expect(!ks.length || ks[ks.length - 1] !== st.kind, `${st.rowId} asked as ${st.kind} twice running`);
      expect(st.head.includes(`فاضل ${st.left}`) && /صح [0-2] من 2/.test(st.head), `drill header lacks فاضل / صح x من 2: ${st.head}`);
      const ok = plan[st.rowId][ks.length];
      ks.push(st.kind); prevRow = st.rowId;
      await answerQ(page, ok !== false);
      const qz = await page.evaluate(() => window.__anionLab.peekState().qz);
      const n = ks.length;
      if (st.rowId === r1 && n === 2) expect(!(r1 in qz.missedRows), "r1 still missed after 2 right in a row");
      if (st.rowId === r2 && n === 3) {
        expect(r2 in qz.missedRows && qz.drill[r2] === 1, `after right, wrong, right r2 should stay with streak 1: ${JSON.stringify([qz.missedRows[r2], qz.drill[r2]])}`);
        const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), QK));
        expect(stored.drill[r2] === 1, "r2's streak isn't stored in the quiz key");
        if (!reloaded) {   // reload mid-drill
          reloaded = true;
          await page.reload(); await page.waitForSelector("#who-name"); await nav(page, "quiz");
          expect((await page.evaluate(() => window.__anionLab._t.round())).drill, "the drill didn't survive a reload");
          prevRow = null;
        }
      }
    }
    expect(reloaded, "never reached the reload point");
    const end = await page.evaluate(() => ({ r: window.__anionLab._t.round(), missed: Object.keys(window.__anionLab.peekState().qz.missedRows) }));
    expect(end.r.done && !end.missed.length, `drill didn't end empty: ${JSON.stringify(end)}`);
    expect(asked[r1].length === 2 && asked[r3].length === 2 && asked[r2].length === 4, `asks per row: ${JSON.stringify(asked)}`);
    expect(!(await page.isEnabled("#q-drill")), "button should be disabled once nothing is missed");

    await addProfile(page, "B");
    await nav(page, "quiz");
    expect(!(await page.isEnabled("#q-drill")) && (await page.textContent("#q-drill-note")).includes("مفيش غلطات"), "B has no misses: the button should be disabled with a note");
    return page;
  },

  // T11: with sound on, each lab scene logs its cues (drip before fizz, boil while heating, roar for the flame, a "none" row only drips);
  //      a quiz answer plays exactly one tone; under reduced motion a lab scene logs nothing
  async T11(ctx) {
    await ctx.addInitScript(SPY);
    const page = await openPage(ctx);
    await addProfile(page, "A");
    await soundOn(page);
    const rm = await reduced(page);
    const flame = await page.evaluate(() => window.__anionLab.ROWS.find(r => r.visual.type === "flame").id);
    const s2ag = await page.evaluate(() => window.__anionLab.ROWS.find(r => r.anion === "S²⁻" && r.reagent === "AgNO₃").id);
    const got = {};
    for (const id of ["I-co32-dil-hcl-base", BOIL, flame, s2ag, "II-so42-dil-hcl-base"]) got[id] = await cuesOf(page, id);
    if (rm) {
      for (const [id, c] of Object.entries(got)) expect(!c.length, `reduced motion: ${id} logged ${c}`);
    } else {
      expect(got["I-co32-dil-hcl-base"].join() === "drip,fizz", `CO₃²⁻ + dil. HCl logged ${got["I-co32-dil-hcl-base"]}`);
      expect(got[BOIL].includes("boil"), `HCO₃⁻ + BaCl₂ boiling logged ${got[BOIL]}`);
      expect(got[flame].join() === "roar", `the flame row logged ${got[flame]}`);
      expect(got[s2ag].join() === "drip", `S²⁻ + AgNO₃ logged ${got[s2ag]}`);
      expect(got["II-so42-dil-hcl-base"].join() === "drip", `SO₄²⁻ + dil. HCl logged ${got["II-so42-dil-hcl-base"]}`);
    }
    await nav(page, "quiz");
    await page.evaluate(() => { window.__anionLab.soundLog.length = 0; });
    await answerOne(page);
    const tones = await page.evaluate(() => window.__anionLab.soundLog.map(e => e.cue));
    expect(tones.length === 1 && ["right", "wrong"].includes(tones[0]), `a quiz answer played ${JSON.stringify(tones)}`);
    return page;
  },

  // T12: every stop path silences at once; compare mode keeps a shared cue for the scenes still running; settings are per profile
  async T12(ctx) {
    await ctx.addInitScript(SPY);
    const page = await openPage(ctx);
    await addProfile(page, "A");
    await soundOn(page);
    if (!(await reduced(page))) {
      const startBoil = async () => { await openRow(page, BOIL); await page.waitForFunction(() => window.__anionLab.activeSounds() > 0); };
      const silentNow = async what => { const t = Date.now(), n = await activeNow(page); expect(n === 0 && Date.now() - t < 50, `${what}: ${n} sound(s) still playing`); };
      await startBoil(); await page.click("#spk-btn"); await silentNow("sound off");
      await soundOn(page);
      await nav(page, "play"); await page.click("#play-toggle");
      await page.waitForFunction(() => window.__anionLab.activeSounds() > 0);
      await page.click("#play-toggle"); await silentNow("Play paused");
      await startBoil(); await nav(page, "grid"); await silentNow("leaving the lab");
      await startBoil(); await addProfile(page, "B"); await silentNow("switching profile");
      await pickProfile(page, "A");
      await startBoil();
      await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
      await silentNow("page hidden");
      await page.waitForTimeout(1200);   // the scene's later cues (fizz at 700 ms) must not start while hidden
      expect(await activeNow(page) === 0, "a cue started while the page was hidden");
      await page.evaluate(() => { delete document.hidden; });
      // compare: 3 lime-water scenes share one fizz; cancelling one scene keeps it for the other two
      await nav(page, "lab"); await page.click('[data-lab-mode="compare"]'); await page.selectOption("#cmp-set", "12");
      await page.waitForFunction(() => window.__anionLab.soundLog.filter(e => e.cue === "fizz").length >= 3 && window.__anionLab.activeSounds() > 0);
      const before = await activeNow(page);
      expect(await page.evaluate(() => window.__anionLab._t.cmpCancel(0)) === 3, "compare mode didn't mount 3 scenes");
      await page.waitForTimeout(80);
      expect(await activeNow(page) === before, `cancelling one scene cut a shared cue (${before} → ${await activeNow(page)})`);
      await page.evaluate(() => { window.__anionLab._t.cmpCancel(1); window.__anionLab._t.cmpCancel(2); });
      await silentNow("all compare scenes cancelled");
      await page.click('[data-lab-mode="single"]');
    } else await addProfile(page, "B");
    // per-profile settings survive a reload
    await pickProfile(page, "A");
    await page.fill("#spk-vol", "0.4");
    await pickProfile(page, "B");
    if ((await page.getAttribute("#spk-btn", "aria-pressed")) === "true") await page.click("#spk-btn");
    await pickProfile(page, "A");
    await page.reload(); await page.waitForSelector("#who-name");
    const a = await page.evaluate(() => ({ on: document.querySelector("#spk-btn").getAttribute("aria-pressed"), vol: document.querySelector("#spk-vol").value, row: !document.querySelector("#spk-row").hidden, text: document.querySelector("#spk-vol").getAttribute("aria-valuetext") }));
    expect(a.on === "true" && a.vol === "0.4" && a.row && a.text === "40%", `A after reload: ${JSON.stringify(a)}`);
    await pickProfile(page, "B");
    const b = await page.evaluate(() => ({ on: document.querySelector("#spk-btn").getAttribute("aria-pressed"), row: !document.querySelector("#spk-row").hidden, s: window.__anionLab.peekState().settings }));
    expect(b.on === "false" && !b.row && b.s.sound === false, `B after reload: ${JSON.stringify(b)}`);
    return page;
  },

  // T13: no AudioContext before the speaker tap, none while sound is off however much the page is tapped,
  //      and pointerdown / touchstart never unlock audio (pointerup / touchend do)
  async T13(ctx) {
    await ctx.addInitScript(SPY);
    const page = await openPage(ctx);
    const made = () => page.evaluate(() => window.__acs.length);
    await addProfile(page, "A");
    for (const v of VIEWS) await nav(page, v);
    await answerQuiz(page, 2);
    await nav(page, "lab"); await page.click('[data-lab-group="III"]'); await page.click('[data-lab-group="I"]');
    expect(await made() === 0, `${await made()} AudioContext(s) made while sound was off`);
    await page.click("#spk-btn");
    expect(await made() === 1, "the speaker tap should make exactly one AudioContext");
    await page.click("#spk-btn");
    // sound saved as on, then a reload: only a real tap wakes it
    const c2 = await ctx.browser().newContext({ viewport: { width: 360, height: 800 }, hasTouch: true });
    await c2.addInitScript(SPY);
    const p2 = await c2.newPage(); const errs = [];
    p2.on("pageerror", e => errs.push(e.message)); p2.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    await p2.goto(URL_ + "#lab"); await p2.waitForSelector("#who-name");
    await p2.fill("#prof-name", "T"); await p2.click("#prof-form button[type=submit]"); await p2.waitForSelector("#sheet-host", { state: "hidden" });
    await p2.click("#spk-btn");
    await p2.reload(); await p2.waitForSelector("#who-name");
    const n2 = () => p2.evaluate(() => window.__acs.length);
    expect(await n2() === 0, "an AudioContext was made on load");
    const cdp = await c2.newCDPSession(p2);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 180, y: 260 }] });
    await p2.waitForTimeout(100);
    expect(await n2() === 0, "touchstart unlocked audio");
    await p2.mouse.move(180, 262); await p2.mouse.down();
    await p2.waitForTimeout(100);
    expect(await n2() === 0, "pointerdown unlocked audio");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await p2.waitForTimeout(100);
    expect(await n2() === 1, "touchend didn't wake the audio");
    await p2.mouse.up();
    expect(!errs.length, "errors: " + errs.join(" | "));
    await c2.close();
    return page;
  },

  // T14: audio missing, throwing or refusing to resume: the speaker hides or sound stays off, every view works, no errors
  //      (the earlier tests run once more with sound on in the "sound-on" mode)
  async T14(ctx) {
    const variants = {
      missing: () => { delete window.AudioContext; delete window.webkitAudioContext; },
      throwing: () => { window.AudioContext = function () { throw new Error("no audio here"); }; delete window.webkitAudioContext; },
      "resume rejects": () => {
        Object.defineProperty(BaseAudioContext.prototype, "state", { configurable: true, get() { return "suspended"; } });
        AudioContext.prototype.resume = function () { return Promise.reject(new Error("not allowed")); };
      }
    };
    let page = null;
    for (const [name, fn] of Object.entries(variants)) {
      const c = await ctx.browser().newContext({ viewport: { width: 360, height: 800 } });
      await c.addInitScript(fn);
      page = await openPage(c);
      await addProfile(page, "A");
      if (await page.isVisible("#spk-btn")) { await page.click("#spk-btn"); await page.waitForTimeout(300); }
      const st = await page.evaluate(() => ({ hidden: document.querySelector("#spk-slot").hidden, on: document.querySelector("#spk-btn").getAttribute("aria-pressed"), s: window.__anionLab.peekState().settings.sound }));
      expect(st.hidden || (st.on === "false" && !st.s), `${name}: the speaker shows and sound is on: ${JSON.stringify(st)}`);
      expect(st.s === false, `${name}: sound is saved as on`);
      await everyViewRenders(page, name);
      await nav(page, "lab"); await page.click("#lab-replay");
      await answerQuiz(page, 1);
      expect(!page.errors.length, `${name}: errors: ${page.errors.join(" | ")}`);
      await c.close();
    }
    return null;
  },

  // T15: the engine inside the page is sound-engine.js character for character, and still meets every Prompt 5a target
  async T15() {
    if (!T15_OUT) {
      const html = readFileSync(FILE, "utf8"), file = readFileSync("anionlab/sound-engine.js", "utf8").replace(/\s+$/, "");
      const a = html.indexOf("/* Anion Lab — lab sounds"), END = "  return { input, output, synth: SYN, start, stopAll, active, setVolume, cues: Object.keys(SYN) };\n}";
      const b = html.indexOf(END, a);
      const inPage = a < 0 || b < 0 ? "" : html.slice(a, b + END.length);
      writeFileSync("anionlab/engine-from-page.js", inPage);
      let out = "", code = 0;
      try { out = execFileSync("node", ["anionlab/sound-metrics.mjs", "--engine", "anionlab/engine-from-page.js"], { encoding: "utf8" }); }
      catch (e) { out = String(e.stdout || ""); code = e.status || 1; }
      T15_OUT = { same: inPage === file, out, code };
    }
    expect(T15_OUT.same, "the engine in the page differs from sound-engine.js");
    expect(T15_OUT.code === 0, "a Prompt 5a target fails: " + (T15_OUT.out.match(/NEW ENGINE MISSES.*/) || [""])[0]);
    return null;
  }
};

// ───────── runner ─────────
const MODES = [
  { name: "light", opts: { colorScheme: "light" } },
  { name: "dark", opts: { colorScheme: "dark" } },
  { name: "reduce", opts: { colorScheme: "light", reducedMotion: "reduce" } },
  { name: "sound-on", opts: { colorScheme: "light" }, sound: true, only: ["T1", "T2", "T3", "T4", "T5", "T6", "T6a", "T6b", "T7", "T8", "T9", "T10"] }
];
async function runAll(browser, modes, base) {
  const results = [];
  for (const mode of modes) {
    for (const [name, fn] of Object.entries(TESTS)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      if (mode.only && !mode.only.includes(name)) continue;
      SOUND_ON = !!mode.sound;
      const ctx = await browser.newContext({ ...base, ...mode.opts });
      const pages = [];
      ctx.on("page", p => pages.push(p));
      let err = null;
      try { await fn(ctx); } catch (e) { err = e; }
      const errors = pages.flatMap(p => p.errors || []);
      if (!err && errors.length) err = new Fail("errors on the page: " + errors.join(" | "));
      if (err && pages.length) { try { await pages[pages.length - 1].screenshot({ path: `${SHOTS}/FAIL-${name}-${mode.name}.png`, fullPage: true }); } catch (e) { /* page closed */ } }
      results.push({ test: name, mode: mode.name, ok: !err });
      console.log(`${err ? "FAIL" : "ok  "} ${name} [${mode.name}]${err ? "  " + (err instanceof Fail ? err.message : err.stack.split("\n").slice(0, 3).join(" ")) : ""}`);
      await ctx.close();
    }
  }
  return results;
}

const results = [];
const chrome = await chromium.launch({ executablePath: CHROME });
results.push(...await runAll(chrome, MODES, { viewport: { width: 360, height: 800 } }));
await chrome.close();
if (process.argv.includes("--webkit")) {
  if (existsSync(webkit.executablePath())) {
    const wk = await webkit.launch();
    results.push(...await runAll(wk, [{ name: "webkit-iphone13", opts: {} }], { ...devices["iPhone 13"], viewport: { width: 360, height: 800 } }));
    await wk.close();
  } else console.log("skip WebKit: not installed");
}
for (const n of specNotes) console.log("SPEC " + n);
if (T15_OUT) console.log("T15 (engine inside the page):\n" + T15_OUT.out.slice(T15_OUT.out.indexOf("AFTER")).trim());
if (T9_COUNTS) for (const [g, t] of Object.entries(T9_COUNTS)) console.log(`T9 group ${g}: ` + Object.entries(t).map(([k, c]) => `${k} built ${c.built} / fallback ${c.fallback} / skipped ${c.skipped}${c.giveaway ? ` (+${c.giveaway} name in the stem)` : ""}`).join(" · "));
const bad = results.filter(r => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
