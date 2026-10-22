const { HANDLES, FRAMES, HANDLE_COLORS, RAIL_COLORS, DEFAULTS, normalize, normalizeHex } = globalThis.GWH;
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
const darkScheme = matchMedia('(prefers-color-scheme: dark)');
let current = { ...DEFAULTS };
// "Reset all" covers the look and behavior settings; width has its own Reset.
const { width: _width, ...STYLE_DEFAULTS } = DEFAULTS;

// A single-choice picker stored under `key`, with roving focus and arrow-key navigation.
function radioGroup({ container, nameEl, items, key, className, render, onPick }) {
  const choose = (item) => (onPick ? onPick(item) : chrome.storage.sync.set({ [key]: item.id }));
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
      if (next.custom) chrome.storage.sync.set({ [key]: next.id });
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
    chrome.storage.local.set({ live: { [key]: value } });
    clearTimeout(saveTimer);
    saveTimer = 0;
    const save = () => chrome.storage.sync.set({ [key]: value });
    if (now) save();
    else saveTimer = setTimeout(() => { saveTimer = 0; save(); }, 300);
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
    if (key) chrome.storage.sync.set({ [key]: hsvaToHex(hsva) });
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
      chrome.storage.sync.set({ [colorKey]: item.id });
      return;
    }
    if (picker.isOpenFor(customKey)) return picker.close();
    chrome.storage.sync.set({ [colorKey]: 'custom' });
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

function render(values) {
  current = values;
  enabledEl.checked = values.enabled;
  const custom = values.width !== null;
  widthEl.textContent = custom ? `${values.width}px` : 'Default';
  resetEl.hidden = !custom;
  for (const update of pickers) update(values);

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

const load = () => chrome.storage.sync.get(DEFAULTS).then((v) => render(normalize(v)));

load().then(() => {
  // Enable transitions only after the stored state is shown.
  requestAnimationFrame(() => document.body.classList.remove('loading'));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') load();
});

enabledEl.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledEl.checked });
});

for (const [key, el] of Object.entries(hideToggles)) {
  el.addEventListener('change', () => chrome.storage.sync.set({ [key]: el.checked }));
}

frameColoredEl.addEventListener('change', () => chrome.storage.sync.set({ frameColored: frameColoredEl.checked }));
darkScheme.addEventListener('change', () => render(current));

// Random handle, frame and preset colors; always a different look from the current one.
const randomOf = (list) => list[Math.floor(Math.random() * list.length)].id;
$('randomize').addEventListener('click', () => {
  picker.close();
  const presets = (list) => list.filter((c) => !c.custom);
  let next;
  do {
    next = { handle: randomOf(HANDLES), frame: randomOf(FRAMES), handleColor: randomOf(presets(HANDLE_COLORS)), railColor: randomOf(presets(RAIL_COLORS)) };
  } while (Object.keys(next).every((key) => next[key] === current[key]));
  chrome.storage.sync.set(next);
});

resetAllEl.addEventListener('click', () => {
  picker.close();
  chrome.storage.sync.set(STYLE_DEFAULTS);
});

resetEl.addEventListener('click', () => {
  chrome.storage.sync.set({ width: null });
});
