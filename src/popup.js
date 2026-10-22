const HANDLES = globalThis.GWH_HANDLES;
const DEFAULTS = { enabled: true, width: null, handle: globalThis.GWH_DEFAULT_HANDLE };
const enabledEl = document.getElementById('enabled');
const widthEl = document.getElementById('width');
const resetEl = document.getElementById('reset');
const handlesEl = document.getElementById('handles');
const handleNameEl = document.getElementById('handle-name');

const handleButtons = HANDLES.map((h) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'handle-option';
  btn.dataset.id = h.id;
  btn.title = h.name;
  btn.setAttribute('role', 'radio');
  btn.setAttribute('aria-label', h.name);
  btn.innerHTML = `<span class="preview${h.box ? ' box' : ''}${h.id === 'hairline' ? ' faint' : ''}">${h.svg}</span>`;
  btn.addEventListener('click', () => chrome.storage.sync.set({ handle: h.id }));
  btn.addEventListener('keydown', (e) => {
    const i = HANDLES.indexOf(h);
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = HANDLES[(i + delta + HANDLES.length) % HANDLES.length];
    chrome.storage.sync.set({ handle: next.id });
    handlesEl.querySelector(`[data-id="${next.id}"]`).focus();
  });
  handlesEl.append(btn);
  return btn;
});

function render({ enabled, width, handle }) {
  const selected = HANDLES.find((h) => h.id === handle) || HANDLES.find((h) => h.id === DEFAULTS.handle);
  for (const btn of handleButtons) {
    const on = btn.dataset.id === selected.id;
    btn.setAttribute('aria-checked', String(on));
    btn.tabIndex = on ? 0 : -1;
  }
  handleNameEl.textContent = selected.name;
  enabledEl.checked = enabled !== false;
  const custom = Number.isFinite(width) && width > 0;
  widthEl.textContent = custom ? `${Math.round(width)}px` : 'Default';
  resetEl.hidden = !custom;
}

chrome.storage.sync.get(DEFAULTS).then((v) => {
  render(v);
  // Enable switch transitions only after the stored state is shown.
  requestAnimationFrame(() => document.body.classList.remove('loading'));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  chrome.storage.sync.get(DEFAULTS).then(render);
});

enabledEl.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledEl.checked });
});

resetEl.addEventListener('click', () => {
  chrome.storage.sync.set({ width: null });
});
