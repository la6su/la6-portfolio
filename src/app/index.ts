// Owns Vue Router mounting, browser navigation events, and route transitions.
// `entry-app.ts` loads this graph dynamically so page components remain lazy.
// Route navigation updates the semantic page and typed scene ports while the
// persistent Experience and SceneHost remain mounted.

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import { eventBus } from '../core/EventBus'
import { applyTranslations } from '../core/i18n'
import { applyMetaTags } from '../core/pageMeta'
import { isRoutePath, resolveRoute } from '../core/routeManifest'
import { RouteTransition } from '../UI/RouteTransition'
import AppShell from './AppShell.vue'
import { jlzRouteRecords, pageForPath } from './routes'

let mounted = false
let unmountMountedVueApp: (() => void) | null = null

/** Own the direct-entry hash handoff until the renderer is ready. */
export function createDeferredInitialHashGate(): {
  defer: (hash: string) => void
  invalidate: () => void
} {
  let generation = 0
  let unsubscribe: (() => void) | null = null
  const invalidate = () => {
    generation += 1
    unsubscribe?.()
    unsubscribe = null
  }
  return {
    defer: (hash) => {
      invalidate()
      const token = generation
      const onReady = () => {
        if (token !== generation) return
        unsubscribe?.()
        unsubscribe = null
        eventBus.emit('jlz:goto-section-by-hash', { hash })
      }
      unsubscribe = eventBus.on('jlz:webgl-ready', onReady)
    },
    invalidate,
  }
}

/** Own one deferred frame and invalidate callbacks that were superseded. */
export function createSingleFrameOwner(): {
  schedule: (callback: () => void) => void
  cancel: () => void
} {
  let frame: number | null = null
  let generation = 0
  const cancel = (): void => {
    generation += 1
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }
  return {
    schedule: (callback) => {
      cancel()
      const token = generation
      frame = requestAnimationFrame(() => {
        frame = null
        if (token !== generation) return
        callback()
      })
    },
    cancel,
  }
}

/** Mount the public Vue application on `#app` and take over navigation. */
export async function mountVueApp(): Promise<void> {
  if (mounted) return

  const root = document.getElementById('app')
  if (!root) throw new Error('Missing app element #app')
  mounted = true

  const router = createRouter({
    history: createWebHistory(),
    routes: jlzRouteRecords(),
  })

  // ── Route transition (legacy `routeTransition.run(render)` contract) ───
  // The cover phase completes inside the navigation guard, so the RouterView
  // re-render lands under the covered document; the reveal starts once the
  // route has settled. Under reduced motion both phases are synchronous
  // no-ops and the overlay element is never created (RouteTransition).
  const routeTransition = new RouteTransition()
  const initialHashGate = createDeferredInitialHashGate()
  const hashNavigationFrame = createSingleFrameOwner()
  const appUnsubs: Array<() => void> = []
  let disposed = false
  // The initial navigation skips the cover: the legacy `initRouter`
  // rendered the first page without the transition (no prior document to
  // cover), and a synchronous first commit leaves no startup gap in which
  // an early `jlz:navigate` could race the router.
  let coverNavigation = true
  router.beforeEach(async () => {
    if (coverNavigation) {
      coverNavigation = false
      return
    }
    await routeTransition.cover()
  })
  router.afterEach(() => {
    routeTransition.reveal()
  })
  router.onError(() => {
    hashNavigationFrame.cancel()
    routeTransition.dispose()
    initialHashGate.invalidate()
  })

  // ── Section-hash dispatch (legacy router contract) ─────────────────────
  // After navigation settles, a `#section-*` hash must reach the 3D
  // navigation owner (CinematicNav). The initial entry is deferred until
  // `jlz:webgl-ready` — dispatching earlier races the owner's subscription
  // and leaves the world with stale first-frame state (legacy comment).
  // Track the very first navigation (regardless of hash): only a direct
  // load that already carries a `#section-` hash defers the dispatch until
  // the 3D navigation owner is ready. In-app hash navigations dispatch on
  // the next frame, matching the legacy `navigateToPage` contract.
  let firstNavigation = true
  let hashNavigationGeneration = 0
  router.afterEach((to) => {
    hashNavigationFrame.cancel()
    const generation = ++hashNavigationGeneration
    const isInitial = firstNavigation
    firstNavigation = false
    initialHashGate.invalidate()
    if (!to.hash.startsWith('#section-')) return
    if (isInitial) {
      initialHashGate.defer(to.hash)
      return
    }
    // A first visit to a lazy route swaps the RouterView component only
    // after the dynamic import resolves — later than one frame. Dispatch
    // once the target section actually exists in the swapped-in route root
    // (bounded poll); a stale generation or the bound gives up silently,
    // matching the legacy no-target no-op.
    const targetId = to.hash.slice(1)
    let waitedFrames = 0
    const dispatchWhenReady = (): void => {
      if (generation !== hashNavigationGeneration) return
      if (document.getElementById(targetId)) {
        eventBus.emit('jlz:goto-section-by-hash', { hash: to.hash })
        return
      }
      if (waitedFrames++ >= 60) return
      hashNavigationFrame.schedule(dispatchWhenReady)
    }
    dispatchWhenReady()
  })

  const app = createApp(AppShell)
  // Resolve the initial navigation BEFORE the mount so RouterView renders
  // the landing component on its first pass. `router.install` starts the
  // initial navigation; the ready promise also gates in-app navigation
  // (below) against the startup gap.
  app.use(router)
  const routerReady = router.isReady()

  // ── In-app navigation (strict, like the legacy `navigateToPage`) ───────
  // The listeners register BEFORE the initial navigation settles: the
  // legacy initRouter wired them synchronously at startup, and an early
  // `jlz:navigate` (or anchor click) in the startup gap must not be lost.
  const navigateToPath = async (path: string): Promise<void> => {
    const hashIdx = path.indexOf('#')
    const purePath = hashIdx >= 0 ? path.slice(0, hashIdx) : path
    if (!resolveRoute(purePath) && !isRoutePath(purePath)) return
    // A push before the initial navigation settles is committed against
    // the start history entry (replace) and loses the session's first
    // back slot — the legacy contract never had this window because its
    // first render and listener wiring landed in one synchronous call.
    await routerReady
    if (disposed) return
    await router.push(path)
    if (disposed) return
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // jlz:navigate — strict in-app navigation request from UI controls/tests.
  // Its lifetime matches this router app and is released by unmountVueApp().
  appUnsubs.push(
    eventBus.on('jlz:navigate', ({ path }) => {
      if (path) void navigateToPath(path)
    }),
  )

  // jlz:lang-change — re-apply translations + per-page meta to the live DOM.
  appUnsubs.push(
    eventBus.on('jlz:lang-change', () => {
      applyTranslations()
      applyMetaTags(pageForPath(router.currentRoute.value.path))
    }),
  )

  // Anchor click capture — port of the legacy document capture handler.
  const onClick = (event: MouseEvent): void => {
    const anchorEl = (event.target as HTMLElement)?.closest(
      'a[href]',
    ) as HTMLAnchorElement | null
    if (!anchorEl) return
    const href = anchorEl.getAttribute('href')
    if (!href) return
    // A bare hash is a UIkit toggle / local control, not a route.
    if (href.startsWith('#')) {
      event.preventDefault()
      if (href === '#') return
      const target = document.getElementById(href.slice(1))
      if (target) {
        history.pushState(null, '', href)
        target.scrollIntoView({ behavior: 'smooth' })
      }
      return
    }
    const url = new URL(href, window.location.origin)
    if (url.origin === window.location.origin && isRoutePath(url.pathname)) {
      event.preventDefault()
      void navigateToPath(url.pathname + url.hash)
    }
  }
  document.addEventListener('click', onClick, true)

  let appMounted = false
  unmountMountedVueApp = () => {
    if (disposed) return
    disposed = true
    hashNavigationFrame.cancel()
    initialHashGate.invalidate()
    appUnsubs.splice(0).forEach((unsubscribe) => unsubscribe())
    document.removeEventListener('click', onClick, true)
    routeTransition.dispose()
    if (appMounted) app.unmount()
    appMounted = false
    if (
      (window as unknown as { __jlzRouterReady?: boolean }).__jlzRouterReady
    ) {
      delete (window as unknown as { __jlzRouterReady?: boolean })
        .__jlzRouterReady
    }
    mounted = false
    unmountMountedVueApp = null
  }

  try {
    await routerReady
    // A fresh client render (createApp) replaces `#app`'s content on mount:
    // the build-time prerender keeps the home route shell available before JS
    // boots, and the SFC re-renders identical DOM rather than hydrating it.
    app.mount(root)
    appMounted = true
    ;(window as unknown as { __jlzRouterReady?: boolean }).__jlzRouterReady =
      true
  } catch (error) {
    unmountMountedVueApp()
    throw error
  }

  if (import.meta.env.DEV) {
    window.__jlzTestUnmountVueApp = () => {
      window.__jlzRuntimeDestroy?.()
      unmountMountedVueApp?.()
      delete window.__jlzTestUnmountVueApp
    }
  }
}

/** Release the app-level listeners and timers before unmounting its Vue tree. */
export function unmountVueApp(): void {
  unmountMountedVueApp?.()
}
