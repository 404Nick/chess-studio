<h1 align="center">♞ Chess Studio</h1>

<p align="center">
  A production-ready chess <b>analytics &amp; studio</b> desktop/web app — a Stockfish-powered
  analysis board with automatic move classification and plain-English explanations, a combined
  offline&nbsp;+&nbsp;online opening explorer, one-click game import from Lichess and Chess.com,
  and a full study/PGN studio with a drag-and-drop position editor.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss&logoColor=white">
  <img alt="Stockfish" src="https://img.shields.io/badge/Stockfish-WASM-1a1a1a">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-desktop-47848F?logo=electron&logoColor=white">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-green">
</p>

<p align="center">
  <img src="assets/analysis.gif" alt="Playing moves with live Stockfish evaluation and move classification" width="90%">
</p>

<p align="center"><i>Live evaluation, best-move arrows and instant move classification as you play.</i></p>

Built with **Next.js 14 (App Router) · TypeScript · Tailwind CSS · Framer Motion ·
chess.js · react-chessboard · Stockfish (WebAssembly, in a Web Worker)**, and packaged as a
native Windows app with **Electron**.

---

## A closer look

<table>
  <tr>
    <td width="50%" valign="top">
      <b>Six board themes, live</b><br>
      <img src="assets/themes.gif" alt="Switching board themes and piece styles" width="100%">
    </td>
    <td width="50%" valign="top">
      <b>Full study &amp; position editor</b><br>
      <img src="assets/studio.png" alt="Studio with chapters, position editor and PGN export" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <b>Analysis board</b><br>
      <img src="assets/analysis.png" alt="Analysis board with engine candidate lines" width="100%">
    </td>
    <td width="50%" valign="top">
      <b>Opening explorer</b><br>
      <img src="assets/opening.png" alt="Opening explorer with names, win rates and continuations" width="100%">
    </td>
  </tr>
</table>

---

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

`npm install` runs `scripts/setup-engine.mjs`, which copies the Stockfish WebAssembly build
out of `node_modules` into `public/stockfish/` and writes a `manifest.json` describing it.
The app reads that manifest at runtime and spawns the engine as a classic Web Worker.

Requires **Node.js 18.17+**.

### Other scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server (re-copies the engine first) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm run typecheck` | `tsc --noEmit` over the whole project |
| `npm run electron:dev` | Run the desktop shell against `localhost:3000` (start `npm run dev` first) |
| `npm run dist` | Build the Windows **installer + portable** `.exe` into `dist-electron/` |
| `npm run dist:dir` | Build the unpacked desktop app only (fast, no installer) |

## Desktop app (Windows .exe)

The project doubles as a native Windows desktop app via **Electron**. Because the app
relies on server-side API routes, the desktop build runs Next.js in **standalone**
server mode: Electron spawns that server on a private localhost port (using its own
bundled Node) and loads it in a Chromium window — so the Stockfish worker, the API
proxies and everything else behave exactly as they do in the browser.

```bash
npm run dist
```

This produces, in `dist-electron/`:

- **`ChessStudio-Setup-1.0.0.exe`** — an NSIS installer (Start-menu + desktop shortcut,
  choose install directory, per-user, uninstaller).
- **`ChessStudio-Portable-1.0.0.exe`** — a single double-click executable that needs no
  installation.

`scripts/make-icon.mjs` generates `build-assets/icon.ico`; `scripts/prepare-electron.mjs`
copies the static assets and the Stockfish engine into the standalone server so
electron-builder can ship one self-contained folder. The Electron entry point is
`electron/main.js`.

---

## Project structure

```
chess-studio/
├── next.config.mjs                 # headers for /stockfish, webpack fallbacks
├── tailwind.config.ts              # design tokens, move-quality palette, keyframes
├── tsconfig.json                   # strict TS, "@/*" path alias
├── postcss.config.mjs
├── scripts/
│   └── setup-engine.mjs            # copies a Stockfish build into public/stockfish
├── public/
│   └── stockfish/                  # generated at install time (git-ignored)
└── src/
    ├── app/
    │   ├── layout.tsx              # root layout + <AppShell>
    │   ├── globals.css             # design system, component classes
    │   ├── page.tsx                # ANALYSIS BOARD
    │   ├── studio/page.tsx         # STUDIO (chapters, editor, PGN)
    │   └── api/
    │       ├── profile/route.ts    # Lichess / Chess.com profile proxy
    │       ├── games/route.ts      # recent games proxy
    │       └── explorer/route.ts   # Lichess Opening Explorer proxy
    ├── components/
    │   ├── AppShell.tsx            # nav, engine status, store hydration
    │   ├── Chessboard.tsx          # BoardSurface: moves, arrows, badges, promotion
    │   ├── AnalysisPanel.tsx       # engine lines + "why this move?" + review
    │   ├── OpeningBook.tsx         # opening name, win rates, continuations
    │   ├── ProfileFetch.tsx        # username/URL → profile → game list
    │   ├── StudioEditor.tsx        # drag-and-drop position editor
    │   ├── MoveList.tsx            # move table with quality badges
    │   ├── MoveQualityBadge.tsx    # animated classification icons
    │   ├── GameReviewSummary.tsx   # accuracy dials, eval graph, counts
    │   ├── EvalBar.tsx
    │   ├── EngineLines.tsx
    │   ├── BoardControls.tsx       # navigation + PGN/FEN import & export
    │   ├── ChapterList.tsx
    │   ├── ThemePicker.tsx         # board themes, piece styles, engine settings
    │   ├── board/
    │   │   ├── ChessboardLib.tsx   # ssr:false dynamic import + local prop types
    │   │   ├── pieces.tsx          # custom piece styles (glyph / neon / outline)
    │   │   └── PromotionOverlay.tsx
    │   └── ui/Primitives.tsx       # Panel, Button, Tabs, Toggle, Select, Slider…
    ├── hooks/
    │   ├── useStockfish.ts         # engine boot + live analysis with cancellation
    │   ├── useGameReview.ts        # full-game review on a dedicated engine
    │   ├── useOpening.ts           # local book + explorer, debounced
    │   ├── useBoardShortcuts.ts
    │   └── useMounted.ts
    ├── lib/
    │   ├── chess/
    │   │   ├── board.ts            # 64-square model, attack maps, SEE, material
    │   │   ├── tactics.ts          # forks, pins, hanging pieces, king safety
    │   │   ├── fen.ts              # parse/build/validate, castling & e.p. helpers
    │   │   ├── line.ts             # move line, navigation, PGN parsing
    │   │   └── pgn.ts              # PGN writer (comments, NAGs, %cal/%csl shapes)
    │   ├── engine/
    │   │   ├── uci.ts              # UCI parsing, win% / accuracy maths
    │   │   ├── StockfishEngine.ts  # worker wrapper with a serialised job queue
    │   │   └── engineManager.ts    # live + review engine instances
    │   ├── analysis/
    │   │   ├── classify.ts         # Brilliant → Blunder classification
    │   │   ├── explain.ts          # human-readable move explanations
    │   │   └── review.ts           # full-game review + accuracy scores
    │   ├── openings/               # bundled ECO book + lookup
    │   ├── api/                    # Lichess & Chess.com clients + browser wrappers
    │   └── theme/boardThemes.ts
    ├── store/
    │   ├── gameStore.ts            # analysis board state
    │   ├── studioStore.ts          # study + chapters (persisted)
    │   └── settingsStore.ts        # preferences (persisted)
    └── types/index.ts              # every shared type
```

---

## Features

### 1. Analysis board

* Drag or click to move, with a custom promotion picker.
* Live Stockfish evaluation with a configurable depth and MultiPV (1–5).
* Animated evaluation bar that flips with the board.
* Best-move arrow, last-move highlight, check indicator, legal-move dots.
* Right-**drag** to draw arrows, right-**click** to highlight squares, in four colours.
  Annotations are stored per move and exported to PGN as `[%cal]` / `[%csl]`.
* Keyboard navigation: `←` `→` `Home` `End`, `F` to flip.

### 2. Move classification & explanations

Every move gets one of ten labels, each with its own **crisp vector icon** (a teal `!!`,
a green ★, a thumbs-up, an open book, `?!`/`?`/`??`, …) in the style of the premium
analyzers — shown as an animated badge on the destination square and in the move list:

| ★ Best | ✦ Great | ✦✦ Brilliant | 👍 Excellent | ✓ Good | 📖 Book | ➔ Forced | ?! Inaccuracy | ? Mistake | ?? Blunder |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Classification is driven by the *drop in winning chances* (Lichess' win-probability model)
rather than raw centipawns, so a 0.5-pawn slip in a wild position is judged differently
from the same slip in a dead-drawn one. On top of that:

* **Forced** — only one legal move.
* **Book** — still inside the bundled opening book.
* **Great** — the played move is best *and* the runner-up loses ≥ 10% of winning chances.
* **Brilliant** — a genuine material sacrifice (verified with static exchange evaluation)
  that is still within 15 cp of best and keeps the position healthy.

Explanations are generated from the position, not from templates alone. The explainer
computes attack maps, runs SEE on every square, and detects forks, pins, loose pieces and
king pressure, producing sentences such as:

> **Nxd4 is a blunder because it leaves the knight on d4 undefended, costing 3.2 pawns —
> Qxd4 wins it on the spot.** The engine prefers Bb3, pinning the knight on c6 against the
> king. The evaluation moves from +0.42 to −2.10.

### 3. Full-game review

Runs on a **separate engine instance** so the board stays responsive. Produces per-side
accuracy (blended arithmetic/harmonic mean, as Lichess does), average centipawn loss, a
clickable evaluation graph, and a breakdown of every classification.

### 4. Opening explorer

* A bundled ECO book (~185 named lines) resolves the opening name instantly and offline.
* The Lichess Opening Explorer is layered on top for full coverage, White/Draw/Black win
  rates, move popularity and notable games. Switch between the **Lichess players** and
  **Masters** databases.
* Click any continuation to play it on the board.

### 5. Lichess & Chess.com import

Type a username or paste a profile URL (`lichess.org/@/…`, `chess.com/member/…`) — the
platform is detected automatically. Profile, ratings and the 20 most recent games are
fetched, and any game loads onto the analysis board in one click.

Both APIs are proxied through this app's own route handlers (`/api/profile`, `/api/games`)
so CORS is a non-issue and the descriptive `User-Agent` that Chess.com requires is always
sent.

### 6. Studio

* Multiple **chapters**, each with its own starting position, move line, orientation and
  notes. Everything is persisted to `localStorage`.
* A **position editor**: drag pieces from the palette onto the board (or arm a brush and
  click), move pieces freely between squares, erase, and control side-to-move, castling
  rights and the en-passant target. FEN is validated live — structural errors and
  "valid but not legal to play from" are reported separately.
* Per-move text commentary and board annotations.
* **Export** a single chapter or the whole study as standard PGN, with comments, NAGs,
  shape annotations and optional `[%eval]` tags. **Import** a PGN containing several games
  to create one chapter per game.

### 7. Appearance & language

Six board themes (Walnut, Marble, Neon Dark, Emerald, Midnight, Coral) and four piece
styles (Classic vector, Glyph, Neon, Outline), plus toggles for coordinates, legal-move
hints, the eval bar, the best-move arrow and classification badges, and sliders for
animation speed, search depth, MultiPV, review depth and hash size.

The entire interface is **bilingual — English and Russian (Русский)** — switchable from the
`EN / RU` toggle in the header (or the Board settings tab), including every panel, control,
and the move-classification names (Бриллиантовый, Замечательный, Лучший, …). The choice is
remembered per browser.

---

## Engine notes

* The app deliberately uses a **single-threaded** Stockfish build. Multi-threaded builds
  need `SharedArrayBuffer`, which requires `Cross-Origin-Embedder-Policy: require-corp` —
  and that header would break the outbound Lichess/Chess.com requests. If the page *is*
  cross-origin isolated and the build supports threads, `StockfishEngine` enables them
  automatically.
* Searches are serialised through a job queue. Starting a new search sends `stop` to the
  engine, so the board never lags behind the cursor; stale results are discarded by token.
* The transposition table is intentionally **not** cleared between positions in a review —
  that alone makes a full-game pass several times faster.

### Swapping in a different Stockfish build

`scripts/setup-engine.mjs` already knows how to harvest both the `stockfish.js` and
`stockfish` packages. To use a newer engine:

```bash
npm install stockfish
```

Re-run `node scripts/setup-engine.mjs`. The script prefers single-threaded entry points and
writes the chosen one into `public/stockfish/manifest.json`.

If `public/stockfish/` is missing or empty, the app does not crash: the header shows
"Engine unavailable" with a **Retry** button, and every non-engine feature keeps working.

---

## Third-party services

| Service | Used for | Docs |
| --- | --- | --- |
| Lichess API | Profiles, recent games | <https://lichess.org/api> |
| Lichess Opening Explorer | Opening statistics | <https://explorer.lichess.ovh> |
| Chess.com Published-Data API | Profiles, stats, monthly archives | <https://www.chess.com/news/view/published-data-api> |

All three are public and unauthenticated. Please respect their rate limits.

---

## License

MIT.
