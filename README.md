# مختبر الأنيونات — Anion Lab

Phone-first study site for every anion reaction in PHC 101 Pharmaceutical Analytical Chemistry I, lectures L01–L03 (Groups I–VI). Every observation, color word and slide ref is taken from the doctor's slides.

- Live: https://anion-lab.vercel.app
- Views: lab with animated test tubes (and a look-alike compare mode), reaction grid with a mastery map, search by what you saw, unknown-sample mode, play mode, exam-style quiz, slide errors.

## Layout

| Path | What it is |
|---|---|
| `data/build.mjs` | Every reaction row, written from the slides → `data/reactions.json`, `colors.json`, `anions.json` |
| `data/extras.mjs` | Two-tube gas sources, look-alike compare sets, "ليه بيحصل كده؟" notes (tagged slide / doc / extra) |
| `src/app.js`, `src/style.css` | The page (vanilla JS + inline SVG, no frameworks) |
| `build-page.mjs` | Inlines data + CSS + JS into one file: `dist/anion-lab.html` (artifact) and `dist/test.html` (standalone) |
| `tests/acceptance.mjs` | 18 Playwright acceptance tests (uses the installed Chrome via `playwright-core`) |
| `tools/` | Dev helpers: screenshots, quiz checker (`quizcheck.mjs`), a11y pass |
| `NOTES.md` | Working notes: sources, slide errors, decisions |

## Commands

```sh
npm install            # playwright-core only
npm run build          # data → dist/
npm test               # 18 acceptance tests
node tools/quizcheck.mjs
```

Deploy to Vercel: copy `dist/test.html` to `site/anion-lab/index.html`, then from `site/anion-lab` run
`VERCEL_TELEMETRY_DISABLED=1 npx vercel@63.1.2 deploy --prod --yes --scope cosmicbunny0s-projects`.

The slide PDFs, slide images and text dumps are not in the repo.
