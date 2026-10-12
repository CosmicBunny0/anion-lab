/* The lab sounds as they are on the live page (version 1791790310-04aa), copied as they are and wrapped in a factory
   so they can be rendered offline and played on the preview page next to the new engine.
   makeOldEngine(ctx) → { start(cue, seconds, when), stopAll(), active(), setVolume(v), cues } */
function makeOldEngine(ctx, opts = {}) {
  const MASTER = 0.45;
  const master = ctx.createGain(); master.gain.value = MASTER; master.connect(opts.destination || ctx.destination);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const live = new Set();
  // ── copied from the page ──
  const gainNode = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, Q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
  const env = (g, t0, peak, a, hold, r) => { g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.setValueAtTime(peak, Math.max(t0 + a, hold)); g.gain.exponentialRampToValueAtTime(.0001, Math.max(t0 + a, hold) + r); };
  const noise = (t0, t1, src) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(t0, Math.random() * 1.5); n.stop(t1); src.push(n); return n; };
  const tone = (type, f, t0, t1, src) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); o.start(t0); o.stop(t1); src.push(o); return o; };
  const blip = (out, src, t, f0, f1, peak, len, type = "sine") => { const o = tone(type, f0, t, t + len + .05, src), g = ctx.createGain(); o.frequency.exponentialRampToValueAtTime(f1, t + len * .7); env(g, t, peak, .004, t + .008, len); o.connect(g).connect(out); };
  const SYN = {
    drip(t, d, out, src) { blip(out, src, t, 480, 1500, .5, .14); },
    fizz(t, d, out, src) {
      const crackle = ctx.createGain(), g = ctx.createGain();
      for (let x = t; x < t + d; x += .02 + Math.random() * .035) crackle.gain.setValueAtTime(.2 + Math.random() * .8, x);
      env(g, t, .2, .12, t + d - .3, .35);
      noise(t, t + d + .5, src).connect(filt("highpass", 3400)).connect(crackle).connect(g).connect(out);
    },
    boil(t, d, out, src) {
      const g = ctx.createGain(); env(g, t, .55, .4, t + d - .3, .4); g.connect(out);
      noise(t, t + d + .5, src).connect(filt("lowpass", 240)).connect(gainNode(.5)).connect(g);
      for (let x = t + .1; x < t + d - .1; x += .07 + Math.random() * .17) { const f = 85 + Math.random() * 110; blip(g, src, x, f, f * 1.9, .25 + Math.random() * .3, .07); }
    },
    hiss(t, d, out, src) { const g = ctx.createGain(); env(g, t, .09, .35, t + d - .5, .6); noise(t, t + d + .7, src).connect(filt("bandpass", 6200, .6)).connect(g).connect(out); },
    clink(t, d, out, src) { [[2350, .16, .38], [3720, .1, .26], [5260, .06, .18]].forEach(([f, v, len]) => blip(out, src, t, f, f * 1.002, v, len)); },
    trickle(t, d, out, src) {
      const g = ctx.createGain(); env(g, t, .05, .2, t + d - .3, .4); noise(t, t + d + .5, src).connect(filt("bandpass", 1700, 1.4)).connect(g).connect(out);
      for (let x = t + .03; x < t + d; x += .05 + Math.random() * .09) { const f = 900 + Math.random() * 800; blip(out, src, x, f, f * 1.5, .1, .05); }
    },
    roar(t, d, out, src) {
      const g = ctx.createGain(); env(g, t, .5, .3, t + d - .4, .45); g.connect(out);
      noise(t, t + d + .6, src).connect(filt("lowpass", 480)).connect(g);
      const lfo = tone("sine", 9, t, t + d + .6, src), depth = gainNode(.12); lfo.connect(depth).connect(g.gain);
    },
    right(t, d, out, src) { blip(out, src, t, 660, 662, .22, .14); blip(out, src, t + .11, 880, 882, .22, .2); },
    wrong(t, d, out, src) { blip(out, src, t, 300, 210, .22, .3, "triangle"); }
  };
  // ── the page's play() / stop(), without the settings and logging ──
  function start(cue, seconds = .3, when) {
    const t = when ?? ctx.currentTime + .01, d = Math.max(.12, seconds), out = ctx.createGain(), src = [];
    out.connect(master);
    SYN[cue](t, d, out, src);
    const h = { cue, end: t + d + .9, stop() {
      if (!live.has(h)) return;
      live.delete(h);
      src.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
      try { out.disconnect(); } catch (e) { /* already gone */ }
    } };
    live.add(h);
    return h;
  }
  const stopAll = () => [...live].forEach(h => h.stop());
  const active = () => [...live].filter(h => h.end > ctx.currentTime).length;
  const setVolume = v => master.gain.setTargetAtTime(MASTER * v, ctx.currentTime, .03);
  return { start, stopAll, active, setVolume, cues: Object.keys(SYN) };
}
