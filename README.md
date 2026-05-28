# Wingsuit Formation Planner

A browser-based planner for wingsuit flying formations — coordinated shapes
flown by multiple wingsuit pilots.

**Live:** https://brohacz.github.io/wingsuit-formation-planner/

Pick a layout (regular rows × columns grid, or a diamond that swells to a
middle row and tapers back), click a slot to assign a pilot name and pick
their suit color, and get a visual map of who flies where. Drag pilots between
slots to swap or reposition them, park them on the **bench** to rest, or drop
them in the **trash** to remove. Formations can be exported to JSON and
re-imported, so a plan can be saved, shared with the group, or loaded back
later.

## Run

Open `index.html` directly in a browser, or serve the directory:

```sh
python3 -m http.server
```

No build step, no dependencies — a single self-contained HTML file.
