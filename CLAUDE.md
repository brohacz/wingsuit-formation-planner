# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

A browser-based planner for **wingsuit flying formations** — coordinated shapes flown by multiple wingsuit pilots. The user picks a layout (regular rows×columns grid, or a diamond that swells to a middle row and tapers back), clicks a slot to assign a pilot name and pick their suit color, and gets a visual map of who flies where. Each filled slot shows a small SVG wingsuit silhouette in the pilot's color with their name. Formations can be exported to JSON and re-imported, so a plan can be saved, shared with the group, or loaded back later.

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

Everything hangs off the module-scoped object `S` declared at `app.js:1`. The two formation modes own **everything separately** — dimensions, cells, and bench — so editing one doesn't disturb the other:

```js
S = {
  mode,                                                       // which mode is active
  regular: { rows, cols, cells: {}, bench: [] },              // grid: rows × cols
  diamond: { rows,        cells: {}, bench: [] }              // diamond: rows = widest (no cols)
}
```

The `rows`/`cols` inputs in the topbar read and write `cur().rows` / `cur().cols`; switching modes restores each mode's own dimensions. The cols input is hidden in diamond mode.

- `cur()` (`app.js:8`) returns the active mode's `{cells, bench}`; `other()` (`app.js:9`) returns the inactive one. **Never read `S.cells` or `S.bench` — always go through `cur()` / `other()`.**
- `cells` is keyed by `"r,c"` strings produced by `key(r, c)` (`app.js:21`). `bench` is a flat array of `{name, color}` objects for pilots who are resting off the formation.
- Anything that holds a pilot is addressed by a string key. Grid keys are `"r,c"`; bench keys are `"b:<index>"` produced by `bkey(i)` (`app.js:10`). Use the source-agnostic helpers `getPilot(k)`, `setPilot(k, d)`, `removePilot(k)` (`app.js:12`, `app.js:110`, `app.js:106`) — they read/write `cur()` and let drag-and-drop, the edit modal, and trash work uniformly.
- `mode` is `"regular"` or `"diamond"`. In diamond mode the `cols` control is hidden and row widths are computed by `rowCount(total, r)` (`app.js:181`), which produces a symmetric 1, 2, …, mid+1, …, 2, 1 pattern. The diamond is laid out absolutely inside a sized wrapper so rows stay centered; the regular mode uses CSS grid. In diamond, `rows` means "widest" — the single integer that determines both the widest row and (implicitly via `2*rows-1`) the total row count.
- `render()` (`app.js:213`) is the single source of truth for the DOM — every mutation calls it. There is no virtual DOM or diffing; the slot grid and bench are rebuilt on each render. `render()` calls `renderBench()` (`app.js:166`) at the end.
- `makeSlot()` (`app.js:44`) returns a `.slot` element and inlines the `ws()` SVG (`app.js:24`) for the wingsuit silhouette. Color comes from the cell, size from a parameter.

## Cross-mode propagation

The two modes are otherwise isolated, with one exception: when a pilot is **created** (an empty slot is filled via the edit modal), they are also copied to the *other* mode's bench so the same roster is available in both shapes. The propagation rules:

- Trigger: `msav` handler, slot was empty (`getPilot(ekey)` returned undefined), name is non-empty, target is a slot (not the bench).
- Skipped if a pilot with the same case-insensitive trimmed name already exists in the other mode (in either cells or bench) — see `pilotInMode(name, m)` (`app.js:13`).
- Edits, drags, removes, and trash drops do *not* propagate. Mode-isolated state means each mode owns its own positions and color choices.
- The "Clear" button clears only the current mode.

## Drag-and-drop

Pilots can be dragged between any two slots (swap or move), from a slot to the bench (rest), from the bench back to a slot (deploy, swapping if occupied), and from either source onto the trash zone (remove).

- A single module-level `_drag = {src: <key>}` holds the active drag source while a gesture is in flight; it is cleared on `dragend`.
- `attachDragSource(el, k)` (`app.js:69`) makes any element a drag source; `attachSlotDropTarget(el, k)` (`app.js:85`) makes any slot a drop target. The bench-zone and trash-zone listeners are wired separately at the bottom of `app.js` (they live outside the per-slot rebuild, so they survive `render()`).
- The drop reducers are `dropOnSlot`, `dropOnBench`, `dropOnTrash` (`app.js:115`, `app.js:126`, `app.js:142`). They mutate the current mode via `cur()` then call `render()`.
- After a drop, `_dragMoved` is set so the source's `click` handler skips opening the edit modal once.

## Import / export

`toJSON()` and `fromJSON()` define the persisted shape:

```json
{"mode":"regular","regular":{"rows":5,"cols":5,"cells":{...},"bench":[...]},"diamond":{"rows":3,"cells":{...},"bench":[...]}}
```

`fromJSON` coerces `mode` to one of the two valid values. Each mode's dimensions and `cells`/`bench` are sanitized via `normalizeMode(m, fallbackDims, withCols)`: `rows` (and `cols` if `withCols`) are clamped to 1–12 by `clampDim`, with `fallbackDims` providing a fallback when the per-mode field is missing. Bench entries without string `name` *and* `color` are dropped. **Imported JSON is the trust boundary**, so keep validation there if extending the schema.

Backward compat handles two older formats via the same path:
1. Pre-per-mode-state legacy: top-level `{rows, cols, mode, cells, bench}`. The active mode gets the legacy data with its dimensions; the other mode gets the same dimensions as a starting point and every distinct pilot from the legacy data lands on its bench (deduped via `pilotInMode`).
2. Per-mode-state without per-mode dimensions: `{rows, cols, mode, regular:{cells,bench}, diamond:{cells,bench}}`. Each mode inherits the top-level `rows`/`cols` via `fallbackDims`, then takes over its own dimensions on next save.

## Saving and sharing

Three persistence paths beyond export/import JSON, all reusing `toJSON()` / `fromJSON()`:

- **Autosave** — `localStorage` under `wfp:autosave`, a single `toJSON()` string. `autosave()` is called at the end of every `render()`, so any state change (assign, drag, mode switch, clear, etc.) is captured. On page load, `loadAutosave()` restores it. The autosave is overwritten by any subsequent render, so it always reflects the last in-page state.
- **Named local saves** — `localStorage` under `wfp:saves`, a map of `{<name>: <toJSON-string>}`. The Saved modal lets the user save the current formation under a name, then load or delete any entry. `getSaves` / `setSaves` are the only readers/writers; `renderSavesList()` rebuilds the modal contents. Saving with an existing name silently overwrites.
- **Share-link URL hash** — `shareURL()` builds `<current-url>#f=<base64url-of-toJSON>` and copies it to the clipboard. `applyHashIfAny()` decodes the hash and feeds it to `fromJSON()`. Base64 is URL-safe (`+/=` rewritten to `-_` with stripped padding) and Unicode-safe via `TextEncoder` / `TextDecoder`. No compression — typical exports fit in URL limits.

**Page-load order** (at the bottom of `app.js`): URL hash wins → autosave → default empty state. So a share link always loads the shared formation (even on returning users), and a regular reload picks up where the user left off.

## Conventions to preserve

- Keep the project to these three sibling files (`index.html`, `styles.css`, `app.js`) — no build step, no module bundler, no framework. Plain `<link>` and `<script defer>` only, so `file://` opens still work.
- Keep identifiers short (the existing code uses `S`, `ws`, `ekey`, `cnt`, `sx`, `rW`, `cur`, etc.). Don't "modernize" them piecemeal.
- After any state mutation, call `render()` rather than patching the DOM in place.
- Address pilots through the `getPilot` / `setPilot` / `removePilot` helpers when the source could be either a slot or the bench. Only the helpers know the `"b:N"` vs `"r,c"` distinction.
- Always read mode-scoped state through `cur()` / `other()`. Directly touching `S.regular` / `S.diamond` is fine when you genuinely need to reach into a specific mode (e.g., the new-pilot propagation does `other().bench.push(...)`), but avoid hard-coding `'regular'` / `'diamond'` strings in business logic — let `cur()` and `other()` flip with `S.mode`.
