# GitHub Width Handle

A small Chrome extension that adds a drag handle to the main content column on GitHub detail pages, so dense issues and PRs can use more of a large display.

![icon](icons/icon128.png)

## Screenshots

| Light | Dark |
| --- | --- |
| ![Handle beside a PR comment, light theme](docs/handle-light.png) | ![Handle beside a PR comment, dark theme](docs/handle-dark.png) |
| ![Settings popup, light theme](docs/popup-light.png) | ![Settings popup, dark theme](docs/popup-dark.png) |

The handle sits in the gutter beside the first comment, with the reset **×** under it and the rail running down the content. The popup follows your system's light or dark setting.

## What it does

- Adds a grip in the gutter between the main column and the right sidebar.
- A faint blue rail runs along the content, in the same blue as GitHub's highlighted comment headers.
  - It fades out away from the handle.
  - It stops below any pinned GitHub header.
  - On short pages it ends level with the Comment button instead of the bottom of the sidebar.
- **Drag** it to widen the column **from the center**: both sides grow equally, the sidebar slides outward (never overlapped), and headers and PR tabs stay aligned.
- On page load the handle sits beside the first comment's `…` menu. When you scroll past it, it slides to the vertical center of the viewport, so it's always reachable.
- A small **×** under the handle (shown only when a custom width is set) eases back to GitHub's default width.
- The width is **global** and **synced** (`chrome.storage.sync`). It's applied before the page paints, so there's no snap on load or when moving between pages. If it can only be applied after the content is visible, it eases in over 0.5s.
- Keyboard: focus the handle and use <kbd>←</kbd> / <kbd>→</kbd> (hold <kbd>Shift</kbd> for bigger steps).
- The toolbar popup has an on/off toggle, the current width, Reset, and a picker with 12 handle styles. The choice applies live and is synced.

### Handle styles

From most minimal to chunkiest: Hairline, Dash, Pill, Double line, Triple line, Grip (2×3), **Dots (3-5-3, default)**, Dot grid (3×5), Ridges, Arrows, Resize cursor and Knob.

All styles are muted at rest and turn blue on hover or drag. To add or change a style, edit [`src/handles.js`](src/handles.js).

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
src/handles.js    handle graphics, shared by the page and the popup
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
- the handle anchors beside the first comment, then docks to the viewport center on scroll
- the rail's extent: below pinned headers, and ending at the Comment button on short pages
- the handle style picker
- the reset and late-apply animations
- keyboard resizing, the popup controls, and pages that should be left untouched

Test screenshots are written to `tests/screenshots/` (git-ignored). The README images in `docs/` are separate and committed.

## How it works

GitHub's detail pages center a fixed `max-width` container (1280px) that holds the main column and the sidebar. The extension raises that container's `max-width` through a CSS variable (`--gwh-width`), plus a couple of inner caps (e.g. the PR timeline's 1012px). Because it stays `margin: auto` centered, it grows equally on both sides while the sidebar keeps its own width.

All rules are scoped under `html[data-gwh-page][data-gwh-sized]`. The content script sets those attributes at `document_start` from a `localStorage` copy of the synced setting, so the CSS applies as soon as GitHub renders.
