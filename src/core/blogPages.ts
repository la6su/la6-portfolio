// src/core/blogPages.ts — Canonical index of the static blog pages (Phase 9).
//
// The blog is a set of standalone semantic pages (no 3D app shell): the list
// page at `/blog` plus one article per slug. This index is the single source
// for their slugs, paths, SEO fields and content dates; consumers:
//   - the sitemap generator (`scripts/generate-sitemap.ts`),
//   - the Vite build input map (`vite.config.ts`),
//   - the shared SSG content pipeline (Phase 9 slice 4) which renders each
//     entry's content source through the same pipeline as the home prerender.
//
// Pure by design — no DOM, no window — unit-testable without a browser.

interface BlogArticle {
  /** URL slug (lowercase letters, digits, single hyphens). */
  slug: string
  /** `<lastmod>` content date (YYYY-MM-DD). */
  lastmod: string
  /** Sitemap <priority>. */
  priority: number
}

/** The blog list page. */
export const BLOG_INDEX_PATH = '/blog'

/** The blog index page's sitemap fields. */
export const BLOG_INDEX = {
  path: BLOG_INDEX_PATH,
  changefreq: 'weekly' as const,
  priority: 0.8,
}

/** The published articles, newest first. */
export const BLOG_ARTICLES: readonly BlogArticle[] = [
  { slug: 'undercurrent-webgpu-fluid', lastmod: '2026-07-15', priority: 0.7 },
  { slug: 'glassmorphism-webgpu', lastmod: '2026-06-20', priority: 0.7 },
  { slug: 'on-demand-rendering', lastmod: '2026-05-10', priority: 0.7 },
  { slug: 'tsl-changes-everything', lastmod: '2026-04-05', priority: 0.7 },
] as const

/** The static path of an article. */
export function blogArticlePath(slug: string): string {
  return `${BLOG_INDEX_PATH}/${slug}`
}
