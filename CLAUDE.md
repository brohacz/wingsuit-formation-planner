# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

A browser-based planner for **wingsuit flying formations** — coordinated shapes flown by multiple wingsuit pilots. The user picks a layout (regular rows×columns grid, or a diamond that swells to a middle row and tapers back), clicks a slot to assign a pilot name and pick their suit color, and gets a visual map of who flies where. Each filled slot shows a small SVG wingsuit silhouette in the pilot's color with their name. Formations can be exported to JSON and re-imported, so a plan can be saved, shared with the group, or loaded back later.

## Project shape

A single self-contained file: `index.html`. No build system, no package manager, no tests, no dependencies. Vanilla HTML + CSS + JavaScript in one document.

To run: open `index.html` in a browser, or serve the directory (e.g. `python3 -m http.server`) and visit it.

## Design-token assumption

The CSS references variables that are **not defined in this file**: `--color-background-primary`, `--color-text-secondary`, `--color-border-tertiary`, `--font-sans`, `--font-mono`, `--border-radius-md`, `--border-radius-lg`, `--color-background-danger`, `--color-text-danger`, `--color-border-success`, etc.

The page is designed to be embedded in (or styled by) a host that provides these tokens. Standalone, slots and buttons will render but with browser-default colors. When changing styles, prefer reusing the existing `--color-*` / `--border-radius-*` token names rather than hard-coding values, so the page keeps theming through the host.

## State and rendering

Everything hangs off the module-scoped object `S = {rows, cols, mode, cells}` declared at `index.html:140`.

- `cells` is keyed by `"r,c"` strings produced by `key(r, c)` (`index.html:144`). Removing a pilot is `delete S.cells[k]`; assigning is `S.cells[k] = {name, color}`.
- `mode` is `"regular"` or `"diamond"`. In diamond mode the `cols` control is hidden and row widths are computed by `rowCount(total, r)` (`index.html:164`), which produces a symmetric 1, 2, …, mid+1, …, 2, 1 pattern. The diamond is laid out absolutely inside a sized wrapper so rows stay centered; the regular mode uses CSS grid.
- `render()` (`index.html:169`) is the single source of truth for the DOM — every mutation calls it. There is no virtual DOM or diffing; the slot grid is rebuilt on each render.
- `makeSlot()` (`index.html:151`) returns a `.slot` element and inlines the `ws()` SVG (`index.html:146`) for the wingsuit silhouette. Color comes from the cell, size from a parameter.

## Import / export

`toJSON()` and `fromJSON()` (`index.html:231`, `index.html:235`) define the persisted shape: `{rows, cols, mode, cells}`. `fromJSON` clamps `rows`/`cols` to 1–12 and coerces `mode` to one of the two valid values, so imported JSON is the trust boundary — keep validation there if extending the schema.

## Conventions to preserve

- Keep the project a single static file unless there's a strong reason to split.
- Keep identifiers short (the existing code uses `S`, `ws`, `ekey`, `cnt`, `sx`, `rW`, etc.). Don't "modernize" them piecemeal.
- After any state mutation, call `render()` rather than patching the DOM in place.
