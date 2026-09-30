---
name: justlovejazz-ui
description: Apply JUSTLOVEJAZZ interface, theme, accessibility and visual QA contracts when changing route views, controls, overlays, or Less.
---

# JUSTLOVEJAZZ UI

Read the affected Vue/DOM owner and relevant [brand/theme](../../docs/BRAND.md) section. UIkit supplies the baseline; use project
styles for the authored 3D shell. Route DOM lives in `src/app/views/`, with
lifecycle in `src/app/useJlzPage.ts`; the old string templates are gone.

`CinematicNav` owns story reveal/scrolling. `FullscreenOverlay` owns fullscreen
interaction. Keep one focus/state owner; scene interaction stays semantic in
DOM. Theme and motion use typed ports, not body-state inference.

For builder work, read [Page Builder](../../docs/PAGE_BUILDER.md). Change typed
Style fields, validation, compiler and preview together. Never hand-edit
`*.generated.less` or import `admin/` into the public app.

## Verification

Choose representative coverage for the changed surface:

- desktop/narrow viewport, EN/RU where copy changes, auto/inverse;
- keyboard/focus restoration, pointer/touch and reduced motion;
- direct/deep-link entry and route transitions;
- actual WebGPU and dev `?force-webgl-backend=1` when scene appearance changes.

Pass the ready splash Enter control before route screenshots; wait for the
intended scene/story state. Check contrast, clipping and console errors.
Style changes also need preview widths/locales, save/compile/reload, undo, and
production output without the admin graph. Use [Development](../../docs/DEVELOPMENT.md)
for commands and backend evidence limits.
