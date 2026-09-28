# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build tools, no package.json — just three files that cooperate: `index.html`, `style.css`, `game.js`.

## Running the game

There is no build/lint/test tooling in this repo. To run it, just open or serve `index.html`:

```bash
# Open directly
start index.html          # Windows
open index.html           # macOS

# Or serve locally (needed if testing anything that requires http:// origin)
python3 -m http.server 8000
npx serve .
```

Then visit `http://localhost:8000` if using a server. There are no automated tests.

## Architecture

All game logic lives in `game.js` (~300 lines, single file, no modules). Key pieces:

- **Board model**: `board` is a `ROWS × COLS` (20×10) matrix; each cell is `0` (empty) or a piece color index (1–8).
- **Pieces**: defined in `PIECES` as square matrices (I, O, T, S, Z, J, L, and N — a 3×3 "tuerca"/nut with an empty center). Rotation is done via `rotateCW` (transpose + row reverse), not precomputed rotation states. The nut piece's empty center cell (`0`) is a real hole: `collide`/`merge`/`clearLines` treat it like any other empty cell, so once it's locked into the board it can trap an unfillable gap. `drawNutHole()` draws a decorative ring over that hole while the piece is falling (current piece, ghost, and next preview); once merged into the board only the 8 surrounding blocks remain.
- **Wall kicks**: `tryRotate` attempts the rotated shape at offsets `[0, -1, 1, -2, 2]` columns, using the first that doesn't collide.
- **Collision**: `collide(shape, ox, oy)` checks board bounds and existing fixed blocks.
- **Game loop**: `loop(ts)` runs via `requestAnimationFrame`, accumulating delta time in `dropAccum` and advancing the piece down a row once `dropAccum >= dropInterval`.
- **Locking/clearing**: `lockPiece()` → `merge()` (bakes the piece into `board`) → `clearLines()` (scans bottom-up, splices full rows, unshifts empty rows at top) → `spawn()`.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points/row dropped, soft drop adds 1 point/row.
- **Leveling/speed**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level-1)*90)` ms.
- **Ghost piece**: `ghostY()` projects the current piece straight down to its landing row; drawn with `globalAlpha = 0.2`.
- **Rendering**: `draw()` clears and redraws the board canvas each frame (grid, locked blocks, ghost, current piece); `drawNext()` renders the preview piece on a separate canvas.
- **Game over**: triggered in `spawn()` when a freshly spawned piece immediately collides.

All DOM/canvas element references are grabbed once at the top of `game.js` as module-level `const`s (`canvas`, `ctx`, `nextCanvas`, `scoreEl`, `overlay`, etc.) and mutable game state lives in a single `let board, current, next, score, ...` declaration, reset in `init()`.

### Theming

Colors live in CSS variables in `:root` (dark, default) and `:root[data-theme="light"]` in `style.css`. `applyTheme()` in `game.js` sets `data-theme`, persists it in `localStorage`, caches canvas colors (`--grid`, `--highlight`) into `gridColor`/`highlightColor`, and redraws. An inline script in `<head>` applies the saved theme before first paint. The toggle is `#theme-toggle` (also the `T` key).

### Tunable constants (in `game.js`)

| Constant | Meaning | Default |
| --- | --- | --- |
| `COLS` / `ROWS` | Board dimensions | `10` / `20` |
| `BLOCK` | Pixel size per cell | `30` |
| `COLORS` | Color per piece index (1–8) | 8 colors |
| `LINE_SCORES` | Points for 1–4 lines cleared | `[0,100,300,500,800]` |
| `dropInterval` | Initial fall speed (ms) | `1000` |

If you change `COLS`, `ROWS`, or `BLOCK`, also update the `width`/`height` attributes of `<canvas id="board">` in `index.html` to match (`COLS × BLOCK` by `ROWS × BLOCK`).

## Controls (for reference when touching input handling)

`←`/`→` move, `↑`/`X` rotate CW, `↓` soft drop, `Space` hard drop, `P` pause, `T` toggle light/dark theme. All input handling is a single `keydown` listener with a `switch` on `e.code` near the bottom of `game.js`.
