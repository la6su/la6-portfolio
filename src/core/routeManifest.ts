// Canonical public route and page identifier manifest.
//
// The single source of truth for the application's public paths and the
// `PageId` vocabulary. Vue Router and static publishing resolve against this
// manifest instead of re-declaring the mapping. Pure by design: no DOM, no
// window, no globals — unit-testable without a browser.
//
// Adding or renaming a route is a change here plus one line in the router;
// the mapping must never be duplicated.

/** Every public route, in the order the navigation menu presents them. */
export const ROUTE_MANIFEST = [
  { path: '/', page: 'home' },
  { path: '/services', page: 'services' },
  { path: '/works', page: 'works' },
  { path: '/manifesto', page: 'manifesto' },
  { path: '/lab', page: 'lab' },
  { path: '/contact', page: 'contact' },
] as const

export type SiteLang = 'EN' | 'RU'

/** Strip the Russian URL prefix while preserving the page path. */
export function unlocalizedPath(path: string): string {
  const stripped = path.replace(/^\/ru(?=\/|$)/i, '')
  return stripped || '/'
}

/** The language is explicit in the public path; bare routes are English. */
export function langFromPath(path: string): SiteLang {
  return /^\/ru(?:\/|$)/i.test(path) ? 'RU' : 'EN'
}

/** Build the public URL for a language variant of a page path. */
export function localizedPath(lang: SiteLang, path: string): string {
  const basePath = unlocalizedPath(path)
  if (lang === 'EN') return basePath
  return basePath === '/' ? '/ru/' : `/ru${basePath}`
}

/** The closed page vocabulary is derived from the route table itself. */
export type PageId = (typeof ROUTE_MANIFEST)[number]['page']

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

export function localizedPagePath(page: PageId, lang: SiteLang): string {
  return localizedPath(lang, pathForPage(page))
}

/**
 * Lenient resolution: the mapped page, or `home` for unknown paths. This is
 * the initial-load behaviour — a shared deep link to a stale or preview path
 * should still present the application at its home face.
 */
export function resolvePage(path: string): PageId {
  return PAGE_BY_PATH.get(unlocalizedPath(path)) ?? 'home'
}

/** Resolve the page shown by a URL, including Works case-study routes. */
export function resolvePagePath(path: string): PageId {
  return isCaseStudyPath(path) ? 'works' : resolvePage(path)
}

/** True for a case-study detail route owned by the works section. */
export function isCaseStudyPath(path: string): boolean {
  return /^\/works\/[a-z0-9-]+$/.test(unlocalizedPath(path))
}
