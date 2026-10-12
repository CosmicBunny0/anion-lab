# Anion Lab update — Prompt 5a: sound design (preview only, runs before Prompt 5)

Read `anionlab/RULES.md` and follow it, with N = 5a. If it's missing, stop and tell me. If Prompt 4 ended without publishing, stop and tell me.

One exception to RULES.md: this prompt never edits or publishes the main page. It publishes a separate private preview page and stops for my listening check.

## Goal
Replace the current synthesized sounds, which sound like static, with sounds that are soft, natural and easy on the ear on an iPhone speaker and on earphones.
**Done when:** every target below passes, the preview page is published, and I have replied that I approve the sounds. Prompt 5 then builds this engine into the main page.

## Baseline (I measured it on version 1791788295-8c40; Prompts 3 and 4 shouldn't have touched the sound code, so render each cue offline, as below, on today's live page and check these numbers before you start)
| cue | peak dBFS | RMS dBFS | energy > 4 kHz | energy > 6 kHz | spectral centroid |
|---|---|---|---|---|---|
| drip | −13.0 | −24.3 | 0% | 0% | 561 Hz |
| fizz | −16.7 | −29.8 | 92% | 79% | 11.7 kHz |
| boil | −16.7 | −34.0 | 0% | 0% | 172 Hz |
| hiss | −26.4 | −37.6 | 87% | 66% | 7.9 kHz |
| clink | −16.9 | −32.5 | 6% | 0% | 2.8 kHz |
| trickle | −25.7 | −38.6 | 1% | 1% | 1.4 kHz |
| roar | −19.4 | −34.7 | 0% | 0% | 383 Hz |
| right | −20.1 | −30.9 | 0% | 0% | 785 Hz |
| wrong | −20.2 | −32.8 | 0% | 0% | 299 Hz |

What's wrong with it:
1. `fizz` is white noise high-passed at 3.4 kHz with a stepped random gain. Almost all its energy is above 4 kHz, so it sounds like radio static, not bubbles. It is also the most frequent cue (gas, bubbles and gas-transfer rows).
2. `hiss` is white noise band-passed at 6.2 kHz, the band that sounds sharpest.
3. Clicks: `fizz` steps its gain with `setValueAtTime`, and `stop()` calls `n.stop()` with no fade.
4. Loudness is uneven: the cues' RMS levels span 14 dB.
5. Everything is dry, mono and beep-like, with no limiter. Compare mode can stack the same cue from up to 4 scenes.

## Design direction (your judgment inside it)
- **Bubbles are pitched, not noise.** Build `fizz`, `boil`, `drip` and `trickle` from short sine "bubble" grains: each one glides quickly upward in pitch and decays exponentially, which is how a real bubble rings (Minnaert resonance; van den Doel, "Physically based models for liquid sounds", 2005). Keep most of the energy between 300 Hz and 2.5 kHz. Randomize the timing, pitch and level of the grains.
  - `fizz`: many small, light, higher grains, plus at most a very quiet soft bed.
  - `boil`: fewer, larger, lower grains over a soft low rumble.
  - `drip`: one clean drop with a small body, not a game "bloop".
  - `trickle`: a gentle, steady stream of small grains.
- **Noise only where the sound is air** (`hiss`, `roar`), and then pink or brown noise, never white, low-passed. `hiss` sits around 2–3.5 kHz with a low Q and swells in slowly.
- `clink`: glass, with a few slightly inharmonic partials, the highest below about 4.5 kHz, an attack of at least 2 ms and a natural decay.
- Quiz tones: soft and bell- or marimba-like (a sine plus quiet upper partials, about 8 ms attack). `right` is two rising notes (for example a major third). `wrong` is one lower, gentle note. Never triangle, square or sawtooth.
- **One master chain for all cues:** a gentle high-shelf cut above about 6 kHz → a short, subtle room reverb (a `ConvolverNode` with a generated 0.5–0.8 s decaying impulse response, about 10–15% wet, built once) → a `DynamicsCompressorNode` set as a soft limiter → the master gain → the output.
- **No clicks:** every gain change ramps; never step the gain of a running sound. Attacks are at least 3 ms. Every stop fades out (about 20 ms) before the source stops.
- **Overlap:** when several scenes run at once (compare mode), each cue type plays once, not once per scene.
- **iPhone cost:** schedule grains ahead on the audio clock, not with a `setTimeout` per grain. Keep grain density at or under about 40 per second, and build each noise buffer once.
- Keep the module's interface exactly as it is (`play`, `stopAll`, `unlock`, `setVolume`, `log`, `active`, `available`) and keep the cue names, so Prompt 5's hooks and tests still work. Everything stays synthesized: no audio files and no libraries (Rule 6).

## Targets (guards, not the goal)
Write `anionlab/sound-metrics.mjs`. It renders each cue offline (`OfflineAudioContext`, 44.1 kHz, at its usual length) through the full master chain at full volume, in Playwright's Chromium.

| check | target |
|---|---|
| energy above 6 kHz | ≤ 5% for every cue |
| energy above 4 kHz | ≤ 15% (`hiss` ≤ 25%) |
| spectral centroid | ≤ 2.5 kHz (`hiss` ≤ 3.5 kHz) |
| peak, one cue | ≤ −6 dBFS |
| peak, worst overlap (4 compare scenes of HCO₃⁻ + BaCl₂ on boiling, `boil` + `fizz`) | ≤ −1 dBFS, no sample over 1.0 |
| loudness | each cue's RMS over its active part within ±3 dB of the median; quiz tones and `hiss` may sit 3–6 dB lower |
| clicks | stop each cue with `stopAll()` at 3 random points: the largest sample-to-sample jump within 30 ms after the stop is ≤ 0.01; same check over each cue's first 10 ms |

Report a before/after table with these numbers. Passing them doesn't make the sounds pleasant; my ears decide. If a target and my ears disagree, tell me which one, and loosen it only after I say so.

## Preview page: my listening check
- Save the new engine to `anionlab/sound-engine.js`: one function that takes the AudioContext and returns the cue synthesizers and the master chain's input. Prompt 5 copies this file into the page as it is.
- Publish a new, separate, private artifact titled "Anion Lab sound check" (no `url`, so it gets its own link). It is not a rebuild of the main page. Never publish to https://claude.ai/artifact/KskMe89FbDab2AezbzLvoR in this prompt.
- One row per cue: its name in Arabic and English, an example reaction it plays for, and two buttons, "القديم" and "الجديد". "القديم" plays the current engine, copied from the live page; "الجديد" plays the new one, at the same volume. Add a volume slider and a "شغّل الجديد كله" button that plays every new cue in order with 1 s gaps.
- Arabic RTL, light and dark, works at 360 px, tap targets ≥ 44 px. Use the same iPhone rules as Prompt 5: create the AudioContext on the first tap, set `navigator.audioSession.type = "playback"` when it exists, resume on `pointerup`/`touchend`/`click` only, every Web Audio call in try/catch. Show "لو الموبايل على الصامت، الصوت مش هيطلع."

## Stop here
Report, in Egyptian Arabic with English terms: the preview link, the before/after table, and a request to listen on my iPhone once on the speaker and once on earphones.
Then wait. Don't start Prompt 5. If I send notes on specific cues, change only those cues, rerun the targets, republish the preview to its own link, and ask me again.
