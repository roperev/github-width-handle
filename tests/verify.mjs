// End-to-end checks for the extension against live github.com pages in the
// roperev/github-width-handle repo (issue #1, PR #2, discussion #3).
// Run: npm test   (set HEADED=1 to watch)
import { launch, open, layout, setStorage, getStorage, dragHandle, REPO } from './helpers.mjs';
import fs from 'node:fs';

const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
async function trackInfo(page) {
  return page.evaluate(() => {
    const segs = [...document.querySelectorAll('.gwh-track')].filter((el) => !el.hidden);
    if (!segs.length) return { visible: false };
    const rects = segs.map((el) => el.getBoundingClientRect());
    const r = { top: Math.min(...rects.map((x) => x.top)), bottom: Math.max(...rects.map((x) => x.bottom)), width: rects[0].width, height: 1 };
    const el = { hidden: false };
    const segments = segs.length;
    const rounded = segs.every((s) => parseFloat(getComputedStyle(s).borderTopLeftRadius) > 0);
    const sticky = [...document.querySelectorAll('[class*="stickyContainer"]')].map((h) => h.getBoundingClientRect()).filter((h) => h.top <= 1 && h.height > 0);
    const header = Math.round(Math.max(0, ...sticky.map((h) => h.bottom)));
    return { visible: !el.hidden && r.height > 0, top: Math.round(r.top), bottom: Math.round(r.bottom), width: r.width, header, segments, rounded };
  });
}

function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// Records the content container width on every animation frame from document start.
const FRAME_LOGGER = () => {
  window.__gwhFrames = [];
  const sel = [
    '[class*="issueViewerContainer"] [class*="contentContainer__"]',
    '#diff-comparison-viewer-container',
    '.new-discussion-timeline',
  ].join(',');
  const tick = () => {
    const c = document.querySelector(sel);
    if (c) {
      const w = Math.round(c.getBoundingClientRect().width);
      if (w > 0) window.__gwhFrames.push(w);
    }
    if (window.__gwhFrames.length < 600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const frames = (page) => page.evaluate(() => window.__gwhFrames.slice());

const headless = !process.env.HEADED;
const { context, page, extId } = await launch({ headless });
await context.addInitScript(FRAME_LOGGER);
const DEFAULT = 1280;

// ---------- Issue: default state + drag ----------
await setStorage(context, extId, { enabled: true, width: null });
await open(page, `${REPO}/issues/1`);
let l = await layout(page);
check('issue: page detected', l.page === 'issue');
check('issue: handle visible, no reset at default', !!l.ui && !l.reset);
const gutter = await page.evaluate(() => {
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('[data-testid="issue-viewer-metadata-pane"] h3'));
  const svg = document.querySelector('.gwh-bar svg').getBoundingClientRect();
  return {
    mid: (document.querySelector('[data-testid="issue-body"]').getBoundingClientRect().right + range.getBoundingClientRect().left) / 2,
    dots: svg.left + svg.width / 2,
  };
});
check('issue: grip centered between comment box and sidebar text', near(gutter.dots, gutter.mid, 1), `${gutter.dots} vs ${gutter.mid}`);
check('issue: handle anchored beside first comment', near(l.ui.top, l.issue.main.top, 2) && l.ui.position === 'absolute');
const before = l.issue;

await dragHandle(page, 250);
l = await layout(page);
check('issue: drag widens symmetrically', near(before.container.left - l.issue.container.left, 250) && near(l.issue.container.right - before.container.right, 250),
  `${before.container.left}->${l.issue.container.left}, ${before.container.right}->${l.issue.container.right}`);
check('issue: sidebar keeps width and is not overlapped', l.issue.side.width === before.side.width && l.issue.main.right <= l.issue.side.left);
check('issue: header widens with content', l.issue.header.left === l.issue.main.left && l.issue.header.right === l.issue.side.right);
check('issue: reset button appears', l.reset);
let stored = await getStorage(context, extId);
check('issue: width persisted to storage.sync', stored.width === DEFAULT + 500, JSON.stringify(stored));
await page.screenshot({ path: `${SHOTS}issue-wide.png` });

// Clamp at viewport
await dragHandle(page, 2000);
l = await layout(page);
check('drag clamps to viewport width', l.issue.container.width <= l.clientWidth, `${l.issue.container.width}`);
await dragHandle(page, -3000);
l = await layout(page);
check('drag clamps to default width (and clears custom width)', near(l.issue.container.width, before.container.width) && !l.sized && !l.reset);
await dragHandle(page, 250);

// ---------- Reload: no snap ----------
await open(page, `${REPO}/issues/1`);
let f = await frames(page);
check('issue reload: first painted frame already at custom width', f.length > 0 && f.every((w) => w === DEFAULT + 500), `first=${f[0]} min=${Math.min(...f)}`);

// ---------- Scroll docking ----------
l = await layout(page);
const xBefore = l.ui.left;
await page.mouse.wheel(0, 1500);
await page.waitForTimeout(400);
l = await layout(page);
const vh = page.viewportSize().height;
check('scroll: handle docks to viewport center', l.ui.position === 'fixed' && near(l.ui.top + 31, vh / 2, 20), `top=${l.ui.top}`);
check('scroll: handle does not move horizontally', l.ui.left === xBefore);
let t = await trackInfo(page);
check('scroll: rail spans viewport below the sticky header, above and below the handle', t.visible && t.header > 0 && near(t.top, t.header, 1) && t.bottom >= vh && t.width === 5 && t.segments === 2 && t.rounded, JSON.stringify(t));
await page.mouse.wheel(0, -1500);
await page.waitForTimeout(400);
l = await layout(page);
check('scroll back: handle re-anchors to first comment', l.ui.position === 'absolute' && near(l.ui.top, l.issue.main.top, 2));
await page.waitForTimeout(300);
t = await trackInfo(page);
check('anchored: rail runs from under the reset to content bottom', t.visible && t.top > l.ui.top && t.bottom >= l.issue.main.bottom - 2, JSON.stringify(t));

// ---------- Soft navigation: issue list -> issue ----------
await open(page, `${REPO}/issues`);
l = await layout(page);
check('issue list: not touched', l.page === null && !l.sized && !l.ui);
await page.evaluate(() => { window.__gwhFrames.length = 0; });
await page.locator('a[href$="/issues/1"]').first().click();
await page.waitForURL('**/issues/1');
await page.waitForTimeout(1500);
f = await frames(page);
check('soft nav to issue: no default-width frame before custom width', f.length > 0 && f.every((w) => w === DEFAULT + 500), `frames=${[...new Set(f)].join(',')}`);

// ---------- PR conversation ----------
await open(page, `${REPO}/pull/2`);
l = await layout(page);
check('pr: page detected and sized', l.page === 'pr' && l.sized);
check('pr: container at custom width, centered', l.pr.container.width === DEFAULT + 500 && near(l.pr.container.left, (l.clientWidth - l.pr.container.width) / 2));
check('pr: sidebar not overlapped', l.pr.main.right <= l.pr.side.left && l.pr.side.width === 320);
check('pr: tabs aligned with content columns', l.pr.tabs.left === l.pr.main.left && l.pr.tabs.right === l.pr.side.right);
check('pr: handle in gutter', l.ui && l.ui.left >= l.pr.main.right - 2 && l.ui.left + l.ui.width <= l.pr.side.left + 2);
await page.screenshot({ path: `${SHOTS}pr-wide.png` });

// Soft nav via tabs: Commits keeps width; Checks is untouched.
await page.evaluate(() => { window.__gwhFrames.length = 0; });
await page.locator('a[href$="/pull/2/commits"]').first().click();
await page.waitForURL('**/pull/2/commits');
await page.waitForTimeout(1500);
l = await layout(page);
f = await frames(page);
check('pr commits (soft nav): sized, consistent width', l.page === 'pr-commits' && l.pr.container.width === DEFAULT + 500 && f.every((w) => w === DEFAULT + 500));
check('pr commits: handle visible', !!l.ui);
await page.locator('a[href$="/pull/2/checks"]').first().click();
await page.waitForURL('**/pull/2/checks');
await page.waitForTimeout(1500);
l = await layout(page);
check('pr checks: not touched, handle hidden', l.page === null && !l.sized && !l.ui);
await open(page, `${REPO}/pull/2/files`);
l = await layout(page);
check('pr files: not touched', l.page === null && !l.ui);

// ---------- Discussion ----------
await open(page, `${REPO}/discussions/3`);
l = await layout(page);
check('discussion: sized and centered', l.page === 'discussion' && l.discussion.container.width === DEFAULT + 500);
check('discussion: sidebar fixed width, not overlapped', near(l.discussion.side.width, 312) && l.discussion.main.right <= l.discussion.side.left);

// ---------- Excluded pages ----------
for (const p of ['', '/pulls', '/actions', '/blob/main/README.md', '/discussions']) {
  await open(page, `${REPO}${p}`);
  l = await layout(page);
  check(`excluded ${p || '/'}: not touched`, l.page === null && !l.sized && !l.ui);
}

// ---------- Keyboard ----------
await open(page, `${REPO}/issues/1`);
await page.locator('.gwh-handle').focus();
await page.keyboard.press('ArrowRight');
l = await layout(page);
check('keyboard: ArrowRight widens by 40', l.issue.container.width === DEFAULT + 540, `${l.issue.container.width}`);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(500);
stored = await getStorage(context, extId);
check('keyboard: change persisted', stored.width === DEFAULT + 500);

// ---------- Reset button (animated) ----------
await page.locator('.gwh-reset').click();
await page.waitForTimeout(200);
const mid = await page.evaluate(() => ({
  animate: document.documentElement.hasAttribute('data-gwh-animate'),
  w: Math.round(document.querySelector('[class*="issueViewerContainer"] [class*="contentContainer__"]').getBoundingClientRect().width),
}));
check('reset: animates (mid-transition width between default and custom)', mid.animate && mid.w < DEFAULT + 500 && mid.w > DEFAULT, `${mid.w}`);
await page.waitForTimeout(600);
l = await layout(page);
stored = await getStorage(context, extId);
check('reset: back to default, reset hidden, storage cleared', l.issue.container.width === DEFAULT && !l.sized && !l.reset && stored.width == null);

// ---------- Late apply (cache stale vs storage.sync) animates ----------
await setStorage(context, extId, { width: 1700 });
await page.evaluate(() => localStorage.setItem('gwh:v1', JSON.stringify({ enabled: true, width: null })));
await open(page, `${REPO}/issues/1`);
f = await frames(page);
const uniq = [...new Set(f)];
check('late apply: reaches stored width', f.at(-1) === 1700, `last=${f.at(-1)}`);
check('late apply: eased (intermediate frames) or pre-applied', f[0] === 1700 || uniq.some((w) => w > DEFAULT && w < 1700), `first=${f[0]} steps=${uniq.length}`);

// ---------- Popup: enable toggle + live update ----------
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extId}/src/popup.html`);
check('popup: shows width', (await popup.locator('#width').textContent()) === '1700px');
await popup.locator('#enabled').click();
await page.waitForTimeout(300);
l = await layout(page);
check('popup disable: overrides and handle removed live', l.page === null && !l.sized && !l.ui);
await popup.locator('#enabled').click();
await page.waitForTimeout(300);
l = await layout(page);
check('popup enable: restored live', l.page === 'issue' && l.sized && !!l.ui);
await popup.screenshot({ path: `${SHOTS}popup.png` });
await popup.locator('#reset').click();
await page.waitForTimeout(800);
l = await layout(page);
check('popup reset: page returns to default', !l.sized && l.issue.container.width === DEFAULT);
await popup.close();

// ---------- Drag smoothness on long PR ----------
await open(page, `${REPO}/pull/2`);
const box = await page.locator('.gwh-handle').boundingBox();
const startW = (await layout(page)).pr.container.width;
await page.mouse.move(box.x + 8, box.y + 20);
await page.mouse.down();
const t0 = Date.now();
let tracked = true;
for (let i = 1; i <= 30; i++) {
  await page.mouse.move(box.x + 8 + i * 10, box.y + 20);
  const w = await page.evaluate(() => Math.round(document.querySelector('#diff-comparison-viewer-container').getBoundingClientRect().width));
  if (w !== startW + i * 20) tracked = false;
}
const elapsed = Date.now() - t0;
await page.mouse.up();
check('drag: width tracks pointer 1:1 on every move', tracked);
check('drag: moves are fast (no jank)', elapsed / 30 < 50, `${(elapsed / 30).toFixed(1)}ms per move`);
await setStorage(context, extId, { width: null });
await context.close();

// ---------- Dark theme screenshot ----------
const dark = await launch({ headless, colorScheme: 'dark' });
await setStorage(dark.context, dark.extId, { width: 1800 });
await open(dark.page, `${REPO}/pull/2`);
await dark.page.screenshot({ path: `${SHOTS}pr-dark.png` });
const dl = await layout(dark.page);
check('dark: handle visible on PR', !!dl.ui);

// ---------- Short issue: rail ends at the comment area, not the sidebar ----------
await open(dark.page, `${REPO}/issues/5`);
await dark.page.waitForTimeout(300);
const shortInfo = await dark.page.evaluate(() => {
  const segs = [...document.querySelectorAll('.gwh-track')].filter((t) => !t.hidden).map((t) => t.getBoundingClientRect().bottom);
  const comments = document.querySelector('[data-testid="issue-viewer-comments-container"]').getBoundingClientRect().bottom;
  const side = document.querySelector('[data-testid="issue-viewer-metadata-pane"]').getBoundingClientRect().bottom;
  return { rail: Math.round(Math.max(...segs)), comments: Math.round(comments), side: Math.round(side) };
});
check('short issue: rail ends at the comment area, above the sidebar bottom',
  near(shortInfo.rail, shortInfo.comments, 1) && shortInfo.rail < shortInfo.side, JSON.stringify(shortInfo));

// Simulated logged-in composer: an unframed, padded section whose lowest painted thing is the Comment button.
const composer = await dark.page.evaluate(() => {
  const area = document.querySelector('[class*="contentArea__"]');
  const box = document.createElement('div');
  box.id = 'gwh-test-composer';
  box.style.cssText = 'padding: 16px 0 48px; display: flex; justify-content: flex-end';
  box.innerHTML = '<button type="button" style="padding:5px 16px;border-radius:6px;border:1px solid #2ea04366;background:#238636;color:#fff">Comment</button>';
  area.append(box);
  return { box: Math.round(box.getBoundingClientRect().bottom), button: Math.round(box.querySelector('button').getBoundingClientRect().bottom) };
});
await dark.page.waitForTimeout(1300);
await dark.page.mouse.wheel(0, 1);
await dark.page.waitForTimeout(300);
const composerRail = await dark.page.evaluate(() => Math.round(Math.max(...[...document.querySelectorAll('.gwh-track')].filter((t) => !t.hidden).map((t) => t.getBoundingClientRect().bottom))));
check('composer: rail ends at the Comment button, not its padded container', near(composerRail, composer.button - 1, 2) && composerRail < composer.box - 20,
  `rail=${composerRail} button=${composer.button} container=${composer.box}`);

// ---------- Handle style picker ----------
const styleOf = () => dark.page.evaluate(() => document.querySelector('.gwh-bar')?.dataset.style);
await open(dark.page, `${REPO}/pull/2`);
check('handle style: default is dots-353', (await styleOf()) === 'dots-353');
const pop = await dark.context.newPage();
await pop.goto(`chrome-extension://${dark.extId}/src/popup.html`);
await pop.waitForTimeout(200);
check('popup: 12 handle options, default selected', (await pop.locator('.handle-option').count()) === 12
  && (await pop.locator('.handle-option[aria-checked="true"]').getAttribute('data-id')) === 'dots-353');
await pop.locator('.handle-option[data-id="knob"]').click();
await dark.page.waitForTimeout(300);
check('popup: picking a style updates the page live', (await styleOf()) === 'knob');
await pop.close();
await open(dark.page, `${REPO}/issues/1`);
check('handle style: persists across navigation', (await styleOf()) === 'knob');
await dark.context.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
