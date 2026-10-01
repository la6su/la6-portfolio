---
name: justlovejazz-ui
description: Apply JUSTLOVEJAZZ interface, theme, accessibility and visual QA contracts when changing route views, controls, overlays, or Less.
---

# JUSTLOVEJAZZ UI

Read `AGENTS.md`, the current phase in `NEXT.md`, and the affected Vue/DOM
owner. UIkit supplies the baseline; use project styles for the authored 3D
shell. Route DOM lives in `src/app/views/`, with lifecycle in
`src/app/useJlzPage.ts`.

`CinematicNav` owns story reveal/scrolling. `FullscreenOverlay` owns fullscreen
interaction. Keep one focus/state owner; scene interaction stays semantic in
DOM. Theme and motion use typed ports, not body-state inference.

## Verification

Choose representative coverage for the changed surface:

- desktop/narrow viewport, EN/RU where copy changes, auto/inverse;
- keyboard/focus restoration, pointer/touch and reduced motion;
- direct/deep-link entry and route transitions;
- actual WebGPU and dev `?force-webgl-backend=1` when scene appearance changes.

Pass the ready splash Enter control before route screenshots; wait for the
intended scene/story state. Check contrast, clipping and console errors.
Use `package.json` for commands and
`NEXT.md` for backend evidence limits.
