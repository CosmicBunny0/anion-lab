// Builds anionlab/sound-check.html: the listening check page, with sound-old.js and sound-engine.js inlined as they are.
// Run: node anionlab/build-sound-check.mjs
import { readFileSync, writeFileSync } from "node:fs";

const OLD = readFileSync("anionlab/sound-old.js", "utf8");
const NEW = readFileSync("anionlab/sound-engine.js", "utf8");
const CUES = [
  ["drip", "نقطة الكاشف", "أي أنبوبة فيها قطّارة، زي", "CO₃²⁻ + BaCl₂", .3],
  ["fizz", "فوران", "الغاز والفقاعات، زي", "CO₃²⁻ + dil. HCl", 2.92],
  ["boil", "غليان", "طول ما الأنبوبة بتتسخّن، زي", "HCO₃⁻ + BaCl₂ · boiling", 3.82],
  ["hiss", "أبخرة", "لما الـ fumes تطلع، زي", "Br⁻ + conc. H₂SO₄", 1.6],
  ["clink", "رجّ الأنبوبة", "الـ layer وهي بتترج (3 خبطات)، زي", "Br⁻ + chlorine water + CHCl₃", .3],
  ["trickle", "حمض نازل على الجدار", "الـ ring، زي", "NO₃⁻ + FeSO₄ + H₂SO₄ (brown ring test)", 1.1],
  ["roar", "لهب البنزن", "الـ flame، زي", "F⁻ + borax + conc. H₂SO₄ → flame", 1.5],
  ["right", "إجابة صح", "في الكويز", "", .3],
  ["wrong", "إجابة غلط", "في الكويز", "", .3]
];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const page = `<title>Anion Lab sound check</title>
<meta name="description" content="Old vs new synthesized lab sounds for the anion lab, side by side">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Reem+Kufi:wght@700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>
/* Layout: the anion lab's own chrome (ink on porcelain, no hue); one column of cue rows, old and new side by side. */
:root {
  --paper: #F1F2EF; --surface: #FFFFFF; --ink: #1B1D1C; --graphite: #595E5B; --rule: #D1D3CE; --wash: #E5E6E2;
  --font-display: "Reem Kufi", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif;
  --font-body: "IBM Plex Sans Arabic", "Segoe UI", Tahoma, system-ui, sans-serif;
  --font-sci: "Source Serif 4", Cambria, "Times New Roman", serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #101211; --surface: #181B19; --ink: #E8E9E5; --graphite: #A0A5A1; --rule: #2E322F; --wash: #222623; color-scheme: dark; } }
:root[data-theme="dark"] { --paper: #101211; --surface: #181B19; --ink: #E8E9E5; --graphite: #A0A5A1; --rule: #2E322F; --wash: #222623; color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--paper); color: var(--ink); font-family: var(--font-body); font-size: 15.5px; line-height: 1.6; -webkit-text-size-adjust: 100%; }
main { max-width: 560px; margin: 0 auto; padding-inline: 16px; padding-block: 14px 40px; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px dashed var(--ink); outline-offset: 3px; }
header { border-bottom: 2px solid var(--ink); padding-bottom: 12px; margin-bottom: 14px; }
h1 { font-family: var(--font-display); font-size: 26px; line-height: 1.2; margin: 0; }
.en { font-family: var(--font-sci); direction: ltr; unicode-bidi: isolate; }
.sub { color: var(--graphite); font-size: 13.5px; margin: 4px 0 0; }
.silent { margin: 10px 0 0; font-size: 13.5px; color: var(--graphite); }
.controls { display: grid; gap: 10px; margin-bottom: 14px; }
.vol { display: grid; grid-template-columns: auto minmax(0, 1fr) 3.5em; gap: 10px; align-items: center; }
.vol label { font-size: 13.5px; font-weight: 600; color: var(--graphite); }
.vol output { font-variant-numeric: tabular-nums; font-size: 13.5px; text-align: start; }
#vol { width: 100%; min-height: 44px; accent-color: var(--ink); }
.row2 { display: flex; gap: 8px; flex-wrap: wrap; }
.btn { min-height: 48px; padding: 8px 16px; border-radius: 10px; border: 2px solid var(--ink); background: var(--ink); color: var(--paper); font-weight: 700; }
.btn.ghost { background: transparent; color: var(--ink); }
.cues { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.cue { background: var(--surface); border: 1.5px solid var(--rule); border-radius: 12px; padding: 10px 12px; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px 10px; align-items: center; }
.cue[data-on="true"] { border: 2px solid var(--ink); }
.cue h2 { margin: 0; font-size: 16px; font-weight: 700; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.cue h2 .en { font-weight: 400; font-size: 13.5px; color: var(--graphite); }
.cue p { margin: 0; font-size: 13.5px; color: var(--graphite); min-width: 0; overflow-wrap: anywhere; }
.cue p .en { color: var(--ink); }
.pair { display: flex; gap: 6px; grid-row: 1 / span 2; grid-column: 2; }
.pair button { min-width: 64px; min-height: 44px; padding: 6px 10px; border-radius: 10px; border: 1.5px solid var(--graphite); background: transparent; font-size: 14px; font-weight: 600; }
.pair button.new { border: 2px solid var(--ink); background: var(--ink); color: var(--paper); }
.pair button[aria-pressed="true"] { outline: 2px solid var(--ink); outline-offset: 2px; }
.status { min-height: 1.5em; font-size: 13.5px; color: var(--graphite); margin: 12px 0 0; }
@media (max-width: 380px) { .cue { grid-template-columns: 1fr; } .pair { grid-row: auto; grid-column: auto; } .pair button { flex: 1; } }
</style>
<main dir="rtl" lang="ar">
  <header>
    <h1>فحص أصوات المعمل <span class="en" style="display:block;font-size:14px;font-weight:400;text-align:right">Anion Lab sound check</span></h1>
    <p class="sub">كل صوت له زرارين: القديم اللي في الموقع دلوقتي، والجديد. اسمعهم مرة على سماعة الموبايل ومرة على السماعة اللي في ودنك.</p>
    <p class="silent">لو الموبايل على الصامت، الصوت مش هيطلع.</p>
  </header>
  <section class="controls" aria-label="التحكم">
    <div class="vol"><label for="vol">مستوى الصوت</label><input id="vol" type="range" min="0" max="1" step="0.05" value="1" dir="ltr" aria-label="مستوى الصوت" aria-valuetext="100%"><output id="vol-out" for="vol">100%</output></div>
    <div class="row2"><button type="button" class="btn" id="all">شغّل الجديد كله</button><button type="button" class="btn ghost" id="stop">وقّف</button></div>
  </section>
  <ol class="cues">
${CUES.map(([cue, ar, where, ex, d]) => `    <li class="cue" data-cue="${cue}" data-len="${d}"><h2>${esc(ar)} <span class="en">${cue}</span></h2>
      <p>${esc(where)}${ex ? ` <span class="en">${esc(ex)}</span>` : ""}</p>
      <div class="pair"><button type="button" class="old" data-play="old" aria-pressed="false" aria-label="${esc(ar)}: القديم">القديم</button><button type="button" class="new" data-play="new" aria-pressed="false" aria-label="${esc(ar)}: الجديد">الجديد</button></div></li>`).join("\n")}
  </ol>
  <p class="status" id="status" role="status"></p>
</main>
<script>
${OLD}
</script>
<script>
${NEW}
</script>
<script>
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const TAIL = .9;
  let ctx = null, oldE = null, newE = null, failed = false, vol = 1, timers = [];
  const say = t => { $("#status").textContent = t; };
  // the AudioContext is made inside the first tap; iOS plays through the silent switch only with audioSession "playback"
  function ready() {
    if (failed) return false;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (typeof AC !== "function") throw new Error("no Web Audio");
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* not on this browser */ }
        ctx = new AC();
        oldE = makeOldEngine(ctx); newE = makeSoundEngine(ctx);
        oldE.setVolume(vol); newE.setVolume(vol);
      }
      if (ctx.state !== "running") ctx.resume().catch(() => {});
      return true;
    } catch (e) { failed = true; ctx = null; say("الصوت مش شغال في المتصفح ده."); return false; }
  }
  // after a lock or a call iOS suspends the context: resume on a real tap only
  ["pointerup", "touchend", "click"].forEach(t => document.addEventListener(t, () => {
    try { if (ctx && ctx.state !== "running") ctx.resume().catch(() => {}); } catch (e) { /* closed */ }
  }, { capture: true, passive: true }));
  function quiet() {
    timers.forEach(clearTimeout); timers = [];
    try { if (oldE) oldE.stopAll(); if (newE) newE.stopAll(); } catch (e) { /* closed */ }
    $$(".cue").forEach(li => li.dataset.on = "false"); $$("[data-play]").forEach(b => b.setAttribute("aria-pressed", "false"));
  }
  function mark(li, which, from, len) {
    timers.push(setTimeout(() => { li.dataset.on = "true"; if (which) li.querySelector(\`[data-play="\${which}"]\`).setAttribute("aria-pressed", "true"); }, from * 1000));
    timers.push(setTimeout(() => { li.dataset.on = "false"; $$("[data-play]", li).forEach(b => b.setAttribute("aria-pressed", "false")); li.querySelectorAll("[data-play]").forEach(b => b.setAttribute("aria-pressed", "false")); }, (from + len) * 1000));
  }
  // clink plays three times, the way a layer row shakes it on the page
  function play(eng, cue, d, at) {
    try {
      if (cue === "clink") [0, .26, .52].forEach(x => eng.start(cue, d, at + x)); else eng.start(cue, d, at);
    } catch (e) { /* closed */ }
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-play]"); if (!b) return;
    if (!ready()) return;
    quiet();
    const li = b.closest(".cue"), cue = li.dataset.cue, d = +li.dataset.len, which = b.dataset.play;
    play(which === "old" ? oldE : newE, cue, d, ctx.currentTime + .03);
    mark(li, which, 0, d + (cue === "clink" ? .52 : 0) + TAIL);
    say("");
  });
  $("#all").addEventListener("click", () => {
    if (!ready()) return;
    quiet();
    let at = ctx.currentTime + .1, from = .1;
    for (const li of $$(".cue")) {
      const cue = li.dataset.cue, d = +li.dataset.len + (cue === "clink" ? .52 : 0);
      play(newE, cue, +li.dataset.len, at); mark(li, "new", from, d);
      at += d + 1; from += d + 1;
    }
    say("بيشغّل الأصوات الجديدة واحد ورا التاني، وبين كل صوت والتاني ثانية.");
  });
  $("#stop").addEventListener("click", () => { quiet(); if (!failed) say(""); });
  $("#vol").addEventListener("input", e => {
    vol = Math.min(1, Math.max(0, +e.target.value || 0));
    const p = Math.round(vol * 100) + "%"; e.target.setAttribute("aria-valuetext", p); $("#vol-out").textContent = p;
    try { if (oldE) oldE.setVolume(vol); if (newE) newE.setVolume(vol); } catch (e2) { /* closed */ }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) quiet(); });
})();
</script>
`;
writeFileSync("anionlab/sound-check.html", page);
console.log("wrote anionlab/sound-check.html (" + Buffer.byteLength(page) + " bytes)");
