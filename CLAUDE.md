# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

A browser-based planner for **wingsuit flying formations** — coordinated shapes flown by multiple wingsuit pilots. The user places pilots on a freeform half-step grid (every row exposes both square-aligned and diamond-aligned positions), clicks a slot to assign a pilot name and pick their suit color, and gets a visual map of who flies where. Each filled slot shows a small SVG wingsuit silhouette in the pilot's color with their name. A plan can hold multiple **points** — the sequence of formations flown on one dive — stepped through with a chip bar. Formations can be exported to JSON and re-imported, so a plan can be saved, shared with the group, or loaded back later.

## Project shape

Three sibling files, no build system, no package manager, no tests, no dependencies:

- `index.html` — markup only (page chrome, toolbar, formation container, bench/trash zones, modals).
- `styles.css` — all styling and design tokens. Linked from `<head>`.
- `app.js` — all behavior (state, rendering, drag-and-drop, import/export). Loaded with `defer` so it runs after the DOM is parsed.

To run: open `index.html` in a browser, or serve the directory (e.g. `python3 -m http.server`) and visit it. The three files are loaded with relative paths so the open-the-file workflow still works over `file://`.

## Design-token assumption

The CSS references variables that are **not defined in this file**: `--color-background-primary`, `--color-text-secondary`, `--color-border-tertiary`, `--font-sans`, `--font-mono`, `--border-radius-md`, `--border-radius-lg`, `--color-background-danger`, `--color-text-danger`, `--color-border-success`, etc.

The page is designed to be embedded in (or styled by) a host that provides these tokens. Standalone, slots and buttons will render but with browser-default colors. When changing styles, prefer reusing the existing `--color-*` / `--border-radius-*` token names rather than hard-coding values, so the page keeps theming through the host.

## State and rendering

A dive plan is an ordered list of **points** held in `PTS` (current index `PI`). The module-scoped `S` is always the **active point** (`S === PTS[PI]`) — every function below operates on `S`, so switching points just swaps `S` wholesale (`switchPoint`) and re-renders. Each point is one flat freeform formation:

```js
S = PTS[PI] = { name, rows, cols, cells: {}, bench: [] }
```

There is no manual canvas size. `fitGrid(pt)` (called at the top of every `render()` for the active point and by `parsePoint` on import) derives `rows`/`cols`, with two behaviors switched by the **Autofit** checkbox (`#af-chk`, module flag `AF`, persisted in the plan JSON as `autofit`, default **off**):

- **Autofit off (default)**: a static **9×9** grid. It never shifts or shrinks; it only expands when pilots sit beyond it (out-of-bounds imports, toggling autofit off on a large formation).
- **Autofit on**: the grid hugs the cells' bounding box with **exactly one empty row above and below, and one empty column (two half-steps) left and right**; an empty plan defaults to 5×5. Dropping a pilot onto that outer ring grows the canvas on the next render; tightening the formation shrinks it. The refit shifts cell keys via `shiftCells` (`dr = 1 - rmin`, `dhx = 2 - hmin`) so the formation stays compact and centered; `render()` remaps `_selected` and `lastEdit` by the returned shift, which means **cell keys are not stable across renders in autofit mode** — never cache them across a mutation.

`rows`/`cols` are runtime-derived and not persisted. There is no shape picker and no readout bar — the half-step grid is the only layout.

On screens narrower than the canvas, `#fw` scrolls horizontally (`overflow:auto`). When the `_centerScroll` flag is set — on page load, point switch/delete, and `fromJSON` — `render()` scrolls the formation's bounding box (or the canvas midpoint when the point is empty) into the center of the view; edit renders leave the user's manual pan alone.

### Points

The points bar (`#points-bar`, rebuilt by `renderPoints()` inside `render()`) shows one chip per point plus actions for the active one: **+ Point** (`addPoint` — deep-clones the current point via `JSON.parse(JSON.stringify(...))` and inserts it after, so the next point starts as "same crew, same shape, now edit"), rename (`renamePoint`, a `prompt()`), reorder (`movePoint(±1)`, swaps and follows), and delete (`delPoint`, `confirm()`-guarded, disabled when only one point remains). Switching points clears `_selected`.

**Dive playback**: the ▶ Play action in the points bar (`startPlay`/`stopPlay`, timer in `_playT`, `PLAY_MS` = 4200 ms per point) rewinds to point 1 and auto-advances through the plan **in slow motion** — `switchPoint`'s `fromPlay` flag makes `animatePointSwitch` use the slow profile (`PLAY_FLIGHT_MS` = 2800 ms flight, gentle `cubic-bezier(.45,0,.25,1)` in-out curve) instead of the snappy 340 ms editing glide — stopping on the last point. When playback starts already on point 1 there is no rewind flight, so the first tick is only the hold portion (`PLAY_MS - PLAY_FLIGHT_MS`); while running, the button reads ◼ Stop. Playback is interrupted by anything the user does that would fight it: a manual point switch (every `switchPoint` call without the internal `fromPlay` flag stops the run — this covers chip clicks and add point), the direct `stopPlay()` calls in `delPoint`/`renamePoint`/`movePoint` (which mutate the plan without switching), opening the pilot modal, starting a mouse or touch drag, loading a plan (`fromJSON`), or pressing Esc. The Play button is disabled for single-point plans.

Point switches (and point deletes) play a **FLIP animation**: `switchPoint` captures every pilot card's `getBoundingClientRect()` keyed by lowercased name (`capturePilotRects` — identity is global, so names match across points), renders the new point with the stagger suppressed, then `animatePointSwitch` glides each card from its old rect to its new one via WAAPI (`el.animate`, 340 ms, z-index bumped for the flight and restored on `finished`). Pilots that enter the formation — or cross between bench and formation, where a glide would clip on container overflow — fade/scale in instead. Capturing rects mid-flight hands an interrupted glide off smoothly. WAAPI ignores the CSS reduced-motion overrides, so `_reduceMotion` (a `matchMedia` query) gates the whole thing.

### The half-step grid

The canvas has `(2*cols - 1) * rows` snap positions — every row exposes both the integer half-step columns (square-aligned) and the offset half-step columns (diamond-aligned), so one formation can mix both alignments. Cell keys are `"r,hx"` where `hx` is the half-column index (0..2*cols-2).

Filled slots render at 70×80 (the wingsuit silhouette is 40 px, name plate font 10 px). The half-step horizontal spacing is `cW/2 = 35`, so a pilot placed in a "diamond" half-position one row below two square neighbors visually overlaps with both of them — mimicking how the lower-row pilot tucks between the wings of the upper pair when viewed from above. Empty positions render as 30×30 hit areas centered on the half-position and get a higher `z-index` (via `.ff-canvas .slot:not(.filled){z-index:2}`) so they stay clickable even where neighboring filled slots cover their center. The `compact` flag on `slotHTML` is set only for empty slots and switches off the dashed border/background until hover.

For speed, the canvas is built as **one HTML string** (`slotHTML(k, d, i, style, compact)` per slot, single `wrap.innerHTML` parse — hundreds of small `createElement`+`innerHTML` calls were ~80% of render time) and behavior is **event-delegated**: `wireCanvas(wrap)` attaches four listeners on the canvas (click → `slotClick`, dragstart/dragend → `dragStartHandler`/`dragEndHandler`, touchstart → `touchStart`) that resolve the slot via `e.target.closest('.slot…')`. There are no per-slot listeners; filled slots carry `draggable="true"` in their markup.

Drag-and-drop doesn't use per-slot drop targets. `attachFreeformSnap(canvas, ff, hsX, sY, cyOffset, hxMax)` wires `dragover` / `dragleave` / `drop` on the canvas itself. It converts the pointer's `clientX/Y` to the nearest snap key with `Math.round(x/hsX) - 1` (horizontal) and `Math.round((y - cyOffset)/sY)` (vertical), highlights that slot's `.drag-over` class on hover, and on drop hands off to `dropOnSlot(src, k)`. Net effect: drop anywhere in the canvas and the pilot snaps to the closest center — whether that snap point was empty (move) or filled (swap).

- `cur()` returns the active point (it is just `S`); it exists so the helpers below read naturally and call sites don't care which point is active. Plan-wide operations (roster, identity propagation) iterate `for(const pt of PTS)`.
- `cells` is keyed by `"r,hx"` strings produced by `key(r, c)`. `bench` is a flat array of `{name, color}` objects for pilots who are resting off the formation.
- Anything that holds a pilot is addressed by a string key. Grid keys are `"r,hx"`; bench keys are `"b:<index>"` produced by `bkey(i)`. Use the source-agnostic helpers `getPilot(k)`, `setPilot(k, d)`, `removePilot(k)` — they read/write `cur()` and let drag-and-drop, the edit modal, and trash work uniformly.
- `render()` is the single source of truth for the DOM — every mutation calls it. There is no virtual DOM or diffing; the canvas, points bar, and bench are rebuilt on each render (`renderPoints()`, `renderBench()`).
- `slotHTML()` returns a `.slot` button's markup and inlines the `ws()` SVG for the wingsuit silhouette. Color comes from the cell, size from a parameter; all dynamic values interpolated into markup are `esc()`d (including the color in `ws()`'s `fill` and the modal nameplate style — colors come from untrusted imports/share links).

## Undo / redo

History is a stack of `toJSON()` snapshots (`_hist`, index `_hi`, capped at `HIST_MAX` 100) captured by `snapshot()` at the end of every `render()` — since all mutations funnel through `render()`, no per-feature wiring is needed. A new entry is pushed only when the **data** changed: `histKey` compares snapshots with `cur` neutralized, so switching points just updates the current entry's `cur` (Ctrl+Z never walks back through navigation, but an undo still jumps to the point where the change happened). Pushing truncates any redo tail. `applyHist(±1)` restores via `fromJSON` with `_restoring` set so the restore's own render doesn't touch the history; it works for imports/share-link loads too (an accidental import is undoable). Bound to Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y (skipped while focus is in an input/textarea, so native text-field undo still works) and to the `#btn-undo`/`#btn-redo` toolbar buttons, whose disabled state `updateHistUI()` refreshes on every render.

## Global pilot identity

A pilot's **identity** (name + suit color) is plan-wide; only their **position** is per-point. Saving the pilot modal — from a slot, a bench item, or the roster — rewrites every occurrence of that pilot across all points via `rosterApply`, so name/color can never diverge between points. The rules, all living in the `msav` handler and roster helpers:

- Editing an existing pilot (rename and/or recolor) applies to every cell and bench entry in every point. Renaming onto a name that already belongs to a *different* roster pilot is rejected with a toast (case-insensitive; re-casing a pilot's own name is allowed).
- Filling an empty slot with a name that already exists in the roster places that pilot there **and** re-unifies their color everywhere to the one just picked.
- Creating a genuinely new pilot also copies them to every *other* point's bench (deduped via `pilotInPoint(name, pt)`) so the crew is available throughout the plan.
- Drags, removes, and trash drops stay point-local — they move or clear positions, not identities. The "Clear" button clears only the current point.

## Pilot roster

The Roster button opens `modal-roster`, listing the whole plan's crew. There is no separate roster data structure — `rosterList()` derives it on every open: the union of distinct pilots (case-insensitive trimmed name, first-seen color wins) over every point's `cells` and `bench`, each with location strings (`coordLabel(r, hx)` or `"bench"`, prefixed with `P<n>` when the plan has more than one point).

Row actions and the Add button reuse `modal-pilot` instead of duplicating the name/swatch UI. The module flag `rkey` switches the modal's semantics: `null` is the normal per-slot flow keyed by `ekey`; `{old: name}` means "edit this pilot everywhere" (Remove → `rosterRemove` deletes every occurrence); `{add: true}` means "new roster pilot" (save → pushed onto **every** point's bench). The same duplicate-name toast applies. Closing `modal-pilot` always clears `rkey` (in `hideModal`), and `openModal` resets it plus the modal title, so a roster edit can never leak into the next slot edit. Save/Cancel/Remove in roster context return to the reopened roster modal.

## Drag-and-drop

Pilots can be dragged between any two slots (swap or move), from a slot to the bench (rest), from the bench back to a slot (deploy, swapping if occupied), and from either source onto the trash zone (remove).

- A single module-level `_drag = {src: <key>, multi?}` holds the active drag source while a gesture is in flight; it is cleared on `dragend`. The optional `multi` field holds the captured offset map when the gesture is a multi-drag.
- Canvas slots get their drag behavior via `wireCanvas`'s delegated listeners; `attachDragSource(el, k)` (same shared `dragStartHandler`/`dragEndHandler`) is used for bench items, which are still individual elements. The bench-zone and trash-zone listeners are wired separately at the bottom of `app.js` (they live outside the per-render rebuild, so they survive `render()`).
- The drop reducers are `dropOnSlot`, `dropOnBench`, `dropOnTrash`. They mutate the current mode via `cur()` then call `render()`. Each one branches early to a multi-drag variant when `_drag.multi` is set.
- After a drop, `_dragMoved` is set so the source's `click` handler skips opening the edit modal once. It is cleared again when the gesture ends (a 0-timeout in `dragEndHandler`, so a browser-synthesized post-drop click is still swallowed; directly in `touchReset`, where the prevented `touchend` guarantees no click follows) — otherwise it would eat the next unrelated click.

### Touch

HTML5 drag events don't fire on mobile browsers, so `touchstart` (delegated on the canvas, per-element on bench items) feeds a parallel touch layer (module state `_touch`). A 200 ms long-press lifts the pilot (`touchLift`): it sets the same `_drag = {src, multi}` the mouse path uses (including multi-drag capture from `_selected`), clones the slot into a `position:fixed` `.touch-ghost` that follows the finger, and from then on `touchmove` is `preventDefault`ed so the page doesn't scroll. Moving more than ~8 px before the timer fires cancels the lift, so a normal scroll that starts on a slot still scrolls. Drop targets are hit-tested with `document.elementFromPoint` (`touchTarget`): a `.ff-canvas` ancestor reuses the snap function the canvas exposes as `canvas._snap`, otherwise the nearest `.slot[data-key]`, bench zone, or trash zone wins, and `touchend` hands off to the same `dropOnSlot` / `dropOnBench` / `dropOnTrash` reducers. `touchend` while a drag is active is `preventDefault`ed so no synthetic click follows; a quick tap never activates the layer and falls through to the native click (edit modal). `touchcancel` and multi-finger touches reset via `touchReset`. Because native scrolling is suppressed mid-drag, `touchAutoScroll` scrolls the page while the finger holds near the top/bottom viewport edge so off-screen targets (e.g. the bench below a tall canvas) stay reachable.

## Selection and multi-move

`_selected = new Set<key>` holds the currently selected slot keys (per-point; point switching clears it). Three ways to populate it:

- **Rubber-band**: `setupRubberBand()` listens on `#fw` for `mousedown` (left button, not on any `.slot` or `button`). It creates a `position:fixed` `.rubber-band` div on the document body once movement crosses 4 px, then on every `mousemove` re-computes which filled-slot bounding-rect centers fall inside the rectangle (`getBoundingClientRect`). Shift+rubber-band is additive (the prior `_selected` is treated as the baseline).
- **Cmd/Ctrl+click** on a filled slot: `toggleSelect(k)`.
- **Esc** or **click in empty canvas**: `clearSelection()`. The Esc handler skips clearing when it's actually dismissing an open modal.

Selection visual: `.slot.selected` adds an outline and bumps `z-index` so the selection sits above neighboring filled/empty slots. `applySelectedVisual()` re-applies the class after every `render()` rebuild.

**Multi-drag**: in `dragStartHandler`, if the dragged key is in `_selected` and there's more than one selected, it captures `multi = computeMultiOffsets(leadKey)` — a list of `{key, dr, dc}` offsets from the lead. On drop:

- `dropOnSlot` → `dropMultiOnSlot` computes each pilot's target as `(dropR + dr, dropC + dc)` and validates: every target must be in-bounds (`isValidSlot` checks the half-step grid), no two targets can collide, and no target may land on a non-selected occupied slot. Any failure rejects the move with a toast; on success, sources are cleared first then targets are written, and `_selected` is rewritten to the new keys.
- `dropOnBench` / `dropOnTrash` apply to all selected slots at once (bench: move each to the bench, dedupe by source; trash: remove each).

Dragging an unselected pilot clears the selection first (single-drag from then on). Dragging a selected pilot tags every other `.selected` slot with `.dragging` so they dim together until drop.

## Import / export

`toJSON()` and `fromJSON()` define the persisted shape — a plan with one flat entry per point plus the active index:

```json
{"points":[{"name":"Point 1","cells":{"1,2":{"name":"Anna","color":"#1d9e75"}},"bench":[...]}, ...],"cur":0,"autofit":false}
```

Each entry in `points` is sanitized by `parsePoint(d, defName)`: `name` falls back to `"Point <n>"` and is trimmed to 24 chars, `cells`/`bench` go through `normalizeForm` (cell keys must be `r,hx` integer pairs within sane bounds and values must carry string `name`+`color`; bench entries without string `name` *and* `color` are dropped; colors are passed through `safeColor()`, which keeps only safe CSS color forms and falls back to the default suit color otherwise), and `fitGrid` derives the dimensions — old exports carrying `rows`/`cols` simply have them ignored. `cur` is clamped to the points range. **Imported JSON is the trust boundary**, so keep validation there if extending the schema.

Backward compat: a document (or point entry) carrying a `mode` string is a retired multi-mode/legacy format and goes through `migratePoint(d, name)`, which maps the old shapes onto the half-step grid — regular `(r,c)` → `(r, 2c)`; a diamond of widest `w` centers row `r` (width `cnt`) at `hx=(w-1)-(cnt-1)+2c`; a freeform sub-state carries over verbatim. The point's saved active mode decides which layout's positions survive (when it actually has pilots placed; otherwise freeform's), and every pilot from the other modes' cells and benches lands on the bench (deduped via `pilotInPoint`) so nobody is lost. `fromJSON` wraps any non-`points` document as a one-point plan, which also covers the oldest top-level `{rows, cols, mode, cells, bench}` format. The load is atomic: all points are parsed before any state (`PTS`, `PI`, `AF`, the Autofit checkbox) is committed, so a failed import throws without disturbing the current plan (`AF` is set for the parse because `fitGrid` reads it, and rolled back on throw).

## Saving and sharing

Three persistence paths beyond export/import JSON, all reusing `toJSON()` / `fromJSON()`:

- **Autosave** — `localStorage` under `wfp:autosave`, a single `toJSON()` string. `autosave()` is called at the end of every `render()`, so any state change (assign, drag, mode switch, clear, etc.) is captured. On page load, `loadAutosave()` restores it. The autosave is overwritten by any subsequent render, so it always reflects the last in-page state.
- **Named local saves** — `localStorage` under `wfp:saves`, a map of `{<name>: <toJSON-string>}`. The Saved modal lets the user save the current formation under a name, then load or delete any entry. `getSaves` / `setSaves` are the only readers/writers; `renderSavesList()` rebuilds the modal contents. Saving with an existing name silently overwrites.
- **Share-link URL hash** — `shareURL()` builds `<current-url>#f=<base64url-of-toJSON>` and copies it to the clipboard. `applyHashIfAny()` decodes the hash and feeds it to `fromJSON()`. Base64 is URL-safe (`+/=` rewritten to `-_` with stripped padding) and Unicode-safe via `TextEncoder` / `TextDecoder`. No compression — typical exports fit in URL limits. After a successful load the hash is **consumed** (`history.replaceState` drops it) so the shared plan immediately becomes the autosave and any later edits survive a reload.

**Page-load order** (at the bottom of `app.js`): URL hash (loaded once, then cleared) → autosave → default empty state. So a share link loads the shared formation on first open; from then on (including reloads) the user's autosave — which now reflects their edits to that plan — takes over.

## Conventions to preserve

- Keep the project to these three sibling files (`index.html`, `styles.css`, `app.js`) — no build step, no module bundler, no framework. Plain `<link>` and `<script defer>` only, so `file://` opens still work.
- Keep identifiers short (the existing code uses `S`, `ws`, `ekey`, `cnt`, `sx`, `rW`, `cur`, etc.). Don't "modernize" them piecemeal.
- After any state mutation, call `render()` rather than patching the DOM in place.
- Address pilots through the `getPilot` / `setPilot` / `removePilot` helpers when the source could be either a slot or the bench. Only the helpers know the `"b:N"` vs `"r,c"` distinction.
- Read the active point through `cur()`; for plan-wide work iterate `for(const pt of PTS)`.
- `S` must always be `PTS[PI]` — never let them diverge. Anything that replaces the points array or index (point switch/delete, `fromJSON`) must reassign `S`, clear the selection, and `render()`.
- Pilot identity (name + color) is global: any code path that changes a pilot's name or color must go through `rosterApply` (and the duplicate-name check) so every point stays in sync. Positions stay point-local.
