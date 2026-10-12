// Prompt 2 (delete history) on top of v3: exact-match replacements on the code around the data. Never touches the data line.
// v3 already has the four delete buttons and the in-page confirmation; this changes only the differences.
// Usage: node anionlab/p2-patch.mjs <baseline.html> <out.html>
import { readFileSync, writeFileSync } from "node:fs";

const [, , src, out] = process.argv;
let html = readFileSync(src, "utf8");
function rep(oldS, newS) {
  const n = html.split(oldS).length - 1;
  if (n !== 1) throw new Error(`expected exactly 1 match, found ${n}:\n${oldS.slice(0, 160)}`);
  html = html.replace(oldS, () => newS);
}

// Prompt 1 leftover: the brand keeps its natural width so "PHC 101 · … Groups I–VI" stays on one line;
// the name button gives way instead (its name already ends in an ellipsis), down to a 44px tap target
rep(`.top .brand { min-width: 0; display: grid; gap: 1px; }`,
    `.top .brand { flex: none; display: grid; gap: 1px; }`);
rep(`.top .tools { display: flex; align-items: center; gap: 6px; flex: none; position: relative; }`,
    `.top .tools { display: flex; align-items: center; gap: 6px; flex: 0 1 auto; min-width: 0; position: relative; }`);
rep(`.who { min-height: 44px; max-width: 112px; display: grid;`,
    `.who { min-height: 44px; min-width: 44px; max-width: 112px; display: grid;`);

// delete buttons: outlined in --graphite (was the faint --rule)
rep(`.del { min-height: 48px; padding: 8px 12px; border: 1.5px solid var(--rule);`,
    `.del { min-height: 48px; padding: 8px 12px; border: 1.5px solid var(--graphite);`);

// is localStorage usable in this browser? (probe key sits outside the anionlab:* namespace)
rep(`const refill = (obj, ...src) => { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, ...src); return obj; };
`, `const refill = (obj, ...src) => { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, ...src); return obj; };
const STORAGE_OK = (() => { try { const k = "__anionlab_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; } })();
`);

// the sheet: the line under "السجل محفوظ…", and the confirmation's back button wording
rep(`    <p class="note">السجل محفوظ على الجهاز ده بس، ومحدش على جهاز تاني يقدر يشوفه.</p>
`, `    <p class="note">السجل محفوظ على الجهاز ده بس، ومحدش على جهاز تاني يقدر يشوفه.</p>
    <p class="note" data-storage-note>\${STORAGE_OK ? "على الآيفون ممكن يتمسح لو قفلت Safari خالص أو مسحت بيانات المتصفح." : "المتصفح ده مانع الحفظ، فالسجل هيفضل لحد ما تقفل الصفحة بس."}</p>
`);
rep(`data-confirm-no="\${ask}">لا، رجوع</button>`, `data-confirm-no="\${ask}">لا، ارجع</button>`);

writeFileSync(out, html);
console.log(`wrote ${out} (${Buffer.byteLength(html)} bytes)`);
