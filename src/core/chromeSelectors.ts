// DOM selectors for the Vue-owned app chrome that scene/UI input policy must
// not reinterpret as scene interaction. These strings are the controller-side
// rename source; keep them in sync with the owning templates:
// PersistentConsole.vue (#cinematic-nav, .jlz-topbar),
// FullscreenOverlayView.vue (#jlz-fs-overlay), index.html (#jlz-app-loader),
// views/NavMenu.vue ([data-cinematic-menu]), views/ContactFooter.vue
// ([data-contact-footer]), views/HomeView.vue ([data-baku-carousel-control]),
// and views/WorksView.vue (.jlz-works-actions).

/** Chrome that BakuCarousel pointer input must never claim as a scene drag. */
export const UI_CHROME_SELECTOR =
  '#cinematic-nav, #jlz-fs-overlay, #jlz-app-loader, [data-cinematic-menu], [data-contact-footer], [data-baku-carousel-control]'

/** Chrome the works-plane tap handler must not reinterpret as a plane tap. */
export const WORKS_TAP_CHROME_SELECTOR =
  '.jlz-works-actions, #jlz-fs-overlay, #cinematic-nav, #jlz-contact-launcher, .jlz-topbar, [data-cinematic-menu]'
