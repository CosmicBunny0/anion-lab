// Inlines data + CSS + JS into one self-contained page.
//   dist/anion-lab.html  → the file published as the artifact (the host adds <html>/<head>/<body>)
//   dist/test.html       → same page wrapped in a standards-mode skeleton for local Playwright runs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = p => readFileSync(new URL(p, import.meta.url), "utf8");
const rows = JSON.parse(read("./data/reactions.json"));
const colors = JSON.parse(read("./data/colors.json"));
const { groups, anions } = JSON.parse(read("./data/anions.json"));
const compare = JSON.parse(read("./data/compare.json"));
const explain = JSON.parse(read("./data/explain.json"));

// The walkthrough doc's corrections table (Claude Docs 518a3d35…, read 2026-10-10), verbatim.
const corrections = {
  doc: [
    { ref: "L01 · s17", slide: "2 BaNO₃ · 2 CaNO₃ · 2 MgNO₃", problem: "الصيغة غلط، الأيون +2", correct: "Ba(NO₃)₂ (barium nitrate) · Ca(NO₃)₂ · Mg(NO₃)₂" },
    { ref: "L01 · s21", slide: "2MnO₄⁻ + 5S₂O₃²⁻ + 14H⁺ → 2Mn²⁺ + 10SO₄²⁻ + 7H₂O", problem: "مش متوازنة (O والشحنة)", correct: "8MnO₄⁻ + 5S₂O₃²⁻ + 14H⁺ → 8Mn²⁺ + 10SO₄²⁻ + 7H₂O" },
    { ref: "L01 · s22", slide: "Cr₂O₇²⁻ + 3S₂O₃²⁻ + 26H⁺ → 2Cr³⁺ + 3SO₄²⁻ + 13H₂O", problem: "مش متوازنة (S و O والشحنة)", correct: "4Cr₂O₇²⁻ + 3S₂O₃²⁻ + 26H⁺ → 8Cr³⁺ + 6SO₄²⁻ + 13H₂O" },
    { ref: "L01 · s24", slide: "\"All insoluble except Ca²⁺, Ba²⁺ & Sr²⁺\" في خانة واحدة تحت S²⁻ و SO₃²⁻", problem: "لو اتطبقت على الـ sulphite تتعارض مع slide 29 (BaSO₃ white ppt)", correct: "اعتبرها قاعدة الـ sulphide، واسأل المعيد عن الـ sulphite" },
    { ref: "L01 · s28", slide: "Ag₂SO₃ → (boiling) SO₂ + 2Ag₂SO₄²⁻ + 2Ag⁰", problem: "المعادلة متلخبطة", correct: "2Ag₂SO₃ → 2Ag⁰↓ (grey) + Ag₂SO₄ + SO₂↑" },
    { ref: "L01 · s34", slide: "Na₂SO₄ + C → Na₂S + 4CO", problem: "الـ carbon ناقص", correct: "Na₂SO₄ + 4C → Na₂S + 4CO" },
    { ref: "L02 · s10", slide: "AgX + S₂O₃²⁻ → [Ag(S₂O₃)₂]³⁻ + X⁻", problem: "محتاجة 2 thiosulphate", correct: "AgX + 2S₂O₃²⁻ → [Ag(S₂O₃)₂]³⁻ + X⁻" },
    { ref: "L02 · s15", slide: "\"yellow ppt. of sodium chromate\"", problem: "Na₂CrO₄ (sodium chromate) soluble، والصورة نفسها بتوري محلول أصفر", correct: "اكتب yellow solution of Na₂CrO₄ (والـ ppt الأصفر الحقيقي هو PbCrO₄ في الـ confirmation)" },
    { ref: "L03 · s12", slide: "AsO₄³⁻ + 2I⁻ + 4H⁺ → AsO₃⁻ + I₂ + 2H₂O", problem: "مش متوازنة، والشحنة غلط", correct: "استخدم نسخة slide 4: AsO₄³⁻ + 2H⁺ + 2I⁻ ⇌ AsO₃³⁻ + H₂O + I₂" }
  ],
  notes: [
    { ref: "L02 · s5 و s21", text: "السلايد كاتبة Cu²⁺ (وفي 21 Cu₂²⁺) في الـ insoluble halides و thiocyanates. المراجع بتقول cuprous Cu⁺ (زي CuI). اكتب زي السلايد في الامتحان." },
    { ref: "L02 · s16", text: "السلايد بتكتب perchromic acid كـ CrO₈³⁻ والمعادلة بتاعتها متوازنة. مراجع كتير بتكتب المركب الأزرق CrO₅ (chromium peroxide). خليك على السلايد." }
  ]
};

const data = JSON.stringify({ rows, colors, groups, anions, corrections, compare, explain }).replace(/</g, "\\u003c");
const css = read("./src/style.css");
const js = read("./src/app.js");

const page = `<title>مختبر الأنيونات</title>
<meta name="description" content="Interactive test-tube lab for anion reactions, Groups I–VI (PHC 101, L01–L03)">
<meta name="author" content="Mohammed Ayman">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>
${css}
</style>
<div id="app" dir="rtl" lang="ar"></div>
<script id="anion-data" type="application/json">${data}</script>
<script>
${js}
</script>
`;

const skeleton = body => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>
${body}</body></html>
`;

mkdirSync(new URL("./dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("./dist/anion-lab.html", import.meta.url), page);
writeFileSync(new URL("./dist/test.html", import.meta.url), skeleton(page));
console.log("dist/anion-lab.html", (page.length / 1024).toFixed(0) + " KB,", rows.length, "rows");
