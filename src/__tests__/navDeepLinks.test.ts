// src/__tests__/navDeepLinks.test.ts — deep-link contract lock.
//
// Every hash target in `navItems` must resolve against the DOM the route SFCs
// actually render. The menu overlays deep-link into page chapters via
// `CinematicNav.goToSectionByHash`, which silently no-ops when the id does not
// exist — this suite turns that silent failure into a red test by mounting the
// real route SFCs (same harness as vueAppRouter.test.ts, scene stubbed) and
// querying each hash.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'

vi.mock('uikit', () => ({
  default: { update: vi.fn() },
}))
vi.mock('../app/menuLifecycle', () => ({
  initMenuLifecycle: () => () => undefined,
}))
vi.mock('../app/SceneHost.vue', () => ({
  default: { name: 'SceneHost', render: () => null },
}))
vi.mock('../core/motionPolicy', () => ({
  prefersReducedMotion: () => true,
}))

import AppShell from '../app/AppShell.vue'
import { jlzRouteRecords } from '../app/routes'

// Published section URLs are a route contract, not menu data. Keeping this
// fixture beside the route test prevents production navigation from carrying
// fields that only exist to prove deep links.
const NAV_SECTION_LINKS = [
  '/#section-intro',
  '/#section-about',
  '/#section-works',
  '/#section-contact',
  '/services#section-services-creativeDirection',
  '/services#section-services-interactiveDev',
  '/services#section-services-motionRealtime',
  '/services#section-services-aiSystems',
  '/works#section-works-01',
  '/works#section-works-02',
  '/works#section-works-03',
  '/works#section-works-04',
  '/manifesto#section-manifesto-purpose',
  '/manifesto#section-manifesto-clarity',
  '/manifesto#section-manifesto-emotion',
  '/manifesto#section-manifesto-simplicity',
  '/lab#section-lab-01',
  '/lab#section-lab-02',
  '/lab#section-lab-03',
  '/lab#section-lab-04',
  '/contact#section-contact-01',
  '/contact#section-contact-02',
  '/contact#section-contact-03',
  '/contact#section-contact-04',
] as const

// path → hash targets collected from stable published section URLs.
const hashTargets = new Map<string, string[]>()
for (const href of NAV_SECTION_LINKS) {
  const url = new URL(href, 'http://localhost/')
  const targets = hashTargets.get(url.pathname) ?? []
  targets.push(url.hash)
  hashTargets.set(url.pathname, targets)
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('published section hashes resolve against the rendered route DOM', () => {
  it('collects hash targets for every public SPA route', () => {
    expect([...hashTargets.keys()]).toEqual(
      expect.arrayContaining(['/', '/services', '/works', '/manifesto', '/lab', '/contact']),
    )
  })

  for (const [path, hashes] of hashTargets) {
    it(`resolves every ${path} menu hash (${hashes.length} targets)`, async () => {
      const announcer = document.createElement('div')
      announcer.id = 'jlz-route-announcer'
      announcer.className = 'uk-hidden-visually'
      document.body.appendChild(announcer)

      const router = createRouter({
        history: createMemoryHistory(),
        routes: jlzRouteRecords(),
      })
      const wrapper = mount(AppShell, { attachTo: document.body, global: { plugins: [router] } })
      await router.push(path)
      await router.isReady()
      await flushPromises()

      for (const hash of hashes) {
        expect(
          document.querySelector(hash),
          `${path}${hash} must exist in the rendered DOM`,
        ).not.toBeNull()
      }
      wrapper.unmount()
    })
  }
})
