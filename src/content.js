(() => {
  'use strict';

  const CACHE_KEY = 'gwh:v1';
  const { HANDLES, DEFAULTS, normalize, colorVars } = globalThis.GWH;
  // Positions: middle = always centered in the viewport; top = beside the first comment;
  // dynamic = beside the first comment, then centered once that scrolls away.
  const ANIM_MS = 500;
  const MOVE_MS = 180;
  const DOCK_TOP = 72; // Below GitHub's sticky headers.
  const KEY_STEP = 40;
  const MIN_GROWTH = 24; // Hide the handle when there is no room to widen.
  const TRACK_GAP = 6; // Space between the rail and the handle/reset group.
  const root = document.documentElement;

  const PAGES = [
    {
      id: 'issue',
      path: /^\/[^/]+\/[^/]+\/issues\/\d+\/?$/,
      container: '[class*="issueViewerContainer"] [class*="contentContainer__"]',
      main: '[data-testid="issue-viewer-issue-container"], [class*="contentArea__"]',
      side: '[data-testid="issue-viewer-metadata-pane"]',
      sideText: '[data-testid="issue-viewer-metadata-pane"] h3',
      anchor: '[data-testid="issue-body"]',
    },
    {
      id: 'pr',
      path: /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/,
      container: '#diff-comparison-viewer-container',
      main: '.js-pull-discussion-timeline',
      side: '#pr-conversation-sidebar',
      sideText: '#pr-conversation-sidebar .discussion-sidebar-heading',
      anchor: '.js-command-palette-pull-body .timeline-comment-header, .js-pull-discussion-timeline .timeline-comment-header',
    },
    {
      id: 'pr-commits',
      path: /^\/[^/]+\/[^/]+\/pull\/\d+\/commits\/?$/,
      container: '#diff-comparison-viewer-container',
      main: '[data-testid="commits-list"]',
      side: null,
      // The first bordered box of commits, below its "Commits on <date>" heading.
      anchor: '[data-testid="commits-list"] [data-testid="commit-group-title"] + *',
    },
    {
      id: 'discussion',
      path: /^\/[^/]+\/[^/]+\/discussions\/\d+\/?$/,
      container: '.new-discussion-timeline',
      main: '#discussion_bucket > .col-md-9',
      side: '#partial-discussion-sidebar',
      sideText: '#partial-discussion-sidebar .discussion-sidebar-heading',
      anchor: '.discussion-timeline-item',
    },
  ];

  let state = readCache();
  let page = null;
  let lastPath = null;
  let ui = null;
  let handle = null;
  let bar = null;
  let resetBtn = null;
  let track = null;
  let docked = null;
  let dragging = null;
  let animTimer = 0;
  let animUntil = 0;
  let moveTimer = 0;
  let moveUntil = 0;
  let saveTimer = 0;
  let rafId = 0;
  let endCache = null;
  let resizeObserver = null;
  let observedContainer = null;
  const defaultCache = new Map();

  // ---------- storage ----------

  function readCache() {
    try {
      return normalize({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') });
    } catch {
      return { ...DEFAULTS };
    }
  }

  function writeCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }

  function extensionAlive() {
    try {
      return Boolean(chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function persist() {
    writeCache();
    if (!extensionAlive()) return;
    chrome.storage.sync.set({ width: state.width }).catch(() => {});
  }

  // ---------- route + root attributes ----------

  function matchPage() {
    return PAGES.find((p) => p.path.test(location.pathname)) || null;
  }

  function setWidthVar(px) {
    root.style.setProperty('--gwh-width', `${Math.round(px)}px`);
    root.setAttribute('data-gwh-sized', '');
  }

  function clearWidthVar() {
    root.style.removeProperty('--gwh-width');
    root.removeAttribute('data-gwh-sized');
  }

  // Handle and rail colors as root variables (read by content.css), so they apply before paint.
  function applyColors() {
    for (const [name, value] of Object.entries(colorVars(state))) {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    }
    root.toggleAttribute('data-gwh-handle-hidden', state.handleHidden);
    root.toggleAttribute('data-gwh-rail-hidden', state.railHidden);
    root.toggleAttribute('data-gwh-frame-colored', state.frameColored);
  }

  function applyRoot() {
    page = state.enabled ? matchPage() : null;
    if (page) root.setAttribute('data-gwh-page', page.id);
    else root.removeAttribute('data-gwh-page');

    if (page && state.width) setWidthVar(state.width);
    else if (!isAnimating()) clearWidthVar();
  }

  function checkRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    endCache = null;
    applyRoot();
    schedule();
  }

  // ---------- DOM helpers ----------

  function q(sel) {
    return sel ? document.querySelector(sel) : null;
  }

  function rendered(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function getContainer() {
    const main = q(page && page.main);
    if (!main) return null;
    const containers = document.querySelectorAll(page.container);
    for (const c of containers) if (c.contains(main)) return c;
    return null;
  }

  function contentRight(el) {
    const r = el.getBoundingClientRect();
    return r.right - parseFloat(getComputedStyle(el).paddingRight || 0);
  }

  function contentLeft(el) {
    const r = el.getBoundingClientRect();
    return r.left + parseFloat(getComputedStyle(el).paddingLeft || 0);
  }

  // Left edge of the rendered text itself, ignoring any padding/indent on the heading.
  function textLeft(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width > 0 ? r.left : contentLeft(el);
  }

  function renderHandleStyle() {
    if (!bar) return;
    const def = HANDLES.find((h) => h.id === state.handle) || HANDLES.find((h) => h.id === DEFAULTS.handle);
    bar.dataset.frame = state.frame;
    if (!def || bar.dataset.style === def.id) return;
    bar.dataset.style = def.id;
    bar.innerHTML = def.svg;
  }

  // Where the rail should stop: the lowest thing actually painted in the main column (e.g. the
  // composer's Comment button), not the column box, which can be stretched or padded below it.
  // Cached in document coordinates; invalidated when the container resizes or the page changes.
  function contentEnd(main) {
    const now = performance.now();
    if (!endCache || endCache.main !== main || now - endCache.at > 1000) {
      const bottom = paintedBottom(main, -Infinity, 40);
      endCache = { main, at: now, doc: Number.isFinite(bottom) ? bottom + window.scrollY : null };
    }
    return endCache.doc == null ? main.getBoundingClientRect().bottom : endCache.doc - window.scrollY;
  }

  const SOLID_TAGS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'SVG', 'svg', 'VIDEO', 'CANVAS']);

  function paints(el, cs) {
    if (SOLID_TAGS.has(el.tagName)) return true;
    if (cs.boxShadow !== 'none') return true;
    if (!/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor) || cs.backgroundImage !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((side) =>
      parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none'
      && !/^(transparent|rgba\(.*,\s*0\))$/.test(cs[`border${side}Color`]));
  }

  // Lowest painted edge inside `el`, walking children last-to-first and skipping anything above `best`.
  function paintedBottom(el, best, depth) {
    for (let node = el.lastChild; node; node = node.previousSibling) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.data.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const r = range.getBoundingClientRect();
        if (r.height > 0) best = Math.max(best, r.bottom);
        continue;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const r = node.getBoundingClientRect();
      const box = r.width > 1 && r.height > 1;
      if (box && r.bottom <= best) continue;
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      if (box && paints(node, cs)) {
        best = Math.max(best, r.bottom);
      } else if (depth > 0) {
        best = paintedBottom(node, best, depth - 1);
      }
    }
    return best;
  }

  // Bottom edge of any fixed/sticky header bar pinned to the top of the viewport.
  function topChromeBottom(xs) {
    let bottom = 0;
    for (const x of xs) {
      for (const el of document.elementsFromPoint(x, 1)) {
        if (el === root || el === document.body || (ui && ui.contains(el))) continue;
        const pos = getComputedStyle(el).position;
        if (pos !== 'fixed' && pos !== 'sticky') continue;
        const r = el.getBoundingClientRect();
        if (r.top <= 1 && r.height < window.innerHeight / 3) bottom = Math.max(bottom, r.bottom);
      }
    }
    return bottom;
  }

  // GitHub's natural container width, measured with our override briefly removed.
  function measureDefault(container) {
    const key = `${page.id}:${root.clientWidth}`;
    if (defaultCache.has(key)) return defaultCache.get(key);
    let width;
    if (root.hasAttribute('data-gwh-sized')) {
      const animate = root.hasAttribute('data-gwh-animate');
      root.removeAttribute('data-gwh-animate');
      root.removeAttribute('data-gwh-sized');
      width = container.getBoundingClientRect().width;
      root.setAttribute('data-gwh-sized', '');
      container.getBoundingClientRect(); // Flush so the restored width is the transition start point.
      if (animate) root.setAttribute('data-gwh-animate', '');
    } else {
      width = container.getBoundingClientRect().width;
    }
    defaultCache.set(key, width);
    return width;
  }

  function maxWidth() {
    return root.clientWidth;
  }

  // ---------- animation ----------

  function isAnimating() {
    return performance.now() < animUntil;
  }

  function animateTo(width) {
    const container = page && getContainer();
    clearTimeout(animTimer);

    if (!container || !rendered(container)) {
      root.removeAttribute('data-gwh-animate');
      animUntil = 0;
      state.width = width;
      applyRoot();
      schedule();
      return;
    }

    if (width == null) {
      const target = measureDefault(container);
      root.setAttribute('data-gwh-animate', '');
      setWidthVar(target);
    } else {
      if (!root.hasAttribute('data-gwh-sized')) {
        // Start the transition from GitHub's default width.
        setWidthVar(measureDefault(container));
        container.getBoundingClientRect();
      }
      root.setAttribute('data-gwh-animate', '');
      setWidthVar(width);
    }
    state.width = width;
    animUntil = performance.now() + ANIM_MS;
    trackDuringAnimation();

    animTimer = setTimeout(() => {
      animUntil = 0;
      root.removeAttribute('data-gwh-animate');
      applyRoot();
      schedule();
    }, ANIM_MS + 30);
  }

  function trackDuringAnimation() {
    const step = () => {
      update();
      if (isAnimating()) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------- UI ----------

  function buildUI() {
    if (ui) return;
    ui = document.createElement('div');
    ui.className = 'gwh-ui';
    ui.hidden = true;

    handle = document.createElement('div');
    handle.className = 'gwh-handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize content width');
    handle.setAttribute('data-gwh-tip', 'Drag to resize');
    bar = document.createElement('span');
    bar.className = 'gwh-bar gwh-frame';
    renderHandleStyle();
    handle.append(bar);

    resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'gwh-reset';
    resetBtn.hidden = true;
    resetBtn.setAttribute('aria-label', 'Reset content width');
    resetBtn.setAttribute('data-gwh-tip', 'Reset width');
    resetBtn.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>';

    // Two rail segments (above and below the handle) so each keeps its own rounded ends.
    track = ['above', 'below'].map((pos) => {
      const seg = document.createElement('div');
      seg.className = 'gwh-track';
      seg.dataset.pos = pos;
      seg.setAttribute('aria-hidden', 'true');
      seg.hidden = true;
      return seg;
    });

    ui.append(handle, resetBtn, ...track);
    // Lives outside <body> so Turbo body swaps don't remove it.
    root.append(ui);

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('keydown', onKeyDown);
    resetBtn.addEventListener('click', () => {
      animateTo(null);
      persist();
      handle.focus({ preventScroll: true });
    });
  }

  function hideUI() {
    if (ui) ui.hidden = true;
    docked = null;
  }

  function observeContainer(container) {
    if (observedContainer === container) return;
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        endCache = null;
        schedule();
      });
    }
    if (observedContainer) resizeObserver.unobserve(observedContainer);
    observedContainer = container;
    if (container) resizeObserver.observe(container);
  }

  function update() {
    rafId = 0;
    if (!page || !state.enabled || !document.body) return hideUI();

    const container = getContainer();
    const main = q(page.main);
    observeContainer(container);
    if (!rendered(container) || !rendered(main)) return hideUI();

    const side = q(page.side);
    const mainRight = contentRight(main);
    let x;
    if (rendered(side)) {
      const sideText = q(page.sideText);
      const sideLeft = rendered(sideText) && side.contains(sideText) ? textLeft(sideText) : contentLeft(side);
      // Sidebar stacked below the content (narrow layouts): nothing to resize against.
      if (sideLeft < mainRight - 1) return hideUI();
      x = (mainRight + sideLeft) / 2;
    } else {
      x = mainRight + Math.max(8, parseFloat(getComputedStyle(container).paddingRight || 0) / 2);
    }

    const hasCustom = Boolean(state.width);
    if (!hasCustom && !dragging && !isAnimating() && maxWidth() - measureDefault(container) < MIN_GROWTH) {
      return hideUI();
    }

    buildUI();
    resetBtn.hidden = !hasCustom && !dragging;
    ui.hidden = false;

    const groupH = ui.offsetHeight;
    const vh = window.innerHeight;
    const anchor = q(page.anchor) || main;
    // Line up the visible frame (not its taller hit area) with the top of the first comment.
    const barInset = bar.getBoundingClientRect().top - ui.getBoundingClientRect().top;
    const anchorTop = anchor.getBoundingClientRect().top;
    const alignedTop = anchorTop - barInset;
    const containerBottom = container.getBoundingClientRect().bottom;
    const chromeBottom = topChromeBottom([x, root.clientWidth / 2]);
    const dockTop = Math.max(DOCK_TOP, chromeBottom + 8);

    const centered = Math.min(vh / 2 - groupH / 2, containerBottom - groupH);
    let nextDocked;
    let visualTop;
    if (state.position === 'middle') {
      // Never above the first comment, so it doesn't float beside the page header.
      nextDocked = true;
      visualTop = Math.min(Math.max(vh / 2 - groupH / 2, alignedTop, dockTop), Math.min(containerBottom, contentEnd(main)) - groupH);
    } else if (state.position === 'top' || (anchorTop >= dockTop && anchorTop <= vh - groupH - 8)) {
      nextDocked = false;
      visualTop = alignedTop;
    } else {
      nextDocked = true;
      visualTop = centered;
    }
    const visualLeft = Math.round(x - ui.offsetWidth / 2);

    if (docked !== null && nextDocked !== docked) {
      // Slide between anchored and docked spots in fixed coordinates, starting where it is now.
      const from = ui.getBoundingClientRect().top;
      ui.classList.remove('gwh-moving');
      ui.style.position = 'fixed';
      ui.style.left = `${visualLeft}px`;
      ui.style.top = `${Math.round(from)}px`;
      void ui.offsetHeight;
      ui.classList.add('gwh-moving');
      moveUntil = performance.now() + MOVE_MS;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        moveUntil = 0;
        if (ui) ui.classList.remove('gwh-moving');
        schedule();
      }, MOVE_MS + 20);
    }
    docked = nextDocked;

    if (performance.now() < moveUntil || docked) {
      ui.style.position = 'fixed';
      ui.style.left = `${visualLeft}px`;
      ui.style.top = `${Math.round(visualTop)}px`;
    } else {
      // Anchored: document coordinates so it scrolls natively with the page.
      ui.style.position = 'absolute';
      ui.style.left = `${visualLeft + Math.round(window.scrollX)}px`;
      ui.style.top = `${Math.round(visualTop + window.scrollY)}px`;
    }
    ui.style.opacity = containerBottom < groupH + 8 ? '0' : '';
    layoutTrack(visualTop, groupH, anchorTop, contentEnd(main), vh, chromeBottom);

    const current = Math.round(container.getBoundingClientRect().width);
    handle.setAttribute('aria-valuenow', String(current));
    handle.setAttribute('aria-valuemin', String(Math.round(measureDefault(container))));
    handle.setAttribute('aria-valuemax', String(maxWidth()));
  }

  // Rail behind the handle, positioned relative to the handle group (all inputs in viewport px).
  // `viewTop` is the bottom of any pinned header; the rail never draws above it.
  // Each segment is strongest beside the handle and fades out toward the viewport edge.
  function layoutTrack(groupTop, groupH, contentTop, contentBottom, vh, viewTop) {
    const [above, below] = track;
    const groupBottom = groupTop + groupH + TRACK_GAP;
    const belowTop = Math.max(groupBottom, viewTop);
    const belowBottom = docked ? Math.min(contentBottom, vh + TRACK_GAP) : contentBottom;
    placeSegment(below, groupTop, belowTop, belowBottom,
      `linear-gradient(to bottom, var(--gwh-track-peak) 0px, var(--gwh-track-end) ${Math.max(40, vh - belowTop)}px)`);

    if (!docked) {
      above.hidden = true;
      return;
    }
    const aboveTop = Math.max(contentTop, viewTop);
    const aboveBottom = groupTop - TRACK_GAP;
    placeSegment(above, groupTop, aboveTop, aboveBottom,
      `linear-gradient(to top, var(--gwh-track-peak) 0px, var(--gwh-track-end) ${Math.max(40, aboveBottom - viewTop)}px)`);
  }

  function placeSegment(seg, groupTop, top, bottom, bg) {
    const height = bottom - top;
    if (height < 8) {
      seg.hidden = true;
      return;
    }
    seg.hidden = false;
    seg.style.top = `${Math.round(top - groupTop)}px`;
    seg.style.height = `${Math.round(height)}px`;
    seg.style.backgroundImage = bg;
  }

  function schedule() {
    if (!rafId) rafId = requestAnimationFrame(update);
  }

  // ---------- interaction ----------

  function setLiveWidth(width, defaultWidth) {
    if (width <= defaultWidth + 1) {
      state.width = null;
      clearWidthVar();
    } else {
      state.width = Math.round(width);
      setWidthVar(state.width);
    }
    update();
  }

  function onPointerDown(e) {
    if (e.button !== 0 || !page) return;
    const container = getContainer();
    if (!container) return;
    e.preventDefault();
    clearTimeout(animTimer);
    animUntil = 0;
    root.removeAttribute('data-gwh-animate');

    const defaultWidth = measureDefault(container);
    dragging = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: container.getBoundingClientRect().width,
      defaultWidth,
      max: Math.max(defaultWidth, maxWidth()),
    };
    handle.setPointerCapture(e.pointerId);
    root.setAttribute('data-gwh-dragging', '');
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    // Symmetric growth: the right edge follows the pointer, the left edge mirrors it.
    const width = dragging.startWidth + 2 * (e.clientX - dragging.startX);
    setLiveWidth(Math.min(dragging.max, Math.max(dragging.defaultWidth, width)), dragging.defaultWidth);
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    dragging = null;
    if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    root.removeAttribute('data-gwh-dragging');
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
    persist();
    update();
  }

  function onKeyDown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const container = page && getContainer();
    if (!container) return;
    e.preventDefault();
    const defaultWidth = measureDefault(container);
    const step = (e.shiftKey ? 4 : 1) * KEY_STEP * (e.key === 'ArrowRight' ? 1 : -1);
    const current = state.width || container.getBoundingClientRect().width;
    const width = Math.min(Math.max(defaultWidth, maxWidth()), Math.max(defaultWidth, current + step));
    setLiveWidth(width, defaultWidth);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 300);
  }

  // ---------- sync with extension storage ----------

  function applyRemote(next) {
    const enabledChanged = next.enabled !== state.enabled;
    const widthChanged = next.width !== state.width;
    if (next.handle !== state.handle || next.frame !== state.frame) {
      state.handle = next.handle;
      state.frame = next.frame;
      renderHandleStyle();
      writeCache();
      schedule();
    }
    if (next.position !== state.position) {
      state.position = next.position;
      writeCache();
      schedule();
    }
    const colorKeys = ['frameColored', 'handleColor', 'handleCustom', 'handleHidden', 'railColor', 'railCustom', 'railHidden'];
    if (colorKeys.some((key) => next[key] !== state[key])) {
      for (const key of colorKeys) state[key] = next[key];
      applyColors();
      writeCache();
    }
    if (!enabledChanged && !widthChanged) return;

    if (enabledChanged) {
      state.enabled = next.enabled;
      if (!state.enabled) {
        state.width = next.width;
        clearTimeout(animTimer);
        animUntil = 0;
        root.removeAttribute('data-gwh-animate');
        applyRoot();
        hideUI();
        writeCache();
        return;
      }
      applyRoot();
    }

    if (widthChanged && !dragging) {
      page = state.enabled ? matchPage() : null;
      if (page) animateTo(next.width);
      else state.width = next.width;
    }
    writeCache();
    schedule();
  }

  function initStorage() {
    if (!extensionAlive()) return;
    chrome.storage.sync
      .get(DEFAULTS)
      .then((stored) => {
        const next = normalize(stored);
        // Write back settings migrated from older versions (e.g. the v1.0 "Knob" style).
        if (stored.handle !== next.handle) chrome.storage.sync.set({ handle: next.handle, frame: next.frame }).catch(() => {});
        applyRemote(next);
      })
      .catch(() => {});

    chrome.storage.onChanged.addListener((changes, area) => {
      // `local.live` carries live previews from the popup's color picker; `sync` the saved settings.
      const updates = area === 'sync'
        ? Object.fromEntries(Object.entries(changes).map(([key, { newValue }]) => [key, newValue]))
        : area === 'local' && changes.live ? changes.live.newValue || {} : null;
      if (updates) applyRemote(normalize({ ...state, ...updates }));
    });
  }

  // ---------- boot ----------

  // Runs at document_start: apply the cached width before GitHub paints anything.
  lastPath = location.pathname;
  applyColors();
  applyRoot();
  initStorage();

  // MutationObserver callbacks run before paint, so soft navigations pick up
  // the right attributes before the new page is drawn.
  new MutationObserver(() => {
    checkRoute();
    if (page) schedule();
  }).observe(root, { childList: true, subtree: true });

  for (const type of ['turbo:load', 'turbo:render', 'popstate', 'pageshow']) {
    window.addEventListener(type, () => {
      checkRoute();
      schedule();
    });
  }
  document.addEventListener('turbo:load', () => {
    checkRoute();
    schedule();
  });
  // GitHub reveals its sticky header a beat after scrolling; re-measure once things settle.
  let scrollEndTimer = 0;
  window.addEventListener('scroll', () => {
    schedule();
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(schedule, 150);
  }, { passive: true });
  window.addEventListener('resize', () => {
    defaultCache.clear();
    schedule();
  });
  document.addEventListener('DOMContentLoaded', schedule);
})();
