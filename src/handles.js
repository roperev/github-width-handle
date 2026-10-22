// Handle graphics shared by the content script and the popup, ordered minimal → chunky.
// Every SVG draws with currentColor. Frames around them are styled in frames.css.
(() => {
  const svg = (w, h, body) =>
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

  // Dot grid: counts per column, each column centered vertically on a 4px grid.
  const dots = (columns) => {
    const step = 4;
    const rows = Math.max(...columns);
    const body = columns.flatMap((count, col) => {
      const offset = ((rows - count) * step) / 2;
      return Array.from({ length: count }, (_, row) =>
        `<circle cx="${col * step + 2}" cy="${offset + row * step + 2}" r="1"/>`);
    });
    return svg(columns.length * step, rows * step, body.join(''));
  };

  // Horizontal bars, `count` of them, `gap` px apart.
  const bars = (count, gap, width = 8) => {
    const h = (count - 1) * gap + 1;
    return svg(width, h, Array.from({ length: count }, (_, i) => `<rect y="${i * gap}" width="${width}" height="1"/>`).join(''));
  };

  // Two columns of dots, the second offset half a step (a staggered texture).
  const staggered = (count) => {
    const body = [];
    for (let i = 0; i < count; i++) body.push(`<circle cx="2" cy="${i * 4 + 2}" r="1"/>`);
    for (let i = 0; i < count - 1; i++) body.push(`<circle cx="6" cy="${i * 4 + 4}" r="1"/>`);
    return svg(8, count * 4, body.join(''));
  };

  const HANDLES = [
    { id: 'hairline', name: 'Hairline', svg: svg(1, 28, '<rect width="1" height="28"/>') },
    { id: 'dash', name: 'Dash', svg: svg(2, 12, '<rect width="2" height="12" rx="1"/>') },
    { id: 'pill', name: 'Pill', svg: svg(4, 28, '<rect width="4" height="28" rx="2"/>') },
    { id: 'rails', name: 'Double line', svg: svg(5, 20, '<rect width="1" height="20"/><rect x="4" width="1" height="20"/>') },
    { id: 'triple', name: 'Triple line', svg: svg(9, 20, '<rect width="1" height="20"/><rect x="4" width="1" height="20"/><rect x="8" width="1" height="20"/>') },
    { id: 'grip', name: 'Grip (2×3)', svg: dots([3, 3]) },
    { id: 'grip-2x4', name: 'Grip (2×4)', svg: dots([4, 4]) },
    { id: 'grip-2x5', name: 'Grip (2×5)', svg: dots([5, 5]) },
    { id: 'dots-353', name: 'Dots (3-5-3)', svg: dots([3, 5, 3]) },
    { id: 'dots-3x5', name: 'Dot grid (3×5)', svg: dots([5, 5, 5]) },
    { id: 'staggered', name: 'Staggered dots', svg: staggered(5) },
    { id: 'ridges-4', name: 'Ridges (4, wide)', svg: bars(4, 5) },
    { id: 'ridges', name: 'Ridges (5)', svg: bars(5, 3) },
    {
      id: 'arrows',
      name: 'Arrows',
      svg: svg(12, 10, '<path d="M4.5 1 1 5l3.5 4M7.5 1 11 5 7.5 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    },
    {
      id: 'double-arrow',
      name: 'Double arrow',
      svg: svg(14, 8, '<path d="M4 1 1 4l3 3M10 1l3 3-3 3M1.5 4h11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    },
    {
      id: 'cursor',
      name: 'Resize cursor',
      svg: svg(12, 10, '<rect x="5.25" width="1.5" height="10" rx=".75"/><path d="M3.5 2.5 1 5l2.5 2.5M1 5h2.75M8.5 2.5 11 5 8.5 7.5M11 5H8.25" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>'),
    },
  ];

  // Frames drawn around the handle graphic (styles in frames.css), minimal → chunky.
  const FRAMES = [
    { id: 'none', name: 'None' },
    { id: 'dashed', name: 'Dashed' },
    { id: 'square', name: 'Square' },
    { id: 'rounded', name: 'Rounded' },
    { id: 'pill', name: 'Capsule' },
    { id: 'filled', name: 'Filled' },
    { id: 'well', name: 'Well' },
    { id: 'raised', name: 'Raised' },
  ];

  // Colors use GitHub's Primer variables so they follow the page theme. `light`/`dark` are the
  // same values as hex, for the popup swatches (the popup has no access to GitHub's CSS).
  // Handle: `fg` at rest, `hover` + `bg` on hover/drag.
  // Yellow is brighter than Primer's mustard "attention" color; light-dark() follows GitHub's color-scheme.
  const YELLOW_LIGHT = '#e6b400';
  const YELLOW_DARK = '#ffd60a';
  const YELLOW = `light-dark(${YELLOW_LIGHT}, ${YELLOW_DARK})`;
  const mixIn = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  const HANDLE_COLORS = [
    { id: 'gray', name: 'Gray', fg: 'var(--fgColor-muted, #59636e)', hover: 'var(--fgColor-accent, #0969da)', bg: 'var(--bgColor-accent-muted, #ddf4ff)', light: '#59636e', dark: '#9198a1' },
    { id: 'white', name: 'White', fg: '#ffffff', hover: '#ffffff', bg: 'var(--bgColor-neutral-muted, #818b981f)', light: '#ffffff', dark: '#ffffff' },
    { id: 'black', name: 'Black', fg: '#000000', hover: '#000000', bg: 'var(--bgColor-neutral-muted, #818b981f)', light: '#000000', dark: '#000000' },
    { id: 'blue', name: 'Blue', fg: 'var(--fgColor-accent, #0969da)', hover: 'var(--fgColor-accent, #0969da)', bg: 'var(--bgColor-accent-muted, #ddf4ff)', light: '#0969da', dark: '#4493f8' },
    { id: 'green', name: 'Green', fg: 'var(--fgColor-success, #1a7f37)', hover: 'var(--fgColor-success, #1a7f37)', bg: 'var(--bgColor-success-muted, #dafbe1)', light: '#1a7f37', dark: '#3fb950' },
    { id: 'yellow', name: 'Yellow', fg: YELLOW, hover: YELLOW, bg: mixIn(YELLOW, 18), light: YELLOW_LIGHT, dark: YELLOW_DARK },
    { id: 'orange', name: 'Orange', fg: 'var(--fgColor-severe, #bc4c00)', hover: 'var(--fgColor-severe, #bc4c00)', bg: 'var(--bgColor-severe-muted, #fff1e5)', light: '#bc4c00', dark: '#db6d28' },
    { id: 'red', name: 'Red', fg: 'var(--fgColor-danger, #d1242f)', hover: 'var(--fgColor-danger, #d1242f)', bg: 'var(--bgColor-danger-muted, #ffebe9)', light: '#d1242f', dark: '#f85149' },
    { id: 'custom', name: 'Custom', custom: true },
  ];

  // Rail: `peak` beside the handle at rest, `hover` while hovering/dragging. Fades to transparent.
  // Same order as the handle colors. Blue (the default) matches GitHub's highlighted comment headers;
  // picked colors are bolder (about 50% at rest).
  const mix = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  const railColor = (id, name, color, light, dark) => ({ id, name, peak: mix(color, 50), hover: mix(color, 80), light, dark });
  const RAIL_COLORS = [
    railColor('gray', 'Gray', 'var(--fgColor-muted, #59636e)', '#59636e', '#9198a1'),
    railColor('white', 'White', '#ffffff', '#ffffff', '#ffffff'),
    railColor('black', 'Black', '#000000', '#000000', '#000000'),
    { id: 'blue', name: 'Blue', peak: 'var(--bgColor-accent-muted, #388bfd1a)', hover: 'var(--borderColor-accent-muted, #388bfd66)', light: '#0969da', dark: '#4493f8' },
    railColor('green', 'Green', 'var(--fgColor-success, #1a7f37)', '#1a7f37', '#3fb950'),
    railColor('yellow', 'Yellow', YELLOW, YELLOW_LIGHT, YELLOW_DARK),
    railColor('orange', 'Orange', 'var(--fgColor-severe, #bc4c00)', '#bc4c00', '#db6d28'),
    railColor('red', 'Red', 'var(--fgColor-danger, #d1242f)', '#d1242f', '#f85149'),
    { id: 'custom', name: 'Custom', custom: true },
  ];

  const DEFAULTS = {
    enabled: true,
    width: null,
    position: 'dynamic',
    handle: 'grip-2x4',
    frame: 'well',
    frameColored: false,
    handleColor: 'gray',
    handleCustom: '#a371f7ff',
    handleHidden: false,
    railColor: 'blue',
    railCustom: '#a371f740',
    railHidden: false,
    glass: false,
  };
  const POSITIONS = ['middle', 'top', 'dynamic'];
  const HEX = /^#[0-9a-f]{8}$/;

  const pick = (list, id, fallback) => (list.some((x) => x.id === id) ? id : fallback);

  // Custom colors are stored as #rrggbbaa; also accepts #rgb, #rrggbb and #rgba.
  function normalizeHex(value, fallback) {
    let v = String(value || '').trim().toLowerCase();
    if (!v.startsWith('#')) v = `#${v}`;
    if (/^#[0-9a-f]{3,4}$/.test(v)) v = `#${[...v.slice(1)].map((c) => c + c).join('')}`;
    if (/^#[0-9a-f]{6}$/.test(v)) v += 'ff';
    return HEX.test(v) ? v : fallback;
  }

  function normalize(v) {
    // v1.0 had a "Knob" style: a 2×4 grip in a rounded frame.
    if (v.handle === 'knob') v = { ...v, handle: 'grip-2x4', frame: 'rounded' };
    return {
      enabled: v.enabled !== false,
      width: Number.isFinite(v.width) && v.width > 0 ? Math.round(v.width) : null,
      position: POSITIONS.includes(v.position) ? v.position : DEFAULTS.position,
      handle: pick(HANDLES, v.handle, DEFAULTS.handle),
      frame: pick(FRAMES, v.frame, DEFAULTS.frame),
      frameColored: v.frameColored === true,
      handleColor: pick(HANDLE_COLORS, v.handleColor, DEFAULTS.handleColor),
      handleCustom: normalizeHex(v.handleCustom, DEFAULTS.handleCustom),
      handleHidden: v.handleHidden === true,
      railColor: pick(RAIL_COLORS, v.railColor, DEFAULTS.railColor),
      railCustom: normalizeHex(v.railCustom, DEFAULTS.railCustom),
      railHidden: v.railHidden === true,
      glass: v.glass === true,
    };
  }

  // Scale a #rrggbbaa color's alpha, as a CSS color.
  function withAlpha(hex, factor) {
    const [r, g, b, a] = [1, 3, 5, 7].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgba(${r}, ${g}, ${b}, ${Math.min(1, (a / 255) * factor).toFixed(3)})`;
  }

  // CSS values for the page: handle fg/hover/bg and rail peak/hover.
  function colorVars(state) {
    const hc = HANDLE_COLORS.find((c) => c.id === state.handleColor);
    const rc = RAIL_COLORS.find((c) => c.id === state.railColor);
    const handle = hc.custom
      ? { fg: state.handleCustom, hover: state.handleCustom, bg: withAlpha(state.handleCustom, 0.18) }
      : hc;
    // A custom rail color is the rail's peak; hovering makes it stronger.
    const rail = rc.custom ? { peak: state.railCustom, hover: withAlpha(state.railCustom, 2.5) } : rc;
    return {
      '--gwh-handle-fg': handle.fg,
      '--gwh-handle-hover': handle.hover,
      '--gwh-handle-bg': handle.bg,
      '--gwh-rail-peak': rail.peak,
      '--gwh-rail-hover': rail.hover,
    };
  }

  globalThis.GWH = { HANDLES, FRAMES, HANDLE_COLORS, RAIL_COLORS, DEFAULTS, POSITIONS, normalize, normalizeHex, colorVars };
})();
