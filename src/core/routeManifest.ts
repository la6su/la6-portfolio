// src/core/routeManifest.ts — Phase 3 pure route contract.
//
// The single source of truth for the application's public paths and the
// `PageId` vocabulary. Vue Router and static publishing resolve against this
// manifest instead of re-declaring the mapping. Pure by design: no DOM, no
// window, no globals — unit-testable without a browser.
//
// Adding or renaming a route is a change here plus one line in the router;
// the mapping must never be duplicated.

/** The closed page vocabulary the manifest maps every public path to. */
export type PageId = 'home' | 'services' | 'works' | 'manifesto' | 'lab' | 'contact'

interface RouteEntry {
  readonly path: string
  readonly page: PageId
}

/** Every public route, in the order the navigation menu presents them. */
export const ROUTE_MANIFEST: readonly RouteEntry[] = [
  { path: '/', page: 'home' },
  { path: '/services', page: 'services' },
  { path: '/works', page: 'works' },
  { path: '/manifesto', page: 'manifesto' },
  { path: '/lab', page: 'lab' },
  { path: '/contact', page: 'contact' },
] as const

/** Every page the manifest maps to, in manifest order. */
export const MANIFEST_PAGES: readonly PageId[] = Object.freeze(
  ROUTE_MANIFEST.map((entry) => entry.page),
)

const PAGE_BY_PATH = new Map<string, PageId>(
  ROUTE_MANIFEST.map((entry) => [entry.path, entry.page]),
)

const PATH_BY_PAGE = new Map<PageId, string>(
  ROUTE_MANIFEST.map((entry) => [entry.page, entry.path]),
)

/**
 * The manifest-owned path for a page. `PageId` is a closed set that exactly
 * mirrors the manifest, so the lookup is total; the assertion documents that
 * invariant instead of re-declaring paths at the call site.
 */
export function pathForPage(page: PageId): string {
  return PATH_BY_PAGE.get(page)!
}

/**
 * Strict lookup: `undefined` for a path the manifest does not own. Navigation
 * (history push) should only target known paths — unknown paths must be a no-op
 * so a typo in a link never silently lands the user on `home`.
 */
export function resolveRoute(path: string): PageId | undefined {
  return PAGE_BY_PATH.get(path)
}

/**
 * Lenient resolution: the mapped page, or `home` for unknown paths. This is
 * the initial-load behaviour — a shared deep link to a stale or preview path
 * should still present the application at its home face.
 */
export function resolvePage(path: string): PageId {
  return PAGE_BY_PATH.get(path) ?? 'home'
}

/** True when the manifest owns the path (strict lookup). */
export function isRoutePath(path: string): boolean {
  return PAGE_BY_PATH.has(path) || /^\/works\/[a-z0-9-]+$/.test(path)
}

/** True for a case-study detail route owned by the works section. */
export function isCaseStudyPath(path: string): boolean {
  return /^\/works\/[a-z0-9-]+$/.test(path)
}
