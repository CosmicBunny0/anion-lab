// Renders every cue offline (OfflineAudioContext, 44.1 kHz, its usual length, full volume, through the engine's whole
// output chain) in Chromium and checks the Prompt 5a targets. Prints a before/after table.
// Run: node anionlab/sound-metrics.mjs [--engine <file>]   (exit 1 if the new engine misses a target)
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
// usual lengths on the page (s): drip/clink/quiz 300 ms, fizz 2920 ms, boil = the heated scene (3820 ms on HCO₃⁻ + BaCl₂ boiling),
// hiss 1600 ms, trickle 1100 ms, roar 1500 ms
const CUES = { drip: .3, fizz: 2.92, boil: 3.82, hiss: 1.6, clink: .3, trickle: 1.1, roar: 1.5, right: .3, wrong: .3 };
const QUIETER = ["right", "wrong", "hiss"];   // may sit 3–6 dB under the median

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage();
await page.goto("about:blank");
await page.addScriptTag({ content: readFileSync("anionlab/sound-old.js", "utf8") });
const at = process.argv.indexOf("--engine"), ENGINE = at > -1 ? process.argv[at + 1] : "anionlab/sound-engine.js";   // --engine <file>: measure another copy (T15: the one inside the page)
await page.addScriptTag({ content: readFileSync(ENGINE, "utf8") });

const res = await page.evaluate(async ({ CUES }) => {
  const SR = 44100, T0 = .05;
  const factories = { old: (ctx, seed) => makeOldEngine(ctx), new: (ctx, seed) => makeSoundEngine(ctx, { seed }) };
  const q = t => Math.round(t * SR / 128) * 128 / SR;   // suspend() needs render-quantum boundaries
  async function render(which, plan, len, stopAt, seed = 7) {
    const ctx = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
    const eng = factories[which](ctx, seed);
    eng.setVolume(1);
    plan.forEach(([cue, d, t]) => eng.start(cue, d, T0 + t));
    if (stopAt != null) ctx.suspend(q(T0 + stopAt)).then(() => { eng.stopAll(); ctx.resume(); });
    const b = await ctx.startRendering();
    return [b.getChannelData(0), b.getChannelData(1)];
  }
  const peakOf = ch => Math.max(...ch.map(c => { let m = 0; for (const x of c) m = Math.max(m, Math.abs(x)); return m; }));
  const db = x => 20 * Math.log10(Math.max(x, 1e-9));
  const mono = ch => { const m = new Float32Array(ch[0].length); for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2; return m; };
  function fft(re, im) {   // in place, radix-2
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  }
  function spectrum(x) {   // summed Hann-windowed power, 4096-point frames, 50% overlap
    const N = 4096, P = new Float64Array(N / 2);
    for (let s = 0; s + N <= x.length; s += N / 2) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[s + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / N));
      fft(re, im);
      for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
    }
    let tot = 0, a4 = 0, a6 = 0, c = 0;
    for (let k = 1; k < N / 2; k++) { const f = k * SR / N; tot += P[k]; c += f * P[k]; if (f > 4000) a4 += P[k]; if (f > 6000) a6 += P[k]; }
    return { e4: a4 / tot, e6: a6 / tot, centroid: c / tot };
  }
  function activeRms(x) {   // RMS over the 10 ms frames within 20 dB of the loudest frame
    const F = 441, fr = [];
    for (let s = 0; s + F <= x.length; s += F) { let e = 0; for (let i = s; i < s + F; i++) e += x[i] * x[i]; fr.push(e / F); }
    const top = Math.max(...fr), act = fr.filter(e => e >= top / 100);
    return Math.sqrt(act.reduce((a, b) => a + b, 0) / act.length);
  }
  const maxJump = (ch, from, ms) => { let m = 0; const a = Math.round(from * SR), b = Math.min(ch[0].length, a + Math.round(ms / 1000 * SR)); for (const c of ch) for (let i = Math.max(1, a); i < b; i++) m = Math.max(m, Math.abs(c[i] - c[i - 1])); return m; };

  const out = {};
  for (const which of ["old", "new"]) {
    const rows = {};
    for (const [cue, d] of Object.entries(CUES)) {
      const len = T0 + d + 1.3, ch = await render(which, [[cue, d, 0]], len);
      const m = mono(ch), sp = spectrum(m);
      const stops = [];
      for (let i = 0; i < 3; i++) {
        const at = .02 + (d - .04) * ((i * .37 + .19) % 1);   // three spread, fixed "random" points inside the cue
        const sc = await render(which, [[cue, d, 0]], len, at);
        stops.push(maxJump(sc, q(T0 + at), 30));
      }
      rows[cue] = { peak: db(peakOf(ch)), rms: db(activeRms(m)), e4: sp.e4, e6: sp.e6, centroid: sp.centroid, onset: maxJump(ch, T0, 10), stop: Math.max(...stops) };
    }
    // worst overlap: 4 compare scenes of HCO₃⁻ + BaCl₂ on boiling, each starting boil (0 s, 3.82 s) and fizz (0.70 s, 2.92 s)
    const plan = []; for (let s = 0; s < 4; s++) plan.push(["boil", 3.82, s * .004], ["fizz", 2.92, .7 + s * .004]);
    const ov = await render(which, plan, T0 + 3.82 + 1.3);
    let over = 0; for (const c of ov) for (const x of c) if (Math.abs(x) > 1) over++;
    out[which] = { rows, overlap: { peak: db(peakOf(ov)), over } };
  }
  return out;
}, { CUES });
await browser.close();

// ── targets ──
const fails = [];
const med = arr => { const s = arr.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const pct = x => (x * 100).toFixed(1) + "%", hz = f => f >= 1000 ? (f / 1000).toFixed(2) + " kHz" : Math.round(f) + " Hz", d1 = x => x.toFixed(1);
for (const which of ["old", "new"]) {
  const R = res[which].rows, m = med(Object.values(R).map(r => r.rms));
  console.log(`\n${which === "old" ? "BEFORE (live page)" : "AFTER (new engine)"}   median RMS ${d1(m)} dBFS`);
  console.log("cue      peak dBFS  RMS dBFS  vs median  >4 kHz  >6 kHz  centroid   onset jump  stop jump  result");
  for (const [cue, r] of Object.entries(R)) {
    const dm = r.rms - m, miss = [];
    if (r.e6 > .05) miss.push(">6k");
    if (r.e4 > (cue === "hiss" ? .25 : .15)) miss.push(">4k");
    if (r.centroid > (cue === "hiss" ? 3500 : 2500)) miss.push("centroid");
    if (r.peak > -6) miss.push("peak");
    if (QUIETER.includes(cue) ? (dm > 3 || dm < -6) : Math.abs(dm) > 3) miss.push("loudness");
    if (r.onset > .01) miss.push("onset click");
    if (r.stop > .01) miss.push("stop click");
    if (which === "new") miss.forEach(x => fails.push(`${cue}: ${x}`));
    console.log(`${cue.padEnd(8)} ${d1(r.peak).padStart(9)} ${d1(r.rms).padStart(9)} ${((dm >= 0 ? "+" : "") + d1(dm)).padStart(9)}  ${pct(r.e4).padStart(6)}  ${pct(r.e6).padStart(6)}  ${hz(r.centroid).padStart(9)}  ${r.onset.toFixed(4).padStart(10)}  ${r.stop.toFixed(4).padStart(9)}  ${miss.length ? "MISS " + miss.join(", ") : "ok"}`);
  }
  const o = res[which].overlap;
  const oMiss = o.peak > -1 || o.over > 0;
  if (which === "new" && oMiss) fails.push("overlap peak");
  console.log(`worst overlap (4 × boil + fizz): peak ${d1(o.peak)} dBFS, samples over 1.0: ${o.over}  ${oMiss ? "MISS" : "ok"}`);
}
console.log(fails.length ? `\nNEW ENGINE MISSES: ${fails.join(" | ")}` : "\nNEW ENGINE: every target met");
process.exit(fails.length ? 1 : 0);
