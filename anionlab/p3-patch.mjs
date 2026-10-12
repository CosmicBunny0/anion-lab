// Prompt 3 (credit) + two Prompt 2 leftovers, on top of the live page: exact-match replacements around the data.
// v3 already shows the credit under the h1, as a footer after the views and in meta[name=author]; only the spelling differs.
// Usage: node anionlab/p3-patch.mjs <baseline.html> <out.html>
import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out] = process.argv;
let html = readFileSync(src, "utf8");
function rep(oldS, newS) {
  const n = html.split(oldS).length - 1;
  if (n !== 1) throw new Error(`expected exactly 1 match, found ${n}:\n${oldS.slice(0, 160)}`);
  html = html.replace(oldS, () => newS);
}

// credit: "Mohammed Aymen" (A-Y-M-E-N) in the meta, under the h1 and in the footer
rep(`<meta name="author" content="Mohammed Ayman">`, `<meta name="author" content="Mohammed Aymen">`);
rep(`<div class="credit" dir="ltr" lang="en">Made by Mohammed Ayman</div>`, `<div class="credit" dir="ltr" lang="en">Made by Mohammed Aymen</div>`);
rep(`<footer class="credit-foot"><span dir="ltr" lang="en">Made by Mohammed Ayman</span></footer>`, `<footer class="credit-foot"><span dir="ltr" lang="en">Made by Mohammed Aymen</span></footer>`);

// leftover 1: with a profile on the device the sheet focuses its heading, so the iPhone keyboard stays down;
// the name field takes focus only on "مين بيذاكر؟" (or when tapped)
rep(`<div class="sheet-head"><h2 id="sheet-title">\${title}</h2>`, `<div class="sheet-head"><h2 id="sheet-title" tabindex="-1">\${title}</h2>`);
rep(`  const first = mode === "pick" ? sheetHost.querySelector(".prof") : $("#prof-name");
  (first || $("#prof-name")).focus();`,
`  const first = mode === "gate" ? $("#prof-name") : mode === "pick" ? sheetHost.querySelector(".prof") : $("#sheet-title");
  (first || $("#sheet-title")).focus();`);

// leftover 2: after the active profile is deleted, picking a remaining profile is the only way out (no add form)
rep(`      <form id="prof-form" class="prof-form" novalidate>`, `      \${mode === "pick" ? "" : \`<form id="prof-form" class="prof-form" novalidate>`);
rep(`        <p class="form-err" id="prof-err" role="alert"></p>
      </form>
      <div id="sheet-extra"></div>`, `        <p class="form-err" id="prof-err" role="alert"></p>
      </form>\`}
      <div id="sheet-extra"></div>`);

writeFileSync(out, html);
console.log(`wrote ${out} (${Buffer.byteLength(html)} bytes)`);
