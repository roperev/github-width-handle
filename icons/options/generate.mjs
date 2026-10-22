import { chromium } from 'playwright';
import fs from 'node:fs';
// 3-5-3 dot cluster centered at (cx, cy), `s` = spacing, `r` = radius.
const dots353 = (cx, cy, s, r, fill) => [[3, -1], [5, 0], [3, 1]].flatMap(([n, col]) =>
  Array.from({ length: n }, (_, i) => `<circle cx="${cx + col * s}" cy="${cy + (i - (n - 1) / 2) * s}" r="${r}" fill="${fill}"/>`)).join('');
const tile = (fill) => `<rect x="4" y="4" width="120" height="120" rx="26" fill="${fill}"/>`;
const railGrad = (id, color) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient>`;
// Raised frame (filled, blue outline) with a 2×4 grip, centered at (cx, cy).
function raisedGrip(cx, cy, w, h, r) {
  const x = cx - w / 2, y = cy - h / 2, gap = h / 5, dr = Math.min(5.5, w / 9);
  const dots = [0, 1].flatMap((c) => [0, 1, 2, 3].map((i) =>
    `<circle cx="${cx + (c ? 1 : -1) * w * 0.17}" cy="${y + gap * (i + 1)}" r="${dr}" fill="#e6edf3"/>`)).join('');
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#30363d" stroke="#4493f8" stroke-width="5"/>${dots}`;
}
const icons = {
  // Dark tile, fading blue rail split by the 3-5-3 handle: the in-page "middle" look.
  'rail-split': `<defs>${railGrad('g', '#4493f8')}</defs>${tile('#0d1117')}
    <rect x="58" y="12" width="12" height="104" rx="6" fill="url(#g)"/>
    <rect x="42" y="38" width="44" height="52" rx="14" fill="#0d1117"/>
    ${dots353(64, 64, 11, 4.2, '#e6edf3')}`,
  // Big white 3-5-3 dots on a GitHub-blue tile. Bold, reads well at 16px.
  'blue-dots': `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4493f8"/><stop offset="1" stop-color="#0969da"/></linearGradient></defs>${tile('url(#b)')}
    ${dots353(64, 64, 20, 7.5, '#ffffff')}`,
  // Capsule frame with blue dots, on dark.
  'capsule': `${tile('#161b22')}
    <rect x="40" y="18" width="48" height="92" rx="24" fill="#0d1117" stroke="#4493f8" stroke-width="6"/>
    ${dots353(64, 64, 13, 5, '#4493f8')}`,
  // Columns pushed apart by the center handle, with outward arrows.
  'spread': `${tile('#0d1117')}
    <rect x="14" y="30" width="22" height="68" rx="5" fill="none" stroke="#656c76" stroke-width="6"/>
    <rect x="92" y="30" width="22" height="68" rx="5" fill="none" stroke="#656c76" stroke-width="6"/>
    <path d="M50 52 42 64l8 12M78 52l8 12-8 12" fill="none" stroke="#4493f8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots353(64, 64, 8, 3.2, '#e6edf3')}`,
  // Light tile: a widening page column with the blue handle at its edge.
  'light-column': `${tile('#ffffff')}<rect x="4.5" y="4.5" width="119" height="119" rx="25.5" fill="none" stroke="#d1d9e0" stroke-width="3"/>
    <rect x="18" y="22" width="62" height="84" rx="8" fill="#f6f8fa" stroke="#d1d9e0" stroke-width="4"/>
    <g fill="#d1d9e0"><rect x="28" y="36" width="40" height="6" rx="3"/><rect x="28" y="50" width="32" height="6" rx="3"/><rect x="28" y="64" width="40" height="6" rx="3"/><rect x="28" y="78" width="24" height="6" rx="3"/></g>
    <rect x="88" y="34" width="24" height="60" rx="12" fill="#0969da"/>
    ${dots353(100, 64, 7, 2.6, '#ffffff')}`,
  // Raised (filled) frame with grip dots, minimalist on dark.
  'raised-grip': `${tile('#0d1117')}
    <rect x="38" y="20" width="52" height="88" rx="14" fill="#30363d"/>
    <rect x="38" y="20" width="52" height="88" rx="14" fill="none" stroke="#4493f8" stroke-width="5"/>
    ${[0, 1].flatMap((c) => [0, 1, 2, 3].map((r) => `<circle cx="${55 + c * 18}" cy="${37 + r * 18}" r="5.5" fill="#e6edf3"/>`)).join('')}`,
  // Full-height rainbow-ish rail (purple→blue→green) with dots: nods to the color picker.
  'color-rail': `<defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ab7df8"/><stop offset=".5" stop-color="#4493f8"/><stop offset="1" stop-color="#3fb950"/></linearGradient></defs>${tile('#0d1117')}
    <rect x="52" y="14" width="24" height="100" rx="12" fill="url(#c)"/>
    ${dots353(64, 64, 9, 3.4, '#ffffff')}`,
  // Double arrow through the 3-5-3 handle: "resize" at a glance.
  'resize-arrows': `${tile('#1f2328')}
    <path d="M14 64h100M30 46 12 64l18 18M98 46l18 18-18 18" fill="none" stroke="#4493f8" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="46" y="28" width="36" height="72" rx="18" fill="#1f2328" stroke="#9198a1" stroke-width="5"/>
    ${dots353(64, 64, 10, 3.8, '#e6edf3')}`,
  // Raised grip with blue resize arrows: a full shaft through the frame (like resize-arrows).
  'raised-grip-arrows': `${tile('#0d1117')}
    <path d="M12 64h104M28 48 12 64l16 16M100 48l16 16-16 16" fill="none" stroke="#4493f8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    ${raisedGrip(64, 64, 40, 76, 14)}`,
  // Raised grip with chevrons only, beside the frame.
  'raised-grip-chevrons': `${tile('#0d1117')}
    <path d="M30 48 16 64l14 16M98 48l14 16-14 16" fill="none" stroke="#4493f8" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    ${raisedGrip(64, 64, 42, 80, 14)}`,
  // Raised grip with short arrows (shaft + head) on each side.
  'raised-grip-short-arrows': `${tile('#0d1117')}
    <path d="M36 64H12M24 52 12 64l12 12M92 64h24M104 52l12 12-12 12" fill="none" stroke="#4493f8" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${raisedGrip(64, 64, 40, 80, 13)}`,
};
const b = await chromium.launch();
const p = await b.newPage();
const toImg = (svg) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${svg}</svg>`)}`;
for (const [name, svg] of Object.entries(icons)) {
  fs.mkdirSync(`icons/options/${name}`, { recursive: true });
  fs.writeFileSync(`icons/options/${name}/icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${svg}</svg>\n`);
  for (const s of [16, 48, 128]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${toImg(svg)}" width="${s}" height="${s}">`);
    await p.screenshot({ path: `icons/options/${name}/icon${s}.png`, omitBackground: true });
  }
}
// Comparison sheet: current + new, at 128/48/16 on light and dark toolbars.
const all = { 'current': 'icons', 'original': 'icons/options/original', ...Object.fromEntries(Object.keys(icons).map((n) => [n, `icons/options/${n}`])) };
const img = (f, s) => `<img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}" width="${s}" height="${s}">`;
const cell = (name, dir) => `<div class=c><div class=n>${name}</div>${img(`${dir}/icon128.png`, 128)}
  <div class=row><span class=l>${img(`${dir}/icon48.png`, 48)}${img(`${dir}/icon16.png`, 16)}</span><span class=d>${img(`${dir}/icon48.png`, 48)}${img(`${dir}/icon16.png`, 16)}</span></div></div>`;
await p.setViewportSize({ width: 900, height: 600 });
await p.setContent(`<style>body{margin:0;padding:12px;font:13px -apple-system,sans-serif;background:#888;display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
.c{background:#eee;border-radius:10px;padding:8px;text-align:center}.n{margin-bottom:6px;font-weight:600}
.row{display:flex;gap:4px;margin-top:6px}.row span{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:6px;border-radius:6px}
.l{background:#f6f8fa}.d{background:#202124}</style>${Object.entries(all).map(([n, d]) => cell(n, d)).join('')}`);
await p.screenshot({ path: 'icons/options/compare.png', fullPage: true });
await b.close();
