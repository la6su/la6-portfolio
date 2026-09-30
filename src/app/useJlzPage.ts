// src/app/useJlzPage.ts — Phase 5: per-page lifecycle owner for route SFCs.
//
// Every semantic route SFC calls this composable once with its static
// `PageId`. It owns the render contract the legacy `renderView` implemented
// imperatively, now split across router + i18n/meta providers:
//
// - home intro activation (the template does not ship `section-active`);
// - i18n + per-route meta on every render (the router-owned providers);
// - the route announcer on page change;
// - the menu lifecycle binding on freshly rendered DOM;
// - UIkit hydration scoped to the page root (`update(el)`, never a
//   document-wide update), with the idle-callback re-pass.
//
// The scene runtime is never touched: navigation re-renders the DOM only and
// keeps the 3D world in sync through `jlz:route-change`. This file is the
// permanent per-page lifecycle owner (the legacy `renderView` side effects
// live here); the string-template adapter (`PageView.vue`) and the legacy
// router were removed in the Phase 5 cleanup.

import { onBeforeUnmount, onMounted } from 'vue'
import UIkit from 'uikit'

import { eventBus } from '../core/EventBus'
import { applyTranslations } from '../core/i18n'
import { applyMetaTags } from '../core/pageMeta'
import type { PageId } from '../core/routeManifest'
import { initMenuLifecycle } from './menuLifecycle'
import { setCurrentPage } from '../core/routePage'

/** In-file helper: UIkit's imperative update for the mounted subtree. */
function uiKitUpdate(el: Element): void {
  ;(UIkit as unknown as { update(el: Element): void }).update(el)
}

// The legacy `renderView` announces only on a page change, never on the
// initial render. A component remount is a page change (Vue Router keeps the
// record alive for a same-path re-push, so this never fires for those).
let mountedOnce = false

export function useJlzPage(page: PageId, rootEl: () => HTMLElement | null): void {
  let idleHandle: number | null = null
  let announcerRafHandle: number | null = null
  let mounted = false
  let disposeMenuLifecycle: (() => void) | null = null

  onBeforeUnmount(() => {
    mounted = false
    disposeMenuLifecycle?.()
    disposeMenuLifecycle = null
    if (announcerRafHandle !== null) {
      cancelAnimationFrame(announcerRafHandle)
      announcerRafHandle = null
    }
    if (idleHandle !== null && 'cancelIdleCallback' in window) {
      cancelIdleCallback(idleHandle)
      idleHandle = null
    }
  })

  // The legacy `renderView` post-render sequence, verbatim.
  function postRender(): void {
    const el = rootEl()
    if (!el) return
    if (page === 'home') {
      // Home: activate the intro section (the section template does not add
      // `section-active` in home mode).
      el.querySelector<HTMLElement>('[data-section="intro"]')?.classList.add('section-active')
    }
    applyTranslations()
    applyMetaTags(page)
    if (mountedOnce) {
      const announcer = document.getElementById('jlz-route-announcer')
      if (announcer) {
        announcer.textContent = ''
        if (announcerRafHandle !== null) cancelAnimationFrame(announcerRafHandle)
        announcerRafHandle = requestAnimationFrame(() => {
          announcerRafHandle = null
          if (mounted) announcer.textContent = document.title
        })
      }
    }
    disposeMenuLifecycle?.()
    disposeMenuLifecycle = initMenuLifecycle(el)
    uiKitUpdate(el)
    // Typed EventBus emission — app-lifetime listeners subscribe to this port.
    eventBus.emit('jlz:route-change', { page })
    if ('requestIdleCallback' in window) {
      idleHandle = requestIdleCallback(
        () => {
          idleHandle = null
          if (mounted && rootEl() === el) uiKitUpdate(el)
        },
        { timeout: 100 },
      )
    }
  }

  onMounted(() => {
    setCurrentPage(page)
    mounted = true
    postRender()
    mountedOnce = true
  })
}
