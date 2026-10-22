// Shared helpers for driving the unpacked extension in Chromium via Playwright.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXT_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = 'https://github.com/roperev/github-width-handle';

export async function launch({ width = 2400, height = 1200, colorScheme = 'light', headless = true, deviceScaleFactor = 1 } = {}) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless,
    viewport: { width, height },
    colorScheme,
    deviceScaleFactor,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('chrome://extensions');
  const extId = await page.evaluate(async () => {
    const list = await chrome.developerPrivate.getExtensionsInfo();
    return list.find((e) => e.name === 'GitHub Width Handle').id;
  });
  return { context, page, extId };
}

export async function setStorage(context, extId, values) {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extId}/src/popup.html`);
  await p.evaluate((v) => chrome.storage.sync.set(v), values);
  await p.close();
}

export async function getStorage(context, extId) {
  const p = await context.newPage();
  await p.goto(`chrome-extension://${extId}/src/popup.html`);
  const v = await p.evaluate(() => chrome.storage.sync.get(null));
  await p.close();
  return v;
}

export async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  await page.waitForTimeout(1200);
}

// Layout snapshot of the elements that matter for each page type.
export async function layout(page) {
  return page.evaluate(() => {
    const rect = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
    };
    const ui = document.querySelector('.gwh-ui');
    const html = document.documentElement;
    return {
      page: html.getAttribute('data-gwh-page'),
      sized: html.hasAttribute('data-gwh-sized'),
      widthVar: html.style.getPropertyValue('--gwh-width'),
      ui: ui && !ui.hidden ? { ...rect('.gwh-ui'), position: ui.style.position } : null,
      reset: !!(ui && !ui.hidden && !ui.querySelector('.gwh-reset').hidden),
      clientWidth: html.clientWidth,
      issue: {
        container: (() => {
          const main = document.querySelector('[data-testid="issue-viewer-issue-container"]');
          const c = main && [...document.querySelectorAll('[class*="issueViewerContainer"] [class*="contentContainer__"]')].find((el) => el.contains(main));
          if (!c) return null;
          const r = c.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) };
        })(),
        main: rect('[data-testid="issue-viewer-issue-container"]'),
        side: rect('[data-testid="issue-viewer-metadata-pane"]'),
        header: rect('[data-testid="issue-header"]'),
      },
      pr: {
        container: rect('#diff-comparison-viewer-container'),
        main: rect('.js-pull-discussion-timeline'),
        side: rect('#pr-conversation-sidebar'),
        tabs: rect('#diff-comparison-viewer-container [class*="TabNav"]'),
        commits: rect('[data-testid="commits-list"]'),
        checks: rect('.container-lg.p-responsive'),
      },
      discussion: {
        container: rect('.new-discussion-timeline'),
        main: rect('#discussion_bucket > .col-md-9'),
        side: rect('#partial-discussion-sidebar'),
      },
    };
  });
}

export async function dragHandle(page, dx, { steps = 20 } = {}) {
  const box = await page.locator('.gwh-handle').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
