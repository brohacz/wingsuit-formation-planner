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

Everything hangs off the module-scoped object `S = {rows, cols, mode, cells, bench}` declared at `app.js:1`.

- `cells` is keyed by `"r,c"` strings produced by `key(r, c)` (`app.js:9`). `bench` is a flat array of `{name, color}` objects for pilots who are resting off the formation.
- Anything that holds a pilot is addressed by a string key. Grid keys are `"r,c"`; bench keys are `"b:<index>"` produced by `bkey(i)` (`app.js:4`). Use the source-agnostic helpers `getPilot(k)`, `setPilot(k, d)`, `removePilot(k)` (`app.js:6`, `app.js:98`, `app.js:94`) instead of poking `S.cells` / `S.bench` directly — that's what lets drag-and-drop, the edit modal, and trash work uniformly across both.
- `mode` is `"regular"` or `"diamond"`. In diamond mode the `cols` control is hidden and row widths are computed by `rowCount(total, r)` (`app.js:168`), which produces a symmetric 1, 2, …, mid+1, …, 2, 1 pattern. The diamond is laid out absolutely inside a sized wrapper so rows stay centered; the regular mode uses CSS grid.
- `render()` (`app.js:200`) is the single source of truth for the DOM — every mutation calls it. There is no virtual DOM or diffing; the slot grid and bench are rebuilt on each render. `render()` calls `renderBench()` (`app.js:154`) at the end.
- `makeSlot()` (`app.js:32`) returns a `.slot` element and inlines the `ws()` SVG (`app.js:12`) for the wingsuit silhouette. Color comes from the cell, size from a parameter.

## Drag-and-drop

Pilots can be dragged between any two slots (swap or move), from a slot to the bench (rest), from the bench back to a slot (deploy, swapping if occupied), and from either source onto the trash zone (remove).

- A single module-level `_drag = {src: <key>}` holds the active drag source while a gesture is in flight; it is cleared on `dragend`.
- `attachDragSource(el, k)` (`app.js:57`) makes any element a drag source; `attachSlotDropTarget(el, k)` makes any slot a drop target. The bench-zone and trash-zone listeners are wired separately at the bottom of `app.js` (they live outside the per-slot rebuild, so they survive `render()`).
- The drop reducers are `dropOnSlot`, `dropOnBench`, `dropOnTrash` (`app.js:103`, `app.js:114`, `app.js:130`). They mutate `S` then call `render()`.
- After a drop, `_dragMoved` is set so the source's `click` handler skips opening the edit modal once.

## Import / export

`toJSON()` and `fromJSON()` (`app.js:322`, `app.js:326`) define the persisted shape: `{rows, cols, mode, cells, bench}`. `fromJSON` clamps `rows`/`cols` to 1–12, coerces `mode` to one of the two valid values, and filters `bench` entries to ones with string `name` and `color` — imported JSON is the trust boundary, so keep validation there if extending the schema. Older exports without `bench` still load (it defaults to `[]`).

## Conventions to preserve

- Keep the project to these three sibling files (`index.html`, `styles.css`, `app.js`) — no build step, no module bundler, no framework. Plain `<link>` and `<script defer>` only, so `file://` opens still work.
- Keep identifiers short (the existing code uses `S`, `ws`, `ekey`, `cnt`, `sx`, `rW`, etc.). Don't "modernize" them piecemeal.
- After any state mutation, call `render()` rather than patching the DOM in place.
- Address pilots through the `getPilot` / `setPilot` / `removePilot` helpers when the source could be either a slot or the bench. Only the helpers know the `"b:N"` vs `"r,c"` distinction.
