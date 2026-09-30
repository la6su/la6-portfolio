import { describe, it, expect } from 'vitest'
import {
  ROUTE_MANIFEST,
  MANIFEST_PAGES,
  resolveRoute,
  resolvePage,
  isRoutePath,
  isCaseStudyPath,
  pathForPage,
} from '../core/routeManifest'
import type { PageId } from '../core/routeManifest'

/** The current application surface: every public path and the page it owns. */
const EXPECTED: Array<{ path: string; page: PageId }> = [
  { path: '/', page: 'home' },
  { path: '/services', page: 'services' },
  { path: '/works', page: 'works' },
  { path: '/manifesto', page: 'manifesto' },
  { path: '/lab', page: 'lab' },
  { path: '/contact', page: 'contact' },
]

describe('route manifest', () => {
  it('maps every public path to its page', () => {
    for (const { path, page } of EXPECTED) {
      expect(resolveRoute(path)).toBe(page)
      expect(resolvePage(path)).toBe(page)
      expect(isRoutePath(path)).toBe(true)
    }
  })

  it('declares exactly the expected routes and nothing else', () => {
    expect(ROUTE_MANIFEST.map((entry) => entry.path)).toEqual(EXPECTED.map((entry) => entry.path))
    expect(ROUTE_MANIFEST).toHaveLength(6)
  })

  it('covers every PageId exactly once (bijection)', () => {
    const pages = MANIFEST_PAGES
    expect(pages).toHaveLength(new Set(pages).size)
    expect(new Set(pages)).toEqual(
      new Set<PageId>(['home', 'services', 'works', 'manifesto', 'lab', 'contact']),
    )
  })

  it('strict lookup rejects unknown paths', () => {
    expect(resolveRoute('/does-not-exist')).toBeUndefined()
    expect(isRoutePath('/does-not-exist')).toBe(false)
  })

  it('owns case-study detail paths without a manifest page mapping', () => {
    // A /works/:projectId path is a real route (CaseStudyView) but the page
    // mapping stays SPA-only: the manifest owns the six story pages.
    expect(resolveRoute('/works/case-1')).toBeUndefined()
    expect(isRoutePath('/works/case-1')).toBe(true)
    expect(isCaseStudyPath('/works/case-1')).toBe(true)
    expect(isCaseStudyPath('/works/')).toBe(false)
    expect(isCaseStudyPath('/works/till_at_night')).toBe(false)
  })

  it('lenient resolution falls back to home for unknown paths', () => {
    expect(resolvePage('/does-not-exist')).toBe('home')
    expect(resolvePage('')).toBe('home')
  })

  it('pathForPage is the exact inverse of resolveRoute for every page', () => {
    for (const { path, page } of EXPECTED) {
      expect(pathForPage(page)).toBe(path)
      expect(resolveRoute(pathForPage(page))).toBe(page)
    }
  })
})
