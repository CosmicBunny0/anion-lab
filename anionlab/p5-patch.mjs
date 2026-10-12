// Prompt 5 (lab sounds) on top of the live page: exact-match replacements around the data.
// The engine is anionlab/sound-engine.js pasted in as it is; Sound keeps its interface and drives it.
// Usage: node anionlab/p5-patch.mjs <baseline.html> <out.html>
import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out] = process.argv;
let html = readFileSync(src, "utf8");
const ENGINE = readFileSync("anionlab/sound-engine.js", "utf8").replace(/\s+$/, "");
const count = s => html.split(s).length - 1;
function rep(oldS, newS) {
  const n = count(oldS);
  if (n !== 1) throw new Error(`expected exactly 1 match, found ${n}:\n${oldS.slice(0, 160)}`);
  html = html.replace(oldS, () => newS);
}
// replace the code from `start` up to and including `end` (both must occur exactly once)
function repSpan(start, end, newS) {
  if (count(start) !== 1 || count(end) !== 1) throw new Error(`span markers not unique: ${start.slice(0, 60)} / ${end.slice(0, 60)}`);
  const a = html.indexOf(start), b = html.indexOf(end) + end.length;
  if (b <= a) throw new Error("span end before start");
  html = html.slice(0, a) + newS + html.slice(b);
}

// ── CSS: speaker = on/off toggle; the volume row shows under the top bar while sound is on ──
repSpan(`.spk[aria-expanded="true"] { border: 2px solid var(--ink); }`, `@media (prefers-reduced-motion: reduce) { .spk-toggle .knob { transition: none; } }`,
`.spk svg { width: 22px; height: 22px; }
.spk-row { display: grid; gap: 0; margin: -10px 0 14px; }
.spk-row .vol { display: grid; grid-template-columns: auto minmax(0, 1fr) 3.2em; gap: 10px; align-items: center; }
.spk-row .vol label { font-size: var(--fs-xs); color: var(--graphite); font-weight: 600; }
.spk-row output { font-size: var(--fs-xs); font-variant-numeric: tabular-nums; color: var(--graphite); }
#spk-vol { width: 100%; accent-color: var(--ink); min-height: 44px; margin: 0; }
.spk-row .note { margin: 0; font-size: var(--fs-xs); }`);

// the volume row sits right under the top bar
rep(`<div class="spk-slot" id="spk-slot"></div></div></header>
  \${VIEWS.map(`, `<div class="spk-slot" id="spk-slot"></div></div></header>
  <div class="spk-row" id="spk-row" hidden></div>
  \${VIEWS.map(`);

// ── no lab sounds under reduced motion (the scene jumps to its end); a drop on paper / a rod drips ──
rep(`  const cueOnce = list => { const seen = new Set(); list.slice().sort((a, b) => a.t - b.t).filter(c => !seen.has(c.cue) && seen.add(c.cue)).forEach((c, i) => timers.push(setTimeout(() => startCue(c.cue, 300), i * 300))); };
`, ``);
rep(`  // sound cues ride on the same timers (and speed); reduced motion plays each cue once, ~300 ms, in step order`,
    `  // sound cues ride on the same timers (and speed); reduced motion jumps to the end, so it stays silent`);
rep(`    if (instant) { svg.classList.add("instant"); fin(); done(); cueOnce([{ cue: "roar", t: 0 }]); }`,
    `    if (instant) { svg.classList.add("instant"); fin(); done(); }`);
rep(`    if (instant) { svg.classList.add("instant"); fumesOn(); genStatic(); fin(); done(); if (gen) cueOnce([{ cue: "fizz", t: 0 }, ...(fumesG ? [{ cue: "hiss", t: 250 }] : [])]); }`,
    `    if (instant) { svg.classList.add("instant"); fumesOn(); genStatic(); fin(); done(); }`);
rep(`      at(100, () => { drop.style.opacity = "1"; drop.style.transform = "translateY(110px)"; });`,
    `      at(100, () => { drop.style.opacity = "1"; drop.style.transform = "translateY(110px)"; });
      cue("drip", 450);   // the drop lands on the paper / rod`);
rep(`  if (instant) { finalState(); done(); cueOnce(p.heat ? [{ cue: "boil", t: 0 }, ...cues] : cues); return ctl(); }`,
    `  if (instant) { finalState(); done(); return ctl(); }`);

// ── a new profile starts at full volume: the engine sits ~5 dB under the old one ──
rep(`const SETTINGS_DEF = () => ({ sound: false, volume: 0.6, saved: [] });`, `const SETTINGS_DEF = () => ({ sound: false, volume: 1, saved: [] });`);

// ── Sound: same interface, the approved engine inside ──
repSpan(`const Sound = (() => {`, `["pointerdown", "pointerup", "keydown", "click"].forEach(t => document.addEventListener(t, () => { if (settings.sound) Sound.unlock(); }, { capture: true, passive: true }));`,
`${ENGINE}
const Sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, eng = null, failed = typeof AC !== "function";
  const log = [];
  const gesture = () => !navigator.userActivation || navigator.userActivation.isActive;
  // audio can't work here: sound goes off, the speaker hides, the page carries on
  function fail() {
    failed = true;
    try { if (eng) eng.stopAll(); } catch (e) { /* closed */ }
    try { if (ctx && ctx.close) ctx.close().catch(() => {}); } catch (e) { /* already closed */ }
    eng = null; ctx = null;
    if (settings.sound) { settings.sound = false; saveSettings(); }
    if (typeof renderSpeaker === "function") renderSpeaker();
  }
  function unlock() {                   // only ever called from a tap: the speaker, or pointerup / touchend / click
    if (failed || !gesture()) return !failed && !!ctx;
    try {
      if (!ctx) {
        try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* plays even with the silent switch on, where supported */ }
        ctx = new AC();
        eng = makeSoundEngine(ctx);
        eng.setVolume(settings.volume);
      }
      if (ctx.state !== "running") { const p = ctx.resume(); if (p && p.catch) p.catch(() => fail()); }
      return true;
    } catch (e) { fail(); return false; }
  }
  function play(cue, rowId, ms = 300) {
    if (!settings.sound || failed || !eng || !ctx || ctx.state !== "running" || document.hidden) return null;   // a scene's later cues stay silent while the page is hidden
    try {
      const h = eng.start(cue, Math.max(.12, ms / 1000));
      if (!h) return null;
      log.push({ cue, rowId: rowId || null, t: Math.round(performance.now()) }); if (log.length > 400) log.splice(0, log.length - 400);
      return h;
    } catch (e) { return null; }
  }
  const stopAll = () => { try { if (eng) eng.stopAll(); } catch (e) { /* closed */ } };
  const setVolume = v => { try { if (eng) eng.setVolume(v); } catch (e) { /* closed */ } };
  const active = () => { try { return eng ? eng.active() : 0; } catch (e) { return 0; } };
  return { play, stopAll, unlock, setVolume, log, active, available: () => !failed };
})();
// sound saved as "on": wake the audio on a real tap anywhere (iOS counts pointerup / touchend / click, not pointerdown / touchstart)
["pointerup", "touchend", "click"].forEach(t => document.addEventListener(t, () => { if (settings.sound) Sound.unlock(); }, { capture: true, passive: true }));
document.addEventListener("visibilitychange", () => { if (document.hidden) Sound.stopAll(); });`);

// ── the speaker toggles sound; while on, the volume and the silent-switch note show under the top bar ──
repSpan(`$("#spk-slot").innerHTML = \``, `document.addEventListener("keydown", e => { if (e.key === "Escape" && !spkPop.hidden) { spkShow(false); $("#spk-btn").focus(); } });`,
`$("#spk-slot").innerHTML = \`<button type="button" class="spk" id="spk-btn" aria-pressed="false" aria-label="أصوات المعمل" aria-describedby="spk-what"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"></svg></button>\`;
$("#spk-row").innerHTML = \`<div class="vol"><label for="spk-vol">مستوى الصوت</label><input type="range" id="spk-vol" min="0" max="1" step="0.05" dir="ltr" aria-label="مستوى الصوت"><output id="spk-out" for="spk-vol"></output></div>
  <p class="note" id="spk-what">نقطة الكاشف، والفوران، والغليان، والأبخرة… بتتسمع مع حركة التفاعل. في الكويز: نغمة للصح ونغمة للغلط.</p>
  <p class="note">لو الموبايل على الصامت، الصوت مش هيطلع.</p>\`;
function renderSpeaker() {
  const ok = Sound.available(), on = ok && !!settings.sound, btn = $("#spk-btn"), pc = Math.round(settings.volume * 100) + "%";
  $("#spk-slot").hidden = !ok;
  $("#spk-row").hidden = !on;
  btn.dataset.on = String(on);
  btn.setAttribute("aria-pressed", String(on));
  btn.querySelector("svg").innerHTML = on ? SPK_ON : SPK_OFF;
  $("#spk-vol").value = String(settings.volume);
  $("#spk-vol").setAttribute("aria-valuetext", pc);
  $("#spk-out").textContent = pc;
  Sound.setVolume(settings.volume);
}
// the AudioContext is created inside this tap (Sound.unlock)
$("#spk-btn").addEventListener("click", () => {
  const on = !settings.sound;
  if (on && !Sound.unlock()) { renderSpeaker(); return; }
  settings.sound = on;
  if (!on) Sound.stopAll();
  saveSettings(); renderSpeaker();
});
$("#spk-vol").addEventListener("input", e => {
  settings.volume = Math.min(1, Math.max(0, +e.target.value || 0));
  const pc = Math.round(settings.volume * 100) + "%";
  Sound.setVolume(settings.volume); e.target.setAttribute("aria-valuetext", pc); $("#spk-out").textContent = pc;
});
$("#spk-vol").addEventListener("change", () => saveSettings());`);

// the "storage blocked" check goes through store, like every other storage access
rep(`  del(k) { MEM.set(k, null); try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
`, `  del(k) { MEM.set(k, null); try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  ok() { try { const k = "__anionlab_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; } }   // false when this browser blocks localStorage
`);
rep(`const STORAGE_OK = (() => { try { const k = "__anionlab_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; } })();`,
    `const STORAGE_OK = store.ok();`);

// test hook: cancel one compare scene (T12 checks a cue the others still hold keeps playing)
rep(`round: () => round && { drill: !!round.drill, done: !!round.done } } };`,
    `round: () => round && { drill: !!round.drill, done: !!round.done }, cmpCancel: i => { const c = lab.cctl[i]; if (c) c.cancel(); return lab.cctl.length; } } };`);

writeFileSync(out, html);
console.log(`wrote ${out} (${Buffer.byteLength(html)} bytes)`);
