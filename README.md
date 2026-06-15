# Wuji Hand 2 — Range of Motion Viewer

Interactive, browser-based viewer for the **right** Wuji Hand 2. Loads the URDF +
STL meshes with [three.js](https://threejs.org/) and
[urdf-loader](https://github.com/gkjohnson/urdf-loaders).

**Live:** https://aaryaman-atomos.github.io/wuji-hand-2/

## Features

- Orbit / pan / zoom around the hand (drag, right-drag, scroll).
- Drive every joint with sliders — 20 revolute DOF, grouped by finger, clamped to
  the URDF limits.
- Translucent meshes with adjustable opacity and a show/hide toggle.
- Kinematic skeleton (bones + joint nodes) drawn underneath the mesh, with its own toggle.
- Per-finger range-of-motion point clouds — the reachable fingertip volume, sampled by
  Monte-Carlo over each finger's joint limits, with per-finger toggle buttons and a
  density slider.

## Running locally

ES modules require a server (a plain `file://` open will not work):

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

three.js and urdf-loader are loaded from a CDN via the import map in `index.html`, so
an internet connection is required the first time.

## Assets

Model assets live in `urdf/right.urdf` and `meshes/right/`, taken from the
[wuji-description](https://github.com/wuji-technology/wuji-description) package
(`hand2/body`).
