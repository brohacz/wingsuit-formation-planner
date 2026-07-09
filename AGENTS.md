# AGENTS.md

Notes for future agents working in this repo. Add resolutions to confusions here.

## formation-3d.html

- **Standalone 3D viewer**, separate from the three-file planner app (`index.html` /
  `styles.css` / `app.js`). It reuses the visual language of `wingsuit-3d.html`
  (twilight sky dome, cloud decks, wind streaks, film grain, corner frame, HUD)
  but places **one extruded-SVG wingsuit per pilot** on the half-step grid,
  colored by suit, with name labels, point switching, and playback.
- It loads `sample-formation.json` via `fetch`, but **`fetch` is blocked over
  `file://`** (CORS), which is the repo's primary open-the-file workflow. So the
  same JSON is also embedded as the `EMBEDDED` const and used as the fallback.
  When the sample formation changes, update BOTH the JSON file and the embedded
  copy (regenerate the minified blob from `sample-formation.json`).
- This is a **vertical (stacked) formation**, not a plan view: the planner's 2D
  rows are stacked in altitude, each rank higher AND slightly in front of the
  one below. Grid -> world mapping: `hx` -> lateral world x (`HX`); row `r` ->
  altitude (world y = `-r*VY`, so row 0 is highest) PLUS a small forward push
  (world z = `r*FZ`; heads face -z, so "front" = -z and lower r is more forward).
  Do NOT map rows to flat depth (an earlier version did — it looked like a plan
  view, not a stack). `VY`/`FZ` set the climb angle. The camera (`frameCamera`)
  sits front-right and only slightly above so the altitude stagger reads.
- Each pilot's rank altitude is tweened into `info.by` (base y); the idle bob is
  added ON TOP as `g.position.y = info.by + bob` so the bob never clobbers the
  rank height.
- A pilot is a 3-level nested group: outer `g` (grid position + PITCH flat
  rotation + grow-in scale) -> `scaled` (fixed icon scale) -> `inner` (template
  clone carrying the SVG `scale.y = -1` head-up flip). **Scaling lives on its own
  node on purpose** — calling `setScalar` on the flipped node would clobber the
  `scale.y = -1` and render pilots upside down.
- Pilots persist across points (one object per lowercased name) so switching a
  point **tweens** each pilot from its old slot to the new one; pilots absent
  from a point fade+shrink out, returning ones fade back in.

## Testing the 3D view headless

- `formation-3d.html` needs WebGL. Headless Chromium (Playwright) renders it only
  with software GL flags: `--use-gl=angle --use-angle=swiftshader
  --ignore-gpu-blocklist --enable-unsafe-swiftshader`. Serve the directory over
  http (not `file://`) so `fetch` of the JSON succeeds. `window.__goPoint(i)`
  snaps to a point for stable screenshots; `window.__setCam(x,y,z)` moves the camera.
