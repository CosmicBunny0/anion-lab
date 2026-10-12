# Anion Lab update — Prompt 5 of 5: lab sounds + final check

Read `anionlab/RULES.md` and follow it, with N = 5. If it's missing, stop and tell me to run Prompt 1 first. If Prompt 4 ended without publishing, stop and tell me. If `anionlab/sound-engine.js` or `anionlab/sound-metrics.mjs` is missing, stop and tell me to run Prompt 5a first.

## How to treat what's already on the page
The live page already has a sound module (`const Sound = (() => { … })()`): a speaker button, a volume slider, per-profile settings, `soundLog` and `activeSounds()` hooks, and cues scheduled in `mountScene()`. For every requirement and test below: if it's already there and correct, keep it and only add its test; if it differs, change only the difference; if it's missing, build it. Never build a second sound module.

What I saw on the live page (version 1791790310-04aa). Each one is a check, not a fact:
- The cue synthesis inside `Sound` is the old engine (white-noise fizz and hiss). This prompt replaces it.
- It unlocks audio on `pointerdown` among other events, and checks `navigator.userActivation`. There's no `touchend`, no `navigator.audioSession`, and no `visibilitychange` stop.
- Under reduced motion it still plays each cue once (`cueOnce`). This prompt wants silence then.
- There's no silent-switch note.

## Goal
Lab sounds that play with the animation, using the engine I approved by ear in Prompt 5a. They must never cause an error: if sound can't work somewhere, the page works exactly as before, just without sound. Then check the whole site before the last publish.
**Done when:** T11–T15 pass, every earlier test still passes, the final check is clean, `check_data.py` passes, and the same URL is republished.

## The engine: use `anionlab/sound-engine.js` as it is
- I approved these sounds on the preview page. Copy `makeSoundEngine` from `anionlab/sound-engine.js` into the page's IIFE as it is, character for character. Don't change any cue's synthesis, level, pitch or the master chain. If something in it truly can't work inside the page, stop and tell me instead of editing it.
- Delete the old synthesis from `Sound` (its `SYN`, `blip`, `tone`, the white-noise buffer and their helpers), so only one engine exists.
- Keep `Sound`'s outside interface exactly: `play`, `stopAll`, `unlock`, `setVolume`, `log`, `active`, `available`. Inside, `unlock` creates the AudioContext and `makeSoundEngine(ctx)`; `play(cue, rowId, ms)` calls the engine's `start(cue, seconds)`; `stopAll`, `setVolume` and `active` call the engine's own. Each Web Audio call stays inside try/catch.
- The engine already plays a cue type once when several compare scenes ask for it at the same time. Keep the page's per-scene `cancel()` working with that: cancelling one scene must not cut a cue another running scene still holds.

## Which events make a sound
Cues come from each row's `visual`. Each one starts with the animation step that shows it and stops when that step ends.

| What the animation shows | Cue |
|---|---|
| a drop of reagent reaching the tube (every tube scene with a dropper, "No reaction" rows included), or a drop on a paper or rod | `drip` |
| `type: "gas"`, `bubbles: true`, or a gas-transfer scene bubbling | `fizz` |
| `heat: true`, for as long as the heating shows | `boil` |
| `type: "fumes"` rising | `hiss` |
| `type: "layer"`, with the tube shaking for an extraction | `clink` |
| `type: "ring"`, with acid running down the wall | `trickle` |
| `type: "flame"` | `roar` |

Everything else is silent: color changes, a ppt forming, a stain spreading, and a "none" row after its drip. No music and no jingles in the lab. In the quiz only, `right` plays for a right answer and `wrong` for a wrong one.

Sound never carries information alone. Everything stays visible and captioned exactly as it is now.

## Control and iPhone rules
- Sound is off by default. A speaker `<button aria-pressed>` sits at the end of the top bar's second row. While sound is on, a volume slider shows next to it with `dir="ltr"`, the aria-label "مستوى الصوت", and `aria-valuetext` as a %. Both are ≥44 px tall. On/off and the volume are saved in the active profile's `:settings`.
- The new engine is about 5 dB quieter than the old one. Keep each profile's saved volume as it is, and set the default volume for a new profile so the quiz `right` tone sounds about as loud as the old one did.
- Create the AudioContext inside the speaker tap. In that same tap, set `navigator.audioSession.type = "playback"` if it exists (in try/catch; it helps when the silent switch is on).
- After that, on every `pointerup`, `touchend` or `click` anywhere, if sound is on and the context isn't `"running"`, call `resume()`, and create the context first if it's missing. This covers a reload with sound saved as on, and iOS's `"suspended"` and `"interrupted"` states after a lock or a call. Remove `pointerdown` from the unlock listeners, and never use `touchstart`, because iOS doesn't count either as a tap.
- A cue plays only while sound is on and the context is `"running"`. Otherwise `play()` does nothing, without an error. If creating or resuming audio fails, turn sound off, hide the speaker, and carry on.
- While sound is on, show a small `--graphite` note under the controls: "لو الموبايل على الصامت، الصوت مش هيطلع."

## Timing and stopping
- Schedule each cue in `mountScene()` next to its `at()` step, at the same `speed`, with the drip before the fizz. A scene controller's `cancel()` also stops its sounds.
- Stop every sound at once, using the engine's own fade, when: sound is turned off, Play pauses or moves on, a scene replays, the view changes, the profile switches, or the page is hidden (`visibilitychange`).
- With reduced motion, scenes jump straight to the end, so there's nothing to hear: play no lab sounds then. Remove the `cueOnce` path. The quiz tones still play.
- Unknown mode shows no animated scenes, so it stays silent.
- Test hooks on `window.__anionLab`: `soundLog` (`{cue, rowId, t}`, pushed each time a cue actually plays) and `activeSounds()` (how many sounds are playing now).

## Tests (add to tests.mjs)
Don't launch Chromium with `--autoplay-policy=no-user-gesture-required`: it hides exactly the failures my iPhone would have. Turn the speaker on with a real Playwright click.
- T11: With sound on, check `soundLog`: CO₃²⁻ + dil. HCl → `drip`, then `fizz`. HCO₃⁻ + BaCl₂ on boiling includes `boil`. The flame row (pick it by `visual.type`) → `roar`. S²⁻ + AgNO₃ → `drip` only. SO₄²⁻ + dil. HCl → `drip` only. A quiz answer → exactly one tone. With reduced motion, a lab scene logs no cue.
- T12: Start HCO₃⁻ + BaCl₂ on boiling and turn sound off mid-scene: `activeSounds()` is 0 within 50 ms. The same holds after Play pause, after leaving the lab, after switching profile and after `visibilitychange` to hidden. In compare mode with 3 scenes, cancelling one scene keeps the shared cue playing for the others. Set A to on at 40% and B to off, then reload: each keeps its own setting and volume.
- T13: Spy on `AudioContext` and `webkitAudioContext` with `addInitScript`. In a fresh profile, none is constructed before the speaker tap, and none is constructed while sound is off, however much the page is tapped. No listener for `pointerdown` or `touchstart` unlocks audio.
- T14 (no errors, whatever happens): run every earlier test once more with sound on. Then load the page three times: with `AudioContext` deleted from `window`, with its constructor throwing, and with `resume()` rejecting. Each time the speaker hides or sound stays off, every view still works, and there is no console or page error.
- T15: Run `anionlab/sound-metrics.mjs` against the engine as it sits inside the final page (extract it from the page, don't read `sound-engine.js`). Every Prompt 5a target still passes, and the engine text in the page is identical to `sound-engine.js`.

## Final check, before this prompt's publish
1. Give a fresh subagent only `anionlab/before-p1.html`, the final file, and `anionlab/prompt-1.md` to `anionlab/prompt-5.md` (including `prompt-5a.md`). It reports anything that changed without a prompt asking for it, and any requirement that isn't met. Fix what it finds and rerun every test.
2. Open the page at 360 px wide and look at every one of the 7 views, the profile sheet and each confirmation, in light and dark. Fix anything that looks wrong, then rerun every test.

## Report
The usual 3 lines from RULES.md, then:
- The exact output line of `check_data.py`, and T15's table.
- What I should check on my iPhone: tap the speaker, play CO₃²⁻ + dil. HCl and the flame row, with the silent switch on and off, once on the speaker and once on earphones.
- If I've shared the link, check that Share → "Always share latest version" is on.
