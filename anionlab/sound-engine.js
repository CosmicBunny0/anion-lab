/* Anion Lab — lab sounds, synthesized with Web Audio (no audio files, no libraries).
   makeSoundEngine(ctx, opts) → { input, output, synth, start(cue, seconds, when), stopAll(), active(), setVolume(v), cues }
     input   the master chain's input (every cue voice connects here)
     output  the master gain (setVolume moves it smoothly)
     synth   the cue synthesizers: synth[cue](t, seconds, out, sources)
   Bubbles are pitched: short sine grains that glide up and decay exponentially, the way a bubble rings
   (Minnaert resonance; van den Doel, "Physically based models for liquid sounds", 2005). Noise is used only for air
   (hiss, roar), and only pink or brown, low-passed. Every gain change ramps; every stop fades out (20 ms) before
   the sources stop. Grains are scheduled ahead on the audio clock, at most ~40 per second.
   One master chain: high-shelf cut above 6 kHz → short room (convolver, ~13% wet) → soft limiter → master gain. */
function makeSoundEngine(ctx, opts = {}) {
  const sr = ctx.sampleRate;
  let seed = (opts.seed ?? (Math.random() * 4294967296)) >>> 0;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let x = seed; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const between = (a, b) => a + rnd() * (b - a);
  const logBetween = (a, b) => a * Math.pow(b / a, rnd());
  const MASTER = opts.master ?? 1.6;

  // ── building blocks ──
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, Q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
  // a short room: stereo decaying noise, darker as it decays, 8 ms pre-delay, built once
  function roomIR(seconds) {
    const n = Math.round(seconds * sr), pre = Math.round(.008 * sr), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let lp = 0;
      for (let i = pre; i < n; i++) {
        const k = (i - pre) / (n - pre), a = Math.exp(-6.9 * k);    // −60 dB at the end
        const smooth = .35 + .6 * k;                                 // high end dies first
        lp += (1 - smooth) * ((rnd() * 2 - 1) - lp);
        d[i] = lp * a;
      }
    }
    return b;
  }
  let pinkBuf = null, brownBuf = null;
  function pink() {    // Paul Kellet's pink-noise filter over white noise, 2 s, built once
    if (pinkBuf) return pinkBuf;
    pinkBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = pinkBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = rnd() * 2 - 1;
      b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
      b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
    }
    return pinkBuf;
  }
  function brown() {   // integrated white noise, 2 s, built once
    if (brownBuf) return brownBuf;
    brownBuf = ctx.createBuffer(1, sr * 2, sr);
    const d = brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { last = (last + .02 * (rnd() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    return brownBuf;
  }
  function noise(buf, t0, t1, src) {
    const n = ctx.createBufferSource(); n.buffer = buf; n.loop = true;
    n.start(t0, rnd() * 1.5); n.stop(t1); src.push(n); return n;
  }
  // a gain that swells in, holds and fades out, all ramps (no steps on a running sound)
  function swell(t, d, peak, attack, release) {
    const g = gain(0), a = Math.max(.003, attack), hold = Math.max(t + a, t + d - release);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, hold); g.gain.setTargetAtTime(0, hold, release / 4);
    return g;
  }
  // one bubble: a sine that glides up in pitch and rings down exponentially
  function bubble(out, src, t, f, amp, ring, rise = 1.3, attack = .004) {
    const o = ctx.createOscillator(), g = gain(0), a = Math.max(.003, attack), end = t + a + ring * 8;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rise, t + a + ring * 4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + a); g.gain.setTargetAtTime(0, t + a, ring);
    o.connect(g).connect(out); o.start(t); o.stop(end); src.push(o);
  }
  // a struck note: sine + a few quiet partials, each with its own decay
  function note(out, src, t, partials, attack, len) {
    for (const [f, amp, ring] of partials) {
      const o = ctx.createOscillator(), g = gain(0), a = Math.max(.003, attack);
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + a); g.gain.setTargetAtTime(0, t + a, ring);
      o.connect(g).connect(out); o.start(t); o.stop(t + a + Math.max(len, ring * 8)); src.push(o);
    }
  }
  // grains spread over [t, t + d]; density thins in and out at the edges
  function stream(t, d, perSecond, edge, each) {
    const n = Math.max(1, Math.round(d * perSecond));
    for (let i = 0; i < n; i++) {
      const x = t + (i + between(.1, .9)) * d / n, k = Math.min(1, (x - t) / edge, (t + d - x) / edge);
      if (k > 0) each(x, Math.max(.25, k));
    }
  }

  // ── the cues ──
  const SYN = {
    // one clean drop: a quick upward "plink", a tiny second droplet, and a soft low body
    drip(t, d, out, src) {
      bubble(out, src, t, 640, .049, .016, 1.9, .004);
      bubble(out, src, t + .002, 210, .027, .012, 1.15, .005);
      bubble(out, src, t + between(.06, .085), between(1150, 1350), .011, .009, 1.5);
    },
    // small, light, higher bubbles at an easy pace (about 14 a second) over a very quiet soft bed
    fizz(t, d, out, src) {
      stream(t, d, 14, .25, (x, k) => bubble(out, src, x, logBetween(550, 1250), between(.009, .025) * k, between(.022, .036), between(1.15, 1.45)));
      const bed = swell(t, d, .044, .25, .35); bed.connect(out);
      noise(pink(), t, t + d + .6, src).connect(filt("highpass", 350)).connect(filt("lowpass", 1600)).connect(bed);
    },
    // fewer, larger, lower bubbles over a soft low rumble
    boil(t, d, out, src) {
      stream(t, d, 11, .45, (x, k) => bubble(out, src, x, logBetween(320, 760), between(.016, .036) * k, between(.018, .034), between(1.25, 1.7), .005));
      const rumble = swell(t, d, .028, .45, .5); rumble.connect(out);
      noise(brown(), t, t + d + .7, src).connect(filt("lowpass", 300)).connect(rumble);
    },
    // air through a narrow opening: pink noise around 2–3.5 kHz, low Q, swelling in slowly
    hiss(t, d, out, src) {
      const g = swell(t, d, .06, .45, .5); g.connect(out);
      noise(pink(), t, t + d + .7, src).connect(filt("bandpass", 2300, .55)).connect(filt("lowpass", 3000)).connect(g);
    },
    // glass: a few slightly inharmonic partials (highest under 4.5 kHz), soft 2.5 ms attack, natural decay
    clink(t, d, out, src) {
      const f = between(1250, 1320);
      note(out, src, t, [[f, .0255, .11], [f * 1.003, .005, .14], [f * 2.41, .003, .045], [f * 2.93, .0013, .03]], .0025, .3);
    },
    // acid running down the wall: a steady stream of small bubbles
    trickle(t, d, out, src) {
      stream(t, d, 26, .2, (x, k) => bubble(out, src, x, logBetween(560, 1150), between(.018, .033) * k, between(.007, .012), between(1.15, 1.35)));
      const bed = swell(t, d, .0075, .2, .3); bed.connect(out);
      noise(pink(), t, t + d + .5, src).connect(filt("bandpass", 1100, .8)).connect(bed);
    },
    // a soft burner: brown noise low-passed, with a slow, shallow flutter
    roar(t, d, out, src) {
      const g = swell(t, d, .04, .25, .45); g.connect(out);
      const body = filt("lowpass", 520), air = gain(.9);
      noise(brown(), t, t + d + .6, src).connect(body).connect(g);
      noise(pink(), t, t + d + .6, src).connect(filt("highpass", 250)).connect(filt("lowpass", 1100)).connect(air).connect(g);
      const lfo = ctx.createOscillator(), depth = gain(.035); lfo.frequency.value = 6.5; depth.gain.value = .01;
      lfo.connect(depth).connect(g.gain); lfo.start(t); lfo.stop(t + d + .6); src.push(lfo);
    },
    // quiz: two rising marimba-like notes (a major third) for right, one lower gentle note for wrong
    right(t, d, out, src) {
      note(out, src, t, [[784, .0185, .09], [784 * 4, .002, .02]], .008, .4);
      note(out, src, t + .12, [[988, .0185, .12], [988 * 3.9, .0016, .02]], .008, .5);
    },
    wrong(t, d, out, src) { note(out, src, t, [[330, .0235, .14], [330 * 4, .0013, .025]], .008, .6); }
  };
  const TAIL = { drip: .35, fizz: .8, boil: .9, hiss: .9, clink: .7, trickle: .7, roar: .8, right: 1, wrong: 1.1 };

  // ── master chain: high-shelf → dry + room → soft limiter → master gain → out ──
  const input = gain(1), shelf = filt("highshelf", 6000); shelf.gain.value = -9;
  const dry = gain(.87), wet = gain(.13), room = ctx.createConvolver(); room.buffer = roomIR(.65);
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = .003; limiter.release.value = .2;
  const output = gain(MASTER);
  input.connect(shelf); shelf.connect(dry).connect(limiter); shelf.connect(room).connect(wet).connect(limiter);
  limiter.connect(output).connect(opts.destination || ctx.destination);

  // ── voices: a cue that starts within 150 ms of the same cue already playing joins it (compare mode plays it once) ──
  let voices = [];
  function start(cue, seconds = .3, when) {
    if (!SYN[cue]) return null;
    const now = ctx.currentTime, t = when ?? now + .01, d = Math.max(.12, seconds);
    voices = voices.filter(v => !v.done && v.end > now);
    const same = voices.find(v => v.cue === cue && Math.abs(v.t - t) < .15);
    if (same) { same.refs++; let gone = false; return { cue, stop() { if (!gone) { gone = true; if (--same.refs <= 0) same.stop(); } } }; }
    const out = gain(1), src = [];
    out.connect(input);
    SYN[cue](t, d, out, src);
    const v = { cue, t, end: t + d + TAIL[cue], refs: 1, done: false, stop() {
      if (v.done) return;
      v.done = true;
      const n = ctx.currentTime;
      try { out.gain.cancelScheduledValues(n); out.gain.setValueAtTime(1, n); out.gain.linearRampToValueAtTime(0, n + .02); } catch (e) { /* closed */ }
      src.forEach(s => { try { s.stop(n + .03); } catch (e) { /* already stopped */ } });
    } };
    voices.push(v);
    let gone = false;
    return { cue, stop() { if (!gone) { gone = true; if (--v.refs <= 0) v.stop(); } } };
  }
  const stopAll = () => { voices.forEach(v => v.stop()); voices = []; };
  const active = () => voices.filter(v => !v.done && v.end > ctx.currentTime).length;
  const setVolume = v => { try { output.gain.setTargetAtTime(MASTER * v, ctx.currentTime, .03); } catch (e) { /* closed */ } };
  return { input, output, synth: SYN, start, stopAll, active, setVolume, cues: Object.keys(SYN) };
}
