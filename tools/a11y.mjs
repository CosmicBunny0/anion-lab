// lightweight a11y pass: tap targets, accessible names, focusable controls, per view
import { chromium } from "playwright-core";
import { pathToFileURL } from "node:url";
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, reducedMotion: "reduce" });
await page.goto(pathToFileURL(process.cwd() + "/dist/test.html").href + "#lab");
for (const v of ["lab", "grid", "find", "unknown", "play", "quiz", "errors"]) {
  await page.click(`button[data-nav="${v}"]`);
  const r = await page.evaluate(() => {
    const out = { small: [], noname: [] };
    for (const el of document.querySelectorAll("button, select, summary, a[href]")) {
      if (el.closest("[hidden]") || el.disabled) continue;
      const b = el.getBoundingClientRect(); if (!b.width) continue;
      if (b.width < 44 || b.height < 44) out.small.push(`${el.tagName}.${el.className} "${(el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 20)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
      const name = (el.getAttribute("aria-label") || el.innerText || el.title || (el.id && document.querySelector(`label[for="${el.id}"]`)?.innerText) || "").trim();
      if (!name) out.noname.push(`${el.tagName}#${el.id}.${el.className}`);
    }
    out.small = [...new Set(out.small)].slice(0, 8); out.noname = [...new Set(out.noname)].slice(0, 8);
    return out;
  });
  console.log(v, JSON.stringify(r));
}
await browser.close();
