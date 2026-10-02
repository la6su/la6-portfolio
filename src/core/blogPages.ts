// Canonical index of the standalone blog pages.
//
// The blog is a set of standalone semantic pages (no 3D app shell): the list
// page at `/blog` plus one article per slug. This index is the single source
// for their slugs, paths, SEO fields and content dates; consumers:
//   - the sitemap generator (`scripts/generate-sitemap.ts`),
//   - the Vite build input map (`vite.config.ts`),
//   - the shared SSG content pipeline, which renders each
//     entry's content source through the same pipeline as the home prerender.
//
// Pure by design — no DOM, no window — unit-testable without a browser.

interface BlogArticle {
  /** URL slug (lowercase letters, digits, single hyphens). */
  slug: string
  /** Publication date used by the sitemap and article metadata (ISO 8601). */
  publishedTime: string
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
  { slug: 'undercurrent-webgpu-fluid', publishedTime: '2026-07-15T10:00:00Z', priority: 0.7 },
  { slug: 'glassmorphism-webgpu', publishedTime: '2026-06-20T10:00:00Z', priority: 0.7 },
  { slug: 'on-demand-rendering', publishedTime: '2026-05-10T10:00:00Z', priority: 0.7 },
  { slug: 'tsl-changes-everything', publishedTime: '2026-04-05T10:00:00Z', priority: 0.7 },
] as const

/** The static path of an article. */
export function blogArticlePath(slug: string): string {
  return `${BLOG_INDEX_PATH}/${slug}`
}
