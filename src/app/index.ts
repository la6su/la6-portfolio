// Owns Vue Router mounting, browser navigation events, and route transitions.
// `entry-app.ts` loads this graph dynamically so page components remain lazy.
// Route navigation updates the semantic page and typed scene ports while the
// persistent Experience and SceneHost remain mounted.

import { createApp, nextTick } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import { eventBus } from '../core/EventBus'
import { applyTranslations, setLang } from '../core/i18n'
import { applyMetaTags } from '../core/pageMeta'
import {
  langFromPath,
  localizedPath,
  resolvePagePath,
  unlocalizedPath,
} from '../core/routeManifest'
import { RouteTransition } from '../UI/RouteTransition'
import AppShell from './AppShell.vue'
import { jlzRouteRecords } from './routes'

let mounted = false
let unmountMountedVueApp: (() => Promise<void>) | null = null

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
  const cancel = (): void => {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
  }
  return {
    schedule: (callback) => {
      cancel()
      frame = requestAnimationFrame(() => {
        frame = null
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

  // Cover before RouterView changes and reveal after the new route settles.
  // The cover phase completes inside the navigation guard, so the RouterView
  // re-render lands under the covered document; the reveal starts once the
  // route has settled. Under reduced motion both phases are synchronous
  // no-ops; AppShell keeps the statically declared overlay hidden.
  const routeTransition = new RouteTransition()
  let appMounted = false
  let routeFocusGeneration = 0
  let destroyAppShell: (() => Promise<void>) | null = null
  let unmountPromise: Promise<void> | null = null
  const initialHashGate = createDeferredInitialHashGate()
  const hashNavigationFrame = createSingleFrameOwner()
  const appUnsubs: Array<() => void> = []
  let disposed = false
  // The initial navigation skips the cover because there is no previous page
  // to hide. Its flag is consumed synchronously by the first guard.
  let coverNavigation = true
  router.beforeEach(async (to, from) => {
    if (disposed) return false
    setLang(langFromPath(to.path))
    if (to.path === from.path) return
    if (coverNavigation) {
      coverNavigation = false
      return
    }
    // Startup navigation can settle before AppShell has mounted its overlay.
    if (!appMounted) return
    await routeTransition.cover()
    if (disposed) return false
  })
  router.afterEach((to, from) => {
    const focusGeneration = ++routeFocusGeneration
    if (!disposed && appMounted && unlocalizedPath(to.path) !== unlocalizedPath(from.path)) {
      // RouterLink focus can be lost when its route view is removed. Move
      // keyboard and screen-reader users to the new semantic page after Vue
      // has committed the RouterView swap. Locale-only changes keep focus on
      // the language control because their unlocalized paths are identical.
      void nextTick(() => {
        if (disposed || focusGeneration !== routeFocusGeneration) return
        document.getElementById('spa-content')?.focus({ preventScroll: true })
      })
    }
    if (!disposed && appMounted && to.path !== from.path) routeTransition.reveal()
  })
  router.onError(() => {
    hashNavigationFrame.cancel()
    routeTransition.cancel()
    initialHashGate.invalidate()
  })

  // ── Section-hash dispatch ───────────────────────────────────────────────
  // After navigation settles, a `#section-*` hash must reach the 3D
  // navigation owner (CinematicNav). The initial entry is deferred until
  // `jlz:webgl-ready` — dispatching earlier races the owner's subscription
  // and leaves the world with stale first-frame state.
  // Track the very first navigation (regardless of hash): only a direct
  // load that already carries a `#section-` hash defers the dispatch until
  // the 3D navigation owner is ready. In-app hash navigations dispatch on
  // the next frame.
  let firstNavigation = true
  router.afterEach((to) => {
    if (disposed) return
    hashNavigationFrame.cancel()
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
    // (bounded poll); a newer navigation cancels its scheduled frame and the
    // bound gives up silently.
    const targetId = to.hash.slice(1)
    let waitedFrames = 0
    const dispatchWhenReady = (): void => {
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

  // ── In-app navigation ──────────────────────────────────────────────────
  // Register listeners before initial navigation settles so an early
  // `jlz:navigate` (or anchor click) in the startup gap is not lost.
  const navigateToPath = async (path: string): Promise<void> => {
    if (router.resolve(path).name === 'fallback') return
    // Wait until the initial navigation commits so this push preserves the
    // first history entry and the browser back slot.
    await routerReady
    if (disposed) return
    await router.push(path)
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
    eventBus.on('jlz:lang-change', ({ lang }) => {
      applyTranslations()
      applyMetaTags(resolvePagePath(router.currentRoute.value.path))
      const current = router.currentRoute.value
      const localized = localizedPath(lang === 'RU' ? 'RU' : 'EN', current.path)
      if (localized !== current.path) {
        void router.replace({ path: localized, query: current.query, hash: current.hash })
      }
    }),
  )

  // Story hashes must reach the 3D navigation owner. Ordinary fragment links
  // use browser scrolling; UIkit controls keep their own click behavior.
  const onClick = (event: MouseEvent): void => {
    const anchorEl = (event.target as HTMLElement)?.closest('a[href]') as HTMLAnchorElement | null
    if (!anchorEl) return
    const href = anchorEl.getAttribute('href')
    if (!href?.startsWith('#section-')) return
    event.preventDefault()
    const current = router.currentRoute.value
    void router.push({ path: current.path, query: current.query, hash: href })
  }
  document.addEventListener('click', onClick, true)

  const unmountApp = (): Promise<void> => {
    if (unmountPromise) return unmountPromise
    disposed = true
    hashNavigationFrame.cancel()
    initialHashGate.invalidate()
    appUnsubs.splice(0).forEach((unsubscribe) => unsubscribe())
    document.removeEventListener('click', onClick, true)
    routeTransition.dispose()
    unmountPromise = (async () => {
      try {
        await destroyAppShell?.()
      } finally {
        if (appMounted) app.unmount()
        appMounted = false
        destroyAppShell = null
        delete window.__jlzRouterReady
        mounted = false
        if (unmountMountedVueApp === unmountApp) unmountMountedVueApp = null
      }
    })()
    return unmountPromise
  }
  unmountMountedVueApp = unmountApp

  try {
    await routerReady
    // The app-level unmount path can run while initial navigation is still
    // pending. Its teardown owns the pending mount too: never resurrect the
    // Vue tree after that teardown has completed.
    if (disposed) return
    // A fresh client render (createApp) replaces `#app`'s content on mount:
    // the build-time prerender keeps the home route shell available before JS
    // boots, and the SFC re-renders identical DOM rather than hydrating it.
    const shell = app.mount(root) as unknown as {
      destroyExperience: () => Promise<void>
    }
    destroyAppShell = () => shell.destroyExperience()
    appMounted = true
    window.__jlzRouterReady = true
  } catch (error) {
    await unmountApp()
    throw error
  }

  if (import.meta.env.DEV) {
    window.__jlzTestUnmountVueApp = async () => {
      try {
        await unmountMountedVueApp?.()
      } finally {
        delete window.__jlzTestUnmountVueApp
      }
    }
  }
}