# GitHub Width Handle

A small Chrome extension that adds a drag handle to the main content column on GitHub detail pages, so dense issues and PRs can use more of a large display.

![icon](icons/icon128.png)

## Screenshots

| Light | Dark |
| --- | --- |
| ![Handle beside a PR comment, light theme](docs/handle-light.png) | ![Handle beside a PR comment, dark theme](docs/handle-dark.png) |
| ![Settings popup, light theme](docs/popup-light.png) | ![Settings popup, dark theme](docs/popup-dark.png) |

The handle sits in the gutter between the comments and the sidebar, with the reset **×** under it and the rail running along the content. The popup follows your system's light or dark setting.

<details>
<summary>Color combinations</summary>
<br>

Twelve randomized combinations of handle graphic, frame, handle color and rail color. Each light row is followed by the same six in dark. All shown at rest (75% opacity).

<table>
  <tr><td align="center" valign="top"><img src="docs/combos/01-light-arrows-square-blue-yellow.png" width="130" height="195" alt="Arrows · Square · Blue · Yellow rail, light"><br><sub>Arrows · Square · Blue · Yellow rail</sub></td><td align="center" valign="top"><img src="docs/combos/02-light-cursor-raised-orange-blue.png" width="130" height="195" alt="Resize cursor · Raised · Orange · Blue rail, light"><br><sub>Resize cursor · Raised · Orange · Blue rail</sub></td><td align="center" valign="top"><img src="docs/combos/03-light-dots-3x5-well-colorized-gray-green.png" width="130" height="195" alt="Dot grid (3×5) · Inset (colorized) · Gray · Green rail, light"><br><sub>Dot grid (3×5) · Inset (colorized) · Gray · Green rail</sub></td><td align="center" valign="top"><img src="docs/combos/04-light-rails-rounded-green-orange.png" width="130" height="195" alt="Double line · Rounded · Green · Orange rail, light"><br><sub>Double line · Rounded · Green · Orange rail</sub></td><td align="center" valign="top"><img src="docs/combos/05-light-grip-2x5-dashed-colorized-red-red.png" width="130" height="195" alt="Grip (2×5) · Dashed (colorized) · Red · Red rail, light"><br><sub>Grip (2×5) · Dashed (colorized) · Red · Red rail</sub></td><td align="center" valign="top"><img src="docs/combos/06-light-staggered-none-yellow-gray.png" width="130" height="195" alt="Staggered dots · no frame · Yellow · Gray rail, light"><br><sub>Staggered dots · no frame · Yellow · Gray rail</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/combos/01-dark-arrows-square-blue-yellow.png" width="130" height="195" alt="Arrows · Square · Blue · Yellow rail, dark"><br><sub>Arrows · Square · Blue · Yellow rail</sub></td><td align="center" valign="top"><img src="docs/combos/02-dark-cursor-raised-orange-blue.png" width="130" height="195" alt="Resize cursor · Raised · Orange · Blue rail, dark"><br><sub>Resize cursor · Raised · Orange · Blue rail</sub></td><td align="center" valign="top"><img src="docs/combos/03-dark-dots-3x5-well-colorized-gray-green.png" width="130" height="195" alt="Dot grid (3×5) · Inset (colorized) · Gray · Green rail, dark"><br><sub>Dot grid (3×5) · Inset (colorized) · Gray · Green rail</sub></td><td align="center" valign="top"><img src="docs/combos/04-dark-rails-rounded-green-orange.png" width="130" height="195" alt="Double line · Rounded · Green · Orange rail, dark"><br><sub>Double line · Rounded · Green · Orange rail</sub></td><td align="center" valign="top"><img src="docs/combos/05-dark-grip-2x5-dashed-colorized-red-red.png" width="130" height="195" alt="Grip (2×5) · Dashed (colorized) · Red · Red rail, dark"><br><sub>Grip (2×5) · Dashed (colorized) · Red · Red rail</sub></td><td align="center" valign="top"><img src="docs/combos/06-dark-staggered-none-yellow-gray.png" width="130" height="195" alt="Staggered dots · no frame · Yellow · Gray rail, dark"><br><sub>Staggered dots · no frame · Yellow · Gray rail</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/combos/07-light-double-arrow-well-yellow-yellow.png" width="130" height="195" alt="Double arrow · Inset · Yellow · Yellow rail, light"><br><sub>Double arrow · Inset · Yellow · Yellow rail</sub></td><td align="center" valign="top"><img src="docs/combos/08-light-dots-353-raised-colorized-orange-gray.png" width="130" height="195" alt="Dots (3-5-3) · Raised (colorized) · Orange · Gray rail, light"><br><sub>Dots (3-5-3) · Raised (colorized) · Orange · Gray rail</sub></td><td align="center" valign="top"><img src="docs/combos/09-light-grip-none-red-green.png" width="130" height="195" alt="Grip (2×3) · no frame · Red · Green rail, light"><br><sub>Grip (2×3) · no frame · Red · Green rail</sub></td><td align="center" valign="top"><img src="docs/combos/10-light-dash-rounded-blue-orange.png" width="130" height="195" alt="Dash · Rounded · Blue · Orange rail, light"><br><sub>Dash · Rounded · Blue · Orange rail</sub></td><td align="center" valign="top"><img src="docs/combos/11-light-ridges-4-filled-colorized-green-red.png" width="130" height="195" alt="Ridges (4, wide) · Filled (colorized) · Green · Red rail, light"><br><sub>Ridges (4, wide) · Filled (colorized) · Green · Red rail</sub></td><td align="center" valign="top"><img src="docs/combos/12-light-hairline-pill-gray-blue.png" width="130" height="195" alt="Hairline · Capsule · Gray · Blue rail, light"><br><sub>Hairline · Capsule · Gray · Blue rail</sub></td></tr>
  <tr><td align="center" valign="top"><img src="docs/combos/07-dark-double-arrow-well-yellow-yellow.png" width="130" height="195" alt="Double arrow · Inset · Yellow · Yellow rail, dark"><br><sub>Double arrow · Inset · Yellow · Yellow rail</sub></td><td align="center" valign="top"><img src="docs/combos/08-dark-dots-353-raised-colorized-orange-gray.png" width="130" height="195" alt="Dots (3-5-3) · Raised (colorized) · Orange · Gray rail, dark"><br><sub>Dots (3-5-3) · Raised (colorized) · Orange · Gray rail</sub></td><td align="center" valign="top"><img src="docs/combos/09-dark-grip-none-red-green.png" width="130" height="195" alt="Grip (2×3) · no frame · Red · Green rail, dark"><br><sub>Grip (2×3) · no frame · Red · Green rail</sub></td><td align="center" valign="top"><img src="docs/combos/10-dark-dash-rounded-blue-orange.png" width="130" height="195" alt="Dash · Rounded · Blue · Orange rail, dark"><br><sub>Dash · Rounded · Blue · Orange rail</sub></td><td align="center" valign="top"><img src="docs/combos/11-dark-ridges-4-filled-colorized-green-red.png" width="130" height="195" alt="Ridges (4, wide) · Filled (colorized) · Green · Red rail, dark"><br><sub>Ridges (4, wide) · Filled (colorized) · Green · Red rail</sub></td><td align="center" valign="top"><img src="docs/combos/12-dark-hairline-pill-gray-blue.png" width="130" height="195" alt="Hairline · Capsule · Gray · Blue rail, dark"><br><sub>Hairline · Capsule · Gray · Blue rail</sub></td></tr>
</table>

</details>

## What it does

- Adds a grip in the gutter between the main column and the right sidebar.
- A faint rail runs along the content. By default it's the same blue as GitHub's highlighted comment headers.
  - It fades out away from the handle.
  - It stops below any pinned GitHub header.
  - On short pages it ends level with the Comment button instead of the bottom of the sidebar.
- **Drag** it to widen the column **from the center**: both sides grow equally, the sidebar slides outward (never overlapped), and headers and PR tabs stay aligned.
- Where the handle sits is your choice (see [Vertical position](#vertical-position)). By default it stays at the vertical center of the window, so it's always reachable.
- The handle, × and rail are dimmed to 75% opacity until you hover or use them.
- A small **×** under the handle (shown only when a custom width is set) eases back to GitHub's default width.
- The width is **global** and **synced** (`chrome.storage.sync`). It's applied before the page paints, so there's no snap on load or when moving between pages. If it can only be applied after the content is visible, it eases in over 0.5s.
- Keyboard: focus the handle and use <kbd>←</kbd> / <kbd>→</kbd> (hold <kbd>Shift</kbd> for bigger steps).
- The toolbar popup has:
  - an on/off toggle, the current width and Reset
  - the handle's vertical position
  - 16 handle graphics and 8 frames to put them in
  - handle and rail colors (8 presets plus a custom color picker), each with a **Hide** switch
  - **Randomize!**, which picks a random handle, frame, handle color and rail color
  - **Reset all to defaults**, which resets every style and position setting but keeps your width (use Reset next to the width for that)

  Changes apply live and are synced.

### Vertical position

- **Middle** (default): stays at the vertical center of the window. It never rises above the first comment, and on short pages it stops at the end of the content.
- **Top**: sits beside the first comment and scrolls away with the page.
- **Dynamic**: starts beside the first comment, then slides to the center once you scroll past it.

### Handle styles

The handle is a graphic inside an optional frame, picked separately.

**Graphics (16):** Hairline, Dash, Pill, Double line, Triple line, Grip (2×3), Grip (2×4), Grip (2×5), **Dots (3-5-3, default)**, Dot grid (3×5), Staggered dots, Ridges (4, wide), Ridges (5), Arrows, Double arrow and Resize cursor.

**Frames (8):** **None (default)**, Dashed, Square, Rounded, Capsule, Filled, Inset and Raised. Frames are neutral gray by default. Turn on **Colorize** to tint the frame with the handle color. Bordered frames pick up the handle's hover color when you hover or drag.

The frame previews in the popup show your current graphic, so you can see the combination before choosing. The v1.0 "Knob" style becomes Grip (2×4) in a Rounded frame.

To add or change a graphic, edit [`src/handles.js`](src/handles.js). Frames are in [`src/frames.css`](src/frames.css).

### Colors

The handle and the rail each take one of eight presets: Gray, White, Black, Blue, Green, Yellow, Orange and Red. The presets use GitHub's own theme colors, so they adjust to light and dark mode.

The ninth, rainbow swatch is **Custom**. It opens a small picker with a saturation/brightness square, a hue slider, an alpha slider and a hex field (`#rgb`, `#rrggbb` or `#rrggbbaa`). The page updates live as you drag, and the color is saved when you let go or close the picker (<kbd>Esc</kbd>, **Done**, or a click outside). Custom colors are the same in light and dark mode.

- The default handle color is **Gray**, which turns blue on hover. Other colors keep their color on hover.
- The default rail color is **Blue**, a subtle match for GitHub's highlighted comment headers. The other rail colors are bolder (about 50% strength at rest) so a chosen color stands out. Use Custom if you want a different strength.
- **Hide** stops a part from being drawn. A hidden handle still works: hover the gap and drag as usual.

The palettes are in [`src/handles.js`](src/handles.js).

### Pages

| Applies to | Untouched |
| --- | --- |
| Issue detail (`/issues/123`) | Issue / PR lists |
| PR Conversation (`/pull/123`) | PR Checks, Files changed, single commits |
| PR Commits (`/pull/123/commits`) | Code, Actions, Projects, etc. |
| Discussion detail (`/discussions/123`) | Discussion lists |

## Install (unpacked)

No build step is needed. Chrome loads the folder directly.

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this repo folder (the one containing `manifest.json`).
3. Optional: pin it from the puzzle-piece menu in the toolbar to reach the popup.
4. Reload any GitHub tabs that were already open.

**Updating:** after pulling or editing code, click the ↻ reload icon on the extension's card in `chrome://extensions`, then reload GitHub tabs.

**Zip for another machine:** `npm run package` creates `github-width-handle.zip` containing only the extension files. Unzip it there and use **Load unpacked** on the unzipped folder. Chrome on macOS and Windows won't install self-packed `.crx` files from outside the Web Store, so unpacked is the way to go.

## Project layout

```
manifest.json     MV3 manifest
src/content.js    route detection, width application, handle + drag logic
src/content.css   scoped width overrides and handle styles (Primer CSS variables)
src/frames.css    handle frame styles, shared by the page and the popup
src/handles.js    settings: handle graphics, frames, palettes, defaults; shared by the page and the popup
src/popup.*       toolbar popup
icons/            extension icons
docs/             README screenshots
tests/            Playwright end-to-end checks against live github.com
```

No build step. Plain JS and CSS.

## Testing

```sh
npm install
npx playwright install chromium
npm test            # headless; HEADED=1 npm test to watch
```

The suite loads the unpacked extension in Chromium and runs against test content in this repo: a dense issue (#1), a PR (#2), a discussion (#3) and a short issue (#5). It checks:

- the width is applied before first paint and across soft navigations
- columns widen symmetrically without covering the sidebar
- the three handle positions (middle, top, dynamic) and the idle fade
- the rail's extent: below pinned headers, and ending at the Comment button on short pages
- the handle graphic, frame, Colorize, color, custom picker, Hide and Randomize controls, the Knob migration, and Reset all
- the reset and late-apply animations
- keyboard resizing, the popup controls, and pages that should be left untouched

Test screenshots are written to `tests/screenshots/` (git-ignored). The README images in `docs/` are separate and committed.

## How it works

GitHub's detail pages center a fixed `max-width` container (1280px) that holds the main column and the sidebar. The extension raises that container's `max-width` through a CSS variable (`--gwh-width`), plus a couple of inner caps (e.g. the PR timeline's 1012px). Because it stays `margin: auto` centered, it grows equally on both sides while the sidebar keeps its own width.

All rules are scoped under `html[data-gwh-page][data-gwh-sized]`. The content script sets those attributes at `document_start` from a `localStorage` copy of the synced setting, so the CSS applies as soon as GitHub renders.
