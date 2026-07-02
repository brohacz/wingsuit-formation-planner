# Wingsuit Formation Planner

A browser-based planner for wingsuit flying formations - coordinated shapes
flown by multiple wingsuit pilots.

**Live:** https://brohacz.github.io/wingsuit-formation-planner/

Place pilots on a freeform half-step grid: every row exposes both
square-aligned and diamond-aligned positions, so one formation can mix both.
Click a slot to assign a pilot name and pick their suit color, and get a
visual map of who flies where.

## Features

- **Drag and drop** - drag pilots between slots to swap or reposition them,
  park them on the **bench** to rest, or drop them in the **trash** to
  remove. Works on touch devices too: long-press lifts a pilot.
- **Multi-select** - rubber-band or Cmd/Ctrl+click to select several pilots
  and move them together as a block.
- **Points** - a plan holds a sequence of formations (the points flown on one
  dive), stepped through with a chip bar. The Play button runs the whole
  plan in slow motion, gliding each pilot from point to point.
- **Roster** - the plan's crew in one panel. A pilot's name and color are
  plan-wide: edit them once and every point updates.
- **Undo/redo** - Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z across any change,
  including imports.
- **Save and share** - export/import JSON, named saves in the browser,
  autosave on every change, and a copyable share link that encodes the whole
  plan in the URL.

## Run

Open `index.html` directly in a browser, or serve the directory:

```sh
python3 -m http.server
```

Three plain files (`index.html`, `styles.css`, `app.js`) - no build step, no
dependencies.
