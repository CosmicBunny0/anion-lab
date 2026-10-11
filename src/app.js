(() => {
"use strict";

// ───────────────────────── data ─────────────────────────
const DATA = JSON.parse(document.getElementById("anion-data").textContent);
const ROWS = DATA.rows, COLORS = DATA.colors, ANIONS = DATA.anions, GROUPS = DATA.groups;
const ROW = new Map(ROWS.map(r => [r.id, r]));
const GROUP_IDS = ["I", "II", "III", "IV", "V", "VI"];
const CAT_ORDER = ["general", "dry", "confirm", "wet", "special"];
const CAT = {
  general: ["General properties", "خواص عامة (reducing)"],
  dry: ["Dry reactions", "تفاعلات جافة على الـ powder"],
  confirm: ["Confirmatory tests", "تأكيد الغاز اللي طلع"],
  wet: ["Wet reactions", "تفاعلات الـ salt solution"],
  special: ["Special tests", "اختبارات خاصة"]
};
const anionInfo = new Map(ANIONS.map(a => [a.anion, a]));
const anionsOf = g => ANIONS.filter(a => a.group === g).map(a => a.anion);

// anion → reagent → rows (reagents ordered by category, then by order on the slides)
const BY = new Map();
for (const a of ANIONS) BY.set(a.anion, new Map());
const firstSeen = new Map();
ROWS.forEach((r, i) => { if (!firstSeen.has(r.reagent)) firstSeen.set(r.reagent, i); });
const catOfReagent = new Map();
for (const r of ROWS) {
  const m = BY.get(r.anion);
  if (!m.has(r.reagent)) m.set(r.reagent, []);
  m.get(r.reagent).push(r);
  if (!catOfReagent.has(r.reagent)) catOfReagent.set(r.reagent, r.category);
}
const reagentSort = (a, b) => (CAT_ORDER.indexOf(catOfReagent.get(a)) - CAT_ORDER.indexOf(catOfReagent.get(b))) || (firstSeen.get(a) - firstSeen.get(b));
for (const [a, m] of BY) BY.set(a, new Map([...m.entries()].sort((x, y) => reagentSort(x[0], y[0]))));
const reagentsOf = a => [...BY.get(a).keys()];
const rowsOf = (a, rg) => (BY.get(a) && BY.get(a).get(rg)) || [];
const ALL_REAGENTS = [...firstSeen.keys()].sort(reagentSort);

// ───────────────────────── utils ─────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const SUPMAP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "−" };
function sci(s) {
  const str = esc(s); let out = "";
  for (let k = 0; k < str.length;) {
    const ch = str[k];
    if (SUB.includes(ch)) { let run = ""; while (k < str.length && SUB.includes(str[k])) run += SUB.indexOf(str[k++]); out += `<sub>${run}</sub>`; }
    else if (SUPMAP[ch] !== undefined) { let run = ""; while (k < str.length && SUPMAP[str[k]] !== undefined) run += SUPMAP[str[k++]]; out += `<sup>${run}</sup>`; }
    else { out += ch; k++; }
  }
  return out;
}
const L = s => `<span class="lt" dir="ltr">${sci(s)}</span>`;   // LTR, may wrap (long reagent / test names)
const F = s => `<span class="f" dir="ltr">${sci(s)}</span>`;          // a formula, isolated LTR
const EN = (s, tag = "span", cls = "") => `<${tag} class="en ${cls}" dir="ltr" lang="en" data-raw="${esc(s)}">${sci(s)}</${tag}>`;
// Arabic text with embedded formulas / English terms: wrap each Latin run as an isolated LTR span
const LATIN_RUN = /[A-Za-z0-9(\[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀-₉"][^؀-ۿ]*[A-Za-z0-9)\]₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻↑↓"]|[A-Za-z0-9]/g;
function AR(s) {
  s = String(s ?? ""); let out = "", last = 0;
  s.replace(LATIN_RUN, (m, i) => { out += esc(s.slice(last, i)) + (m.length > 16 ? L(m) : F(m)); last = i + m.length; return m; });
  return out + esc(s.slice(last));
}
const hex = w => COLORS[w] || null;
const MEM = new Map();   // everything this tab wrote (null = deleted); the source of truth when localStorage throws or is full
const store = {
  raw(k) { if (MEM.has(k)) return MEM.get(k); try { return localStorage.getItem(k); } catch (e) { return null; } },
  persisted(k) { try { return localStorage.getItem(k); } catch (e) { return MEM.has(k) ? MEM.get(k) : null; } },
  get(k, d) { const v = store.raw(k); if (!v) return d; try { return JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { const t = JSON.stringify(v); MEM.set(k, t); try { localStorage.setItem(k, t); } catch (e) { /* storage blocked or full: progress lives only in this tab */ } },
  del(k) { MEM.set(k, null); try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
};
const refill = (obj, ...src) => { for (const k of Object.keys(obj)) delete obj[k]; Object.assign(obj, ...src); return obj; };

// ── profiles: who is studying on this device. Every profile has its own quiz / unknown / settings keys. ──
const PKEY = "anionlab:v1:profiles";
const pkey = (id, part) => `anionlab:v1:${id}:${part}`;
const OLD_KEYS = { quiz: "anionlab.v1.quiz", unknown: "anionlab.v1.unknown", saved: "anionlab.v1.saved" };   // before profiles existed
const profiles = { list: [], active: null };
(() => { const p = store.get(PKEY, {}); profiles.list = Array.isArray(p.list) ? p.list.filter(x => x && x.id && typeof x.name === "string") : []; profiles.active = profiles.list.some(x => x.id === p.active) ? p.active : null; })();
const saveProfiles = () => store.set(PKEY, { list: profiles.list, active: profiles.active });
const activeProfile = () => profiles.list.find(p => p.id === profiles.active) || null;
function nameProblem(raw) {
  const n = String(raw ?? "").trim();
  if (!n) return "اكتب اسم الأول.";
  if (n.length > 30) return "الاسم لازم يبقى 30 حرف أو أقل.";
  if (profiles.list.some(p => p.name.toLocaleLowerCase() === n.toLocaleLowerCase())) return "فيه بروفايل بالاسم ده على الجهاز ده.";
  return null;
}
const newProfileId = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// copy the pre-profile keys into this profile, check the copy, then remove the old keys so nothing migrates twice
function migrateOldKeys(id) {
  const move = (oldKey, newKey, shape) => {
    const raw = store.raw(oldKey); if (raw == null) return;
    let val; try { val = JSON.parse(raw); } catch (e) { return; }
    const out = shape ? shape(val) : val;
    store.set(newKey, out);
    if (store.persisted(newKey) === JSON.stringify(out)) store.del(oldKey);
  };
  move(OLD_KEYS.quiz, pkey(id, "quiz"));
  move(OLD_KEYS.unknown, pkey(id, "unknown"));
  move(OLD_KEYS.saved, pkey(id, "settings"), v => Object.assign(SETTINGS_DEF(), store.get(pkey(id, "settings"), {}), { saved: Array.isArray(v) ? v.filter(x => ROW.has(x)) : [] }));
}
function createProfile(raw) {
  const err = nameProblem(raw); if (err) return err;
  const id = newProfileId(), first = profiles.list.length === 0;
  profiles.list.push({ id, name: String(raw).trim() });
  profiles.active = id; saveProfiles();
  if (first) migrateOldKeys(id);
  loadProfileState();
  return null;
}
function loadProfileState() { loadQuiz(); loadUnk(); loadSettings(); }
const reducedMotion = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const anionLabel = a => `${F(a)} <small>${esc(anionInfo.get(a).anionName)}</small>`;
const condText = c => c ? c : "";

// ───────────────────────── visual plan ─────────────────────────
function plan(v) {
  const p = {};
  if (v.type === "solution") p.sol = v.timeline ? v.timeline.slice() : ["colorless", v.color];
  else if (v.solution) p.sol = ["colorless", ...[].concat(v.solution)];
  else p.sol = ["colorless"];
  if (v.type === "ppt") p.ppt = { tl: v.timeline || [v.color], style: v.style || null, dissolve: !!v.dissolve };
  else if (v.ppt) p.ppt = { tl: [v.ppt.color], style: v.ppt.style || null, dissolve: false };
  p.bubbles = v.type === "gas" || !!v.bubbles;
  p.fumes = v.type === "fumes" ? v.color : null;
  p.layer = v.type === "layer" ? { ...v.layer, tl: v.layer.timeline || [v.layer.color] } : null;
  p.ring = v.type === "ring" ? v.color : null;
  p.heat = !!v.heat;
  p.odor = v.odor || null;
  return p;
}
// color words the student should see for this result, in order
function colorWords(row) {
  const v = row.visual, p = plan(v), seq = [];
  if (v.type === "flame" || v.type === "stain") { if (v.color) seq.push([v.color]); return seq; }
  if (p.layer) seq.push(p.layer.tl);
  if (p.ppt) seq.push(p.ppt.tl);
  if (v.type === "solution") seq.push(v.timeline || [v.color]);
  else if (v.solution) seq.push([].concat(v.solution));
  if (p.fumes) seq.push([p.fumes]);
  if (p.ring) seq.push([p.ring]);
  return seq;
}
const finalColor = row => {
  const v = row.visual;
  if (v.type === "layer") { const tl = v.layer.timeline || [v.layer.color]; return tl[tl.length - 1]; }
  return v.color || (v.ppt && v.ppt.color) || null;
};

// ───────────────────────── scenes (animated SVG) ─────────────────────────
let seq = 0;
const BOX = "#DAD9D3", BOXINK = "#3A3C3A";
const TUBE_OUT = "M92 70 V262 A28 28 0 0 0 148 262 V70";
const TUBE_IN = "M95 70 V262 A25 25 0 0 0 145 262 V70 Z";
const rnd = (a, b) => a + Math.random() * (b - a);

const tubePath = (cx, top, bottom, r) => `M${cx - r} ${top} V${bottom - r} A${r} ${r} 0 0 0 ${cx + r} ${bottom - r} V${top}`;
// the tube where the gas is generated (left tube of a two-tube scene, or the tube under a paper / rod)
function genTube(k, src, cx, top, bottom, r, level, stopper) {
  const inner = tubePath(cx, top, bottom - 3, r - 3) + " Z";
  let bubbles = "";
  for (let i = 0; i < 6; i++) bubbles += `<circle class="bub" cx="${rnd(cx - r + 7, cx + r - 7).toFixed(1)}" cy="${rnd(bottom - 22, bottom - 8).toFixed(1)}" r="${rnd(1.8, 3.4).toFixed(1)}" style="--d:${i * 210}ms" fill="rgba(255,255,255,.55)" stroke="${BOXINK}" stroke-width=".9"/>`;
  return `<g class="gen" data-gen="${esc(src.label)}">
    <clipPath id="g${k}"><path d="${inner}"/></clipPath>
    <path d="${tubePath(cx, top, bottom, r)} Z" fill="rgba(255,255,255,.3)"/>
    <g clip-path="url(#g${k})">
      ${src.fumes ? `<rect class="genfumes" x="${cx - r}" y="${top}" width="${2 * r}" height="${level - top}" fill="${hex(src.fumes)}" opacity="0"/>` : ""}
      <rect x="${cx - r}" y="${level}" width="${2 * r}" height="${bottom - level + 4}" fill="${hex("colorless")}" opacity=".5"/>
      ${src.ppt ? `<rect class="genppt" x="${cx - r}" y="${level}" width="${2 * r}" height="${bottom - level + 4}" fill="${hex(src.ppt)}" opacity="0"/>` : ""}
      ${bubbles}
    </g>
    <path class="glass" d="${tubePath(cx, top, bottom, r)}"/>
    ${stopper ? `<rect x="${cx - r - 2}" y="${top - 10}" width="${2 * r + 4}" height="14" rx="2" fill="#6A6C69"/>` : `<rect class="lip" x="${cx - r - 6}" y="${top - 6}" width="${2 * r + 12}" height="7" rx="3"/>`}
  </g>`;
}
const genLabel = (src, x, y) => `<text class="lbl gen-lbl" x="${x}" y="${y}" text-anchor="middle">${esc(src.label)}</text>`;

function tubeSVG(k, row, p) {
  const v = row.visual, src = v.source;
  const transfer = src && src.kind === "transfer", overRod = src && src.kind === "over";
  const gel = p.ppt && p.ppt.style === "gelatinous";
  const turbid = p.ppt && (p.ppt.style === "turbidity" || p.ppt.style === "colloidal");
  const cryst = p.ppt && p.ppt.style === "crystalline";
  let parts = "";
  if (p.ppt && !turbid) {
    for (let i = 0; i < 14; i++) {
      const x = rnd(101, 139).toFixed(1), y = rnd(178, 232).toFixed(1);
      parts += cryst ? `<rect class="part" x="${x}" y="${y}" width="3.6" height="3.6" transform-origin="${x} ${y}" data-dy="${(258 - y).toFixed(0)}" opacity="0"/>`
                     : `<circle class="part" cx="${x}" cy="${y}" r="${rnd(1.6, 2.8).toFixed(1)}" data-dy="${(262 - y).toFixed(0)}" opacity="0"/>`;
    }
  }
  let bubbles = "";
  if (p.bubbles) for (let i = 0; i < 8; i++) {
    const x = (transfer ? rnd(110, 130) : rnd(103, 137)).toFixed(1), r = rnd(2.4, 4.6).toFixed(1);
    bubbles += `<circle class="bub" cx="${x}" cy="${rnd(transfer ? 246 : 262, transfer ? 258 : 282).toFixed(1)}" r="${r}" style="--d:${Math.round(i * 170)}ms" fill="rgba(255,255,255,.55)" stroke="${BOXINK}" stroke-width="1"/>`;
  }
  const layerTop = p.layer && p.layer.position === "top";
  const heapPath = gel ? "M95 252 Q104 238 116 246 Q128 236 137 246 Q143 248 145 252 V300 H95 Z" : "M95 266 Q120 254 145 266 V300 H95 Z";
  const receiver = `
  <g class="fumes" data-part="fumes" filter="url(#b${k})" ${p.fumes ? "" : "hidden"}>
    <ellipse cx="120" cy="60" rx="22" ry="12"/><ellipse cx="106" cy="40" rx="19" ry="12"/><ellipse cx="134" cy="30" rx="21" ry="12"/><ellipse cx="117" cy="13" rx="17" ry="10"/>
  </g>
  <g class="odor" ${p.odor ? "" : "hidden"}><path d="M106 58 q-7 -10 0 -20 q7 -10 0 -20"/><path d="M120 54 q-7 -10 0 -20 q7 -10 0 -20"/><path d="M134 58 q-7 -10 0 -20 q7 -10 0 -20"/></g>
  <g class="tubewrap">
    <path d="${TUBE_OUT} Z" fill="rgba(255,255,255,.3)"/>
    <g clip-path="url(#c${k})">
      <rect class="liq" data-part="solution" x="88" y="170" width="64" height="130"/>
      ${p.ring ? `<rect class="liq acid" x="88" y="252" width="64" height="48" opacity="0"/><rect class="ringband" data-part="ring" x="88" y="244" width="64" height="9" opacity="0"/>` : ""}
      ${p.layer ? `<rect class="layerfill" data-part="layer" data-position="${layerTop ? "top" : "bottom"}" x="88" y="${layerTop ? 170 : 240}" width="64" height="${layerTop ? 36 : 60}" opacity="0"/>` : ""}
      ${p.ppt && turbid ? `<rect class="turbid" data-part="ppt" x="88" y="170" width="64" height="130" opacity="0"/>` : ""}
      ${p.ppt && !turbid ? `<path class="heap" data-part="ppt" d="${heapPath}" stroke="${BOXINK}" stroke-width="1" stroke-opacity=".55" opacity="0" style="transform:scaleY(0)"/>` : ""}
      <g class="parts">${parts}</g>
      <g class="bubbles" data-part="${p.bubbles ? "bubbles" : ""}">${bubbles}</g>
      <path d="M95 170 Q120 176 145 170" fill="none" stroke="${BOXINK}" stroke-width="1.2" opacity=".55"/>
      ${p.layer ? `<line x1="95" x2="145" y1="${layerTop ? 206 : 240}" y2="${layerTop ? 206 : 240}" stroke="${BOXINK}" stroke-width="1" opacity=".45"/>` : ""}
    </g>
    ${p.ring ? `<path class="trickle" d="M141 78 V246"/>` : ""}
    <path class="glass" d="${TUBE_OUT}"/>
    ${transfer ? `<rect x="88" y="58" width="64" height="14" rx="2" fill="#6A6C69"/>` : `<rect class="lip" x="85" y="64" width="70" height="8" rx="3"/>`}
    ${p.layer ? `<text class="lbl" x="156" y="${layerTop ? 192 : 272}">${p.layer.organic === "CHCl₃" ? "CHCl₃" : "ether"}</text>` : ""}
    ${p.ring ? `<text class="lbl" x="156" y="252">ring</text>` : ""}
  </g>
  <g class="heat" data-part="${p.heat ? "heat" : ""}" ${p.heat ? "" : "hidden"}><text class="lbl" x="150" y="304">heat</text><path d="M104 302 q4 -4 0 -8 q-4 -4 0 -8"/><path d="M120 304 q4 -4 0 -8 q-4 -4 0 -8"/><path d="M136 302 q4 -4 0 -8 q-4 -4 0 -8"/></g>`;
  const dropper = `<g class="dropper" opacity="0" style="transform:translateY(-24px)">
    <rect x="114" y="8" width="12" height="20" rx="5" fill="#5B5D5B"/><rect x="116.5" y="26" width="7" height="30" rx="2" fill="rgba(255,255,255,.7)" stroke="${BOXINK}" stroke-width="1.2"/>
  </g>
  <circle class="drop" cx="120" cy="60" r="3" fill="rgba(255,255,255,.85)" stroke="${BOXINK}" stroke-width="1" opacity="0"/>`;
  const defs = `<defs>
    <clipPath id="c${k}"><path d="${TUBE_IN}"/></clipPath>
    <filter id="b${k}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter>
  </defs>`;
  const open = (w, kind) => `<svg viewBox="0 0 ${w} 320" class="scene" role="img" aria-label="${esc(sceneLabel(row))}" data-kind="${kind}">${defs}`;
  if (transfer) {
    // generating tube (centre x 70) → delivery tube → receiver (centre x 310)
    const pipeIn = src.fumes ? hex(src.fumes) : "rgba(255,255,255,.92)";
    return `${open(400, "transfer")}
  ${genTube(k, src, 70, 120, 300, 24, 220, true)}
  <path d="M70 112 V40 H310 V250" fill="none" stroke="${BOXINK}" stroke-width="7" stroke-linejoin="round"/>
  <path class="pipe" d="M70 112 V40 H310 V250" fill="none" stroke="${pipeIn}" stroke-opacity="${src.fumes ? 0 : .92}" stroke-width="3.6" stroke-linejoin="round"/>
  <g transform="translate(190,0)">${receiver}</g>
  ${genLabel(src, 70, 316)}
</svg>`;
  }
  return `${open(240, "tube")}${receiver}
  ${overRod ? `<rect x="40" y="30" width="150" height="9" rx="4.5" fill="rgba(255,255,255,.55)" stroke="${BOXINK}" stroke-width="1.4"/><text class="lbl" x="40" y="24">glass rod + NH₄OH</text>${genLabel(src, 120, 316)}` : ""}
  ${dropper}
</svg>`;
}

function flameSVG(k, row) {
  return `<svg viewBox="0 0 240 320" class="scene" role="img" aria-label="${esc(sceneLabel(row))}" data-kind="flame">
  <defs><linearGradient id="m${k}" x1="0" x2="1"><stop offset="0" stop-color="#9C9D98"/><stop offset=".5" stop-color="#D9DAD5"/><stop offset="1" stop-color="#8E8F8A"/></linearGradient></defs>
  <path class="flamefill" data-part="flame" d="M120 206 C96 186 100 140 120 82 C140 140 144 186 120 206 Z" opacity=".55"/>
  <path d="M120 204 C110 192 112 170 120 150 C128 170 130 192 120 204 Z" fill="rgba(255,255,255,.45)" stroke="${BOXINK}" stroke-width="1" opacity=".6"/>
  <rect x="110" y="206" width="20" height="78" fill="url(#m${k})" stroke="${BOXINK}" stroke-width="1.5"/>
  <rect x="106" y="236" width="28" height="10" rx="2" fill="#B9BAB5" stroke="${BOXINK}" stroke-width="1.2"/>
  <rect x="78" y="284" width="84" height="14" rx="4" fill="url(#m${k})" stroke="${BOXINK}" stroke-width="1.5"/>
  <g class="wire" style="transition:transform 700ms ease;transform:translate(40px,-40px)"><line x1="214" y1="40" x2="131" y2="150" stroke="${BOXINK}" stroke-width="2"/><circle cx="128" cy="153" r="5" fill="none" stroke="${BOXINK}" stroke-width="2"/></g>
  <text class="lbl" x="150" y="300">Bunsen flame</text>
</svg>`;
}

function stainSVG(k, row) {
  const v = row.visual, s = v.surface, src = v.source && v.source.kind === "over" ? v.source : null;
  let base, blob, gen = "", fumesG = "";
  if (s === "coin") {
    base = `<circle cx="120" cy="165" r="70" fill="url(#m${k})" stroke="#6E6F6B" stroke-width="2"/><circle cx="120" cy="165" r="58" fill="none" stroke="#7C7D78" stroke-width="1.2"/><text class="lbl" x="120" y="258" text-anchor="middle">silver coin</text>`;
    blob = "M120 140 C140 136 152 152 146 168 C141 184 124 192 108 184 C94 177 92 158 102 148 C108 142 112 141 120 140 Z";
  } else if (s === "paper" && src) {
    base = `<rect x="88" y="14" width="64" height="118" rx="3" fill="#FBFBF9" stroke="#8F908B" stroke-width="1.5"/><text class="lbl" x="158" y="40">${row.reagent.includes("iodide") ? "starch-iodide paper" : "starch paper"}</text>`;
    blob = "M120 50 C136 48 144 62 140 78 C136 94 122 100 108 92 C96 85 96 66 104 56 C109 50 114 50 120 50 Z";
    gen = genTube(k, src, 120, 178, 300, 22, 252, false) + genLabel(src, 120, 316);
  } else if (s === "paper") {
    base = `<rect x="88" y="60" width="64" height="200" rx="3" fill="#FBFBF9" stroke="#8F908B" stroke-width="1.5"/><text class="lbl" x="120" y="282" text-anchor="middle">${row.reagent.includes("iodide") ? "starch-iodide paper" : "starch paper"}</text>`;
    blob = "M120 120 C136 118 144 134 140 150 C136 166 122 172 108 164 C96 157 96 138 104 128 C109 122 114 120 120 120 Z";
  } else if (src) {
    base = `<rect x="14" y="104" width="186" height="11" rx="5.5" fill="rgba(255,255,255,.5)" stroke="${BOXINK}" stroke-width="1.5"/><text class="lbl" x="14" y="96">glass rod + drop of water</text>`;
    blob = "M190 112 C204 108 212 118 208 128 C204 138 190 140 184 132 C180 125 182 115 190 112 Z";
    gen = genTube(k, src, 196, 178, 300, 22, 252, false) + genLabel(src, 160, 316);
  } else {
    base = `<rect x="30" y="156" width="170" height="11" rx="5.5" fill="rgba(255,255,255,.5)" stroke="${BOXINK}" stroke-width="1.5"/><text class="lbl" x="115" y="200" text-anchor="middle">glass rod + drop of water</text>`;
    blob = "M196 158 C210 154 218 164 214 174 C210 184 196 186 190 178 C186 171 188 161 196 158 Z";
  }
  if (src) {
    const cx = s === "paper" ? 120 : 196, c = src.fumes ? hex(src.fumes) : "rgba(255,255,255,.8)";
    fumesG = `<g class="fumes" filter="url(#b${k})" data-src-fumes="${esc(src.fumes || "")}">
      <ellipse cx="${cx}" cy="168" rx="16" ry="9" fill="${c}"/><ellipse cx="${cx - 8}" cy="152" rx="14" ry="9" fill="${c}"/><ellipse cx="${cx + 7}" cy="140" rx="13" ry="8" fill="${c}"/></g>`;
  }
  return `<svg viewBox="0 0 240 320" class="scene" role="img" aria-label="${esc(sceneLabel(row))}" data-kind="stain">
  <defs><radialGradient id="m${k}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#ECEDE9"/><stop offset=".6" stop-color="#BFC0BB"/><stop offset="1" stop-color="#9A9B96"/></radialGradient>
  <filter id="b${k}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
  ${gen}${fumesG}${base}
  <path class="stainfill" data-part="stain" d="${blob}" opacity="0" style="transform:scale(.2)" ${v.color ? "" : `fill="rgba(255,255,255,.75)" stroke="${BOXINK}" stroke-width="1.2"`}/>
  ${src ? "" : `<circle class="drop" cx="${s === "rod" ? 200 : 120}" cy="40" r="4" fill="rgba(255,255,255,.85)" stroke="${BOXINK}" stroke-width="1" opacity="0"/>`}
</svg>`;
}

function sceneLabel(row) {
  return `${row.anion} (${row.anionName}) + ${row.reagent}${row.condition ? ", " + row.condition : ""}: ${row.observation}`;
}

// mounts one scene and plays it; returns a controller
function mountScene(host, row, opt = {}) {
  const speed = opt.speed || 1, instant = opt.instant ?? reducedMotion();
  const k = ++seq, v = row.visual, p = plan(v);
  const kind = v.type === "flame" ? "flame" : v.type === "stain" ? "stain" : "tube";
  const transfer = !!(v.source && v.source.kind === "transfer");
  if (transfer) p.bubbles = true;   // the gas keeps bubbling through the receiving tube
  host.innerHTML = kind === "flame" ? flameSVG(k, row) : kind === "stain" ? stainSVG(k, row) : tubeSVG(k, row, p);
  host.classList.toggle("wide", transfer);
  const svg = host.querySelector("svg");
  svg.dataset.row = row.id;
  svg.dataset.state = "playing";
  svg.style.setProperty("--t", Math.round(900 / speed) + "ms");
  svg.style.setProperty("--tf", Math.round(1000 / speed) + "ms");
  svg.style.setProperty("--tb", Math.round(1400 / speed) + "ms");
  svg.style.setProperty("--tm", Math.round(2600 / speed) + "ms");
  const timers = [];
  let end = 0;
  const at = (ms, fn, dur = 0) => { end = Math.max(end, ms + dur); timers.push(setTimeout(fn, ms / speed)); };
  // sound cues ride on the same timers (and speed); reduced motion plays each cue once, ~300 ms, in step order
  const sounds = [];
  let hushed = false;
  const startCue = (name, ms) => { if (hushed) return; const h = Sound.play(name, row.id, ms); if (h) sounds.push(h); };
  const cue = (name, t, dur = 300) => at(t, () => startCue(name, dur / speed));
  const cueOnce = list => { const seen = new Set(); list.slice().sort((a, b) => a.t - b.t).filter(c => !seen.has(c.cue) && seen.add(c.cue)).forEach((c, i) => timers.push(setTimeout(() => startCue(c.cue, 300), i * 300))); };
  const silence = () => { hushed = true; sounds.forEach(h => h.stop()); sounds.length = 0; };
  const ctl = () => ({ svg, cancel: () => { timers.forEach(clearTimeout); silence(); }, silence });
  const hist = {};
  const paint = (el, word, part) => {
    if (!el || !word) return;
    el.style.fill = hex(word); el.setAttribute("data-color", word);
    (hist[part] = hist[part] || []).push(word);
    svg.setAttribute(`data-${part}-history`, hist[part].join(","));
  };
  const q = s => svg.querySelector(s);
  const liq = q('[data-part="solution"]'), heap = q(".heap"), turb = q(".turbid"), layer = q(".layerfill"),
        ring = q(".ringband"), acid = q(".acid"), fumes = q(".fumes"), flame = q(".flamefill"), stain = q(".stainfill");
  const done = () => { svg.dataset.state = "done"; svg.classList.remove("heating", "bubbling"); if (opt.onDone) opt.onDone(); };
  const gen = q(".gen");
  const genOn = () => { if (!gen) return; const f = q(".genfumes"), pp = q(".genppt"), pipe = q(".pipe"); if (f) f.style.opacity = ".6"; if (pp) pp.style.opacity = ".6"; if (pipe && v.source.fumes) pipe.style.strokeOpacity = ".85"; };
  const genStatic = () => { if (gen) $$(".gen .bub", svg).slice(0, 3).forEach(b => b.classList.add("static")); };

  if (kind === "flame") {
    paint(flame, "colorless", "flame");
    const fin = () => { paint(flame, v.color, "flame"); flame.style.opacity = ".92"; q(".wire").style.transform = "none"; };
    if (instant) { svg.classList.add("instant"); fin(); done(); cueOnce([{ cue: "roar", t: 0 }]); }
    else { at(150, () => { q(".wire").style.transform = "none"; }); cue("roar", 1000, 1500); at(1000, fin, 900); at(end + 250, done); }
    return ctl();
  }
  if (kind === "stain") {
    const fumesG = q(".fumes");
    const fin = () => { if (v.color) paint(stain, v.color, "stain"); stain.style.opacity = "1"; stain.style.transform = "none"; };
    const fumesOn = () => { if (fumesG) { fumesG.style.opacity = ".85"; svg.classList.add("fuming"); } genOn(); };
    if (instant) { svg.classList.add("instant"); fumesOn(); genStatic(); fin(); done(); if (gen) cueOnce([{ cue: "fizz", t: 0 }, ...(fumesG ? [{ cue: "hiss", t: 250 }] : [])]); }
    else if (gen) {
      cue("fizz", 0, 2400); if (fumesG) cue("hiss", 250, 1600);
      at(0, () => svg.classList.add("bubbling"), 2400);
      at(250, fumesOn, 900);
      at(1300, fin, 1100);
      at(end + 250, () => { svg.classList.remove("bubbling"); genStatic(); done(); });
    } else {
      const drop = q(".drop");
      at(100, () => { drop.style.opacity = "1"; drop.style.transform = "translateY(110px)"; });
      at(550, () => { drop.style.opacity = "0"; });
      at(700, fin, 1100); at(end + 250, done);
    }
    return ctl();
  }

  // ── tube ──
  const turbid = p.ppt && (p.ppt.style === "turbidity" || p.ppt.style === "colloidal");
  const turbOpacity = p.ppt && p.ppt.style === "colloidal" ? .6 : .86;
  const solOpacity = w => (w === "colorless" ? .5 : 1);
  if (p.fumes) fumes.querySelectorAll("ellipse").forEach(e => { e.style.fill = hex(p.fumes); });
  const finalState = () => {
    svg.classList.add("instant");
    hist.solution = []; p.sol.forEach(w => paint(liq, w, "solution")); liq.style.opacity = solOpacity(p.sol[p.sol.length - 1]);
    if (p.layer) { hist.layer = []; p.layer.tl.forEach(w => paint(layer, w, "layer")); layer.style.opacity = p.layer.tl[p.layer.tl.length - 1] === "colorless" ? ".5" : "1"; }
    if (p.ppt) {
      const el = turbid ? turb : heap; hist.ppt = []; p.ppt.tl.forEach(w => paint(el, w, "ppt"));
      el.style.opacity = p.ppt.dissolve ? "0" : String(turbid ? turbOpacity : 1); if (!turbid) el.style.transform = "none";
      if (p.ppt.dissolve) el.setAttribute("data-dissolved", "true");
    }
    if (p.bubbles) $$(".bubbles .bub", svg).slice(0, 4).forEach(b => b.classList.add("static"));
    if (p.fumes) { fumes.style.opacity = ".85"; fumes.setAttribute("data-color", p.fumes); }
    if (p.ring) { paint(ring, p.ring, "ring"); ring.style.opacity = "1"; acid.style.fill = hex("colorless"); acid.style.opacity = ".8"; q(".trickle").style.strokeDashoffset = "0"; }
    if (p.odor) $$(".odor path", svg).forEach(e => (e.style.opacity = ".8"));
    if (p.heat) svg.classList.remove("heating");
    genOn(); genStatic();
  };

  // initial
  paint(liq, p.sol[0], "solution"); liq.style.opacity = solOpacity(p.sol[0]);
  if (p.layer) { layer.style.fill = hex("colorless"); }
  const dropper = q(".dropper"), drop = q(".drop");
  const R = 820;
  // drip = reagent added (dropper), fizz = gas / bubbles, boil = while heating, hiss = fumes, clink = shaking the layer, trickle = ring
  const cues = [];
  if (dropper && !transfer) cues.push({ cue: "drip", t: 660 });
  if (p.bubbles) cues.push(transfer ? { cue: "fizz", t: 0, dur: R + 2800 } : { cue: "fizz", t: R - 120, dur: 2920 });
  if (p.fumes) cues.push({ cue: "hiss", t: R + 150, dur: 1600 });
  if (transfer && v.source.fumes) cues.push({ cue: "hiss", t: 200, dur: 1600 });
  if (p.layer) [0, 260, 520].forEach(d => cues.push({ cue: "clink", t: R + d }));
  if (p.ring) cues.push({ cue: "trickle", t: R, dur: 1100 });
  if (instant) { finalState(); done(); cueOnce(p.heat ? [{ cue: "boil", t: 0 }, ...cues] : cues); return ctl(); }

  if (p.heat) svg.classList.add("heating");
  if (transfer) { at(0, () => svg.classList.add("bubbling")); at(200, genOn, 900); }
  else if (dropper) {
    at(0, () => { dropper.style.opacity = "1"; dropper.style.transform = "none"; });
    at(380, () => { drop.style.opacity = "1"; drop.style.transform = "translateY(108px)"; });
    at(760, () => { drop.style.opacity = "0"; dropper.style.opacity = "0"; dropper.style.transform = "translateY(-24px)"; });
  }
  p.sol.slice(1).forEach((w, i) => at(R + 200 + i * 1300, () => { paint(liq, w, "solution"); liq.style.opacity = solOpacity(w); }, 900));
  if (p.layer) {
    at(R, () => svg.classList.add("shaking"), 800);
    at(R + 820, () => svg.classList.remove("shaking"));
    p.layer.tl.forEach((w, i) => at(R + 900 + i * 1400, () => { paint(layer, w, "layer"); layer.style.opacity = w === "colorless" ? ".5" : "1"; }, 900));
  }
  if (p.ppt) {
    const tl = p.ppt.tl;
    if (turbid) {
      at(R, () => { paint(turb, tl[0], "ppt"); turb.style.opacity = String(turbOpacity); }, 900);
      tl.slice(1).forEach((w, i) => at(R + 1300 + i * 1400, () => paint(turb, w, "ppt"), 900));
      const last = R + 1300 + (tl.length - 1) * 1400;
      if (p.ppt.dissolve) at(last + 300, () => { turb.style.opacity = "0"; turb.setAttribute("data-dissolved", "true"); }, 900);
    } else {
      const parts = $$(".part", svg);
      parts.forEach(e => (e.style.fill = hex(tl[0])));
      at(R, () => parts.forEach(e => (e.style.opacity = "1")));
      at(R + 60, () => parts.forEach(e => (e.style.transform = `translateY(${e.dataset.dy}px)`)), 1000);
      at(R + 300, () => { paint(heap, tl[0], "ppt"); heap.style.opacity = "1"; heap.style.transform = "none"; }, 900);
      at(R + 1150, () => parts.forEach(e => (e.style.opacity = "0")));
      tl.slice(1).forEach((w, i) => at(R + 1500 + i * 1400, () => paint(heap, w, "ppt"), 900));
      const last = R + 1500 + (tl.length - 1) * 1400;
      if (p.ppt.dissolve) at(last + 300, () => { heap.style.opacity = "0"; heap.style.transform = "scaleY(.25)"; heap.setAttribute("data-dissolved", "true"); }, 900);
    }
  }
  if (p.bubbles) {
    at(R - 120, () => svg.classList.add("bubbling"), 2900);
    at(R + 2800, () => { svg.classList.remove("bubbling"); $$(".bubbles .bub", svg).slice(0, 4).forEach(b => b.classList.add("static")); genStatic(); });
  }
  if (p.fumes) at(R + 150, () => { fumes.style.opacity = ".85"; fumes.setAttribute("data-color", p.fumes); svg.classList.add("fuming"); }, 1600);
  if (p.ring) {
    at(R, () => { q(".trickle").style.strokeDashoffset = "0"; }, 900);
    at(R + 300, () => { acid.style.fill = hex("colorless"); acid.style.opacity = ".8"; }, 900);
    at(R + 1100, () => { paint(ring, p.ring, "ring"); ring.style.opacity = "1"; }, 900);
  }
  if (p.odor) at(R + 300, () => $$(".odor path", svg).forEach(e => (e.style.opacity = ".8")), 600);
  const fin = Math.max(end, R + 400) + 200;
  cues.forEach(c => cue(c.cue, c.t, c.dur));
  if (p.heat) cue("boil", 0, fin);   // low bubbling for as long as the tube is heated
  at(fin, () => { if (p.heat) svg.classList.remove("heating"); done(); });
  return ctl();
}

// ───────────────────────── swatches (grid / logs) ─────────────────────────
function miniIcon(v, x0, w, k, idx) {
  const cx = x0 + w / 2, tw = w >= 40 ? 15 : 10, L = cx - tw / 2, Rr = cx + tw / 2, top = 5, sEnd = 30, bot = sEnd + tw / 2;
  const tube = `M${L} ${top} V${sEnd} A${tw / 2} ${tw / 2} 0 0 0 ${Rr} ${sEnd} V${top}`;
  const clip = `<clipPath id="q${k}_${idx}"><path d="${tube} Z"/></clipPath>`;
  const p = plan(v), C = w2 => hex(w2) || "none";
  const liqTop = v.type === "fumes" ? 16 : 13;
  if (v.type === "flame") return `<path d="M${cx} 36 C${cx - 9} 30 ${cx - 8} 16 ${cx} 5 C${cx + 8} 16 ${cx + 9} 30 ${cx} 36 Z" fill="${C(v.color)}" stroke="${BOXINK}" stroke-width=".8"/>`;
  if (v.type === "stain") {
    const surf = v.surface === "paper" ? `<rect x="${cx - 8}" y="4" width="16" height="32" fill="#FBFBF9" stroke="#8F908B"/>` : v.surface === "rod" ? `<rect x="${x0 + 3}" y="17" width="${w - 6}" height="5" rx="2.5" fill="rgba(255,255,255,.6)" stroke="${BOXINK}" stroke-width=".8"/>` : `<circle cx="${cx}" cy="20" r="${Math.min(15, w / 2 - 2)}" fill="#C4C5C0" stroke="#6E6F6B"/>`;
    return surf + `<circle cx="${v.surface === "rod" ? x0 + w - 6 : cx}" cy="20" r="5.5" fill="${v.color ? C(v.color) : "rgba(255,255,255,.8)"}" stroke="${BOXINK}" stroke-width=".6"/>`;
  }
  const lastSol = p.sol[p.sol.length - 1];
  let inner = `<rect x="${x0}" y="${liqTop}" width="${w}" height="40" fill="${C(lastSol)}" opacity="${lastSol === "colorless" ? .55 : .92}"/>`;
  if (p.layer) {
    const lw = p.layer.tl[p.layer.tl.length - 1];
    inner += p.layer.position === "top" ? `<rect x="${x0}" y="${liqTop}" width="${w}" height="6" fill="${C(lw)}" opacity="${lw === "colorless" ? .5 : .95}"/>` : `<rect x="${x0}" y="27" width="${w}" height="14" fill="${C(lw)}" opacity="${lw === "colorless" ? .5 : .95}"/>`;
  }
  if (p.ring) inner += `<rect x="${x0}" y="25" width="${w}" height="3.5" fill="${C(p.ring)}"/>`;
  if (p.ppt) {
    const fw = p.ppt.tl[p.ppt.tl.length - 1], turbid = p.ppt.style === "turbidity" || p.ppt.style === "colloidal";
    if (p.ppt.dissolve) inner += `<path d="M${L} ${sEnd + 1} Q${cx} ${sEnd - 4} ${Rr} ${sEnd + 1}" fill="none" stroke="${C(fw)}" stroke-width="1.6" stroke-dasharray="2 1.6"/>`;
    else if (turbid) inner += `<rect x="${x0}" y="${liqTop}" width="${w}" height="40" fill="${C(fw)}" opacity="${p.ppt.style === "colloidal" ? .6 : .88}"/>`;
    else inner += `<rect x="${x0 - 1}" y="${sEnd - 3}" width="${w + 2}" height="20" fill="${C(fw)}" stroke="${BOXINK}" stroke-width=".7"/>`;
  }
  if (p.bubbles) inner += `<circle cx="${cx - 2}" cy="22" r="1.6" fill="none" stroke="${BOXINK}" stroke-width=".7"/><circle cx="${cx + 2}" cy="17" r="1.3" fill="none" stroke="${BOXINK}" stroke-width=".7"/>`;
  let out = clip + `<g clip-path="url(#q${k}_${idx})">${inner}</g><path d="${tube}" fill="none" stroke="${BOXINK}" stroke-width="1"/>`;
  if (p.fumes) out += `<ellipse cx="${cx}" cy="7" rx="${w / 2 - 3}" ry="5" fill="${C(p.fumes)}" opacity=".9"/>`;
  if (v.odor && !p.fumes) out += `<path d="M${cx - 3} 4 q-2 -2 0 -3 M${cx + 3} 4 q-2 -2 0 -3" stroke="${BOXINK}" stroke-width=".7" fill="none"/>`;
  return out;
}
function swatch(rows) {
  const k = ++seq;
  const sel = rows.length > 1 ? [rows[0], rows[rows.length - 1]] : rows;
  const w = sel.length > 1 ? 20 : 40;
  let body = sel.map((r, i) => miniIcon(r.visual, sel.length > 1 ? (1 - i) * w : 0, w, k, i)).join("");
  if (sel.length > 1) body += `<line x1="20" y1="4" x2="20" y2="36" stroke="${BOXINK}" stroke-width=".6" stroke-dasharray="1.5 1.5"/>`;
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="7" fill="${BOX}"/>${body}</svg>`;
}

// ───────────────────────── saved (★) + "ليه بيحصل كده؟" ─────────────────────────
const SETTINGS_DEF = () => ({ sound: false, volume: 0.6, saved: [] });
const settings = SETTINGS_DEF();
const saved = new Set();
function loadSettings() {
  refill(settings, SETTINGS_DEF(), profiles.active ? store.get(pkey(profiles.active, "settings"), {}) : {});
  saved.clear(); (Array.isArray(settings.saved) ? settings.saved : []).forEach(id => { if (ROW.has(id)) saved.add(id); });
}
const saveSettings = () => { if (profiles.active) store.set(pkey(profiles.active, "settings"), { sound: !!settings.sound, volume: settings.volume, saved: [...saved] }); };
const isSaved = id => saved.has(id);
function toggleSaved(id) {
  if (saved.has(id)) saved.delete(id); else saved.add(id);
  saveSettings();
  $$(`[data-star="${CSS.escape(id)}"]`).forEach(b => b.setAttribute("aria-pressed", String(saved.has(id))));
  if (typeof renderFind === "function" && current === "find") renderFind();
}
const STAR = id => `<button type="button" class="star" data-star="${esc(id)}" aria-pressed="${isSaved(id)}" aria-label="احفظ التفاعل ده في المحفوظ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.6l-5.1 2.8 1.1-5.8-4.3-4 5.8-.7z"/></svg></button>`;
document.addEventListener("click", e => { const b = e.target.closest("[data-star]"); if (b) { e.preventDefault(); toggleSaved(b.dataset.star); } });
const EXPL = DATA.explain, CMP = DATA.compare;
const srcTag = src => src === "extra" ? `<span class="extra" data-src="extra">زيادة للفهم — مش في السلايدز</span>`
  : src === "doc" ? `<span class="src" data-src="doc">من صفحة الشرح بتاعتك</span>` : `<span class="src" data-src="slide">من السلايد</span>`;
function whyBox(row) {
  const i = EXPL.byRow[row.id]; if (i === undefined) return "";
  const e = EXPL.entries[i];
  return `<details class="why" data-why-source="${e.source}"><summary>ليه بيحصل كده؟</summary><p>${AR(e.ar)}</p><div class="why-meta">${srcTag(e.source)}<span class="ref">${esc(e.ref)}</span></div></details>`;
}

// ───────────────────────── shared result rendering ─────────────────────────
function colorStrip(row) {
  return colorWords(row).map(tl => tl.map(w => `<span class="cw"><i class="sw ${w === "colorless" ? "colorless" : ""}" style="background:${hex(w)}"></i>${esc(w)}</span>`).join(`<span class="arr">→</span>`)).join(`<span class="arr">·</span>`);
}
function flagBox(f) {
  if (!f) return "";
  const extra = f.source === "extra";
  return `<div class="flag" data-flag="${extra ? "extra" : "doc"}">
    <div class="fh"><span aria-hidden="true">⚠️</span> ${extra ? "معادلة السلايد مش متوازنة" : "غلطة في السلايد (من جدول التصحيحات بتاعك)"} ${extra ? `<span class="extra">زيادة للفهم — مش في السلايدز</span>` : ""}</div>
    <div class="pair"><div class="slide"><b>اللي في السلايد</b>${EN(f.slide, "div")}</div><div class="right"><b>الصح</b>${/[؀-ۿ]/.test(f.correct) ? `<div>${AR(f.correct)}</div>` : EN(f.correct, "div")}</div></div>
    <div class="note">${AR(f.note)}</div>
  </div>`;
}
function resultCard(row) {
  const layerNote = row.visual.type === "layer" ? `<div class="note">الـ ${F("CHCl₃")} بيبقى الطبقة اللي تحت والـ ether الطبقة اللي فوق، ده من الكثافة مش من السلايد. <span class="extra">زيادة للفهم — مش في السلايدز</span></div>` : "";
  const odor = row.visual.odor ? `<div class="fld"><span>الريحة</span>${EN(row.visual.odor, "div")}</div>` : "";
  return `<article class="result" aria-live="polite" data-row="${row.id}">
    <div class="res-head"><span class="kind">${F(CAT[row.category][0])} · ${AR(CAT[row.category][1])}</span><span class="row"><span class="ref" data-ref>${esc(row.slideRef)}</span>${STAR(row.id)}</span></div>
    <div class="fld"><span>اللي هتشوفه</span>${EN(row.observation, "p", "obs")}</div>
    ${whyBox(row)}
    ${odor}
    ${row.equation ? `<div class="fld"><span>المعادلة</span>${EN(row.equation, "div", "eq")}</div>` : ""}
    ${row.product ? `<div class="fld"><span>الناتج والأسامي</span>${EN(row.product, "div")}</div>` : ""}
    ${row.solubility ? `<div class="fld"><span>الذوبان وملاحظات السلايد</span>${EN(row.solubility, "div")}</div>` : ""}
    ${flagBox(row.flag)}
    ${layerNote}
  </article>`;
}
const stageCaption = row => `${F(row.anion)}<span class="plus">+</span>${F(row.reagent)}${row.condition ? `<span class="cond">${sci(row.condition)}</span>` : ""}`;
const REPLAY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>`;

// ───────────────────────── app shell / nav ─────────────────────────
const VIEWS = [
  ["lab", "المعمل", `<path d="M9 3h6M10 3v6.5L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-9.5V3"/><path d="M7.5 14.5h9"/>`],
  ["grid", "الجدول", `<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17"/>`],
  ["find", "دوّر", `<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20.5 20.5"/>`],
  ["unknown", "مجهول", `<path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2v.6"/><circle cx="12" cy="18" r=".6" fill="currentColor"/><circle cx="12" cy="12" r="9.5"/>`],
  ["play", "عرض", `<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M10 9.2v5.6l4.6-2.8z" fill="currentColor"/>`],
  ["quiz", "كويز", `<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M3.5 6.5l1 1 2-2M3.5 12l1 1 2-2M3.5 17.5l1 1 2-2"/>`],
  ["errors", "الأخطاء", `<path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 9.5v5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>`]
];
const app = $("#app");
app.innerHTML = `<header class="top"><div class="brand"><h1>مختبر الأنيونات</h1><div class="sub">PHC 101 · L01–L03 · Groups I–VI</div><div class="credit" dir="ltr" lang="en">Made by Mohammed Ayman</div></div>
  <div class="tools"><button type="button" class="who" id="who-btn" aria-haspopup="dialog"><span class="vh">البروفايل: </span><span class="who-name" id="who-name"></span> <span class="who-sw">تبديل</span></button><div class="spk-slot" id="spk-slot"></div></div></header>
  ${VIEWS.map(([id]) => `<section class="view" id="v-${id}" data-view="${id}" hidden></section>`).join("")}
  <footer class="credit-foot"><span dir="ltr" lang="en">Made by Mohammed Ayman</span></footer>`;
const nav = document.createElement("nav");
nav.className = "tabs"; nav.setAttribute("aria-label", "الأقسام");
nav.innerHTML = `<div class="in">${VIEWS.map(([id, label, icon]) => `<button type="button" data-nav="${id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span>${label}</span></button>`).join("")}</div>`;
app.after(nav);
nav.setAttribute("dir", "rtl");

const sheetHost = document.createElement("div");
sheetHost.id = "sheet-host"; sheetHost.hidden = true; sheetHost.setAttribute("dir", "rtl"); sheetHost.setAttribute("lang", "ar");
nav.after(sheetHost);
let sheetMode = null;
function renderTop() {
  const p = activeProfile();
  $("#who-name").innerHTML = p ? esc(p.name) : "—";
  if (typeof renderSpeaker === "function") renderSpeaker();
}
function openSheet(mode) {
  sheetMode = mode;
  const p = activeProfile(), closable = mode === "switch";
  const title = mode === "gate" ? "مين بيذاكر؟" : mode === "pick" ? "اختار بروفايل" : "البروفايلات";
  const list = mode === "gate" ? "" : `<span class="label">على الجهاز ده</span><div class="prof-list">${profiles.list.map(x => `<button type="button" class="prof" data-prof-id="${esc(x.id)}" ${x.id === profiles.active ? 'aria-current="true"' : ""}><span class="prof-name">${esc(x.name)}</span>${x.id === profiles.active ? '<span class="prof-now">الحالي</span>' : ""}</button>`).join("")}</div>`;
  sheetHost.innerHTML = `<div class="scrim" data-sheet-scrim></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-head"><h2 id="sheet-title">${title}</h2>${closable ? `<button type="button" class="sheet-x" data-sheet-close aria-label="اقفل">✕</button>` : ""}</div>
      ${mode === "gate" ? `<p class="note">اكتب اسمك عشان نتايجك تتحفظ باسمك. لو أكتر من حد بيذاكر على نفس الموبايل، كل واحد له بروفايل لوحده.</p>` : ""}
      ${list}
      <form id="prof-form" class="prof-form" novalidate>
        <label class="label" for="prof-name">${mode === "gate" ? "اسمك" : "بروفايل جديد"}</label>
        <div class="prof-row"><input id="prof-name" class="big-input" type="text" aria-describedby="prof-err" maxlength="30" autocomplete="off" dir="auto" enterkeyhint="done" placeholder="مثلًا: محمد"><button type="submit" class="btn">${mode === "gate" ? "ابدأ" : "أضف"}</button></div>
        <p class="form-err" id="prof-err" role="alert"></p>
      </form>
      <div id="sheet-extra"></div>
    </div>`;
  sheetHost.hidden = false;
  app.inert = true; nav.inert = true;
  const first = mode === "pick" ? sheetHost.querySelector(".prof") : $("#prof-name");
  (first || $("#prof-name")).focus();
  if (typeof renderSheetExtra === "function") renderSheetExtra();
}
function closeSheet() {
  if (!activeProfile()) return;           // somebody has to be studying
  sheetMode = null; sheetHost.hidden = true; sheetHost.innerHTML = "";
  app.inert = false; nav.inert = false;
  $("#who-btn").focus();
}
function rerenderAfterProfileChange() {
  renderTop();
  if (current) show(current, { keepScroll: true });
}
function switchProfile(id) {
  if (typeof Sound !== "undefined") Sound.stopAll();
  if (id !== profiles.active) { profiles.active = id; saveProfiles(); loadProfileState(); }
  closeSheet();
  rerenderAfterProfileChange();
}
sheetHost.addEventListener("click", e => {
  if (e.target.closest("[data-sheet-close]") || (e.target.closest("[data-sheet-scrim]") && sheetMode === "switch")) { closeSheet(); return; }
  const b = e.target.closest("[data-prof-id]"); if (b) { switchProfile(b.dataset.profId); return; }
});
sheetHost.addEventListener("submit", e => {
  if (e.target.id !== "prof-form") return;
  e.preventDefault();
  if (typeof Sound !== "undefined") Sound.stopAll();
  const err = createProfile($("#prof-name").value);
  if (err) { $("#prof-err").textContent = err; $("#prof-name").setAttribute("aria-invalid", "true"); $("#prof-name").focus(); return; }
  closeSheet();
  rerenderAfterProfileChange();
});
sheetHost.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const no = sheetHost.querySelector("[data-confirm-no]");
  if (no) { no.click(); return; }            // first Escape backs out of a delete confirmation
  if (sheetMode === "switch") closeSheet();
});

// ── delete history: active profile only, every action behind an in-page confirmation ──
const DEL = {
  quiz:    { label: "امسح نتايج الكويز", parts: ["quiz"], done: "اتمسحت نتايج الكويز.",
             what: n => `هيتمسح سجل الكويز بتاع ${n}: الإجابات، والمستوى، والغلطات، وعلامات حفظك في الجدول.` },
  unknown: { label: "امسح سجل الـ Unknown", parts: ["unknown"], done: "اتمسح سجل الـ Unknown.",
             what: n => `هيتمسح سجل الـ Unknown بتاع ${n}: العينات، والنقط، والعينة اللي شغال عليها.` },
  all:     { label: "امسح كل سجلي", parts: ["quiz", "unknown"], done: "اتمسح كل السجل. الاسم والإعدادات زي ما هم.",
             what: n => `هيتمسح سجل الكويز وسجل الـ Unknown بتاع ${n}. الاسم والإعدادات (الصوت والمحفوظ ★) هيفضلوا زي ما هم.` },
  profile: { label: "امسح البروفايل ده", parts: ["quiz", "unknown", "settings"], done: "",
             what: n => `هيتمسح بروفايل ${n} كله: الاسم، وسجل الكويز، وسجل الـ Unknown، والإعدادات والمحفوظ ★.` }
};
function renderSheetExtra(ask) {
  const host = $("#sheet-extra"), p = activeProfile();
  if (!host) return;
  if (sheetMode !== "switch" || !p) { host.innerHTML = ""; return; }
  const name = `<b><bdi>${esc(p.name)}</bdi></b>`;
  host.innerHTML = `<section class="hist" aria-labelledby="hist-title">
    <h3 class="hist-title" id="hist-title">سجل ${name}</h3>
    <p class="note">السجل محفوظ على الجهاز ده بس، ومحدش على جهاز تاني يقدر يشوفه.</p>
    ${ask ? `<div class="confirm" role="alertdialog" aria-labelledby="confirm-q" aria-describedby="confirm-what">
        <p class="confirm-q" id="confirm-q">${DEL[ask].label}؟</p>
        <p id="confirm-what">${DEL[ask].what(name)} مش هينفع ترجّعه بعد ما يتمسح.</p>
        <div class="row"><button type="button" class="btn" data-confirm-yes="${ask}">أيوه، امسح</button><button type="button" class="btn ghost" data-confirm-no="${ask}">لا، رجوع</button></div>
      </div>`
    : `<div class="del-list">${Object.keys(DEL).map(k => `<button type="button" class="del${k === "profile" ? " del-strong" : ""}" data-del="${k}">${DEL[k].label}</button>`).join("")}</div>`}
    <p class="note del-done" id="del-done" role="status"></p>
  </section>`;
}
function deleteHistory(kind) {
  const p = activeProfile(); if (!p || !DEL[kind]) return;
  if (typeof Sound !== "undefined") Sound.stopAll();
  DEL[kind].parts.forEach(part => store.del(pkey(p.id, part)));
  if (kind === "profile") {
    profiles.list = profiles.list.filter(x => x.id !== p.id);
    profiles.active = null; saveProfiles(); loadProfileState();
    renderTop();
    if (current) show(current, { keepScroll: true });
    openSheet(profiles.list.length ? "pick" : "gate");
    return;
  }
  if (DEL[kind].parts.includes("quiz")) loadQuiz();
  if (DEL[kind].parts.includes("unknown")) loadUnk();
  if (current) show(current, { keepScroll: true });
  renderSheetExtra();
  $("#del-done").textContent = DEL[kind].done;
  sheetHost.querySelector(`[data-del="${kind}"]`).focus();
}
sheetHost.addEventListener("click", e => {
  const d = e.target.closest("[data-del]"); if (d) { renderSheetExtra(d.dataset.del); $("[data-confirm-no]").focus(); return; }
  const no = e.target.closest("[data-confirm-no]"); if (no) { const k = no.dataset.confirmNo; renderSheetExtra(); sheetHost.querySelector(`[data-del="${k}"]`).focus(); return; }
  const yes = e.target.closest("[data-confirm-yes]"); if (yes) deleteHistory(yes.dataset.confirmYes);
});
$("#who-btn").addEventListener("click", () => openSheet(activeProfile() ? "switch" : (profiles.list.length ? "pick" : "gate")));

// ───────────────────────── lab sounds: synthesized with Web Audio, off by default, per profile ─────────────────────────
const Sound = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, noiseBuf = null, failed = typeof AC !== "function";
  const MASTER = 0.45;                 // quiet: every cue peaks well under this, then × the profile's volume
  const live = new Set(), log = [];
  const gesture = () => !navigator.userActivation || navigator.userActivation.isActive;
  function unlock() {                   // only ever called from a tap / key press
    if (failed || !gesture()) return !failed && !!ctx;
    try {
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = MASTER * settings.volume; master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return true;
    } catch (e) { failed = true; ctx = null; if (typeof renderSpeaker === "function") renderSpeaker(); return false; }
  }
  const setVolume = v => { if (master) master.gain.setTargetAtTime(MASTER * v, ctx.currentTime, .03); };
  // building blocks
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
  function play(cue, rowId, ms = 300) {
    if (!settings.sound || failed || !ctx || !SYN[cue]) return null;
    try {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const t = ctx.currentTime + .01, d = Math.max(.12, ms / 1000), out = ctx.createGain(), src = [];
      out.connect(master);
      SYN[cue](t, d, out, src);
      const h = { cue, stop() {
        if (!live.has(h)) return;
        live.delete(h); clearTimeout(h.timer);
        src.forEach(n => { try { n.stop(); } catch (e) { /* already stopped */ } });
        try { out.disconnect(); } catch (e) { /* already gone */ }
      } };
      h.timer = setTimeout(() => h.stop(), (d + .9) * 1000);
      live.add(h);
      log.push({ cue, rowId: rowId || null, t: Math.round(performance.now()) }); if (log.length > 400) log.splice(0, log.length - 400);
      return h;
    } catch (e) { return null; }
  }
  const stopAll = () => [...live].forEach(h => h.stop());
  return { play, stopAll, unlock, setVolume, log, active: () => live.size, available: () => !failed };
})();
// sound saved as "on": wake the audio on the first tap or key press anywhere (never before a gesture)
["pointerdown", "pointerup", "keydown", "click"].forEach(t => document.addEventListener(t, () => { if (settings.sound) Sound.unlock(); }, { capture: true, passive: true }));

const SPK_ON = `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>`;
const SPK_OFF = `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>`;
$("#spk-slot").innerHTML = `<button type="button" class="spk" id="spk-btn" aria-expanded="false" aria-controls="spk-pop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"></svg></button>
  <div class="spk-pop" id="spk-pop" role="group" aria-labelledby="spk-title" hidden>
    <p class="spk-title" id="spk-title">أصوات المعمل</p>
    <button type="button" class="spk-toggle" id="spk-toggle" aria-pressed="false"><span class="track" aria-hidden="true"><span class="knob"></span></span><span id="spk-state"></span></button>
    <label class="label" for="spk-vol">مستوى الصوت</label>
    <input type="range" id="spk-vol" min="0" max="1" step="0.05" dir="ltr">
    <p class="note">نقطة الكاشف، والفوران، والغليان، والأبخرة… بتتسمع مع حركة التفاعل. في الكويز: نغمة للصح ونغمة للغلط.</p>
  </div>`;
const spkPop = $("#spk-pop");
function renderSpeaker() {
  const slot = $("#spk-slot");
  slot.hidden = !Sound.available();
  const on = !!settings.sound, btn = $("#spk-btn");
  btn.dataset.on = String(on);
  btn.setAttribute("aria-label", on ? "أصوات المعمل: شغّالة. الإعدادات" : "أصوات المعمل: مقفولة. الإعدادات");
  btn.querySelector("svg").innerHTML = on ? SPK_ON : SPK_OFF;
  $("#spk-toggle").setAttribute("aria-pressed", String(on));
  $("#spk-state").textContent = on ? "الصوت شغّال" : "الصوت مقفول";
  $("#spk-vol").value = String(settings.volume);
  $("#spk-vol").setAttribute("aria-valuetext", Math.round(settings.volume * 100) + "%");
  Sound.setVolume(settings.volume);
}
const spkShow = open => { spkPop.hidden = !open; $("#spk-btn").setAttribute("aria-expanded", String(open)); };
$("#spk-btn").addEventListener("click", () => { Sound.unlock(); spkShow(spkPop.hidden); });
$("#spk-toggle").addEventListener("click", () => {
  settings.sound = !settings.sound;
  if (settings.sound) Sound.unlock(); else Sound.stopAll();
  saveSettings(); renderSpeaker();
});
$("#spk-vol").addEventListener("input", e => { settings.volume = Math.min(1, Math.max(0, +e.target.value || 0)); Sound.setVolume(settings.volume); e.target.setAttribute("aria-valuetext", Math.round(settings.volume * 100) + "%"); });
$("#spk-vol").addEventListener("change", () => saveSettings());
document.addEventListener("click", e => { if (!spkPop.hidden && !e.target.closest("#spk-slot")) spkShow(false); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !spkPop.hidden) { spkShow(false); $("#spk-btn").focus(); } });

const inited = {};
let current = null;
function show(id, opts = {}) {
  if (!VIEWS.some(v => v[0] === id)) id = "lab";
  if (current && current !== id) { Sound.stopAll(); if (LEAVE[current]) LEAVE[current](); }
  current = id;
  $$(".view", app).forEach(s => (s.hidden = s.dataset.view !== id));
  $$("button[data-nav]", nav).forEach(b => { if (b.dataset.nav === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  if (!inited[id]) { INIT[id](); inited[id] = true; }
  if (ENTER[id]) ENTER[id](opts);
  try { if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id); } catch (e) { /* sandboxed */ }
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
nav.addEventListener("click", e => { const b = e.target.closest("button[data-nav]"); if (b) show(b.dataset.nav); });
const INIT = {}, ENTER = {}, LEAVE = {};

// ───────────────────────── 1. LAB ─────────────────────────
const lab = { group: "I", anion: "CO₃²⁻", reagent: null, cond: 0, ctl: null, mode: "single", set: 0, view: 0, cctl: [] };
INIT.lab = () => {
  const el = $("#v-lab");
  el.innerHTML = `<div class="vhead"><h2>المعمل</h2><p>اختار أنيون وكاشف، وشوف اللي بيحصل في الأنبوبة بكلام السلايد بالظبط.</p></div>
    <div class="seg" role="tablist" aria-label="طريقة العرض"><button type="button" role="tab" data-lab-mode="single">تفاعل واحد</button><button type="button" role="tab" data-lab-mode="compare">قارن الشبيهين</button></div>
    <div id="lab-compare" hidden></div>
    <div id="lab-single">
    <div class="grp-tabs" role="tablist" aria-label="المجموعات">${GROUP_IDS.map(g => `<button type="button" class="chip" role="tab" data-lab-group="${g}">${g}</button>`).join("")}</div>
    <div class="chips" id="lab-anions"></div>
    <label class="label" for="lab-reagent">الكاشف أو الاختبار</label>
    <div class="select-row"><button type="button" id="lab-prev" aria-label="الاختبار اللي قبله">›</button><select id="lab-reagent" class="big"></select><button type="button" id="lab-next" aria-label="الاختبار اللي بعده">‹</button></div>
    <div id="lab-conds"></div>
    <div class="stage"><button type="button" class="replay" id="lab-replay" aria-label="شغّل التفاعل تاني">${REPLAY_ICON}</button>
      <div class="stage-cap" id="lab-cap"></div><div class="tube" id="lab-tube"></div><div class="strip" id="lab-strip"></div></div>
    <div id="lab-result"></div>
    </div>`;
  el.addEventListener("click", e => {
    const m = e.target.closest("[data-lab-mode]"); if (m) { lab.mode = m.dataset.labMode; renderLab(); return; }
    const cs = e.target.closest("[data-cmp-step]"); if (cs) { lab.set = (lab.set + +cs.dataset.cmpStep + CMP.length) % CMP.length; lab.view = 0; renderCompare(); return; }
    const cv = e.target.closest("[data-cmp-view]"); if (cv) { lab.view = +cv.dataset.cmpView; renderCompare(); return; }
    if (e.target.closest("#cmp-replay")) { playCompare(); return; }
    const o = e.target.closest("[data-open-row]"); if (o) { const r = ROW.get(o.dataset.openRow); lab.mode = "single"; openInLab(r.anion, r.reagent, Math.max(0, rowsOf(r.anion, r.reagent).indexOf(r))); return; }
    const g = e.target.closest("[data-lab-group]"); if (g) { lab.group = g.dataset.labGroup; lab.anion = anionsOf(lab.group)[0]; lab.reagent = null; lab.cond = 0; renderLab(); return; }
    const a = e.target.closest("[data-anion]"); if (a) { lab.anion = a.dataset.anion; const keep = reagentsOf(lab.anion).includes(lab.reagent); if (!keep) lab.reagent = null; lab.cond = 0; renderLab(); return; }
    const c = e.target.closest("[data-cond-i]"); if (c) { lab.cond = +c.dataset.condI; renderLab(true); return; }
  });
  el.addEventListener("change", e => { if (e.target.id === "cmp-set") { lab.set = +e.target.value; lab.view = 0; renderCompare(); } });
  $("#lab-reagent").addEventListener("change", e => { lab.reagent = e.target.value; lab.cond = 0; renderLab(true); });
  const step = d => { const list = reagentsOf(lab.anion); const i = list.indexOf(lab.reagent); lab.reagent = list[(i + d + list.length) % list.length]; lab.cond = 0; renderLab(true); };
  $("#lab-prev").addEventListener("click", () => step(-1));
  $("#lab-next").addEventListener("click", () => step(1));
  $("#lab-replay").addEventListener("click", () => playLab());
};
ENTER.lab = () => renderLab();
LEAVE.lab = () => { if (lab.ctl) lab.ctl.cancel(); lab.cctl.forEach(c => c.cancel()); };
function openInLab(anion, reagent, condIdx = 0) {
  lab.anion = anion; lab.group = anionInfo.get(anion).group; lab.reagent = reagent; lab.cond = condIdx;
  show("lab");
}
function renderLab(keepTop) {
  $$("[data-lab-mode]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.labMode === lab.mode)));
  $("#lab-single").hidden = lab.mode !== "single";
  $("#lab-compare").hidden = lab.mode !== "compare";
  if (lab.mode === "compare") { if (lab.ctl) lab.ctl.cancel(); renderCompare(); return; }
  lab.cctl.forEach(c => c.cancel()); lab.cctl = [];
  const a = lab.anion, list = reagentsOf(a);
  if (!lab.reagent || !list.includes(lab.reagent)) lab.reagent = list[0];
  $$("[data-lab-group]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.labGroup === lab.group)));
  $("#lab-anions").innerHTML = anionsOf(lab.group).map(x => `<button type="button" class="chip" data-anion="${esc(x)}" aria-pressed="${x === a}">${anionLabel(x)}</button>`).join("");
  const sel = $("#lab-reagent");
  sel.innerHTML = CAT_ORDER.map(cat => {
    const items = list.filter(rg => catOfReagent.get(rg) === cat);
    return items.length ? `<optgroup label="${esc(CAT[cat][0])}">${items.map(rg => `<option value="${esc(rg)}">${esc(rg)}</option>`).join("")}</optgroup>` : "";
  }).join("");
  sel.value = lab.reagent;
  const rows = rowsOf(a, lab.reagent);
  if (lab.cond >= rows.length) lab.cond = 0;
  $("#lab-conds").innerHTML = rows.length > 1 ? `<span class="label">الظروف (زي ما السلايد كاتبة)</span><div class="chips" role="group" aria-label="الظروف">${rows.map((r, i) => `<button type="button" class="chip en" data-cond-i="${i}" data-cond="${esc(r.condition || "")}" aria-pressed="${i === lab.cond}">${sci(r.condition || "—")}</button>`).join("")}</div>`
    : rows[0].condition ? `<span class="label">الظروف</span><div class="chips"><span class="chip en" aria-pressed="true" data-cond="${esc(rows[0].condition)}">${sci(rows[0].condition)}</span></div>` : "";
  playLab();
}
function renderCompare() {
  const set = CMP[lab.set], view = set.views[lab.view] || set.views[0];
  const rows = view.rows.map(id => ROW.get(id));
  $("#lab-compare").innerHTML = `<label class="label" for="cmp-set">اختار الشبيهين اللي بيتلخبطوا (${CMP.length})</label>
    <div class="select-row"><button type="button" data-cmp-step="-1" aria-label="المجموعة اللي قبلها">›</button><select id="cmp-set" class="big">${CMP.map((x, i) => `<option value="${i}" data-cmp-id="${esc(x.id)}" ${i === lab.set ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</select><button type="button" data-cmp-step="1" aria-label="المجموعة اللي بعدها">‹</button></div>
    ${set.views.length > 1 ? `<span class="label">الظروف</span><div class="chips" role="group" aria-label="الظروف">${set.views.map((v, i) => `<button type="button" class="chip en" data-cmp-view="${i}" aria-pressed="${i === lab.view}">${sci(v.label)}</button>`).join("")}</div>` : ""}
    <div class="stage cmp-stage"><button type="button" class="replay" id="cmp-replay" aria-label="شغّل الكل تاني">${REPLAY_ICON}</button>
      <div class="stage-cap">${sci(set.title)}</div>
      <div class="cmp-row" style="--n:${rows.length}">${rows.map((r, i) => `<div class="cmp-cell"><div class="tube cmp-tube" id="cmp-t${i}"></div><div class="cmp-f">${F(r.anion)}</div></div>`).join("")}</div>
    </div>
    <div class="tip" data-tip><div class="fh">الفرق</div><p>${AR(set.tip)}</p><div class="why-meta">${srcTag(set.source)}<span class="ref">${esc(set.ref)}</span></div></div>
    <div class="cmp-notes">${rows.map(r => `<article class="cmp-note" data-row="${esc(r.id)}"><div class="res-head"><b>${anionLabel(r.anion)}</b><span class="row"><span class="ref" data-ref>${esc(r.slideRef)}</span>${STAR(r.id)}</span></div>
      ${r.condition ? `<div class="en note">${sci(r.condition)}</div>` : ""}${EN(r.observation, "div", "obs")}
      <div class="strip">${colorStrip(r)}</div>
      <button type="button" class="chip" data-open-row="${esc(r.id)}">افتحه لوحده في المعمل</button></article>`).join("")}</div>`;
  playCompare();
}
function playCompare() {
  lab.cctl.forEach(c => c.cancel());
  const set = CMP[lab.set], view = set.views[lab.view] || set.views[0];
  lab.cctl = view.rows.map((id, i) => mountScene($("#cmp-t" + i), ROW.get(id)));
}
function playLab() {
  const row = rowsOf(lab.anion, lab.reagent)[lab.cond];
  if (lab.ctl) lab.ctl.cancel();
  $("#lab-cap").innerHTML = stageCaption(row);
  lab.ctl = mountScene($("#lab-tube"), row);
  $("#lab-strip").innerHTML = colorStrip(row);
  $("#lab-result").innerHTML = resultCard(row);
}

// ───────────────────────── 2. GRID ─────────────────────────
const grid = { group: "all", mode: "color" };
const M_RANK = { new: 0, known: 1, learning: 2, weak: 3 };
const M_TEXT = { weak: "ضعيف", learning: "بتتعلمه", known: "حافظه", new: "لسه ماتدربتش" };
const M_ICON = {
  weak: `<circle cx="9" cy="9" r="7" class="mb-paper mb-stroke" stroke-width="1.7" stroke-dasharray="2.6 2"/><path d="M9 5v4.6" class="mb-stroke" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="12.6" r="1.1" class="mb-ink"/>`,
  learning: `<circle cx="9" cy="9" r="7" class="mb-paper mb-stroke" stroke-width="1.6"/><path d="M9 2 A7 7 0 0 1 9 16 Z" class="mb-ink"/>`,
  known: `<circle cx="9" cy="9" r="7.6" class="mb-ink"/><path d="M5.4 9.2l2.4 2.4 4.8-5" class="mb-pstroke" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
};
const cellLevel = rs => rs.map(r => mastery(r.id)).sort((a, b) => M_RANK[b] - M_RANK[a])[0];
const mBadge = lvl => lvl === "new" ? "" : `<span class="mbadge" data-m="${lvl}"><svg viewBox="0 0 18 18" aria-hidden="true">${M_ICON[lvl]}</svg></span>`;
INIT.grid = () => {
  const el = $("#v-grid");
  el.innerHTML = `<div class="vhead"><h2>الجدول</h2><p>كل خانة هي اللون اللي هتشوفه في الأنبوبة. لو فيه أكتر من ظرف، الخانة بتتقسم نصين: أول ظرف على اليمين وآخر ظرف على الشمال. دوس على أي خانة تفتحها في المعمل.</p></div>
    <div class="seg" role="tablist" aria-label="طريقة العرض"><button type="button" role="tab" data-grid-mode="color">اللون</button><button type="button" role="tab" data-grid-mode="mastery">حفظك</button></div>
    <div id="grid-legend"></div>
    <div class="grp-tabs filter7" role="group" aria-label="فلتر المجموعات">${["all", ...GROUP_IDS].map(g => `<button type="button" class="chip" data-grid-group="${g}">${g === "all" ? "الكل" : g}</button>`).join("")}</div>
    <div id="grid-body"></div>`;
  el.addEventListener("click", e => {
    const m = e.target.closest("[data-grid-mode]"); if (m) { grid.mode = m.dataset.gridMode; renderGrid(); return; }
    const pr = e.target.closest("[data-practice]"); if (pr) { startPractice(pr.dataset.practice); return; }
    const g = e.target.closest("[data-grid-group]"); if (g) { grid.group = g.dataset.gridGroup; renderGrid(); return; }
    const c = e.target.closest("button.cell[data-anion]"); if (c) openInLab(c.dataset.anion, c.dataset.reagent);
  });
};
ENTER.grid = () => renderGrid();
function renderGrid() {
  $$("[data-grid-group]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.gridGroup === grid.group)));
  $$("[data-grid-mode]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.gridMode === grid.mode)));
  const mm = grid.mode === "mastery";
  $("#grid-legend").innerHTML = mm ? `<div class="mlegend">${["weak", "learning", "known"].map(l => `<span>${mBadge(l)} ${M_TEXT[l]}</span>`).join("")}<span class="note">من غير علامة = لسه ماتدربتش عليه. العلامة بتتحسب من الكويز والعينة المجهولة.</span></div>` : "";
  const groups = grid.group === "all" ? GROUP_IDS : [grid.group];
  $("#grid-body").innerHTML = groups.map(g => {
    const an = anionsOf(g);
    const reagents = ALL_REAGENTS.filter(rg => an.some(a => rowsOf(a, rg).length));
    const weakN = ROWS.filter(r => r.group === g && isQuizzable(r) && ["weak", "new"].includes(mastery(r.id))).length;
    let html = `<div class="gtable" data-group="${g}" style="--n:${an.length}"><h3>Group ${g} <small>${esc(GROUPS[g].name)}</small></h3>
      ${mm ? `<button type="button" class="chip practice" data-practice="${g}">تمرّن على الضعيف والجديد (${weakN})</button>` : ""}
      <div class="grow ghead"><span></span>${an.map(a => `<span class="ah" title="${esc(anionInfo.get(a).anionName)}">${a.length > 6 ? `<span class="f">${sci(a.slice(0, a.lastIndexOf("]") + 1))}</span><br><span class="f">${sci(a.slice(a.lastIndexOf("]") + 1))}</span>` : F(a)}</span>`).join("")}</div>`;
    let lastCat = null;
    for (const rg of reagents) {
      const cat = catOfReagent.get(rg);
      if (cat !== lastCat) { html += `<div class="grow" style="border:0"><span class="gcat">${esc(CAT[cat][0])}</span></div>`; lastCat = cat; }
      html += `<div class="grow"><span class="rl">${sci(rg)}</span>${an.map(a => {
        const rs = rowsOf(a, rg);
        if (!rs.length) return `<span class="cell empty" title="مش في السلايدز">·</span>`;
        const lab2 = `${a} + ${rg}: ${rs.map(r => (r.condition ? r.condition + ": " : "") + r.observation).join(" | ")}`;
        const lvl = mm ? cellLevel(rs) : null;
        return `<button type="button" class="cell" data-anion="${esc(a)}" data-reagent="${esc(rg)}" ${lvl ? `data-m="${lvl}"` : ""} aria-label="${esc(lab2 + (lvl ? " — حفظك: " + M_TEXT[lvl] : ""))}" title="${esc(lab2)}">${swatch(rs)}${lvl ? mBadge(lvl) : ""}</button>`;
      }).join("")}</div>`;
    }
    return html + `</div>`;
  }).join("");
}

// ───────────────────────── 3. FIND: search + "شفت إيه؟" + saved ─────────────────────────
const SUPF = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-" };
const fold = t => String(t ?? "").toLowerCase()
  .replace(/[₀-₉]/g, c => String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)))
  .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, c => SUPF[c]).replace(/[−‐‑–]/g, "-");
const HAY = new Map(ROWS.map(r => [r.id, fold([r.anion, r.anionName, r.reagent, r.reagentName, r.condition, r.observation, r.product, r.solubility, r.equation, r.slideRef].filter(Boolean).join(" | "))]));
const rowColorSet = r => { const set = new Set(colorWords(r).flat()); if (r.visual.ppt) set.add(r.visual.ppt.color); return set; };
const EFFECTS = [["gas", "غاز / فوران"], ["odor", "ريحة"], ["fumes", "fumes"], ["layer", "طبقتين"], ["ring", "ring"], ["flame", "flame"], ["stain", "بقعة / ورقة"], ["none", "No reaction"]];
const hasEffect = (r, ef) => {
  const v = r.visual, p = plan(v);
  return ef === "gas" ? (v.type === "gas" || !!v.bubbles) : ef === "odor" ? !!v.odor : ef === "fumes" ? !!p.fumes
    : ef === "none" ? v.type === "none" : v.type === ef;
};
const findState = { q: "", color: null, effect: null, saved: false, limit: 40 };
INIT.find = () => {
  const el = $("#v-find");
  el.innerHTML = `<div class="vhead"><h2>دوّر</h2><p>اكتب كلمة، أو قول شفت إيه في الأنبوبة، وهطلعلك كل التفاعلات اللي بتدّي كده بأرقام السلايدز.</p></div>
    <label class="label" for="find-q" style="margin-top:0">دوّر بكلمة</label>
    <input id="find-q" class="big search" type="search" dir="auto" autocomplete="off" placeholder="chocolate · Prussian · Ag2S · ammonia" enterkeyhint="search">
    <span class="label">شفت لون إيه؟</span>
    <div class="chips find-colors" role="group" aria-label="الألوان">${Object.keys(COLORS).map(w => `<button type="button" class="chip cchip" data-find-color="${esc(w)}" aria-pressed="false"><i class="sw ${w === "colorless" ? "colorless" : ""}" style="background:${hex(w)}"></i><span class="lt">${esc(w)}</span></button>`).join("")}</div>
    <span class="label">ولا شفت إيه؟</span>
    <div class="chips" role="group" aria-label="اللي حصل">${EFFECTS.map(([k, t]) => `<button type="button" class="chip" data-find-effect="${k}" aria-pressed="false">${AR(t)}</button>`).join("")}</div>
    <div class="row" style="margin-top:12px"><button type="button" class="chip" id="find-saved" aria-pressed="false"></button><button type="button" class="chip" id="find-clear">امسح الفلاتر</button></div>
    <div id="find-out" aria-live="polite"></div>`;
  $("#find-q").addEventListener("input", e => { findState.q = e.target.value; findState.limit = 40; renderFind(); });
  el.addEventListener("click", e => {
    const c = e.target.closest("[data-find-color]"); if (c) { findState.color = findState.color === c.dataset.findColor ? null : c.dataset.findColor; findState.limit = 40; renderFind(); return; }
    const f = e.target.closest("[data-find-effect]"); if (f) { findState.effect = findState.effect === f.dataset.findEffect ? null : f.dataset.findEffect; findState.limit = 40; renderFind(); return; }
    if (e.target.closest("#find-saved")) { findState.saved = !findState.saved; findState.limit = 40; renderFind(); return; }
    if (e.target.closest("#find-clear")) { Object.assign(findState, { q: "", color: null, effect: null, saved: false, limit: 40 }); $("#find-q").value = ""; renderFind(); return; }
    if (e.target.closest("#find-more")) { findState.limit += 40; renderFind(); return; }
    const o = e.target.closest("[data-find-open]"); if (o) { const r = ROW.get(o.dataset.findOpen); lab.mode = "single"; openInLab(r.anion, r.reagent, Math.max(0, rowsOf(r.anion, r.reagent).indexOf(r))); }
  });
};
ENTER.find = () => renderFind();
function findResults() {
  const terms = fold(findState.q).split(/\s+/).filter(Boolean);
  return ROWS.filter(r => (!findState.saved || saved.has(r.id))
    && (!findState.color || rowColorSet(r).has(findState.color))
    && (!findState.effect || hasEffect(r, findState.effect))
    && terms.every(t => HAY.get(r.id).includes(t)));
}
function renderFind() {
  if (!$("#find-out")) return;
  $$("[data-find-color]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.findColor === findState.color)));
  $$("[data-find-effect]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.findEffect === findState.effect)));
  const sv = $("#find-saved"); sv.setAttribute("aria-pressed", String(findState.saved)); sv.innerHTML = `★ المحفوظ (${saved.size})`;
  const active = findState.q.trim() || findState.color || findState.effect || findState.saved;
  if (!active) { $("#find-out").innerHTML = `<p class="note" style="margin-top:14px">اكتب كلمة أو دوس على لون أو على اللي شفته. مثلًا: canary yellow، أو violet + fumes، أو ★ المحفوظ.</p>`; return; }
  const res = findResults();
  const shown = res.slice(0, findState.limit);
  const byAnion = new Map();
  for (const r of shown) { if (!byAnion.has(r.anion)) byAnion.set(r.anion, []); byAnion.get(r.anion).push(r); }
  $("#find-out").innerHTML = `<p class="note" data-find-count="${res.length}">${res.length ? `${res.length} تفاعل` : "مفيش تفاعل بالمواصفات دي في السلايدز."}</p>
    ${[...byAnion].map(([a, rs]) => `<section class="fgroup"><h3 class="fgh">${anionLabel(a)} <small>Group ${anionInfo.get(a).group}</small></h3>
      ${rs.map(r => `<div class="fres" data-row="${esc(r.id)}"><button type="button" class="fres-main" data-find-open="${esc(r.id)}">${swatch([r])}<span class="fres-t"><span class="lt fres-rg">${sci(r.reagent)}${r.condition ? ` · ${sci(r.condition)}` : ""}</span>${EN(r.observation, "span", "fres-o")}</span></button><span class="fres-side"><span class="ref" data-ref>${esc(r.slideRef)}</span>${STAR(r.id)}</span></div>`).join("")}</section>`).join("")}
    ${res.length > shown.length ? `<button type="button" class="btn ghost" id="find-more" style="margin-top:10px">اعرض أكتر (${res.length - shown.length})</button>` : ""}`;
}

// ───────────────────────── signatures (used by unknown + quiz) ─────────────────────────
const outcomeKey = r => {
  const v = r.visual, p = plan(v);
  return [v.type, (p.ppt && p.ppt.tl.join(">")) || "", p.ppt && p.ppt.style || "", p.ppt && p.ppt.dissolve ? "d" : "", (v.type === "solution" ? (v.timeline || [v.color]).join(">") : ""),
    p.layer ? p.layer.tl.join(">") + "@" + p.layer.position : "", p.fumes || "", p.ring || "", v.type === "flame" || v.type === "stain" ? v.color || "x" : "", v.heat ? "h" : "", v.odor || ""].join("|");
};
const sig = (a, rg) => { const rs = rowsOf(a, rg); return rs.length ? rs.map(outcomeKey).sort().join(" ; ") : null; };
const ALL_ANIONS = ANIONS.map(a => a.anion);
const coverage = new Map(ALL_REAGENTS.map(rg => [rg, ALL_ANIONS.filter(a => rowsOf(a, rg).length).length]));
const TESTS_BY_COVERAGE = ALL_REAGENTS.slice().sort((x, y) => coverage.get(y) - coverage.get(x) || reagentSort(x, y));
function separates(rg, a, b) { const sa = sig(a, rg), sb = sig(b, rg); return sa !== null && sb !== null && sa !== sb; }
function shortestPath(target) {
  const tests = TESTS_BY_COVERAGE.filter(rg => rowsOf(target, rg).length);
  const others = ALL_ANIONS.filter(x => x !== target);
  const sets = tests.map(rg => new Set(others.filter(x => separates(rg, target, x))));
  const ok = idx => others.every(x => idx.some(i => sets[i].has(x)));
  const n = tests.length;
  for (let size = 1; size <= 4; size++) {
    const combo = [];
    const rec = start => {
      if (combo.length === size) return ok(combo) ? combo.slice() : null;
      for (let i = start; i < n; i++) { combo.push(i); const r = rec(i + 1); if (r) return r; combo.pop(); }
      return null;
    };
    const r = rec(0); if (r) return r.map(i => tests[i]);
  }
  // greedy fallback
  const chosen = [], left = new Set(others);
  while (left.size) {
    let best = -1, gain = 0;
    sets.forEach((s, i) => { const gN = [...s].filter(x => left.has(x)).length; if (gN > gain) { gain = gN; best = i; } });
    if (best < 0) break;
    chosen.push(tests[best]); sets[best].forEach(x => left.delete(x));
  }
  return chosen;
}

// ───────────────────────── 3. UNKNOWN ─────────────────────────
const UDEF = () => ({ played: 0, correct: 0, points: 0, queue: [], weak: {}, cur: null });
const unk = UDEF();
function loadUnk() { refill(unk, UDEF(), profiles.active ? store.get(pkey(profiles.active, "unknown"), {}) : {}); }
const saveUnk = () => { if (profiles.active) store.set(pkey(profiles.active, "unknown"), unk); };
function newUnknown() {
  let anion, clue = null;
  if (unk.queue.length && Math.random() < .6) {
    anion = unk.queue.shift();
    const path = shortestPath(anion);
    clue = pick(path);
  } else anion = pick(ALL_ANIONS);
  unk.cur = { anion, used: clue ? [clue] : [], clue, answered: false, guess: null, n: unk.played + 1 };
  saveUnk();
}
INIT.unknown = () => {
  const el = $("#v-unknown");
  el.innerHTML = `<div class="vhead"><h2>عينة مجهولة</h2><p>زي الـ practical: اختار اختبار، تشوف النتيجة بس، ولما تبقى متأكد قول الأنيون. كل اختبار زيادة عن أقصر طريق بينقّص نقطة.</p></div>
    <div class="stats" id="unk-stats"></div>
    <div class="panel" id="unk-panel"></div>`;
  el.addEventListener("click", e => {
    const t = e.target.closest("[data-unk-test]");
    if (t && unk.cur && !unk.cur.answered) { const rg = t.dataset.unkTest; if (!unk.cur.used.includes(rg)) { unk.cur.used.push(rg); saveUnk(); renderUnknown(); $("#unk-log li:last-child")?.scrollIntoView({ block: "nearest" }); } return; }
    if (e.target.closest("#unk-submit")) { submitUnknown(); return; }
    if (e.target.closest("#unk-next")) { newUnknown(); renderUnknown(); window.scrollTo(0, 0); return; }
  });
};
ENTER.unknown = () => { if (!unk.cur) newUnknown(); renderUnknown(); };
function renderUnknown() {
  const c = unk.cur;
  $("#unk-stats").innerHTML = `<span>عينات: <b>${unk.played}</b></span><span>صح: <b>${unk.correct}</b></span><span>نقط: <b>${unk.points}</b></span>`;
  const testChips = CAT_ORDER.map(cat => {
    const items = ALL_REAGENTS.filter(rg => catOfReagent.get(rg) === cat);
    return `<details class="tests-cat" ${cat === "dry" || cat === "wet" ? "open" : ""}><summary>${F(CAT[cat][0])} · ${AR(CAT[cat][1])} <small>(${items.length})</small></summary><div class="chips">${items.map(rg => `<button type="button" class="chip" data-unk-test="${esc(rg)}" aria-pressed="${c.used.includes(rg)}" ${c.answered ? "disabled" : ""}>${L(rg)}</button>`).join("")}</div></details>`;
  }).join("");
  const log = c.used.map((rg, i) => {
    const rs = rowsOf(c.anion, rg);
    const body = rs.length ? rs.map(r => `<div class="lr">${swatch([r])}<div>${r.condition ? `<div class="en note">${sci(r.condition)}</div>` : ""}${EN(r.observation, "div")}${c.answered ? `<span class="ref" data-ref>${esc(r.slideRef)}</span>` : ""}</div></div>`).join("")
      : `<div class="note">السلايدز مفيهاش نتيجة للاختبار ده مع العينة دي. جرّب اختبار تاني.</div>`;
    return `<li><b>${i + 1}. ${L(rg)}</b>${c.clue === rg && i === 0 ? ` <span class="note">(اتعمل لك كبداية لأنك غلطت في العينة دي قبل كده)</span>` : ""}${body}</li>`;
  }).join("");
  $("#unk-panel").innerHTML = `<p class="big-title">عينة رقم ${c.n}</p>
    <p class="note">الاختبارات اللي عملتها: <b>${c.used.length}</b>${c.answered ? "" : " · أرقام السلايدز هتظهر بعد ما تجاوب عشان ماتكشفش المجموعة"}</p>
    <ol class="log" id="unk-log">${log || `<li class="note">لسه ماعملتش أي اختبار. ابدأ بالـ dry reactions زي المعمل.</li>`}</ol>
    ${testChips}
    <div class="panel" style="margin-top:14px">
      <label class="label" for="unk-guess" style="margin-top:0">الأنيون ده هو</label>
      <select id="unk-guess" class="big" ${c.answered ? "disabled" : ""}>${GROUP_IDS.map(g => `<optgroup label="Group ${g}">${anionsOf(g).map(a => `<option value="${esc(a)}" ${c.guess === a ? "selected" : ""}>${esc(a)} (${esc(anionInfo.get(a).anionName)})</option>`).join("")}</optgroup>`).join("")}</select>
      <div class="row" style="margin-top:10px">${c.answered ? `<button type="button" class="btn" id="unk-next">عينة جديدة</button>` : `<button type="button" class="btn" id="unk-submit">تأكيد الإجابة</button>`}</div>
      <div id="unk-fb" aria-live="polite">${c.answered ? unknownFeedback() : ""}</div>
    </div>`;
}
function submitUnknown() {
  const c = unk.cur; c.guess = $("#unk-guess").value; c.answered = true;
  const path = shortestPath(c.anion);
  const right = c.guess === c.anion;
  const extra = Math.max(0, c.used.length - path.length);
  c.points = right ? Math.max(3, 10 - extra) : 0;
  unk.played++; if (right) unk.correct++; unk.points += c.points;
  if (!right) {
    unk.queue.push(c.anion);
    path.forEach(rg => rowsOf(c.anion, rg).forEach(r => (unk.weak[r.slideRef] = (unk.weak[r.slideRef] || 0) + 1)));
  }
  // the reactions that identify this anion count toward mastery on the grid
  path.forEach(rg => { const r0 = rowsOf(c.anion, rg)[0]; if (r0) record(r0.id, right); });
  saveQ(); saveUnk(); renderUnknown();
  $("#unk-fb").scrollIntoView({ block: "nearest" });
}
function unknownFeedback() {
  const c = unk.cur, path = shortestPath(c.anion), right = c.guess === c.anion;
  const pathHtml = path.map(rg => `<li>${L(rg)}: ${rowsOf(c.anion, rg).map(r => `${EN((r.condition ? r.condition + " → " : "") + r.observation)} <span class="ref">${esc(r.slideRef)}</span>`).join("<br>")}</li>`).join("");
  let why = "";
  if (!right) {
    const diff = c.used.filter(rg => separates(rg, c.anion, c.guess));
    if (diff.length) {
      const rg = diff[0];
      why = `<p>ليه ${F(c.guess)} غلط؟ لو كانت العينة ${F(c.guess)} كنت هتشوف مع ${L(rg)}: ${rowsOf(c.guess, rg).map(r => EN(r.observation) + ` <span class="ref">${esc(r.slideRef)}</span>`).join(" / ")}، لكن اللي ظهر: ${rowsOf(c.anion, rg).map(r => EN(r.observation)).join(" / ")}.</p>`;
    } else {
      const sep = TESTS_BY_COVERAGE.find(rg => separates(rg, c.anion, c.guess));
      why = `<p>الاختبارات اللي عملتها ماكانتش كفاية تفرّق بين ${F(c.anion)} و ${F(c.guess)}.${sep ? ` الاختبار اللي يفرّق: ${L(sep)}. مع ${F(c.anion)}: ${rowsOf(c.anion, sep).map(r => EN(r.observation)).join(" / ")} · مع ${F(c.guess)}: ${rowsOf(c.guess, sep).map(r => EN(r.observation)).join(" / ")} <span class="ref">${esc(rowsOf(c.guess, sep)[0].slideRef)}</span>` : ""}</p>`;
    }
  }
  const weak = Object.entries(unk.weak).sort((x, y) => y[1] - x[1]).slice(0, 6);
  return `<div class="fb">
    <div class="verdict">${right ? "✓ صح" : "✗ غلط"} — العينة كانت ${anionLabel(c.anion)}</div>
    <p>${right ? `خدت <b>${c.points}</b> من 10 (عملت ${c.used.length} اختبار وأقصر طريق ${path.length}).` : "العينة دي هترجعلك تاني بعد شوية بشكل مختلف."}</p>
    ${why}
    <span class="label">أقصر طريق يميّز ${F(c.anion)} عن الـ 18 التانيين (${path.length} ${path.length === 1 ? "اختبار" : "اختبارات"})</span>
    <ol class="weak">${pathHtml}</ol>
    ${weak.length ? `<span class="label">نقط ضعفك في العينات (ارجع للسلايدز دي)</span><ul class="weak">${weak.map(([ref, n]) => `<li><span class="ref">${esc(ref)}</span> غلطت فيها ${n} مرة</li>`).join("")}</ul>` : ""}
  </div>`;
}

// ───────────────────────── 4. PLAY ─────────────────────────
const SPEEDS = [0.5, 1, 1.5, 2];
const play = { group: "I", i: 0, playing: false, speed: 1, ctl: null, timer: null };
INIT.play = () => {
  const el = $("#v-play");
  el.innerHTML = `<div class="vhead"><h2>عرض المعمل</h2><p>كل تفاعلات المجموعة ورا بعض زي فيديو، ومعاها كلام السلايد.</p></div>
    <div class="grp-tabs" role="group" aria-label="المجموعات">${GROUP_IDS.map(g => `<button type="button" class="chip" data-play-group="${g}">${g}</button>`).join("")}</div>
    <div class="stage"><div class="stage-cap" id="play-cap"></div><div class="tube" id="play-tube"></div><div class="strip" id="play-strip"></div></div>
    <div class="progress" aria-hidden="true"><i id="play-bar"></i></div>
    <div class="controls" dir="ltr">
      <button type="button" id="play-prev" aria-label="التفاعل اللي قبله"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h2v14H7zM20 5v14l-10-7z"/></svg></button>
      <button type="button" id="play-toggle" class="main" aria-label="تشغيل"></button>
      <button type="button" id="play-next" aria-label="التفاعل اللي بعده"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 5h2v14h-2zM4 5v14l10-7z"/></svg></button>
    </div>
    <span class="label">السرعة</span><div class="chips" role="group" aria-label="السرعة">${SPEEDS.map(s => `<button type="button" class="chip" data-speed="${s}">${s}×</button>`).join("")}</div>
    <div class="caption" id="play-caption"></div>`;
  el.addEventListener("click", e => {
    const g = e.target.closest("[data-play-group]"); if (g) { play.group = g.dataset.playGroup; play.i = 0; renderPlay(); return; }
    const s = e.target.closest("[data-speed]"); if (s) { play.speed = +s.dataset.speed; renderPlayControls(); renderPlay(); return; }
  });
  $("#play-prev").addEventListener("click", () => { stepPlay(-1); });
  $("#play-next").addEventListener("click", () => { stepPlay(1); });
  $("#play-toggle").addEventListener("click", () => { play.playing = !play.playing; renderPlayControls(); if (play.playing) renderPlay(); else { clearTimeout(play.timer); if (play.ctl) play.ctl.silence(); } });
};
const playRows = () => ROWS.filter(r => r.group === play.group);
function stepPlay(d) { const n = playRows().length; play.i = (play.i + d + n) % n; renderPlay(); }
function renderPlayControls() {
  $("#play-toggle").innerHTML = play.playing ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>` : `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z"/></svg>`;
  $("#play-toggle").setAttribute("aria-label", play.playing ? "إيقاف مؤقت" : "تشغيل");
  $$("[data-speed]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.speed === play.speed)));
  $$("[data-play-group]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.playGroup === play.group)));
}
function renderPlay() {
  clearTimeout(play.timer); if (play.ctl) play.ctl.cancel();
  const rows = playRows(), row = rows[play.i];
  renderPlayControls();
  $("#play-cap").innerHTML = stageCaption(row);
  $("#play-strip").innerHTML = colorStrip(row);
  $("#play-bar").style.width = `${((play.i + 1) / rows.length) * 100}%`;
  $("#play-caption").innerHTML = `<p class="note">${play.i + 1} من ${rows.length} · Group ${play.group}</p>${resultCard(row)}`;
  play.ctl = mountScene($("#play-tube"), row, {
    speed: play.speed,
    onDone: () => { if (play.playing) play.timer = setTimeout(() => { if (play.playing && current === "play") stepPlay(1); }, 2600 / play.speed); }
  });
}
ENTER.play = () => renderPlay();
LEAVE.play = () => { play.playing = false; clearTimeout(play.timer); if (play.ctl) play.ctl.cancel(); };

// ───────────────────────── 5. QUIZ (pharm-exam-forge Mode A) ─────────────────────────
const QDEF = () => ({ answered: 0, correct: 0, level: 2, streak: 0, misses: 0, missedRows: {}, weakRefs: {}, rounds: 0, rowStats: {}, drill: {} });
const qz = QDEF();
function loadQuiz() { refill(qz, QDEF(), profiles.active ? store.get(pkey(profiles.active, "quiz"), {}) : {}); round = null; }
const saveQ = () => { if (profiles.active) store.set(pkey(profiles.active, "quiz"), { answered: qz.answered, correct: qz.correct, level: qz.level, streak: qz.streak, misses: qz.misses, missedRows: qz.missedRows, weakRefs: qz.weakRefs, rounds: qz.rounds, rowStats: qz.rowStats, drill: qz.drill }); };
const FAM = { white: "w", colorless: "w", "yellowish-white": "y", yellow: "y", "canary yellow": "y", buff: "y", orange: "o", "orange red": "r", "yellow-scarlet red": "r", red: "r", "blood red": "r", "brownish red": "n", brown: "n", "chocolate brown": "n", "brownish black": "k", black: "k", grey: "k", pink: "v", purple: "v", violet: "v", blue: "b", "pale blue": "b", "Prussian blue": "b", green: "g", "greyish green": "g" };
function similarity(r, s) {
  let x = 0;
  if (r.reagent === s.reagent) x += 4;
  if (r.visual.type === s.visual.type) x += 2;
  const a = finalColor(r), b = finalColor(s);
  if (a && b) { if (a === b) x += 3; else if (FAM[a] === FAM[b]) x += 2; }
  if (r.group === s.group) x += 1;
  if (r.category === s.category) x += .5;
  return x;
}
// the same chemical can appear under different test names on different slides (MnO₄⁻ vs KMnO₄ + dil. H₂SO₄ …)
const fam = rg => /MnO₄/.test(rg) ? "permanganate" : (rg === "I₂" || /on I₂/.test(rg)) ? "iodine" : /AgNO₃/.test(rg) ? "silver nitrate"
  : /starch/.test(rg) ? "starch paper" : /cadmium|CdCO₃/.test(rg) ? "cadmium" : /^FeCl₃$|or FeCl₃$/.test(rg) ? "ferric chloride" : rg;
// conservative: two results "look alike" if they share the first OR the last thing a student sees
const looksKeys = r => {
  const v = r.visual, p = plan(v), keys = [];
  const add = (t, tl) => { tl = (tl || []).filter(Boolean); if (!tl.length) keys.push(t + "|"); else keys.push(`${t}|${tl[0]}`, `${t}|${tl[tl.length - 1]}`); };
  if (v.type === "ppt") add("ppt", p.ppt.tl);
  else if (v.type === "layer") add("layer", p.layer.tl);
  else if (v.type === "solution") add("solution", v.timeline || [v.color]);
  else if (v.type === "gas") add("gas:" + (v.odor || ""), []);
  else add(v.type, [v.color]);
  if (v.type !== "ppt" && v.ppt) add("ppt", [v.ppt.color]);
  return keys;
};
const alike = (r, s) => { const a = looksKeys(r), b = looksKeys(s); return a.some(k => b.includes(k)); };
const famRows = (a, rg) => ROWS.filter(s => s.anion === a && fam(s.reagent) === fam(rg));
const sameOutcome = (r, s) => r.reagent === s.reagent && outcomeKey(r) === outcomeKey(s);
const norm = t => String(t).toLowerCase().replace(/[^a-z0-9₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+/g, " ").trim();
// what a student would "see": type + first and last color (style ignored on purpose: "white ppt" vs "white crystalline ppt" both read as white ppt)
const looks = r => { const v = r.visual, p = plan(v); const tl = p.ppt ? p.ppt.tl : p.layer ? p.layer.tl : v.timeline || [v.color]; return [v.type, tl[0] || "", tl[tl.length - 1] || "", p.ppt && p.ppt.dissolve ? "d" : "", p.fumes || "", p.ring || ""].join("|"); };
const isQuizzable = r => !/^(No|no)\b/.test(r.observation) || r.reagent !== "dil. HCl";
const QPOOL = ROWS.filter(isQuizzable);
const giveaway = r => { const t = fold(r.observation + " " + (r.condition || "")); return t.includes(fold(r.anion)) || t.includes(r.anionName.toLowerCase()) || (r.anion === "CO₃²⁻" && /carbonate/.test(t)); };
const WANT = level => (level === 3 ? [0, 3] : level === 2 ? [2, 7] : [5, 14]);

// ── per-reaction mastery (fed by every question type and by Unknown mode) ──
qz.rowStats = qz.rowStats || {};
function record(id, ok) {
  const st = qz.rowStats[id] || (qz.rowStats[id] = { r: 0, w: 0, s: 0 });
  if (ok) { st.r++; st.s++; } else { st.w++; st.s = 0; }
  st.last = ok; st.t = Date.now();
}
const mastery = id => { const st = qz.rowStats[id]; return !st ? "new" : st.last === false ? "weak" : st.s >= 2 ? "known" : "learning"; };

// ── where wrong options come from (MCQ both ways, True/False, Matching, and the condition blanks in Complete):
//    1) the question's own group; 2) only when the group gives fewer than 3, the same reagent family (fam) from the
//    other groups, most look-alike first; 3) otherwise no question. The "can't also be right" filters stay as they were.
const NEED = 3;
const otherGroup = (a, row) => anionInfo.get(a).group !== row.group;
function candidatesB(row, own) {
  const ownRows = famRows(row.anion, row.reagent);
  const ownObs = new Set(ownRows.map(s => norm(s.observation)));
  const seen = new Set([norm(row.observation)]);
  return ROWS.filter(s => s.anion !== row.anion && (own ? s.group === row.group : s.group !== row.group && fam(s.reagent) === fam(row.reagent)))
    .filter(s => !ownObs.has(norm(s.observation)) && !ownRows.some(o => alike(o, s)))
    .map(s => ({ s, score: similarity(row, s) })).sort((x, y) => y.score - x.score)
    .filter(c => { const n = norm(c.s.observation); if (seen.has(n)) return false; seen.add(n); return true; });
}
function stagedB(row) {
  const group = candidatesB(row, true);
  if (group.length >= NEED) return { cands: group, src: "group" };
  const have = new Set(group.map(c => norm(c.s.observation)));
  const more = candidatesB(row, false).filter(c => !have.has(norm(c.s.observation))).slice(0, NEED - group.length);
  return group.length + more.length >= NEED ? { cands: group.concat(more), src: "fallback" } : null;
}
// level window over a candidate list (easy = less alike), never fewer than 3
const windowed = (cands, level) => { const want = WANT(level), lo = Math.max(0, Math.min(want[0], cands.length - NEED)); return cands.slice(lo, Math.max(want[1], lo + NEED)); };

// ── MCQ (both directions) ──
function buildMCQ(row, dir, level) {
  if (dir === "A") {
    if (giveaway(row)) return null;
    // observation → anion: wrong options are anions that don't also give this result with this reagent family
    const fits = a => famRows(a, row.reagent).some(s => alike(s, row) || norm(s.observation) === norm(row.observation));
    const best = (a, rows) => { const b = rows.map(s => [s, similarity(row, s)]).sort((x, y) => y[1] - x[1])[0]; return { a, row: b[0], score: b[1] }; };
    let cands = anionsOf(row.group).filter(a => a !== row.anion && !fits(a)).map(a => best(a, ROWS.filter(s => s.anion === a))), src = "group";
    if (cands.length < NEED) {
      cands = cands.concat(ALL_ANIONS.filter(a => otherGroup(a, row) && famRows(a, row.reagent).length && !fits(a))
        .map(a => best(a, famRows(a, row.reagent))).sort((x, y) => y.score - x.score).slice(0, NEED - cands.length));
      src = "fallback";
    }
    if (cands.length < NEED) return null;
    const chosen = shuffle(cands).slice(0, 3);
    const tempting = chosen.slice().sort((x, y) => y.score - x.score)[0];
    const opts = shuffle([{ key: row.anion, right: true }, ...chosen.map(c => ({ key: c.a, right: false, via: c.row.id }))]);
    return { type: "mcq", dir, rowId: row.id, rowIds: [row.id], level, opts, tempting: tempting.a, temptingRow: tempting.row.id, src };
  }
  // anion → observation: wrong options are other anions' observations that look like the right one
  const st = stagedB(row);
  if (!st) return null;
  const chosen = shuffle(windowed(st.cands, level)).slice(0, 3);
  const tempting = chosen.slice().sort((x, y) => y.score - x.score)[0];
  const opts = shuffle([{ key: row.observation, right: true }, ...chosen.map(c => ({ key: c.s.observation, right: false, via: c.s.id }))]);
  return { type: "mcq", dir, rowId: row.id, rowIds: [row.id], level, opts, tempting: tempting.s.anion, temptingRow: tempting.s.id, src: st.src };
}

// ── True / False with correction ──
function buildTF(row, level) {
  const st = stagedB(row);
  if (!st) return null;
  const fake = pick(windowed(st.cands, level));
  const truth = Math.random() < .45;
  const fixDistractors = shuffle(st.cands.filter(c => c !== fake).slice(0, 6)).slice(0, 2);
  const fixOpts = shuffle([{ key: row.observation, right: true }, { key: fake.s.observation, right: false, via: fake.s.id }, ...fixDistractors.map(c => ({ key: c.s.observation, right: false, via: c.s.id }))]);
  return { type: "tf", rowId: row.id, rowIds: [row.id], level, truth, shown: truth ? row.observation : fake.s.observation, via: truth ? null : fake.s.id, stage: "tf", fixOpts, src: st.src };
}

// ── Matching (one reagent, 3–4 anions) ──
function buildMatch(row, level) {
  if (giveaway(row)) return null;
  const n = level === 3 ? 4 : 3;
  const chosen = [row];
  const fitsIn = (a, r) => r && isQuizzable(r) && !giveaway(r)
    && !chosen.some(c => alike(c, r) || norm(c.observation) === norm(r.observation))
    // no other chosen anion may also give this result with the same reagent family
    && !chosen.some(c => famRows(c.anion, r.reagent).some(s => alike(s, r))) && !famRows(a, row.reagent).some(s => chosen.some(c => alike(s, c)));
  for (const a of shuffle(anionsOf(row.group).filter(a => a !== row.anion))) {
    if (chosen.length === n) break;
    const r = rowsOf(a, row.reagent)[0];
    if (fitsIn(a, r)) chosen.push(r);
  }
  let src = "group";
  if (chosen.length < n) {
    // the stem names one reagent, so items from other groups use that same reagent, most look-alike first
    const more = ALL_ANIONS.filter(a => otherGroup(a, row)).map(a => rowsOf(a, row.reagent)[0]).filter(Boolean).sort((x, y) => similarity(row, y) - similarity(row, x));
    for (const r of more) { if (chosen.length === n) break; if (fitsIn(r.anion, r)) { chosen.push(r); src = "fallback"; } }
  }
  if (chosen.length < 3) return null;
  return { type: "match", rowId: row.id, rowIds: chosen.map(r => r.id), level, reagent: row.reagent,
           left: shuffle(chosen.map(r => r.id)), rcol: shuffle(chosen.map(r => r.id)), picks: {}, sel: null, src };
}

// ── Complete the sentence: the slide's exact color word, or the condition ──
const COLOR_WORDS = Object.keys(COLORS).sort((a, b) => b.length - a.length);
const FAM_ORDER = ["w", "y", "o", "r", "n", "k", "v", "b", "g"];
const FILL_CONDS = ["cold", "boiling", "excess boiling", "standing", "heating", "after boiling", "on standing (or warming by hand)", "on hot", "gently warm",
  "prolonged passage of H₂S", "dil. H₂SO₄", "conc. H₂SO₄ on the walls of test tube", "chlorine water", "excess chlorine water", "+ dil. ammonia", "+ conc. ammonia", "excess CN⁻", "excess iodide"];
function colorHits(text) {
  let t = " " + text.toLowerCase() + " ", hits = [];
  for (const w of COLOR_WORDS) {
    const re = new RegExp(`(^|[^a-z-])${w.toLowerCase().replace(/[-]/g, "\\-")}(?=[^a-z-]|$)`);
    const m = re.exec(t); if (m) { hits.push(w); t = t.slice(0, m.index + m[1].length) + " ".repeat(w.length) + t.slice(m.index + m[1].length + w.length); }
  }
  return hits;
}
function buildFill(row, level) {
  const hits = colorHits(row.observation);
  if (hits.length === 1 && !/\bor\b/i.test(row.observation)) {
    const w = hits[0], own = rowColorSet(row);
    const fam1 = FAM[w], fi = FAM_ORDER.indexOf(fam1);
    const near = COLOR_WORDS.filter(x => x !== w && !own.has(x) && x !== "colorless")
      .sort((a, b) => (FAM[a] === fam1 ? 0 : 1) - (FAM[b] === fam1 ? 0 : 1) || Math.abs(FAM_ORDER.indexOf(FAM[a]) - fi) - Math.abs(FAM_ORDER.indexOf(FAM[b]) - fi));
    const opts = shuffle([w, ...near.slice(0, level === 1 ? 6 : 3).sort(() => Math.random() - .5).slice(0, 3)]);
    const re = new RegExp(w.replace(/[-]/g, "\\-"), "i");
    return { type: "fill", mode: "color", rowId: row.id, rowIds: [row.id], level, answer: w, opts, text: row.observation.replace(re, "_____") };
  }
  if (row.condition && FILL_CONDS.includes(row.condition)) {
    const sibs = rowsOf(row.anion, row.reagent);
    if (sibs.length < 2) return null;                       // the slide gives this reaction under more than one condition
    const key = row.condition.replace(/^\+\s*/, "");
    const reKey = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const text = reKey.test(row.observation) ? row.observation.replace(reKey, "_____") : row.observation;
    if (FILL_CONDS.some(c => c !== row.condition && fold(text).includes(fold(c.replace(/^\+\s*/, ""))))) return null;
    const bad = new Set(sibs.filter(s2 => s2 !== row && alike(s2, row)).map(s2 => s2.condition));
    const usable = c => c && c !== row.condition && !bad.has(c) && FILL_CONDS.includes(c);
    const pool = [...new Set([...sibs, ...ROWS.filter(r2 => r2.group === row.group && r2.reagent === row.reagent)].map(r2 => r2.condition).filter(usable))];
    let src = "group";
    if (pool.length < NEED) {
      const more = ROWS.filter(r2 => r2.group !== row.group && fam(r2.reagent) === fam(row.reagent) && usable(r2.condition) && !pool.includes(r2.condition))
        .sort((x, y) => similarity(row, y) - similarity(row, x)).map(r2 => r2.condition);
      const add = [...new Set(more)].slice(0, NEED - pool.length);
      if (add.length) { pool.push(...add); src = "fallback"; }
    }
    if (pool.length < 2) return null;
    const opts = shuffle([row.condition, ...shuffle(pool).slice(0, 3)]);
    return { type: "fill", mode: "cond", rowId: row.id, rowIds: [row.id], level, answer: row.condition, opts, text, src };
  }
  return null;
}

// ── rounds ──
const TYPES = ["mcqA", "mcqB", "tf", "match", "fill"];
const WEIGHT = { mcqA: 25, mcqB: 20, tf: 20, match: 15, fill: 20 };
const weightedType = (avoid) => { const list = TYPES.filter(t => t !== avoid); let x = Math.random() * list.reduce((t, k) => t + WEIGHT[k], 0); for (const t of list) { x -= WEIGHT[t]; if (x <= 0) return t; } return list[0]; };
function build(row, type, level) {
  return type === "mcqA" ? buildMCQ(row, "A", level) : type === "mcqB" ? buildMCQ(row, "B", level)
    : type === "tf" ? buildTF(row, level) : type === "match" ? buildMatch(row, level) : buildFill(row, level);
}
let round = null;
function newRound(opts = {}) {
  const pool = opts.pool && opts.pool.length ? opts.pool.map(id => ROW.get(id)).filter(isQuizzable) : QPOOL;
  const missed = opts.pool ? [] : Object.keys(qz.missedRows).filter(id => ROW.has(id));
  const picks = [], used = new Set(), n = Math.min(10, pool.length);
  let guard = 0;
  while (picks.length < n && guard++ < 500) {
    const row = missed.length && Math.random() < .3 ? ROW.get(pick(missed)) : pick(pool);
    if (used.has(row.id)) continue;
    used.add(row.id);
    picks.push({ rowId: row.id, type: weightedType() });
  }
  round = { list: picks, i: 0, q: null, missed: [], reask: false, score: 0, total: 0, done: false, label: opts.label || null };
  nextQuestion();
}
function nextQuestion() {
  if (round.i >= round.list.length) {
    if (!round.reask && round.missed.length) {
      // re-ask every missed item in a different question type (same reaction, new form)
      round.reask = true;
      round.list = round.list.concat(round.missed.map(m => ({ rowId: m.rowId, type: weightedType(m.type), reask: true })));
    } else { round.done = true; qz.rounds++; saveQ(); renderQuiz(); return; }
  }
  const item = round.list[round.i], row = ROW.get(item.rowId);
  let q = build(row, item.type, qz.level);
  for (const t of shuffle(TYPES)) { if (q) break; if (t !== item.type) q = build(row, t, qz.level); }
  if (!q) { round.i++; return nextQuestion(); }
  q.reask = !!item.reask; q.kind = q.type === "mcq" ? (q.dir === "A" ? "mcqA" : "mcqB") : q.type;
  round.q = q; q.answered = false;
  renderQuiz();
}
function finish(right, perRow) {
  const q = round.q, row = ROW.get(q.rowId);
  q.answered = true; q.right = right; round.total++; qz.answered++;
  Sound.play(right ? "right" : "wrong", q.rowId);
  (perRow || q.rowIds.map(id => [id, right])).forEach(([id, ok]) => record(id, ok));
  (perRow || q.rowIds.map(id => [id, right])).forEach(([id, ok]) => {
    if (!ok || qz.missedRows[id] === undefined) return;
    qz.drill[id] = (qz.drill[id] || 0) + 1;
    if (qz.drill[id] >= 2) { delete qz.missedRows[id]; delete qz.drill[id]; }
  });
  if (right) {
    round.score++; qz.correct++; qz.streak = Math.max(0, qz.streak) + 1; qz.misses = 0;
    if (qz.streak >= 3 && qz.level < 3) { qz.level++; qz.streak = 0; }
  } else {
    qz.misses++; qz.streak = 0;
    if (qz.misses >= 2 && qz.level > 1) { qz.level--; qz.misses = 0; }
    const bad = perRow ? perRow.filter(p => !p[1]).map(p => p[0]) : [row.id];
    bad.forEach(id => { qz.missedRows[id] = (qz.missedRows[id] || 0) + 1; delete qz.drill[id]; const r = ROW.get(id); qz.weakRefs[r.slideRef] = (qz.weakRefs[r.slideRef] || 0) + 1; });
    if (!q.reask) round.missed.push({ rowId: row.id, type: q.kind });
  }
  saveQ(); renderQuiz();
  $("#q-fb")?.scrollIntoView({ block: "nearest" });
}
// rows that some question type can be built for (a few have no 3 valid wrong options under the source rule)
const ASKABLE = new Map();
const askable = id => { if (!ASKABLE.has(id)) ASKABLE.set(id, TYPES.some(t => build(ROW.get(id), t, 2))); return ASKABLE.get(id); };
const drillRows = () => Object.keys(qz.missedRows).filter(id => ROW.has(id) && isQuizzable(ROW.get(id)) && askable(id));
function startDrill() { const ids = drillRows(); if (ids.length) newRound({ pool: ids, label: "راجع غلطاتي" }); }
function onQuizClick(e) {
  if (e.target.closest("#q-drill")) { startDrill(); window.scrollTo(0, 0); return; }
  if (!round || round.done) { if (e.target.closest("#q-new")) { newRound(); window.scrollTo(0, 0); } return; }
  const q = round.q;
  if (e.target.closest("#q-next")) { round.i++; nextQuestion(); window.scrollTo(0, 0); return; }
  if (q.answered) return;
  const o = e.target.closest("[data-opt]");
  if (q.type === "mcq" && o) { q.choice = +o.dataset.opt; finish(q.opts[q.choice].right); return; }
  if (q.type === "fill" && o) { q.choice = +o.dataset.opt; finish(q.opts[q.choice] === q.answer); return; }
  if (q.type === "tf") {
    const t = e.target.closest("[data-tf]");
    if (t && q.stage === "tf") {
      q.tfChoice = t.dataset.tf === "true";
      if (q.truth) finish(q.tfChoice === true);
      else if (q.tfChoice === true) finish(false);
      else { q.stage = "fix"; renderQuiz(); }
      return;
    }
    if (o && q.stage === "fix") { q.choice = +o.dataset.opt; q.stage = "done"; finish(q.fixOpts[q.choice].right); }
    return;
  }
  if (q.type === "match") {
    const l = e.target.closest("[data-ml]"), r = e.target.closest("[data-mr]");
    if (l) { q.sel = q.sel === l.dataset.ml ? null : l.dataset.ml; renderQuiz(); return; }
    if (r && q.sel) { for (const k in q.picks) if (q.picks[k] === r.dataset.mr) delete q.picks[k]; q.picks[q.sel] = r.dataset.mr; q.sel = null; renderQuiz(); return; }
    if (e.target.closest("#q-match-done") && Object.keys(q.picks).length === q.left.length) {
      const per = q.left.map(id => [id, q.picks[id] === id]);
      finish(per.every(p => p[1]), per);
    }
  }
}
INIT.quiz = () => {
  const el = $("#v-quiz");
  el.innerHTML = `<div class="vhead"><h2>كويز</h2><p>سؤال واحد كل مرة، بأنواع الامتحان: اختيار، صح وغلط مع التصحيح، توصيل، وكمّل الجملة. السؤال بالإنجليزي بكلام السلايد، والشرح بالعربي.</p></div>
    <div class="stats" id="q-stats"></div><div class="drill-row" id="q-drill-row"></div><div class="panel" id="q-panel"></div>`;
  el.addEventListener("click", onQuizClick);
};
ENTER.quiz = (opts = {}) => { if (opts.practice) newRound(opts.practice); else if (!round) newRound(); else renderQuiz(); };
const condOf = r => (r.condition ? ` (${r.condition})` : "");
const TYPE_LABEL = { mcqA: "observation → anion", mcqB: "anion → observation", tf: "True / False", match: "Matching", fill: "Complete" };
function qStem(q) {
  const row = ROW.get(q.rowId);
  if (q.type === "mcq") return q.dir === "A" ? `Which of these anions gives "${row.observation}" with ${row.reagent}${condOf(row)}?`
    : `What is observed when ${row.anion} (${row.anionName}) is treated with ${row.reagent}${condOf(row)}?`;
  if (q.type === "tf") return `True or false? With ${row.reagent}${condOf(row)}, ${row.anion} (${row.anionName}) gives: "${q.shown}"`;
  if (q.type === "match") return `Match each anion with what it gives with ${q.reagent}.`;
  return q.mode === "color" ? `Complete with the slide's exact word: with ${row.reagent}${condOf(row)}, ${row.anion} (${row.anionName}) gives "${q.text}"`
    : `Complete the condition: with ${row.reagent}, ${row.anion} (${row.anionName}) gives "${q.text}" — under which condition?`;
}
const explainRow = row => `<p>مع ${L(row.reagent)}${row.condition ? ` ${L("(" + row.condition + ")")}` : ""}، الـ ${F(row.anion)} ${L("(" + row.anionName + ")")} بيدي ${EN(row.observation)}. <span class="ref" data-ref>${esc(row.slideRef)}</span></p>`;
function feedback(q) {
  const row = ROW.get(q.rowId);
  const next = `<div class="row"><button type="button" class="btn" id="q-next">${round.i + 1 >= round.list.length && (round.reask || !round.missed.length) ? "النتيجة" : "السؤال اللي بعده"}</button></div>`;
  let body = "";
  if (q.type === "mcq") {
    const chosen = q.opts[q.choice];
    const tempt = q.right ? ROW.get(q.temptingRow) : ROW.get(chosen.via || q.temptingRow);
    const whyWrong = q.dir === "A"
      ? `${F(tempt.anion)} مش هو: ${F(tempt.anion)} مع ${L(tempt.reagent)}${tempt.condition ? ` ${L("(" + tempt.condition + ")")}` : ""} بيدي ${EN(tempt.observation)} <span class="ref">${esc(tempt.slideRef)}</span>`
      : `الاختيار ${EN(tempt.observation)} ده بتاع ${F(tempt.anion)} مع ${L(tempt.reagent)}، مش ${F(row.anion)} <span class="ref">${esc(tempt.slideRef)}</span>`;
    body = `<p>الإجابة: ${q.dir === "A" ? anionLabel(row.anion) : EN(row.observation)}</p>${explainRow(row)}<p>${q.right ? "الاختيار اللي كان ممكن يوقعك: " : "ليه اختيارك غلط: "}${whyWrong}</p>`;
  } else if (q.type === "tf") {
    const fake = q.via ? ROW.get(q.via) : null;
    body = `<p>الجملة كانت ${q.truth ? "<b>True</b>" : "<b>False</b>"}.</p>${explainRow(row)}${fake ? `<p>الكلام اللي في الجملة ${EN(fake.observation)} ده بتاع ${F(fake.anion)} مع ${L(fake.reagent)} <span class="ref">${esc(fake.slideRef)}</span></p>` : ""}`;
  } else if (q.type === "match") {
    body = `<ul class="weak">${q.left.map(id => { const r = ROW.get(id), ok = q.picks[id] === id; return `<li>${ok ? "✓" : "✗"} ${F(r.anion)} → ${EN(r.observation)} <span class="ref" data-ref>${esc(r.slideRef)}</span></li>`; }).join("")}</ul>`;
  } else {
    body = `<p>الكلمة الصح: ${EN(q.answer, "b")}. الكلمة بالظبط بتفرق في الامتحان.</p>${explainRow(row)}`;
  }
  return `<div class="fb" id="q-fb" aria-live="polite"><div class="verdict">${q.right ? "✓ صح" : "✗ غلط"}</div>${body}${next}</div>`;
}
function optButtons(opts, render, rightIdx, answered, choice) {
  return opts.map((o, i) => {
    let st = ""; if (answered) st = i === rightIdx ? "right" : i === choice ? "wrong" : "";
    return `<button type="button" class="opt" data-opt="${i}" data-state="${st}" data-right="${i === rightIdx}" ${answered ? "disabled" : ""}><span class="k">${"abcd"[i]}.</span><span>${render(o)}</span></button>`;
  }).join("");
}
function renderDrill() {
  const n = drillRows().length;
  $("#q-drill-row").innerHTML = `<button type="button" class="btn ghost" id="q-drill" ${n ? "" : "disabled"} aria-describedby="q-drill-note">راجع غلطاتي${n ? ` (${n})` : ""}</button>
    <p class="note" id="q-drill-note">${n ? "أسئلة على اللي غلطت فيه بس. السؤال بيخرج من هنا لما تجاوبه صح مرتين ورا بعض." : "مفيش غلطات تراجعها دلوقتي. أي سؤال تغلط فيه هيظهر هنا."}</p>`;
}
function renderQuiz() {
  renderDrill();
  const levelName = ["", "سهل", "متوسط", "صعب"][qz.level];
  $("#q-stats").innerHTML = `<span>الإجمالي: <b>${qz.correct}/${qz.answered}</b></span><span>المستوى: <b>${levelName}</b></span><span>الجولة: <b>${round.score}/${round.total}</b></span>${round.label ? `<span>${AR(round.label)}</span>` : ""}`;
  const panel = $("#q-panel");
  if (round.done) {
    const weak = Object.entries(qz.weakRefs).sort((x, y) => y[1] - x[1]).slice(0, 8);
    const missedNow = [...new Set(round.missed.map(m => m.rowId))].map(id => ROW.get(id));
    panel.innerHTML = `<p class="big-title">خلصت الجولة: ${round.score} من ${round.total}</p>
      ${missedNow.length ? `<span class="label">اللي غلطت فيه في الجولة دي</span><ul class="weak">${missedNow.map(r => `<li>${F(r.anion)} + ${L(r.reagent)} → ${EN(r.observation)} <span class="ref">${esc(r.slideRef)}</span></li>`).join("")}</ul>` : `<p>ولا غلطة في الجولة دي.</p>`}
      <span class="label">نقط الضعف (من كل الجولات)</span>
      ${weak.length ? `<ul class="weak">${weak.map(([ref, n]) => { const rs = ROWS.filter(r => r.slideRef === ref); const topics = [...new Set(rs.map(r => r.reagent))].slice(0, 3); return `<li><span class="ref">${esc(ref)}</span> غلطت ${n} مرة · راجع ${topics.map(L).join("، ")} في السلايد دي</li>`; }).join("")}</ul>` : `<p class="note">لسه مفيش نقط ضعف متسجلة.</p>`}
      <div class="row" style="margin-top:12px"><button type="button" class="btn" id="q-new">جولة جديدة</button><button type="button" class="btn ghost" data-nav-to="grid">شوف حفظك في الجدول</button></div>`;
    return;
  }
  const q = round.q, row = ROW.get(q.rowId);
  const head = `<p class="note" data-qtype="${q.kind}">${q.reask ? "إعادة لسؤال غلطت فيه، بنوع تاني · " : ""}سؤال ${round.i + 1} من ${round.list.length} · ${TYPE_LABEL[q.kind] || ""}</p>${EN(qStem(q), "p", "q-stem")}`;
  let body = "";
  if (q.type === "mcq") {
    const rightIdx = q.opts.findIndex(o => o.right);
    body = `<div class="opts" role="group" aria-label="الاختيارات">${optButtons(q.opts, o => q.dir === "A" ? `${sci(o.key)} <small style="font-family:var(--font-body)">(${esc(anionInfo.get(o.key).anionName)})</small>` : sci(o.key), rightIdx, q.answered, q.choice)}</div>`;
  } else if (q.type === "fill") {
    body = `<div class="opts fill-opts" role="group" aria-label="الاختيارات">${optButtons(q.opts, o => q.mode === "color" ? `<i class="sw ${o === "colorless" ? "colorless" : ""}" style="background:${hex(o) || "transparent"}"></i> ${sci(o)}` : sci(o), q.opts.indexOf(q.answer), q.answered, q.choice)}</div>`;
  } else if (q.type === "tf") {
    const tfBtn = (val, label) => { let st = ""; if (q.tfChoice !== undefined && q.tfChoice === val) st = (val === q.truth) ? "right" : "wrong"; if (q.answered && val === q.truth) st = "right"; return `<button type="button" class="opt tf" data-tf="${val}" data-state="${st}" ${q.stage !== "tf" ? "disabled" : ""}>${label}</button>`; };
    body = `<div class="opts tf-row" role="group" aria-label="صح ولا غلط">${tfBtn(true, "True")}${tfBtn(false, "False")}</div>
      ${q.stage !== "tf" && !q.truth && q.tfChoice === false ? `<p class="label">صح، الجملة غلط. صحّحها: ${row.anion} مع ${esc(row.reagent)} بيدي إيه؟</p><div class="opts" role="group" aria-label="التصحيح">${optButtons(q.fixOpts, o => sci(o.key), q.fixOpts.findIndex(o => o.right), q.answered, q.choice)}</div>` : ""}`;
  } else if (q.type === "match") {
    const num = id => q.left.indexOf(id) + 1;
    const pickedBy = rid => Object.keys(q.picks).find(k => q.picks[k] === rid);
    body = `<p class="note">دوس على أنيون من فوق، وبعدين على النتيجة بتاعته تحت. الرقم بيوضح التوصيل.</p>
      <div class="match">
        <div class="mcol" role="group" aria-label="الأنيونات">${q.left.map(id => { const r = ROW.get(id); const ok = q.answered ? (q.picks[id] === id ? "right" : "wrong") : ""; return `<button type="button" class="opt mleft" data-ml="${esc(id)}" aria-pressed="${q.sel === id}" data-state="${ok}" ${q.answered ? "disabled" : ""}><span class="k">${num(id)}</span><span>${F(r.anion)} <small style="font-family:var(--font-body)">${esc(r.anionName)}</small></span></button>`; }).join("")}</div>
        <div class="mcol" role="group" aria-label="النتايج">${q.rcol.map(rid => { const r = ROW.get(rid), by = pickedBy(rid); return `<button type="button" class="opt mright" data-mr="${esc(rid)}" ${q.answered ? "disabled" : ""}><span class="k">${by ? num(by) : "·"}</span><span>${r.condition ? `<small>${sci(r.condition)}</small><br>` : ""}${sci(r.observation)}</span></button>`; }).join("")}</div>
      </div>
      ${q.answered ? "" : `<div class="row" style="margin-top:10px"><button type="button" class="btn" id="q-match-done" ${Object.keys(q.picks).length === q.left.length ? "" : "disabled"}>تأكيد التوصيل</button></div>`}`;
  }
  panel.innerHTML = head + body + (q.answered ? feedback(q) : "");
}
function startPractice(group) {
  const pool = ROWS.filter(r => r.group === group && isQuizzable(r) && ["weak", "new"].includes(mastery(r.id))).map(r => r.id);
  show("quiz", { practice: { pool: pool.length ? pool : ROWS.filter(r => r.group === group && isQuizzable(r)).map(r => r.id), label: `تمرين Group ${group}` } });
}
document.addEventListener("click", e => { const b = e.target.closest("[data-nav-to]"); if (b) show(b.dataset.navTo); });

// ───────────────────────── 6. SLIDE ERRORS ─────────────────────────
INIT.errors = () => {
  const el = $("#v-errors");
  const C = DATA.corrections;
  const linkFor = ref => ROWS.find(r => r.flag && r.flag.source === "doc" && r.slideRef === ref);
  // one list in slide order: the doc's corrections table + the unbalanced slide equations found while copying them (marked زيادة)
  const seenExtra = new Set(), extras = [];
  ROWS.forEach(r => { if (r.flag && r.flag.source === "extra" && !seenExtra.has(r.flag.slide)) { seenExtra.add(r.flag.slide); extras.push(r); } });
  const slideNo = ref => { const m = /L(\d+)\s*·\s*s(\d+)/.exec(ref); return m ? +m[1] * 1000 + +m[2] : Infinity; };
  const list = [...C.doc.map(c => ({ src: "doc", key: "doc|" + c.ref, ref: c.ref, problem: c.problem, slide: c.slide, correct: c.correct, row: linkFor(c.ref) })),
    ...extras.map(r => ({ src: "extra", key: "extra|" + r.flag.slide, ref: r.slideRef, problem: r.flag.note, slide: r.flag.slide, correct: r.flag.correct, row: r }))]
    .map((x, i) => [x, i]).sort((a, b) => slideNo(a[0].ref) - slideNo(b[0].ref) || a[1] - b[1]).map(a => a[0]);
  const txt = t => /[؀-ۿ]/.test(t) ? `<div>${AR(t)}</div>` : EN(t, "div");
  el.innerHTML = `<div class="vhead"><h2>أخطاء في السلايدز</h2><p>عدد الأخطاء: ${list.length}. منهم ${C.doc.length} من جدول التصحيحات في صفحة الشرح بتاعتك، و${extras.length} معادلات مش متوازنة لقيتها وأنا بنقل المعادلات من السلايدز، وعليها علامة «زيادة للفهم» (راجعها مع المعيد قبل ما تعتمد عليها). الداتا في الموقع فضلت زي السلايد بالظبط، والصح جنبها بعلامة ⚠️.</p></div>
    <div id="err-list">${list.map(x => `<div class="err" data-err="${esc(x.ref)}" data-key="${esc(x.key)}" data-src="${x.src}">
      <div class="row"><span class="ref">${esc(x.ref)}</span>${x.row ? `<button type="button" class="chip" data-open="${esc(x.row.id)}">افتحها في المعمل</button>` : ""}</div>
      <div class="flag" style="border-width:1.5px"><div class="fh"><span aria-hidden="true">⚠️</span> ${AR(x.problem)}${x.src === "extra" ? ` <span class="extra">زيادة للفهم — مش في السلايدز</span>` : ""}</div>
      <div class="pair"><div class="slide"><b>اللي في السلايد</b>${txt(x.slide)}</div><div class="right"><b>الصح</b>${txt(x.correct)}</div></div></div>
    </div>`).join("")}</div>
    <h3 class="sec">ملاحظتين من نفس الصفحة</h3>
    ${C.notes.map(n => `<div class="err"><span class="ref">${esc(n.ref)}</span><div>${AR(n.text)}</div></div>`).join("")}
    <h3 class="sec">عن الأسامي الإنجليزي</h3>
    <p class="note">الأسامي اللي بين القوسين جنب كل صيغة اتضافت عشان تفهم الصيغة. اللي مش مكتوب منها في السلايد: <span class="extra">زيادة للفهم — مش في السلايدز</span></p>`;
  el.addEventListener("click", e => { const b = e.target.closest("[data-open]"); if (b) { const r = ROW.get(b.dataset.open); const idx = rowsOf(r.anion, r.reagent).indexOf(r); openInLab(r.anion, r.reagent, Math.max(0, idx)); } });
};

// ───────────────────────── boot ─────────────────────────
let start = "lab";
try { const h = location.hash.slice(1); if (VIEWS.some(v => v[0] === h)) start = h; } catch (e) { /* no hash access */ }
if (activeProfile()) loadProfileState();
renderTop();
show(start);
if (!activeProfile()) openSheet(profiles.list.length ? "pick" : "gate");
window.__anionLab = { ROWS, COLORS, show, version: 1, peekQuestion: () => round && round.q, peekState: () => ({ qz, unk, settings, saved: [...saved], profiles }), soundLog: Sound.log, activeSounds: () => Sound.active(), skip: () => { if (round) { round.i++; nextQuestion(); } }, _t: { alike, famRows, norm, rowColorSet, mastery, fold, fam, similarity, isQuizzable, build } };
})();
