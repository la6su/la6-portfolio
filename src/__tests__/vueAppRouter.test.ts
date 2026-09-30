// src/__tests__/vueAppRouter.test.ts — Phase 5 Vue Router candidate slice.
//
// Two layers: the pure route records (bijection with the Phase 3 route
// manifest, one semantic route SFC per record) and the `AppShell` mount
// (a real memory-history router over jsdom: the home SFC renders into
// `#spa-content`, `jlz:route-change` is emitted, and an in-app push
// re-renders the target page with its meta applied). The imperative side
// effects are mocked — the SFCs' DOM contract is covered by the
// SFC/string-template parity suite and the live candidate gate.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('uikit', () => ({
  default: { update: vi.fn() },
}))
vi.mock('../core/i18n', () => ({
  applyTranslations: vi.fn(),
}))
vi.mock('../core/pageMeta', () => ({
  applyMetaTags: vi.fn(),
}))
vi.mock('../app/menuLifecycle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/menuLifecycle')>()
  return { ...actual, initMenuLifecycle: vi.fn(() => () => undefined) }
})
// Phase 7: AppShell now mounts the persistent SceneHost (a real TresCanvas).
// This suite is routing-scoped — the Tres canvas must not boot in jsdom (no
// WebGL; @pmndrs/pointer-events crashes on the event-manager setup). Stub the
// persistent root to nothing; the SceneHost handshake is covered by its own
// unit tests and the live e2e gate.
vi.mock('../app/SceneHost.vue', () => ({
  default: { name: 'SceneHost', render: () => null },
}))
// Reduced-motion: the route transition renders synchronously, so the tests
// stay deterministic without waiting out the overlay animation.
vi.mock('../core/motionPolicy', () => ({
  prefersReducedMotion: () => true,
}))

import AppShell from '../app/AppShell.vue'
import { pageForPath, jlzRouteRecords } from '../app/routes'
import HomeView from '../app/views/HomeView.vue'
import { ROUTE_MANIFEST, resolvePage } from '../core/routeManifest'
import { eventBus } from '../core/EventBus'
import { applyTranslations } from '../core/i18n'
import { applyMetaTags } from '../core/pageMeta'
import type { PageId } from '../core/routeManifest'

const setupAnnouncer = (): void => {
  if (!document.getElementById('jlz-route-announcer')) {
    const announcer = document.createElement('div')
    announcer.id = 'jlz-route-announcer'
    announcer.className = 'uk-hidden-visually'
    announcer.setAttribute('aria-live', 'polite')
    document.body.appendChild(announcer)
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('jlzRouteRecords', () => {
  it('derives one record per manifest entry plus the catch-all fallback', () => {
    const records = jlzRouteRecords()
    expect(records).toHaveLength(ROUTE_MANIFEST.length + 2)
    expect(records.find((r) => r.path === '/works/:projectId')?.name).toBe('case-study')
    for (const entry of ROUTE_MANIFEST) {
      const record = records.find((r) => r.path === entry.path)
      expect(record?.name).toBe(entry.page)
      // The landing SFC is eagerly available; secondary pages are explicit
      // lazy route components so they do not enter the startup graph.
      expect(['object', 'function']).toContain(typeof record?.component)
    }
    expect(records[0]?.component).toBe(HomeView)
    const fallback = records[records.length - 1]
    expect(fallback?.path).toBe('/:pathMatch(.*)*')
    expect(fallback?.component).toBe(HomeView)
  })

  it('pageForPath is the lenient manifest resolution (unknown → home)', () => {
    for (const entry of ROUTE_MANIFEST) {
      expect(pageForPath(entry.path)).toBe(entry.page)
    }
    expect(pageForPath('/stale-deep-link')).toBe('home')
    expect(pageForPath('/stale-deep-link')).toBe(resolvePage('/stale-deep-link'))
  })
})

describe('AppShell + route SFCs', () => {
  const mountShell = async (start = '/'): Promise<void> => {
    setupAnnouncer()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: jlzRouteRecords(),
    })
    const wrapper = mount(AppShell, { attachTo: document.body, global: { plugins: [router] } })
    // Seed the direct-entry location: the install-triggered initial
    // navigation resolves against the memory history's '/', so the target
    // push settles it as the first completed navigation.
    await router.push(start)
    await router.isReady()
    await flushPromises()
    // Keep the router reachable for the navigation assertions.
    ;(window as unknown as { __testRouter?: typeof router }).__testRouter = router
    wrapper.unmount.bind(wrapper)
  }

  it('renders the home page into #spa-content and emits jlz:route-change', async () => {
    const emitSpy = vi.spyOn(eventBus, 'emit')
    await mountShell('/')
    const content = document.getElementById('spa-content')
    expect(content?.getAttribute('role')).toBe('main')
    // innerHTML round-trips through the parser — compare the rendered
    // section markers instead of the raw template string.
    expect(
      content?.querySelector('[data-section="intro"]')?.classList.contains('section-active'),
    ).toBe(true)
    expect(content?.innerHTML).toContain('data-section="intro"')
    expect(content?.innerHTML).toContain('data-section="works"')
    expect(emitSpy).toHaveBeenCalledWith(
      'jlz:route-change',
      expect.objectContaining({ page: 'home' }),
    )
    expect(applyMetaTags).toHaveBeenCalledWith('home')
    expect(applyTranslations).toHaveBeenCalled()
  })

  it('renders the lenient fallback for an unknown direct entry (URL untouched)', async () => {
    await mountShell('/stale-deep-link')
    const content = document.getElementById('spa-content')
    expect(content?.innerHTML).toContain('data-section="intro"')
    const router = (window as unknown as { __testRouter: ReturnType<typeof createRouter> })
      .__testRouter
    expect(router.currentRoute.value.path).toBe('/stale-deep-link')
  })

  it('re-renders on an in-app push and applies the target page meta', async () => {
    await mountShell('/')
    const router = (window as unknown as { __testRouter: ReturnType<typeof createRouter> })
      .__testRouter
    await router.push('/works')
    await flushPromises()
    const content = document.getElementById('spa-content')
    expect(content?.innerHTML).toContain('data-page-section')
    expect(applyMetaTags).toHaveBeenCalledWith('works')
    expect(applyMetaTags).toHaveBeenLastCalledWith('works' as PageId)
  })
})

describe('mountVueApp prerender adoption', () => {
  // `mountVueApp` uses `createWebHistory`, so the direct-entry location is
  // seeded through `history.replaceState` before the fresh import.
  it('replaces the prerendered home shell on a non-home entry', async () => {
    const marker = document.createElement('div')
    marker.id = 'prerender-marker'
    const appEl = document.createElement('div')
    appEl.id = 'app'
    appEl.appendChild(marker)
    document.body.appendChild(appEl)
    window.history.replaceState(null, '', '/works')
    vi.resetModules()
    const { mountVueApp } = await import('../app')
    await mountVueApp()
    await flushPromises()
    // The prerendered home DOM belongs to a different page — a fresh client
    // render replaces it (no hydration attempt, no mismatch).
    expect(document.getElementById('prerender-marker')).toBeNull()
    expect(document.getElementById('section-works-01')).toBeTruthy()
    const rooms = document.querySelectorAll(
      '.jlz-works-page > .jlz-works-section[data-page-section]',
    )
    expect(rooms).toHaveLength(4)
    expect(document.querySelectorAll('.jlz-works-page .jlz-works-aperture')).toHaveLength(4)
    expect(document.querySelector('.jlz-works-hero')).toBeNull()
    expect(document.getElementById('spa-content')?.dataset.pageView).toBe('content')
  })

  it('keeps the prerendered home available pre-mount, then renders the home SFC', async () => {
    const appEl = document.createElement('div')
    appEl.id = 'app'
    document.body.appendChild(appEl)
    const marker = document.createElement('div')
    marker.id = 'prerender-marker'
    appEl.appendChild(marker)
    // The prerendered shell is available before the Vue mount (SEO, the
    // no-scene contract, the domcontentloaded e2e assertions).
    expect(document.getElementById('prerender-marker')).toBeTruthy()
    window.history.replaceState(null, '', '/')
    vi.resetModules()
    const { mountVueApp } = await import('../app')
    await mountVueApp()
    await flushPromises()
    // The mount replaces the prerendered shell with the home SFC render
    // (a deliberate replace, not a hydration — see the mount comment).
    expect(document.getElementById('prerender-marker')).toBeNull()
    expect(
      document
        .querySelector('main#spa-content [data-section="intro"]')
        ?.classList.contains('section-active'),
    ).toBe(true)
    expect(document.getElementById('spa-content')?.dataset.pageView).toBe('home')
  })

  it('dispatches an in-app section hash once the lazy route root renders it', async () => {
    // First visit to a lazy route swaps the component after the dynamic
    // import resolves — later than one frame. The hash dispatch must wait
    // for the target section instead of firing into the old route root.
    const appEl = document.createElement('div')
    appEl.id = 'app'
    document.body.appendChild(appEl)
    window.history.replaceState(null, '', '/')
    vi.resetModules()
    // resetModules forks the module registry: spy on the SAME eventBus
    // instance the freshly imported app graph will emit on.
    const { mountVueApp } = await import('../app')
    const { eventBus: appBus } = await import('../core/EventBus')
    await mountVueApp()
    await flushPromises()

    const emitSpy = vi.spyOn(appBus, 'emit')
    const anchor = document.createElement('a')
    anchor.href = '/services#section-services-aiSystems'
    document.body.appendChild(anchor)
    anchor.click()
    // Dynamic imports can take longer under a full parallel suite. Wait for
    // the observable contract instead of assuming a fixed number of frames.
    await vi.waitFor(
      () => {
        expect(document.getElementById('section-services-aiSystems')).toBeTruthy()
        expect(
          emitSpy.mock.calls.some(
            ([name, detail]) =>
              name === 'jlz:goto-section-by-hash' &&
              (detail as { hash?: string }).hash === '#section-services-aiSystems',
          ),
        ).toBe(true)
      },
      { timeout: 3000 },
    )
  })
})
