// Acceptance tests for the profiles / delete / credit / content / sound update (12 tests).
// Usage: node tests/update.mjs [light|dark|reduce] [test numbers, e.g. 1,3,11]
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL_ = pathToFileURL(process.cwd() + "/dist/test.html").href;
const ROWS = JSON.parse(readFileSync("data/reactions.json", "utf8"));
const VIEWS = ["lab", "grid", "find", "unknown", "play", "quiz", "errors"];
const RUN = process.argv[2] || "light";
const ONLY = process.argv[3] ? new Set(process.argv[3].split(",").map(Number)) : null;
const ctxOpts = { viewport: { width: 360, height: 800 }, colorScheme: RUN === "dark" ? "dark" : "light", ...(RUN === "reduce" ? { reducedMotion: "reduce" } : {}) };
mkdirSync("shots/update", { recursive: true });

class Fail extends Error {}
const expect = (c, m) => { if (!c) throw new Fail(m); };
const allErrors = [];

async function fresh(browser, init) {
  const ctx = await browser.newContext(ctxOpts);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  await page.goto(URL_ + "#lab");
  await page.evaluate(() => document.fonts.ready);
  return { ctx, page, errors };
}
const L = page => page.evaluate(() => window.__anionLab.peekState());
async function createFirst(page, name) {
  await page.waitForSelector("#prof-name");
  await page.fill("#prof-name", name);
  await page.click("#prof-form button[type=submit]");
  await page.waitForSelector("#sheet-host", { state: "hidden" });
}
async function addProfile(page, name) {
  await page.click("#who-btn");
  await page.fill("#prof-name", name);
  await page.click("#prof-form button[type=submit]");
  await page.waitForSelector("#sheet-host", { state: "hidden" });
}
async function switchTo(page, name) {
  await page.click("#who-btn");
  await page.locator(".prof", { has: page.locator(".prof-name", { hasText: name }) }).first().click();
  await page.waitForSelector("#sheet-host", { state: "hidden" });
}
async function answer(page, correct = true) {
  const q = await page.evaluate(() => window.__anionLab.peekQuestion());
  if (q.type === "mcq") await page.click(`#q-panel [data-opt="${q.opts.findIndex(o => o.right === correct)}"]`);
  else if (q.type === "fill") await page.click(`#q-panel [data-opt="${correct ? q.opts.indexOf(q.answer) : q.opts.findIndex(o => o !== q.answer)}"]`);
  else if (q.type === "tf") {
    await page.click(`#q-panel [data-tf="${correct ? q.truth : !q.truth}"]`);
    if (correct && !q.truth) await page.click(`#q-panel [data-opt="${q.fixOpts.findIndex(o => o.right)}"]`);
  } else if (q.type === "match") {
    for (let i = 0; i < q.left.length; i++) {
      await page.click(`#q-panel [data-ml="${q.left[i]}"]`);
      await page.click(`#q-panel [data-mr="${correct ? q.left[i] : q.left[(i + 1) % q.left.length]}"]`);
    }
    await page.click("#q-match-done");
  }
  await page.waitForSelector("#q-fb");
  return q;
}
const next = page => page.click("#q-next");
const quizText = page => page.locator("#q-stats").innerText();
const lsKeys = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
async function soundOn(page, on = true, volume) {   // the speaker itself toggles sound (Prompt 5)
  if (((await page.getAttribute("#spk-btn", "aria-pressed")) === "true") !== on) await page.click("#spk-btn");
  if (volume !== undefined) await page.evaluate(v => { const r = document.querySelector("#spk-vol"); r.value = String(v); r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); }, volume);
}
async function runLab(page, anion, reagent, condition = null) {
  const group = ROWS.find(r => r.anion === anion).group;
  await page.click('button[data-nav="lab"]');
  if (await page.locator('[data-lab-mode="single"][aria-selected="false"]').count()) await page.click('[data-lab-mode="single"]');
  await page.click(`[data-lab-group="${group}"]`);
  await page.click(`#lab-anions [data-anion="${anion}"]`);
  await page.selectOption("#lab-reagent", reagent);
  await page.evaluate(() => { window.__anionLab.soundLog.length = 0; });
  if (condition !== null) await page.click(`#lab-conds button[data-cond="${condition}"]`);
  else await page.click("#lab-replay");
  await page.waitForTimeout(80);   // let that scene's 0 ms cue fire before clearing (reduced motion starts cues at 0)
  await page.evaluate(() => { window.__anionLab.soundLog.length = 0; });   // keep only the scene that is now playing
  await page.click("#lab-replay");
  await page.waitForSelector('#lab-tube svg[data-state="done"]', { timeout: 30000 });
  await page.waitForTimeout(RUN === "reduce" ? 2600 : 600);
  const id = ROWS.find(r => r.anion === anion && r.reagent === reagent && (r.condition ?? null) === condition)?.id;
  return (await page.evaluate(() => window.__anionLab.soundLog.slice())).filter(x => x.rowId === id).map(x => x.cue);
}

const TESTS = {
  1: ["Profiles A and B keep separate quiz progress; reload keeps both and the active one", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Profile A");
    await page.click('button[data-nav="quiz"]');
    for (let i = 0; i < 3; i++) { await answer(page, i !== 1); await next(page); }
    const a1 = await L(page);
    expect(a1.qz.answered === 3 && a1.qz.correct === 2, `A after 3 answers: ${a1.qz.correct}/${a1.qz.answered}`);
    await addProfile(page, "Profile B");
    expect(/الإجمالي: 0\/0/.test(await quizText(page)), "B does not start at zero: " + await quizText(page));
    await answer(page, true);
    const b1 = await L(page);
    expect(b1.qz.answered === 1, `B answered ${b1.qz.answered}`);
    await switchTo(page, "Profile A");
    const a2 = await L(page);
    expect(a2.qz.answered === 3 && a2.qz.correct === 2 && /الإجمالي: 2\/3/.test(await quizText(page)), `A changed: ${a2.qz.correct}/${a2.qz.answered}`);
    await page.reload();
    expect((await page.locator("#who-name").innerText()).trim() === "Profile A", "active profile not kept after reload");
    await page.click("#who-btn");
    expect(await page.locator(".prof").count() === 2, "both profiles not listed after reload");
    allErrors.push(...errors); await ctx.close();
  }],
  2: ["Clearing all history in A resets quiz + Unknown, keeps A's name and settings, leaves B byte-identical", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Profile A");
    await addProfile(page, "Profile B");
    await page.click('button[data-nav="quiz"]'); await answer(page, false);
    const ks = await lsKeys(page), bId = JSON.parse(ks["anionlab:v1:profiles"]).active;
    const bKeysBefore = Object.fromEntries(Object.entries(ks).filter(([k]) => k.includes(":" + bId + ":")));
    await switchTo(page, "Profile A");
    const aId = JSON.parse((await lsKeys(page))["anionlab:v1:profiles"]).active;
    await page.click('button[data-nav="quiz"]'); await answer(page, true); await next(page); await answer(page, false);
    await page.click('button[data-nav="unknown"]');
    await page.locator("#unk-panel details[open] [data-unk-test]").first().click(); await page.click("#unk-submit");
    if (await page.locator("#spk-btn:visible").count()) await soundOn(page, true, 0.35);
    await page.click('button[data-nav="lab"]'); await page.click("#lab-result [data-star]");
    const before = await lsKeys(page);
    expect(before[`anionlab:v1:${aId}:quiz`] && before[`anionlab:v1:${aId}:unknown`], "A has no quiz/unknown history to clear");
    const settingsBefore = before[`anionlab:v1:${aId}:settings`];
    await page.click("#who-btn"); await page.click('[data-del="all"]');
    const confirmText = await page.locator(".confirm").innerText();
    expect(/Profile A/.test(confirmText) && /مش هينفع/.test(confirmText), "confirmation does not name the profile / say it can't be undone: " + confirmText);
    await page.click("[data-confirm-yes]");
    const after = await lsKeys(page);
    expect(!after[`anionlab:v1:${aId}:quiz`] && !after[`anionlab:v1:${aId}:unknown`], "A's quiz / unknown keys still there");
    expect(after[`anionlab:v1:${aId}:settings`] === settingsBefore, "A's settings changed");
    expect(JSON.parse(after["anionlab:v1:profiles"]).list.some(p => p.name === "Profile A"), "A's name is gone");
    for (const [k, v] of Object.entries(bKeysBefore)) expect(after[k] === v, `B's key ${k} changed`);
    const st = await L(page);
    expect(st.qz.answered === 0 && st.unk.played === 0, "A's in-memory progress not reset");
    allErrors.push(...errors); await ctx.close();
  }],
  3: ["Pre-update dot keys migrate into the first profile and are removed; a second profile starts at zero", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    const star = ROWS.find(r => r.anion === "S²⁻" && r.reagent === "AgNO₃").id;
    await page.evaluate(id => {
      localStorage.setItem("anionlab.v1.quiz", JSON.stringify({ answered: 7, correct: 5, level: 2, streak: 0, misses: 0, missedRows: { [id]: 2 }, weakRefs: { "L01 · s28": 2 }, rounds: 1, rowStats: {} }));
      localStorage.setItem("anionlab.v1.unknown", JSON.stringify({ played: 4, correct: 3, points: 27, queue: [], weak: {}, cur: null }));
      localStorage.setItem("anionlab.v1.saved", JSON.stringify([id]));
    }, star);
    await page.reload();
    await createFirst(page, "Migrated");
    await page.click('button[data-nav="quiz"]');
    expect(/الإجمالي: 5\/7/.test(await quizText(page)), "quiz progress not migrated: " + await quizText(page));
    await page.click('button[data-nav="unknown"]');
    expect(/عينات: 4/.test(await page.locator("#unk-stats").innerText()), "unknown progress not migrated");
    expect((await L(page)).saved.includes(star), "★ saved list not migrated");
    const keys = await lsKeys(page);
    for (const k of ["anionlab.v1.quiz", "anionlab.v1.unknown", "anionlab.v1.saved"]) expect(!(k in keys), `old key ${k} still there`);
    await addProfile(page, "Second");
    const st = await L(page);
    expect(st.qz.answered === 0 && st.unk.played === 0 && st.saved.length === 0, "second profile does not start at zero");
    allErrors.push(...errors); await ctx.close();
  }],
  4: ["Credit visible in every view, footer ends above the nav; meta author exists", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Credit");
    expect(await page.locator('meta[name="author"][content="Mohammed Aymen"]').count() === 1, "meta author missing");
    expect((await page.locator(".top .credit").innerText()).trim() === "Made by Mohammed Aymen", "top bar credit text");
    for (const v of VIEWS) {
      await page.click(`button[data-nav="${v}"]`);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => { const f = document.querySelector(".credit-foot"), n = document.querySelector("nav.tabs"); const a = f.getBoundingClientRect(), b = n.getBoundingClientRect(); return { text: f.innerText.trim(), bottom: a.bottom, top: a.top, navTop: b.top, visible: a.height > 0 && getComputedStyle(f).visibility !== "hidden" }; });
      expect(r.text === "Made by Mohammed Aymen" && r.visible, `${v}: footer credit missing`);
      expect(r.bottom <= r.navTop && r.top >= 0, `${v}: footer (${r.top}–${r.bottom}) not above the nav (${r.navTop})`);
    }
    allErrors.push(...errors); await ctx.close();
  }],
  5: ["Errors page: 12 entries in one list, no duplicates, the 3 extra-source entries keep their marker, header says 12", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Errors");
    await page.click('button[data-nav="errors"]');
    const items = await page.$$eval("#err-list .err", els => els.map(e => ({ key: e.dataset.key, src: e.dataset.src, extra: !!e.querySelector(".extra"), ref: e.querySelector(".ref")?.textContent })));
    expect(items.length === 12, `${items.length} entries`);
    expect(new Set(items.map(i => i.key)).size === 12, "duplicate entries");
    const extras = items.filter(i => i.src === "extra");
    expect(extras.length === 3 && extras.every(i => i.extra), "extra-source entries without their marker");
    expect(items.filter(i => i.src === "doc").every(i => !i.extra), "a doc entry carries the extra marker");
    expect(/12/.test(await page.locator("#v-errors .vhead").innerText()), "header does not say 12");
    expect(!(await page.locator("#v-errors").innerText()).includes("معادلات تانية لقيتها مش متوازنة"), "old extra section still there");
    allErrors.push(...errors); await ctx.close();
  }],
  6: ["50 questions per group: options follow the source order; none is a second correct answer (fallback/skip counts printed)", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Distractors");
    const out = await page.evaluate(() => {
      const A = window.__anionLab, T = A._t, R = new Map(A.ROWS.map(r => [r.id, r]));
      const res = {}, bad = [];
      for (const g of ["I", "II", "III", "IV", "V", "VI"]) {
        const pool = A.ROWS.filter(r => r.group === g && T.isQuizzable(r));
        const c = res[g] = { built: 0, group: 0, fallback: 0, skipped: 0 };
        for (let k = 0; k < 50; k++) {
          const row = pool[Math.floor(Math.random() * pool.length)];
          const type = ["mcqA", "mcqB", "tf", "match"][k % 4];
          const q = T.build(row, type, 1 + (k % 3));
          if (!q) { c.skipped++; continue; }
          c.built++; if (q.src === "fallback") c.fallback++; else c.group++;
          const famOK = s => T.fam(s.reagent) === T.fam(row.reagent);
          const groupAnions = A.ROWS.filter(r => r.group === g).map(r => r.anion);
          // every wrong option: from the group, or (fallback only) from another group in the same reagent family
          const wrongRows = q.type === "mcq" ? q.opts.filter(o => !o.right).map(o => q.dir === "A" ? { anion: o.key, via: R.get(o.via) } : { anion: R.get(o.via).anion, via: R.get(o.via) })
            : q.type === "tf" ? q.fixOpts.filter(o => !o.right).map(o => ({ anion: R.get(o.via).anion, via: R.get(o.via) }))
            : q.left.filter(id => id !== row.id).map(id => ({ anion: R.get(id).anion, via: R.get(id) }));
          for (const w of wrongRows) {
            const inGroup = groupAnions.includes(w.anion);
            if (!inGroup && q.src !== "fallback") bad.push(`${g} ${type} ${row.id}: ${w.anion} from another group without fallback`);
            if (!inGroup && q.type !== "mcq" && q.type !== "tf" && w.via.reagent !== row.reagent) bad.push(`${g} match ${row.id}: other-group item uses another reagent`);
            if (!inGroup && !T.famRows(w.anion, row.reagent).length) bad.push(`${g} ${type} ${row.id}: ${w.anion} not in the reagent family`);
          }
          if (q.src === "fallback" && q.type === "mcq" && q.dir === "A") {
            const groupValid = [...new Set(groupAnions)].filter(a => a !== row.anion && !T.famRows(a, row.reagent).some(s => T.alike(s, row) || T.norm(s.observation) === T.norm(row.observation)));
            if (groupValid.length >= 3) bad.push(`${g} mcqA ${row.id}: used fallback although the group had ${groupValid.length}`);
            for (const a of groupValid) if (!q.opts.some(o => o.key === a)) bad.push(`${g} mcqA ${row.id}: skipped valid group anion ${a}`);
          }
          // no second correct answer
          if (q.type === "mcq" && q.dir === "A") for (const o of q.opts) if (!o.right && T.famRows(o.key, row.reagent).some(s => T.alike(s, row) || T.norm(s.observation) === T.norm(row.observation))) bad.push(`${g} mcqA ${row.id}: ${o.key} also fits`);
          if (q.type === "mcq" && q.dir === "B") for (const o of q.opts) if (!o.right && T.famRows(row.anion, row.reagent).some(s => T.norm(s.observation) === T.norm(o.key) || T.alike(s, R.get(o.via)))) bad.push(`${g} mcqB ${row.id}: "${o.key}" also true`);
          if (q.type === "tf" && !q.truth && T.famRows(row.anion, row.reagent).some(s => T.norm(s.observation) === T.norm(q.shown) || T.alike(s, R.get(q.via)))) bad.push(`${g} tf ${row.id}: false statement is true`);
          if (q.type === "match") { const rs = q.left.map(id => R.get(id)); for (const a of rs) for (const b of rs) if (a !== b && (T.alike(a, b) || T.famRows(a.anion, b.reagent).some(s => T.alike(s, b)))) bad.push(`${g} match ${row.id}: ${a.anion} could take ${b.id}`); }
        }
      }
      return { res, bad: [...new Set(bad)] };
    });
    console.log("      distractor sources per group (50 each):", JSON.stringify(out.res));
    TESTS[6].counts = out.res;
    expect(!out.bad.length, out.bad.slice(0, 10).join("\n      "));
    allErrors.push(...errors); await ctx.close();
  }],
  7: ["راجع غلطاتي: only the missed rows, each leaves after two right in a row, disabled with no misses", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Drill");
    const id = JSON.parse((await lsKeys(page))["anionlab:v1:profiles"]).active;
    const seeded = [ROWS.find(r => r.anion === "AsO₄³⁻" && r.reagent === "AgNO₃").id, ROWS.find(r => r.anion === "NO₂⁻" && r.reagent === "FeSO₄ + H₂SO₄ (brown ring test)").id];
    await page.evaluate(([k, ids]) => localStorage.setItem(k, JSON.stringify({ answered: 4, correct: 2, missedRows: { [ids[0]]: 1, [ids[1]]: 2 }, weakRefs: {}, rowStats: {} })), [`anionlab:v1:${id}:quiz`, seeded]);
    await page.reload();
    await page.click('button[data-nav="quiz"]');
    // a row leaves after two right answers in a row; a matching question also counts for the other rows it covers
    const rights = Object.fromEntries(seeded.map(x => [x, 0]));
    for (let pass = 1; pass <= 3 && await page.isEnabled("#q-drill"); pass++) {
      const missedNow = seeded.filter(x => rights[x] < 2);
      await page.click("#q-drill");
      const seen = new Set();
      while (!(await page.locator("#q-new").count())) {
        const q = await answer(page, true);
        seen.add(q.rowId);
        expect(seeded.includes(q.rowId), `drill asked a row that was not missed: ${q.rowId}`);
        q.rowIds.forEach(x => { if (x in rights && rights[x] < 2) rights[x]++; });
        await next(page);
      }
      expect(missedNow.every(x => seen.has(x)), `pass ${pass} did not ask every missed row`);
      const st = await L(page);
      for (const x of seeded) {
        if (rights[x] >= 2) expect(st.qz.missedRows[x] === undefined, `${x} still in the drill after two right in a row`);
        else expect(st.qz.missedRows[x] !== undefined && st.qz.drill[x] === rights[x], `${x} left after ${rights[x]} right answer(s)`);
      }
    }
    expect(seeded.every(x => rights[x] >= 2), "drill ended before every row had two right answers");
    expect(!(await page.isEnabled("#q-drill")), "drill still enabled with no misses");
    expect((await page.locator("#q-drill-note").innerText()).trim().length > 0, "no note on the disabled drill button");
    allErrors.push(...errors); await ctx.close();
  }],
  8: ["Sound cues follow the animation (soundLog)", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Sound");
    await soundOn(page, true);
    if (RUN === "reduce") {   // Prompt 5: reduced motion jumps to the end, so lab scenes stay silent
      for (const [a, rg] of [["CO₃²⁻", "dil. HCl"], ["F⁻", "borax + conc. H₂SO₄ → flame"]]) { const c = await runLab(page, a, rg); expect(!c.length, `reduced motion: ${a} + ${rg} → ${c.join(",")}`); }
      allErrors.push(...errors); await ctx.close(); return;
    }
    const c1 = await runLab(page, "CO₃²⁻", "dil. HCl");
    expect(c1.join(",") === "drip,fizz", `CO₃²⁻ + dil. HCl → ${c1.join(",")}`);
    const c2 = await runLab(page, "HCO₃⁻", "BaCl₂", "boiling");
    expect(c2.includes("boil") && c2.includes("drip"), `HCO₃⁻ + BaCl₂ boiling → ${c2.join(",")}`);
    const c3 = await runLab(page, "F⁻", "borax + conc. H₂SO₄ → flame");
    expect(c3.join(",") === "roar", `F⁻ flame test → ${c3.join(",")}`);
    const c4 = await runLab(page, "S²⁻", "AgNO₃");
    expect(c4.join(",") === "drip", `S²⁻ + AgNO₃ → ${c4.join(",")}`);
    const c5 = await runLab(page, "SO₄²⁻", "dil. HCl");
    expect(c5.join(",") === "drip", `SO₄²⁻ + dil. HCl → ${c5.join(",")}`);
    allErrors.push(...errors); await ctx.close();
  }],
  9: ["Sound off mid-scene stops everything at once; each profile keeps its own sound setting and volume", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Sound A");
    await soundOn(page, true, 0.3);
    if (RUN !== "reduce") {   // reduced motion is silent (Prompt 5), so this part runs with motion only
      await page.click(`[data-lab-group="I"]`); await page.click(`#lab-anions [data-anion="HCO₃⁻"]`); await page.selectOption("#lab-reagent", "BaCl₂");
      await page.click('#lab-conds button[data-cond="boiling"]');
      await page.waitForTimeout(RUN === "reduce" ? 150 : 1200);
      const mid = await page.evaluate(() => window.__anionLab.activeSounds());
      expect(mid > 0, "nothing playing mid-scene");
      await page.click("#spk-btn");
      const now = await page.evaluate(() => window.__anionLab.activeSounds());
      expect(now === 0, `${now} sounds still playing right after turning sound off`);
      await page.click("#spk-btn");   // back on for the persistence check
    }
    await addProfile(page, "Sound B");
    await soundOn(page, false, 0.8);
    await switchTo(page, "Sound A");
    await page.reload();
    let st = await L(page);
    expect(st.settings.sound === true && Math.abs(st.settings.volume - 0.3) < 1e-9, `A after reload: ${JSON.stringify(st.settings)}`);
    expect(await page.getAttribute("#spk-btn", "data-on") === "true", "speaker does not show A's 'on'");
    await switchTo(page, "Sound B");
    st = await L(page);
    expect(st.settings.sound === false && Math.abs(st.settings.volume - 0.8) < 1e-9, `B: ${JSON.stringify(st.settings)}`);
    allErrors.push(...errors); await ctx.close();
  }],
  10: ["Every view scrollWidth ≤ 360; no console or page error in any test", async browser => {
    const { ctx, page, errors } = await fresh(browser);
    await createFirst(page, "Layout");
    const wide = [];
    const shot = async (name, full = true) => { const sw = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)); if (sw > 360) wide.push(`${name}: ${sw}`); await page.screenshot({ path: `shots/update/${RUN}-${name}.png`, fullPage: full }); };
    for (const v of VIEWS) { await page.click(`button[data-nav="${v}"]`); if (v === "quiz") await answer(page, false); await page.waitForTimeout(RUN === "reduce" ? 100 : 900); await shot(v); }
    await page.click("#who-btn"); await shot("sheet", false);
    for (const kind of ["quiz", "unknown", "all", "profile"]) { await page.click(`[data-del="${kind}"]`); await shot(`confirm-${kind}`, false); await page.click("[data-confirm-no]"); }
    await page.click("[data-sheet-close]");
    if (await page.locator("#spk-btn:visible").count()) { await page.click("#spk-btn"); await shot("speaker", false); await page.click("#spk-btn"); }
    const title = await page.evaluate(() => { const h = document.querySelector(".top h1"); return h.getClientRects().length === 1 && h.scrollWidth <= h.clientWidth + 1; });
    expect(title, "top bar title wraps or overflows");
    expect(!wide.length, wide.join(", "));
    allErrors.push(...errors); await ctx.close();
    expect(!allErrors.length, allErrors.slice(0, 8).join("\n      "));
  }],
  11: ["localStorage that throws: page loads, a profile can be created, the quiz works for the session", async browser => {
    const { ctx, page, errors } = await fresh(browser, () => { Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } }); });
    await createFirst(page, "Private");
    expect((await page.locator("#who-name").innerText()).trim() === "Private", "profile not active");
    await page.click('button[data-nav="quiz"]');
    await answer(page, true); await next(page); await answer(page, false);
    const st = await L(page);
    expect(st.qz.answered === 2 && st.qz.correct === 1, `quiz in memory: ${st.qz.correct}/${st.qz.answered}`);
    expect(!errors.length, errors.join(" | "));
    await ctx.close();
  }],
  12: ["check_data.py passes on the final file (publish URL is checked after publishing)", async () => {
    const out = execFileSync("uv", ["run", "--no-project", "python", "-I", "check_data.py", "dist/anion-lab.html"], { encoding: "utf8" });
    expect(/PASS/.test(out), out);
  }]
};

const browser = await chromium.launch({ executablePath: CHROME });
const results = [];
for (const [n, [name, fn]] of Object.entries(TESTS)) {
  if (ONLY && !ONLY.has(+n)) continue;
  try { await fn(browser); results.push([n, name, "PASS"]); }
  catch (e) { results.push([n, name, "FAIL", e.message.split("\n").slice(0, 6).join("\n      ")]); }
}
await browser.close();
for (const [n, name, st, m] of results) console.log(`${st === "PASS" ? "✓" : "✗"} ${n}. ${name}${m ? "\n      " + m : ""}`);
const passed = results.filter(r => r[2] === "PASS").length;
console.log(`\n[${RUN}] ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
