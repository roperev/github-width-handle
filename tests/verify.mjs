// End-to-end checks for the extension against live github.com pages in the
// roperev/github-width-handle repo (issue #1, PR #2, discussion #3), plus cli/cli issue #2 as a second repo.
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
await setStorage(context, extId, { enabled: true, width: null, position: 'dynamic' });
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
check('issue: handle anchored beside first comment, frame top level with it', near(l.bar.top, l.issue.main.top, 2) && l.ui.position === 'absolute', `${l.bar.top} vs ${l.issue.main.top}`);
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
check('scroll back: handle re-anchors to first comment', l.ui.position === 'absolute' && near(l.bar.top, l.issue.main.top, 2), `${l.bar.top} vs ${l.issue.main.top}`);
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
await page.evaluate(() => localStorage.setItem('gwh:v2', JSON.stringify({ enabled: true, width: null })));
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

// ---------- Per-repo settings ----------
const OWN = 'repo:roperev/github-width-handle';
const OTHER = 'https://github.com/cli/cli/issues/2';
const widthOn = async (p) => (await layout(p)).issue.container.width;
await setStorage(context, extId, { width: 1500, handle: 'grip-2x4', [OWN]: { width: 1800 } });
await open(page, `${REPO}/issues/1`);
check('repo: own width applies on its pages', (await widthOn(page)) === 1800, `${await widthOn(page)}`);
const other = await context.newPage();
await open(other, OTHER);
check('repo: other repos use the global width', (await widthOn(other)) === 1500, `${await widthOn(other)}`);

const repoReply = await page.evaluate(() => document.documentElement.getAttribute('data-gwh-page'));
const rpop = await context.newPage();
await rpop.goto(`chrome-extension://${extId}/src/popup.html`);
const replies = await rpop.evaluate(async () => {
  const tabs = await chrome.tabs.query({});
  return (await Promise.all(tabs.map((t) => chrome.tabs.sendMessage(t.id, { type: 'gwh-repo' }).catch(() => null)))).filter(Boolean);
});
check('repo: content script tells the popup its repo', repoReply === 'issue' && replies.some((r) => r.repo === 'roperev/github-width-handle' && r.label === 'roperev/github-width-handle')
  && replies.some((r) => r.repo === 'cli/cli'), JSON.stringify(replies));
check('repo: popup on a non-GitHub tab hides the repo switch and edits global', await rpop.locator('#repo-row').isHidden());
await rpop.goto(`chrome-extension://${extId}/src/popup.html?repo=roperev/github-width-handle`);
check('repo: popup shows the repo switch on, with the repo width', (await rpop.locator('#repo-own').isChecked()) && (await rpop.locator('#width').textContent()) === '1800px'
  && (await rpop.locator('#repo-name').textContent()) === 'github-width-handle');

// Edits go to the repo's own entry only.
await rpop.locator('#handles [data-id="dash"]').click();
await page.waitForTimeout(500);
let st = await getStorage(context, extId);
check('repo: popup edits save to the repo, not global', st[OWN].handle === 'dash' && st[OWN].width === 1800 && st.handle === 'grip-2x4', JSON.stringify(st));
check('repo: the edit applies on the repo page only', (await page.locator('.gwh-bar').getAttribute('data-style')) === 'dash'
  && (await other.locator('.gwh-bar').getAttribute('data-style')) === 'grip-2x4');

// Dragging on a repo page saves to that repo.
await dragHandle(page, -100);
st = await getStorage(context, extId);
check('repo: dragging saves to the repo width', st[OWN].width === 1600 && st.width === 1500, JSON.stringify(st));

// Turning the switch off goes back to global settings, live.
await rpop.locator('#repo-own').click();
await page.waitForTimeout(900);
st = await getStorage(context, extId);
check('repo: switch off removes the repo settings and the page goes back to global', !(OWN in st) && (await widthOn(page)) === 1500
  && (await page.locator('.gwh-bar').getAttribute('data-style')) === 'grip-2x4' && (await rpop.locator('#width').textContent()) === '1500px', JSON.stringify(st));

// Turning it on starts from the current settings, then diverges.
await rpop.locator('#repo-own').click();
await page.waitForTimeout(300);
st = await getStorage(context, extId);
check('repo: switch on starts with no overrides', JSON.stringify(st[OWN]) === '{}' && (await widthOn(page)) === 1500, JSON.stringify(st[OWN]));
await rpop.locator('#reset').click();
await page.waitForTimeout(900);
st = await getStorage(context, extId);
check('repo: width Reset in repo mode sets this repo to the default width only', st[OWN].width === null && st.width === 1500
  && (await widthOn(page)) === DEFAULT && (await widthOn(other)) === 1500, JSON.stringify(st));

// Reload: the repo width is cached for first paint.
await page.evaluate(() => { window.__gwhFrames.length = 0; });
await setStorage(context, extId, { [OWN]: { width: 1900 } });
await open(page, `${REPO}/issues/1`);
f = await frames(page);
check('repo: reload paints the repo width from the start', f.length > 0 && f.every((w) => w === 1900), `first=${f[0]} last=${f.at(-1)}`);
await rpop.close();
await other.close();
const cleanup = await context.newPage();
await cleanup.goto(`chrome-extension://${extId}/src/popup.html`);
await cleanup.evaluate((k) => chrome.storage.sync.remove(k), OWN);
await cleanup.close();

// ---------- Stealth mode: handle and rail both hidden ----------
await setStorage(context, extId, { width: 1500, handleHidden: true, railHidden: true, railColor: 'orange' });
await open(page, `${REPO}/issues/1`);
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
const stealth = () => page.evaluate(() => {
  const vis = (sel) => getComputedStyle(document.querySelector(sel)).visibility;
  const track = getComputedStyle(document.querySelector('.gwh-track:not([hidden])'));
  const shown = track.visibility === 'visible' && track.opacity === '1' ? 'visible' : 'hidden';
  return { reset: vis('.gwh-reset'), bar: vis('.gwh-bar'), track: shown, peak: track.getPropertyValue('--gwh-track-peak').trim() };
});
let stv = await stealth();
check('stealth: nothing drawn at rest (handle, rail and ×)', stv.reset === 'hidden' && stv.bar === 'hidden' && stv.track === 'hidden', JSON.stringify(stv));
const sbox = await page.locator('.gwh-handle').boundingBox();
await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
await page.waitForTimeout(300);
stv = await stealth();
check('stealth: hover shows the handle, the × and the rail in the default blue', stv.reset === 'visible' && stv.track === 'visible' && stv.bar === 'visible' && !/bc4c00|db6d28/.test(stv.peak), JSON.stringify(stv));
// Hovering anywhere along the (invisible) rail, a few px off center, also reveals everything.
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
const railBox = await page.evaluate(() => {
  // A point on the rail inside the window, well away from the handle.
  const r = document.querySelector('.gwh-track:not([hidden])').getBoundingClientRect();
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, innerHeight);
  const handle = document.querySelector('.gwh-handle').getBoundingClientRect();
  const y = handle.top - top > bottom - handle.bottom ? top + (handle.top - top) / 2 : handle.bottom + (bottom - handle.bottom) / 2;
  return { x: r.left + r.width / 2, y, top, bottom };
});
await page.mouse.move(railBox.x + 5, railBox.y);
await page.waitForTimeout(400);
stv = await stealth();
check('stealth: hovering anywhere along the rail reveals the handle, rail and ×', stv.reset === 'visible' && stv.track === 'visible' && stv.bar === 'visible', JSON.stringify({ ...stv, railBox }));
await setStorage(context, extId, { railHidden: false });
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
stv = await stealth();
check('stealth: only the handle hidden keeps the × and rail visible', stv.reset === 'visible' && stv.track === 'visible', JSON.stringify(stv));
await setStorage(context, extId, { handleHidden: false, railHidden: false, railColor: 'blue' });

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
await setStorage(dark.context, dark.extId, { width: 1800, position: 'dynamic' });
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

// ---------- Position modes ----------
const uiInfo = () => dark.page.evaluate(() => {
  const ui = document.querySelector('.gwh-ui');
  const r = ui.getBoundingClientRect();
  const anchor = document.querySelector('[data-testid="issue-body"]').getBoundingClientRect();
  const comments = document.querySelector('[data-testid="issue-viewer-comments-container"]')?.getBoundingClientRect();
  const barTop = Math.round(document.querySelector('.gwh-bar').getBoundingClientRect().top);
  return { top: Math.round(r.top), barTop, bottom: Math.round(r.bottom), mid: Math.round(r.top + r.height / 2), position: ui.style.position,
    anchor: Math.round(anchor.top), comments: comments && Math.round(comments.bottom), opacity: getComputedStyle(ui).opacity };
});
const dvh = dark.page.viewportSize().height;
await setStorage(dark.context, dark.extId, { position: 'middle' });
await open(dark.page, `${REPO}/issues/1`);
let u = await uiInfo();
check('middle: pinned at load, never above the first comment', u.position === 'fixed' && u.barTop >= u.anchor - 1
  && (u.anchor > dvh / 2 || near(u.mid, dvh / 2, 2)), JSON.stringify(u));
await dark.page.mouse.wheel(0, 1500);
await dark.page.waitForTimeout(500);
u = await uiInfo();
t = await trackInfo(dark.page);
check('middle: stays centered while scrolling, rail below the sticky header', u.position === 'fixed' && near(u.mid, dvh / 2, 2)
  && t.header > 0 && near(t.top, t.header, 1), JSON.stringify({ u, t }));

await dark.page.mouse.move(5, 5);
await dark.page.waitForTimeout(300);
const idle = (await uiInfo()).opacity;
const box2 = await dark.page.locator('.gwh-handle').boundingBox();
await dark.page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
await dark.page.waitForTimeout(300);
const hovered = (await uiInfo()).opacity;
const rail = await dark.page.locator('.gwh-track[data-pos="below"]').boundingBox();
await dark.page.mouse.move(5, 5);
await dark.page.waitForTimeout(300);
await dark.page.mouse.move(rail.x + rail.width / 2, rail.y + 60);
await dark.page.waitForTimeout(300);
const railHovered = (await uiInfo()).opacity;
check('fade: UI at 75% when idle, 100% when the handle or rail is hovered', idle === '0.75' && hovered === '1' && railHovered === '1',
  `${idle} / ${hovered} / ${railHovered}`);
await dark.page.mouse.move(5, 5);

await open(dark.page, `${REPO}/issues/5`);
await dark.page.waitForTimeout(1200);
await dark.page.mouse.wheel(0, 1);
await dark.page.waitForTimeout(300);
u = await uiInfo();
check('middle: short issue keeps the handle beside the comments', u.bottom <= u.comments + 1 && u.barTop >= u.anchor - 1, JSON.stringify(u));

await setStorage(dark.context, dark.extId, { position: 'top' });
await open(dark.page, `${REPO}/issues/1`);
await dark.page.mouse.wheel(0, 1500);
await dark.page.waitForTimeout(500);
u = await uiInfo();
check('top: stays beside the first comment and scrolls away with it', u.position === 'absolute' && near(u.barTop, u.anchor, 2) && u.bottom < 0, JSON.stringify(u));
// The visible frame's top lines up with the top of the comment box, whatever the handle/frame height.
{
  const aligned = [];
  for (const [handle, frame] of [['grip-2x4', 'well'], ['pill', 'pill'], ['dots-353', 'none']]) {
    await setStorage(dark.context, dark.extId, { position: 'top', handle, frame });
    for (const [url, box] of [[`${REPO}/issues/1`, '[data-testid="issue-body"]'], [`${REPO}/pull/2/commits`, '[data-testid="commit-group-title"] + *']]) {
      await open(dark.page, url);
      aligned.push(await dark.page.evaluate((sel) => Math.round(document.querySelector('.gwh-bar').getBoundingClientRect().top
        - document.querySelector(sel).getBoundingClientRect().top), box));
    }
  }
  check('top: the frame\'s top edge aligns with the comment box for short and tall combos', aligned.every((d) => Math.abs(d) <= 1), JSON.stringify(aligned));
  await setStorage(dark.context, dark.extId, { handle: 'grip-2x4', frame: 'well' });
}
// Back to the default position for the checks below.
{
  const p = await dark.context.newPage();
  await p.goto(`chrome-extension://${dark.extId}/src/popup.html`);
  await p.evaluate(() => chrome.storage.sync.remove('position'));
  await p.close();
}

// ---------- Handle style picker ----------
const styleOf = () => dark.page.evaluate(() => {
  const bar = document.querySelector('.gwh-bar');
  return bar && `${bar.dataset.style}/${bar.dataset.frame}`;
});
await open(dark.page, `${REPO}/pull/2`);
check('handle style: default is Grip (2×4) in a Well frame', (await styleOf()) === 'grip-2x4/well');
const pop = await dark.context.newPage();
await pop.goto(`chrome-extension://${dark.extId}/src/popup.html`);
await pop.waitForTimeout(200);
check('popup: 3 position options, dynamic selected', (await pop.locator('.segment-option').count()) === 3
  && (await pop.locator('.segment-option[aria-checked="true"]').getAttribute('data-id')) === 'dynamic');
check('popup: 16 handles and 8 frames, defaults selected', (await pop.locator('#handles .handle-option').count()) === 16
  && (await pop.locator('#frames .frame-option').count()) === 8
  && (await pop.locator('#handles [aria-checked="true"]').getAttribute('data-id')) === 'grip-2x4'
  && (await pop.locator('#frames [aria-checked="true"]').getAttribute('data-id')) === 'well'
  && !(await pop.locator('#frame-colored').isChecked()));
check('popup: fits in Chrome\'s 600px popup limit', (await pop.evaluate(() => document.body.offsetHeight)) <= 600);
await pop.hover('.info');
await pop.waitForTimeout(300);
const glassBox = await pop.locator('.popover-option').boundingBox();
await pop.mouse.move(glassBox.x + glassBox.width - 16, glassBox.y + glassBox.height / 2, { steps: 6 });
await pop.locator('#glass').click();
await pop.waitForTimeout(300);
check('popup: Liquid glass (beta) toggle in the info panel applies and saves the theme',
  (await pop.evaluate(() => document.documentElement.classList.contains('glass')))
  && (await pop.evaluate(() => chrome.storage.sync.get('glass'))).glass === true
  && (await pop.evaluate(() => document.body.offsetHeight)) <= 600);
await pop.reload();
await pop.waitForTimeout(300);
check('popup: Liquid glass persists across popup opens', await pop.evaluate(() => document.documentElement.classList.contains('glass')));
await pop.evaluate(() => chrome.storage.sync.set({ handle: 'pill' }));
await pop.waitForTimeout(200);
await pop.locator('#reset-all').click();
await pop.waitForTimeout(300);
check('popup: Reset all leaves the popup theme alone', (await pop.evaluate(() => chrome.storage.sync.get('glass'))).glass === true);
await pop.evaluate(() => chrome.storage.sync.set({ glass: false }));
await pop.waitForTimeout(300);
check('popup: Liquid glass off restores the standard theme', !(await pop.evaluate(() => document.documentElement.classList.contains('glass'))));
await pop.locator('#handles [data-id="ridges-4"]').click();
await pop.locator('#frames [data-id="pill"]').click();
await dark.page.waitForTimeout(300);
check('popup: picking a handle and frame updates the page live', (await styleOf()) === 'ridges-4/pill');
check('popup: frame previews show the chosen handle',
  (await pop.locator('#frames .gwh-frame').first().innerHTML()) === (await pop.locator('#handles [data-id="ridges-4"] .preview').innerHTML()));
await open(dark.page, `${REPO}/issues/1`);
check('handle style: persists across navigation', (await styleOf()) === 'ridges-4/pill');
const railGap = () => dark.page.evaluate(() => {
  const bar = document.querySelector('.gwh-bar').getBoundingClientRect();
  const tracks = [...document.querySelectorAll('.gwh-track')].filter((t) => !t.hidden).map((t) => t.getBoundingClientRect());
  const above = tracks.find((t) => t.bottom <= bar.top + 1);
  return above ? Math.round(bar.top - above.bottom) : null;
});
await pop.locator('#handles [data-id="pill"]').click();
await dark.page.waitForTimeout(300);
const tallGap = await railGap();
check('frames: tall graphics in Capsule keep at least a 6px gap to the rail', tallGap != null && tallGap >= 6, String(tallGap));
await pop.locator('#handles [data-id="grip"]').click();
await dark.page.waitForTimeout(300);

// Handle and rail colors.
const colorsOf = () => dark.page.evaluate(() => {
  const track = [...document.querySelectorAll('.gwh-track')].find((t) => !t.hidden);
  return {
    bar: getComputedStyle(document.querySelector('.gwh-bar')).color,
    barVisible: getComputedStyle(document.querySelector('.gwh-bar')).visibility === 'visible',
    railVisible: !!track && getComputedStyle(track).visibility === 'visible' && getComputedStyle(track).opacity !== '0',
    railImage: track ? getComputedStyle(track).backgroundImage : '',
  };
});
check('popup: 9 handle and 9 rail colors in the same order, defaults gray and blue',
  (await pop.locator('#handle-colors .swatch-option').count()) === 9
  && (await pop.locator('#rail-colors .swatch-option').count()) === 9
  && (await pop.locator('#handle-colors [aria-checked="true"]').getAttribute('data-id')) === 'gray'
  && (await pop.locator('#rail-colors [aria-checked="true"]').getAttribute('data-id')) === 'blue'
  && String(await pop.locator('#handle-colors .swatch-option').evaluateAll((b) => b.map((x) => x.dataset.id)))
    === String(await pop.locator('#rail-colors .swatch-option').evaluateAll((b) => b.map((x) => x.dataset.id))));
const defaultColors = await colorsOf();
await pop.locator('#handle-colors [data-id="green"]').click();
await pop.locator('#rail-colors [data-id="red"]').click();
await dark.page.waitForTimeout(300);
let colors = await colorsOf();
check('popup: picking colors updates the handle and rail live',
  colors.bar !== defaultColors.bar && colors.bar === 'rgb(63, 185, 80)' && colors.railImage !== defaultColors.railImage,
  JSON.stringify(colors));
check('rail: picked colors are bolder (~50%), default Blue stays subtle', /50%/.test(colors.railImage) || /0\.5\)/.test(colors.railImage), colors.railImage);
const frameBorder = () => dark.page.evaluate(() => getComputedStyle(document.querySelector('.gwh-bar')).borderTopColor);
await pop.locator('#frames [data-id="square"]').click();
await dark.page.waitForTimeout(300);
const plainBorder = await frameBorder();
await pop.locator('#frame-colored').click();
await dark.page.waitForTimeout(300);
check('popup: Colorize gives the frame the handle color', (await frameBorder()) === 'rgb(63, 185, 80)' && plainBorder !== 'rgb(63, 185, 80)'
  && (await pop.locator('#frames.colored').count()) === 1, `${plainBorder} → ${await frameBorder()}`);
await pop.locator('#frame-colored').click();
await dark.page.waitForTimeout(300);
check('popup: Colorize off restores the gray frame', (await frameBorder()) === plainBorder);
await pop.evaluate(() => chrome.storage.sync.set({ handleHidden: true, railHidden: true }));
const beforeRandom = await getStorage(dark.context, dark.extId);
await pop.locator('#randomize').click();
await dark.page.waitForTimeout(400);
const afterRandom = await getStorage(dark.context, dark.extId);
const randKeys = ['handle', 'frame', 'handleColor', 'railColor', 'frameColored'];
check('popup: Randomize picks a new handle, frame, Colorize and preset colors, un-hides, and applies them live',
  typeof afterRandom.frameColored === 'boolean' && !afterRandom.handleHidden && !afterRandom.railHidden &&
  randKeys.some((k) => afterRandom[k] !== beforeRandom[k]) && afterRandom.handleColor !== 'custom' && afterRandom.railColor !== 'custom'
  && (await styleOf()) === `${afterRandom.handle}/${afterRandom.frame}`, JSON.stringify(afterRandom));
await pop.evaluate(() => chrome.storage.sync.set({ frameColored: false }));
await pop.evaluate(() => chrome.storage.sync.set({ handleColor: 'green', railColor: 'red' }));
await pop.locator('#rail-hidden').click();
await pop.locator('#handle-hidden').click();
await dark.page.waitForTimeout(300);
colors = await colorsOf();
check('popup: Hide switches hide the rail and the handle graphic', !colors.railVisible && !colors.barVisible, JSON.stringify(colors));
const widthBefore = (await layout(dark.page)).issue.container.width;
await dragHandle(dark.page, 60);
check('hidden handle: still grabbable', (await layout(dark.page)).issue.container.width > widthBefore);
await open(dark.page, `${REPO}/pull/2`);
colors = await colorsOf();
const firstPaint = await dark.page.evaluate(() => document.documentElement.style.getPropertyValue('--gwh-handle-fg'));
check('colors: persist across navigation', colors.bar === 'rgb(63, 185, 80)' && !colors.railVisible && !colors.barVisible && /success/.test(firstPaint), firstPaint);

// Custom color picker: live preview while dragging, saved to sync when settled.
await pop.locator('#handle-hidden').click();
await pop.locator('#handle-colors [data-id="custom"]').click();
check('custom: opens the picker', await pop.locator('#picker').isVisible());
const sv = await pop.locator('.sv').boundingBox();
await pop.mouse.move(sv.x + 2, sv.y + 2);
await pop.mouse.down();
await pop.mouse.move(sv.x + sv.width - 1, sv.y + 1, { steps: 4 });
await dark.page.waitForTimeout(150);
const midDrag = (await colorsOf()).bar;
await pop.mouse.up();
check('custom: page updates live while dragging', midDrag !== 'rgb(63, 185, 80)', midDrag);
await pop.locator('.hex').fill('#ff8800');
await pop.locator('.alpha').fill('50');
await pop.locator('.alpha').dispatchEvent('change');
await dark.page.waitForTimeout(500);
let synced = await getStorage(dark.context, dark.extId);
check('custom: hex and alpha apply to the page and save', (await colorsOf()).bar === 'rgba(255, 136, 0, 0.5)' && synced.handleCustom === '#ff880080'
  && synced.handleColor === 'custom', `${(await colorsOf()).bar} ${synced.handleCustom}`);
await pop.keyboard.press('Escape');
check('custom: Escape closes the picker', !(await pop.locator('#picker').isVisible()));
await pop.locator('#rail-hidden').click();
await pop.locator('#rail-colors [data-id="custom"]').click();
await pop.locator('.hex').fill('#00ff0080');
await dark.page.waitForTimeout(100);
check('custom: a typed hex saves right away (not lost if the popup closes)', (await getStorage(dark.context, dark.extId)).railCustom === '#00ff0080');
await dark.page.waitForTimeout(400);
check('custom: rail takes the custom color', /rgba\(0, 255, 0, 0\.5/.test((await colorsOf()).railImage), (await colorsOf()).railImage);
await pop.locator('.picker-done').click();

// v1.0's "Knob" style migrates to a 2×4 grip in a rounded frame.
await pop.evaluate(() => chrome.storage.sync.set({ handle: 'knob' }));
await open(dark.page, `${REPO}/pull/2`);
await dark.page.waitForTimeout(300);
synced = await getStorage(dark.context, dark.extId);
check('migration: Knob becomes Grip (2×4) + Rounded frame', (await styleOf()) === 'grip-2x4/rounded' && synced.handle === 'grip-2x4' && synced.frame === 'rounded',
  `${await styleOf()} ${JSON.stringify(synced)}`);

check('popup: Reset all is enabled when anything differs from the defaults', !(await pop.locator('#reset-all').isDisabled()));
const widthBeforeReset = (await getStorage(dark.context, dark.extId)).width;
await pop.locator('#reset-all').click();
await dark.page.waitForTimeout(800);
const afterReset = await getStorage(dark.context, dark.extId);
colors = await colorsOf();
check('popup: Reset all restores every style default, keeps the width, and updates the page', afterReset.width === widthBeforeReset && afterReset.position === 'dynamic'
  && afterReset.handle === 'grip-2x4' && afterReset.frame === 'well' && afterReset.frameColored === false && afterReset.handleColor === 'gray' && afterReset.railColor === 'blue'
  && !afterReset.handleHidden && !afterReset.railHidden && colors.barVisible && colors.railVisible
  && (await pop.locator('#reset-all').isDisabled()) && Number.isFinite(widthBeforeReset) && (await layout(dark.page)).sized, JSON.stringify(afterReset));

// ---------- Looks gallery ----------
const popHeight = () => pop.evaluate(() => document.body.offsetHeight);
const tabOpen = () => pop.evaluate(() => document.documentElement.dataset.tab);
await pop.evaluate(() => localStorage.removeItem('gwh-tab'));
await pop.reload();
await pop.waitForTimeout(300);
check('tabs: Looks gallery is the first tab and opens by default', (await tabOpen()) === 'looks'
  && (await pop.locator('.tab').evaluateAll((t) => t.map((x) => x.dataset.tab).join())) === 'looks,customize'
  && (await pop.locator('#tab-looks').getAttribute('aria-selected')) === 'true' && (await pop.locator('#looks').isVisible())
  && !(await pop.locator('#handles').isVisible()) && (await pop.locator('#positions').isVisible()));
const heightLooks = await popHeight();
await pop.locator('#tab-customize').click();
const heightCustomize = await popHeight();
check('tabs: Customize swaps the gallery for the style settings and keeps the popup height', (await tabOpen()) === 'customize'
  && (await pop.locator('#handles').isVisible()) && !(await pop.locator('#looks').isVisible())
  && heightLooks === heightCustomize && heightCustomize <= 600, `${heightLooks} → ${heightCustomize}`);
await pop.locator('#tab-looks').click();
const lookIds = () => pop.locator('#looks .look').evaluateAll((b) => b.map((x) => x.dataset.id));
const checkedLook = () => pop.locator('#looks .look[aria-checked="true"]').getAttribute('data-id').catch(() => null);
check('looks: 7 built-in looks plus Save look, defaults match Classic', String(await lookIds()) === 'classic,highlighter,grape,terminal,mono,ember,stealth,new'
  && (await checkedLook()) === 'classic' && (await pop.locator('#look-name').textContent()) === 'Classic'
  && (await pop.locator('[data-id="new"]').isDisabled()));
await pop.locator('#looks [data-id="ember"]').click();
await dark.page.waitForTimeout(400);
st = await getStorage(dark.context, dark.extId);
check('looks: picking a look applies it to the page and keeps the width', (await styleOf()) === 'dots-353/rounded' && st.frameColored === true
  && st.handleColor === 'orange' && st.railColor === 'orange' && st.width === widthBeforeReset && (await checkedLook()) === 'ember', JSON.stringify(st));
await pop.locator('#looks [data-id="stealth"]').click();
await dark.page.waitForTimeout(400);
colors = await colorsOf();
check('looks: Stealth hides the handle and rail', !colors.barVisible && !colors.railVisible && (await checkedLook()) === 'stealth');
await pop.locator('#looks [data-id="classic"]').focus();
await pop.keyboard.press('ArrowRight');
await dark.page.waitForTimeout(300);
check('looks: arrow keys move between looks and apply them', (await checkedLook()) === 'highlighter'
  && (await pop.evaluate(() => document.activeElement.dataset.id)) === 'highlighter' && (await styleOf()) === 'pill/none');
await pop.evaluate(() => chrome.storage.sync.set({ handle: 'cursor', railColor: 'custom', railCustom: '#ff00ff80' }));
await pop.waitForTimeout(300);
check('looks: settings that match no look show as Unsaved and can be saved', (await checkedLook()) === null
  && (await pop.locator('#look-name').textContent()) === 'Unsaved' && !(await pop.locator('[data-id="new"]').isDisabled()));
await pop.locator('[data-id="new"]').click();
await pop.locator('.look-new.naming input').fill('Neon');
await pop.keyboard.press('Escape');
check('looks: Escape cancels naming', !(await getStorage(dark.context, dark.extId)).looks && (await pop.locator('[data-id="new"]').isVisible()));
await pop.locator('[data-id="new"]').click();
await pop.locator('.look-new.naming input').fill('  Neon  ');
await pop.keyboard.press('Enter');
await pop.waitForTimeout(300);
st = await getStorage(dark.context, dark.extId);
const neon = st.looks && st.looks[0];
check('looks: Save look stores a named look with the style settings only', st.looks.length === 1 && neon.name === 'Neon' && neon.values.handle === 'cursor'
  && neon.values.railCustom === '#ff00ff80' && !('width' in neon.values) && !('position' in neon.values)
  && (await checkedLook()) === neon.id && (await pop.locator('#look-name').textContent()) === 'Neon' && (await pop.locator('[data-id="new"]').isDisabled()), JSON.stringify(st.looks));
await pop.reload();
await pop.waitForTimeout(300);
check('tabs: the open tab and saved looks persist across popup opens', (await tabOpen()) === 'looks' && (await pop.locator('#looks').isVisible())
  && (await checkedLook()) === neon.id);
await pop.locator('#looks [data-id="classic"]').click();
await pop.waitForTimeout(200);
await pop.locator(`#looks [data-id="${neon.id}"]`).click();
await dark.page.waitForTimeout(400);
check('looks: a saved look applies like a built-in one', (await styleOf()) === 'cursor/none' && /255, 0, 255/.test((await colorsOf()).railImage), (await colorsOf()).railImage);
await pop.evaluate((list) => chrome.storage.sync.set({ looks: list }), [neon, ...Array.from({ length: 6 }, (_, i) => ({ id: `look-t${i}`, name: `Test ${i}`, values: { handle: 'dash', frame: ['none', 'dashed', 'square', 'rounded', 'pill', 'filled'][i] } }))]);
await pop.waitForTimeout(300);
const scroll = await pop.locator('#looks').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
check('looks: more than 8 tiles scroll inside the gallery; the popup keeps its height', scroll.sh > scroll.ch && (await popHeight()) === heightCustomize,
  `${JSON.stringify(scroll)} ${await popHeight()}`);
await pop.locator(`#looks [data-id="${neon.id}"]`).hover();
await pop.locator(`[data-id="delete-${neon.id}"]`).click();
await pop.waitForTimeout(300);
st = await getStorage(dark.context, dark.extId);
check('looks: × deletes a saved look', st.looks.length === 6 && !st.looks.some((l) => l.id === neon.id)
  && (await pop.locator(`#looks [data-id="${neon.id}"]`).count()) === 0 && (await pop.locator('#look-name').textContent()) === 'Unsaved');
await pop.locator('#reset-all').click();
await pop.waitForTimeout(300);
check('looks: Reset all keeps saved looks', (await getStorage(dark.context, dark.extId)).looks.length === 6 && (await checkedLook()) === 'classic');
await pop.evaluate(() => chrome.storage.sync.remove('looks'));
await pop.locator('#tab-customize').click();
await pop.close();
await dark.context.close();

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
