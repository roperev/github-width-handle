// Handle graphics shared by the content script and the popup, ordered minimal → chunky.
// Every SVG draws with currentColor; `box` styles get a bordered knob around the graphic.
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

  const HANDLES = [
    { id: 'hairline', name: 'Hairline', svg: svg(1, 28, '<rect width="1" height="28"/>') },
    { id: 'dash', name: 'Dash', svg: svg(2, 12, '<rect width="2" height="12" rx="1"/>') },
    { id: 'pill', name: 'Pill', svg: svg(4, 28, '<rect width="4" height="28" rx="2"/>') },
    { id: 'rails', name: 'Double line', svg: svg(5, 20, '<rect width="1" height="20"/><rect x="4" width="1" height="20"/>') },
    { id: 'triple', name: 'Triple line', svg: svg(9, 20, '<rect width="1" height="20"/><rect x="4" width="1" height="20"/><rect x="8" width="1" height="20"/>') },
    { id: 'grip', name: 'Grip (2×3)', svg: dots([3, 3]) },
    { id: 'dots-353', name: 'Dots (3-5-3)', svg: dots([3, 5, 3]) },
    { id: 'dots-3x5', name: 'Dot grid (3×5)', svg: dots([5, 5, 5]) },
    {
      id: 'ridges',
      name: 'Ridges',
      svg: svg(8, 13, [0, 3, 6, 9, 12].map((y) => `<rect y="${y}" width="8" height="1"/>`).join('')),
    },
    {
      id: 'arrows',
      name: 'Arrows',
      svg: svg(12, 10, '<path d="M4.5 1 1 5l3.5 4M7.5 1 11 5 7.5 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'),
    },
    {
      id: 'cursor',
      name: 'Resize cursor',
      svg: svg(12, 10, '<rect x="5.25" width="1.5" height="10" rx=".75"/><path d="M3.5 2.5 1 5l2.5 2.5M1 5h2.75M8.5 2.5 11 5 8.5 7.5M11 5H8.25" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>'),
    },
    { id: 'knob', name: 'Knob', box: true, svg: dots([4, 4]) },
  ];

  globalThis.GWH_HANDLES = HANDLES;
  globalThis.GWH_DEFAULT_HANDLE = 'dots-353';
})();
