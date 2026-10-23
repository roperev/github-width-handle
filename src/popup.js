const { HANDLES, FRAMES, HANDLE_COLORS, RAIL_COLORS, DEFAULTS, REPO_KEYS, normalize, normalizeHex, repoKey, settingsFor } = globalThis.GWH;
const POSITIONS = [
  { id: 'middle', name: 'Middle', tip: 'Always centered in the window' },
  { id: 'top', name: 'Top', tip: 'Beside the first comment, scrolls with the page' },
  { id: 'dynamic', name: 'Dynamic', tip: 'Starts beside the first comment, moves to the middle as you scroll' },
];
const $ = (id) => document.getElementById(id);
const enabledEl = $('enabled');
const widthEl = $('width');
const resetEl = $('reset');
const resetAllEl = $('reset-all');
const hideToggles = { handleHidden: $('handle-hidden'), railHidden: $('rail-hidden') };
const frameColoredEl = $('frame-colored');
const glassEl = $('glass');
const repoRow = $('repo-row');
const repoOwnEl = $('repo-own');
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
let current = { ...DEFAULTS };
// Everything in storage: global settings plus `repo:owner/name` entries.
let stored = {};
// The current tab's repo ({ repo, label }), or null when it isn't on a GitHub repo.
let tabRepo = null;
// "Reset all" covers the handle's look and behavior; width has its own Reset and the popup theme is left alone.
const { width: _width, glass: _glass, ...STYLE_DEFAULTS } = DEFAULTS;

// Where edits go: the current repo's own settings if it has them, otherwise global (null).
function target() {
  const key = tabRepo && repoKey(tabRepo.repo);
  return key && stored[key] ? key : null;
}

function save(values) {
  const key = target();
  if (!key) return chrome.storage.sync.set(values);
  const own = { ...stored[key] };
  const global = {};
  for (const [name, value] of Object.entries(values)) (REPO_KEYS.includes(name) ? own : global)[name] = value;
  // Kept locally right away so quick successive edits don't overwrite each other.
  stored[key] = own;
  return chrome.storage.sync.set({ ...global, [key]: own });
}

// A single-choice picker stored under `key`, with roving focus and arrow-key navigation.
function radioGroup({ container, nameEl, items, key, className, render, onPick }) {
  const choose = (item) => (onPick ? onPick(item) : save({ [key]: item.id }));
  const buttons = items.map((item, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.dataset.id = item.id;
    btn.title = item.tip || item.name;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', item.name);
    btn.innerHTML = render(item);
    btn.addEventListener('click', () => choose(item));
    btn.addEventListener('keydown', (e) => {
      const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!delta) return;
      e.preventDefault();
      const next = items[(i + delta + items.length) % items.length];
      if (next.custom) save({ [key]: next.id });
      else choose(next);
      container.querySelector(`[data-id="${next.id}"]`).focus();
    });
    container.append(btn);
    return btn;
  });

  return (values) => {
    const selected = items.find((item) => item.id === values[key]);
    for (const btn of buttons) {
      const on = btn.dataset.id === selected.id;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    if (nameEl) nameEl.textContent = selected.name;
  };
}

const swatchVars = (c) => `--sw-light: ${c.light}; --sw-dark: ${c.dark}`;
const colorSwatch = (shape) => (c) =>
  c.custom
    ? `<span class="swatch custom ${shape}"><span class="custom-fill"></span></span>`
    : `<span class="swatch ${shape}" style="${swatchVars(c)}"></span>`;

// ---------- custom color picker ----------

const picker = (() => {
  const el = $('picker');
  const sv = el.querySelector('.sv');
  const thumb = el.querySelector('.sv-thumb');
  const hue = el.querySelector('.hue');
  const alpha = el.querySelector('.alpha');
  const hex = el.querySelector('.hex');
  const alphaValue = el.querySelector('.alpha-value');
  const preview = el.querySelector('.picker-preview span');
  let key = null; // 'handleCustom' | 'railCustom'
  let anchor = null;
  let hsva = { h: 0, s: 0, v: 0, a: 1 };
  let saveTimer = 0;

  const toHex = (n) => Math.round(n).toString(16).padStart(2, '0');
  function hsvToRgb({ h, s, v }) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
    };
    return [f(5), f(3), f(1)];
  }
  function rgbToHsv(r, g, b) {
    [r, g, b] = [r / 255, g / 255, b / 255];
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  }
  const hsvaToHex = (c) => `#${hsvToRgb(c).map(toHex).join('')}${toHex(c.a * 255)}`;
  function hexToHsva(value) {
    const [r, g, b, a] = [1, 3, 5, 7].map((i) => parseInt(value.slice(i, i + 2), 16));
    return { ...rgbToHsv(r, g, b), a: a / 255 };
  }

  function paint({ fromHex = false } = {}) {
    const value = hsvaToHex(hsva);
    const [r, g, b] = hsvToRgb(hsva).map(Math.round);
    el.style.setProperty('--hue', `hsl(${hsva.h} 100% 50%)`);
    el.style.setProperty('--rgb', `${r}, ${g}, ${b}`);
    thumb.style.left = `${hsva.s * 100}%`;
    thumb.style.top = `${(1 - hsva.v) * 100}%`;
    hue.value = String(Math.round(hsva.h));
    alpha.value = String(Math.round(hsva.a * 100));
    alphaValue.textContent = `${Math.round(hsva.a * 100)}%`;
    preview.style.background = `rgba(${r}, ${g}, ${b}, ${hsva.a})`;
    if (!fromHex) hex.value = value;
    return value;
  }

  // Live preview goes through storage.local (no write quota); storage.sync is written once the
  // value settles, to stay within its per-minute write limit.
  function commit({ fromHex = false, now = false } = {}) {
    const value = paint({ fromHex });
    chrome.storage.local.set({ live: { scope: target(), values: { [key]: value } } });
    clearTimeout(saveTimer);
    saveTimer = 0;
    const store = () => save({ [key]: value });
    if (now) store();
    else saveTimer = setTimeout(() => { saveTimer = 0; store(); }, 300);
  }

  function dragSV(e) {
    const r = sv.getBoundingClientRect();
    hsva.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    hsva.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    commit();
  }
  sv.addEventListener('pointerdown', (e) => {
    sv.setPointerCapture(e.pointerId);
    dragSV(e);
    sv.addEventListener('pointermove', dragSV);
  });
  // Fires on release and on cancel, so the drag never sticks.
  sv.addEventListener('lostpointercapture', () => {
    sv.removeEventListener('pointermove', dragSV);
    commit({ now: true });
  });
  sv.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!d) return;
    e.preventDefault();
    hsva.s = Math.min(1, Math.max(0, hsva.s + d[0]));
    hsva.v = Math.min(1, Math.max(0, hsva.v + d[1]));
    commit();
  });
  sv.addEventListener('keyup', () => {
    if (saveTimer) commit({ now: true });
  });
  hue.addEventListener('input', () => {
    hsva.h = Number(hue.value);
    commit();
  });
  alpha.addEventListener('input', () => {
    hsva.a = Number(alpha.value) / 100;
    commit();
  });
  for (const slider of [hue, alpha]) slider.addEventListener('change', () => commit({ now: true }));
  hex.addEventListener('input', () => {
    const value = normalizeHex(hex.value, null);
    hex.classList.toggle('invalid', !value);
    if (!value) return;
    hsva = hexToHsva(value);
    // Typed values save right away, so closing the popup can't drop them.
    commit({ fromHex: true, now: true });
  });
  hex.addEventListener('blur', () => {
    hex.classList.remove('invalid');
    paint();
  });
  hex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') close();
  });
  el.querySelector('.picker-done').addEventListener('click', () => close());

  function open(forKey, anchorEl) {
    key = forKey;
    anchor = anchorEl;
    hsva = hexToHsva(current[key]);
    paint();
    el.hidden = false;
    // Below the swatches when there's room, otherwise above the row.
    const row = anchorEl.closest('.row');
    const below = anchorEl.getBoundingClientRect().bottom + 6;
    const fitsBelow = below + el.offsetHeight <= Math.max(document.documentElement.clientHeight, document.body.offsetHeight);
    el.style.top = `${fitsBelow ? below + window.scrollY : row.offsetTop - el.offsetHeight - 4}px`;
    sv.focus();
  }

  function close() {
    if (el.hidden) return;
    clearTimeout(saveTimer);
    if (key) save({ [key]: hsvaToHex(hsva) });
    el.hidden = true;
    const focusTo = anchor;
    key = anchor = null;
    if (focusTo) focusTo.focus();
  }

  document.addEventListener('pointerdown', (e) => {
    if (!el.hidden && !el.contains(e.target) && !e.target.closest('.swatch-option[data-id="custom"]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) {
      e.preventDefault();
      close();
    }
  });

  return { open, close, isOpenFor: (k) => !el.hidden && key === k };
})();

function colorPick(colorKey, customKey, containerId) {
  return (item) => {
    if (!item.custom) {
      picker.close();
      save({ [colorKey]: item.id });
      return;
    }
    if (picker.isOpenFor(customKey)) return picker.close();
    save({ [colorKey]: 'custom' });
    picker.open(customKey, $(containerId).querySelector('[data-id="custom"]'));
  };
}

// ---------- pickers ----------

const pickers = [
  radioGroup({
    container: $('positions'),
    items: POSITIONS,
    key: 'position',
    className: 'segment-option',
    render: (p) => p.name,
  }),
  radioGroup({
    container: $('handles'),
    nameEl: $('handle-name'),
    items: HANDLES,
    key: 'handle',
    className: 'handle-option',
    render: (h) => `<span class="preview${h.id === 'hairline' ? ' faint' : ''}">${h.svg}</span>`,
  }),
  radioGroup({
    container: $('frames'),
    nameEl: $('frame-name'),
    items: FRAMES,
    key: 'frame',
    className: 'handle-option frame-option',
    render: (f) => `<span class="preview gwh-frame" data-frame="${f.id}"></span>`,
  }),
  radioGroup({
    container: $('handle-colors'),
    nameEl: $('handle-color-name'),
    items: HANDLE_COLORS,
    key: 'handleColor',
    className: 'swatch-option',
    render: colorSwatch('dot'),
    onPick: colorPick('handleColor', 'handleCustom', 'handle-colors'),
  }),
  radioGroup({
    container: $('rail-colors'),
    nameEl: $('rail-color-name'),
    items: RAIL_COLORS,
    key: 'railColor',
    className: 'swatch-option',
    render: colorSwatch('rail'),
    onPick: colorPick('railColor', 'railCustom', 'rail-colors'),
  }),
];

// ---------- tabs ----------

const tabs = [...document.querySelectorAll('.tab')];
function showTab(name, { focus = false } = {}) {
  picker.close();
  document.documentElement.dataset.tab = name;
  localStorage.setItem('gwh-tab', name);
  for (const tab of tabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
}
for (const tab of tabs) {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    showTab(tabs[(tabs.indexOf(tab) + 1) % tabs.length].dataset.tab, { focus: true });
  });
}
showTab(document.documentElement.dataset.tab);

// ---------- looks gallery ----------
// A look is a named set of style values (no width or position). Built-in looks ship with the
// extension; saved looks live in storage.sync under `looks`, shared by every repo.

const LOOK_KEYS = ['handle', 'frame', 'frameColored', 'handleColor', 'handleCustom', 'handleHidden', 'railColor', 'railCustom', 'railHidden'];
const MAX_SAVED_LOOKS = 24;
const BUILT_IN_LOOKS = [
  { id: 'classic', name: 'Classic', values: {} },
  { id: 'highlighter', name: 'Highlighter', values: { handle: 'pill', frame: 'none', handleColor: 'yellow', railColor: 'yellow' } },
  { id: 'grape', name: 'Grape', values: { handle: 'arrows', frame: 'pill', frameColored: true, handleColor: 'custom', handleCustom: '#a371f7ff', railColor: 'custom', railCustom: '#a371f740' } },
  { id: 'terminal', name: 'Terminal', values: { handle: 'ridges', frame: 'raised', handleColor: 'green', railColor: 'green' } },
  { id: 'mono', name: 'Mono', values: { handle: 'hairline', frame: 'none', handleColor: 'gray', railColor: 'gray' } },
  { id: 'ember', name: 'Ember', values: { handle: 'dots-353', frame: 'rounded', frameColored: true, handleColor: 'orange', railColor: 'orange' } },
  { id: 'stealth', name: 'Stealth', values: { handleHidden: true, railHidden: true } },
];
const EYE_SLASH = '<svg class="look-eye" viewBox="0 0 16 16" aria-hidden="true"><path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/></svg>';

// Every look key, with defaults filled in and values validated.
const fullLook = (values) => {
  const all = normalize({ ...DEFAULTS, ...values });
  return Object.fromEntries(LOOK_KEYS.map((key) => [key, all[key]]));
};
const pickLook = (values) => Object.fromEntries(LOOK_KEYS.map((key) => [key, values[key]]));
// Custom hex values only count when that color is set to Custom.
const sameLook = (a, b) => LOOK_KEYS.every((key) =>
  (key === 'handleCustom' && a.handleColor !== 'custom') || (key === 'railCustom' && a.railColor !== 'custom') || a[key] === b[key]);
function savedLooks() {
  const list = Array.isArray(stored.looks) ? stored.looks : [];
  return list.filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string' && l.values && typeof l.values === 'object');
}
const allLooks = () => [
  ...BUILT_IN_LOOKS.map((l) => ({ ...l, values: fullLook(l.values) })),
  ...savedLooks().map((l) => ({ ...l, saved: true, values: fullLook(l.values) })),
];

function applyLook(look) {
  picker.close();
  const values = { ...look.values };
  // Keep the current custom hex unless the look uses its own.
  if (values.handleColor !== 'custom') delete values.handleCustom;
  if (values.railColor !== 'custom') delete values.railCustom;
  save(values);
}

// Kept locally right away so the gallery updates before storage reports the change.
function saveLooks(list) {
  stored = { ...stored, looks: list };
  renderLooks(current);
  return chrome.storage.sync.set({ looks: list });
}

const looksEl = $('looks');
let namingLook = false;

function lookPreview(values) {
  const scheme = darkScheme.matches ? 'dark' : 'light';
  const hc = HANDLE_COLORS.find((c) => c.id === values.handleColor);
  const rc = RAIL_COLORS.find((c) => c.id === values.railColor);
  const handleColor = hc.custom ? values.handleCustom : hc[scheme];
  // Custom rails are often faint; preview them at full strength like the preset colors.
  const railColor = rc.custom ? values.railCustom.slice(0, 7) : rc[scheme];
  const svg = HANDLES.find((h) => h.id === values.handle).svg;
  const stealth = values.handleHidden && values.railHidden;
  return `<span class="look-stage${values.frameColored ? ' colored' : ''}${values.handleHidden ? ' handle-hidden' : ''}${values.railHidden ? ' rail-hidden' : ''}"
    style="--hc: ${handleColor}; --rc: ${railColor}">
    <span class="look-lines"></span><span class="look-rail"></span>
    <span class="look-handle gwh-frame" data-frame="${values.frame}">${svg}</span>${stealth ? EYE_SLASH : ''}</span>`;
}

function renderLooks(values) {
  if (namingLook) return;
  const looks = allLooks();
  const now = pickLook(values);
  const match = looks.find((l) => sameLook(now, l.values));
  $('look-name').textContent = match ? match.name : 'Unsaved';
  const focused = document.activeElement && looksEl.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  looksEl.textContent = '';
  const options = [];
  for (const look of looks) {
    const tile = document.createElement('div');
    tile.className = 'look-tile';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'look';
    btn.dataset.id = look.id;
    btn.title = look.name;
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(look === match));
    btn.tabIndex = look === (match || looks[0]) ? 0 : -1;
    btn.innerHTML = `${lookPreview(look.values)}<span class="look-name"></span>`;
    btn.querySelector('.look-name').textContent = look.name;
    btn.addEventListener('click', () => applyLook(look));
    tile.append(btn);
    if (look.saved) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'look-delete';
      del.dataset.id = `delete-${look.id}`;
      del.title = `Delete "${look.name}"`;
      del.setAttribute('aria-label', `Delete look ${look.name}`);
      del.textContent = '×';
      del.addEventListener('click', () => saveLooks(savedLooks().filter((l) => l.id !== look.id)));
      tile.append(del);
    }
    looksEl.append(tile);
    options.push(btn);
  }
  // Arrow keys move between looks (four per row) and apply them, like the other pickers.
  options.forEach((btn, i) => btn.addEventListener('keydown', (e) => {
    const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 4, ArrowUp: -4 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(options.length - 1, Math.max(0, i + delta));
    if (next === i) return;
    applyLook(looks[next]);
    options[next].focus();
  }));

  const full = savedLooks().length >= MAX_SAVED_LOOKS;
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'look look-new';
  add.dataset.id = 'new';
  add.disabled = Boolean(match) || full;
  add.title = match ? `This is already saved as "${match.name}". Change something in Customize first.`
    : full ? `You can save up to ${MAX_SAVED_LOOKS} looks. Delete one to make room.` : 'Save the current settings as a look';
  add.innerHTML = '<span class="look-plus" aria-hidden="true">+</span><span class="look-name">Save look</span>';
  add.addEventListener('click', () => startNaming(add));
  const addTile = document.createElement('div');
  addTile.className = 'look-tile';
  addTile.append(add);
  looksEl.append(addTile);
  // Size each preview rail's break to its handle.
  for (const stage of looksEl.querySelectorAll('.look-stage')) {
    const handle = stage.querySelector('.look-handle');
    stage.querySelector('.look-rail').style.setProperty('--gap', `${Math.ceil(handle.offsetHeight / 2) + 6}px`);
  }
  if (focused) (looksEl.querySelector(`[data-id="${focused}"]`) || options[0]).focus();
}

// The Save look tile becomes a name field: Enter saves, Escape or clicking away cancels.
function startNaming(add) {
  namingLook = true;
  const form = document.createElement('form');
  form.className = 'look look-new naming';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 24;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Name for the new look');
  input.value = `My look ${savedLooks().length + 1}`;
  const hint = document.createElement('span');
  hint.className = 'look-hint';
  hint.textContent = 'Enter to save';
  form.append(input, hint);
  add.replaceWith(form);
  input.select();
  const finish = (keep) => {
    if (!namingLook) return;
    namingLook = false;
    const name = input.value.trim();
    if (keep && name) {
      const look = { id: `look-${Date.now().toString(36)}`, name, values: pickLook(current) };
      saveLooks([...savedLooks(), look]);
    }
    renderLooks(current);
    const tile = looksEl.querySelector(keep && name ? '.look[aria-checked="true"]' : '[data-id="new"]');
    if (tile) tile.focus();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    finish(true);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(false));
}

function render(values) {
  current = values;
  repoRow.hidden = !tabRepo;
  if (tabRepo) {
    repoOwnEl.checked = Boolean(target());
    $('repo-name').textContent = tabRepo.label.split('/')[1];
    repoRow.title = repoOwnEl.checked
      ? `${tabRepo.label} has its own settings. Turn off to use the settings for all repos.`
      : `Give ${tabRepo.label} its own settings. Other repos keep using the current ones.`;
  }
  enabledEl.checked = values.enabled;
  glassEl.checked = values.glass;
  document.documentElement.classList.toggle('glass', values.glass);
  localStorage.setItem('gwh-glass', values.glass ? '1' : '0');
  const custom = values.width !== null;
  widthEl.textContent = custom ? `${values.width}px` : 'Default';
  resetEl.hidden = !custom;
  for (const update of pickers) update(values);
  renderLooks(values);

  // Frame previews show the chosen handle graphic.
  const svg = HANDLES.find((h) => h.id === values.handle).svg;
  for (const frame of document.querySelectorAll('.frame-option .gwh-frame')) frame.innerHTML = svg;
  // Colorized frame previews take the handle color.
  const handleColor = HANDLE_COLORS.find((c) => c.id === values.handleColor);
  frameColoredEl.checked = values.frameColored;
  $('frames').classList.toggle('colored', values.frameColored);
  $('frames').style.setProperty('--tint', handleColor.custom ? values.handleCustom : handleColor[darkScheme.matches ? 'dark' : 'light']);
  $('handle-colors').querySelector('.custom-fill').style.background = values.handleCustom;
  $('rail-colors').querySelector('.custom-fill').style.background = values.railCustom;
  if (values.handleColor === 'custom') $('handle-color-name').textContent = values.handleCustom;
  if (values.railColor === 'custom') $('rail-color-name').textContent = values.railCustom;

  for (const [key, el] of Object.entries(hideToggles)) {
    el.checked = values[key];
    // Dim the swatches while hidden; they stay selectable.
    el.closest('.row').classList.toggle('is-hidden', el.checked);
  }
  resetAllEl.disabled = Object.keys(STYLE_DEFAULTS).every((key) => values[key] === STYLE_DEFAULTS[key]);
}

const load = () => chrome.storage.sync.get(null).then((all) => {
  stored = all;
  render(settingsFor(stored, tabRepo && tabRepo.repo));
});

// Asks the content script in the active tab which repo it's on; no reply means it isn't a GitHub page.
async function detectRepo() {
  // `?repo=owner/name` stands in for the active tab when the popup is opened as a page (tests, screenshots).
  const param = new URLSearchParams(location.search).get('repo');
  if (param) return { repo: param.toLowerCase(), label: param };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const reply = tab && (await chrome.tabs.sendMessage(tab.id, { type: 'gwh-repo' }));
    return reply && reply.repo ? reply : null;
  } catch {
    return null;
  }
}

detectRepo().then((found) => {
  tabRepo = found;
  return load();
}).then(() => {
  // Enable transitions only after the stored state is shown.
  requestAnimationFrame(() => document.body.classList.remove('loading'));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') load();
});

repoOwnEl.addEventListener('change', () => {
  picker.close();
  const key = repoKey(tabRepo.repo);
  // Starts with no overrides, so nothing changes until a setting is edited.
  if (repoOwnEl.checked) chrome.storage.sync.set({ [key]: {} });
  else chrome.storage.sync.remove(key);
});

enabledEl.addEventListener('change', () => {
  save({ enabled: enabledEl.checked });
});

for (const [key, el] of Object.entries(hideToggles)) {
  el.addEventListener('change', () => save({ [key]: el.checked }));
}

frameColoredEl.addEventListener('change', () => save({ frameColored: frameColoredEl.checked }));
glassEl.addEventListener('change', () => chrome.storage.sync.set({ glass: glassEl.checked }));
darkScheme.addEventListener('change', () => render(current));

// Random handle, frame, Colorize and preset colors; always a different look from the current one.
// Hidden handle/rail are always turned back on so the new look is visible.
const randomOf = (list) => list[Math.floor(Math.random() * list.length)].id;
$('randomize').addEventListener('click', () => {
  picker.close();
  const presets = (list) => list.filter((c) => !c.custom);
  let next;
  do {
    next = { handle: randomOf(HANDLES), frame: randomOf(FRAMES), handleColor: randomOf(presets(HANDLE_COLORS)), railColor: randomOf(presets(RAIL_COLORS)),
      frameColored: Math.random() < 0.5 };
  } while (Object.keys(next).every((key) => next[key] === current[key]));
  save({ ...next, handleHidden: false, railHidden: false });
});

resetAllEl.addEventListener('click', () => {
  picker.close();
  save(STYLE_DEFAULTS);
});

resetEl.addEventListener('click', () => {
  save({ width: null });
});
