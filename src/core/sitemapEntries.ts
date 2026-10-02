// Default sitemap section assembly.
//
// Builds the document's default sitemap sections from the manifest-driven
// sources only: the route manifest, published Works case studies, the page
// metadata table, and the canonical blog index (paths + content dates).
// Pure — no DOM, no fs — so the build-time generator and the unit tests share
// one assembly. Section ordering + comments mirror the hand-maintained
// sitemap the generator replaces.

import { BLOG_ARTICLES, BLOG_INDEX, blogArticlePath } from './blogPages'
import { CASE_STUDIES } from '../Data/CaseStudies'
import { PAGE_META_DATA } from './pageMetaData'
import { localizedPath, ROUTE_MANIFEST } from './routeManifest'
import type { SitemapEntry } from './sitemap'
import type { PageId } from './routeManifest'

interface SitemapSection {
  /** The `<!-- ... -->` comment above the section's entries. */
  comment: string
  entries: readonly SitemapEntry[]
}

/** The app-route sections: the canonical home entry, then the SPA routes. */
function buildAppSitemapSections(): SitemapSection[] {
  const toEntry = (path: string, page: PageId): SitemapEntry => ({
    path,
    changefreq: PAGE_META_DATA[page].changefreq,
    priority: PAGE_META_DATA[page].priority,
  })
  return [
    {
      comment: 'Main page — 3D experience (canonical entry)',
      entries: ROUTE_MANIFEST.filter((entry) => entry.path === '/').flatMap((entry) => [
        toEntry(entry.path, entry.page),
        toEntry(localizedPath('RU', entry.path), entry.page),
      ]),
    },
    {
      comment: 'Localized app pages',
      entries: ROUTE_MANIFEST.filter((entry) => entry.path !== '/').flatMap((entry) => [
        toEntry(entry.path, entry.page),
        toEntry(localizedPath('RU', entry.path), entry.page),
      ]),
    },
  ]
}

/** The blog sections: the list page, then the published articles. */
function buildBlogSitemapSections(): SitemapSection[] {
  return [
    {
      comment: 'Blog — list page',
      entries: [
        {
          path: BLOG_INDEX.path,
          changefreq: BLOG_INDEX.changefreq,
          priority: BLOG_INDEX.priority,
        },
        {
          path: localizedPath('RU', BLOG_INDEX.path),
          changefreq: BLOG_INDEX.changefreq,
          priority: BLOG_INDEX.priority,
        },
      ],
    },
    {
      comment: 'Blog articles',
      entries: BLOG_ARTICLES.flatMap((article): SitemapEntry[] => [
        {
          path: blogArticlePath(article.slug),
          lastmod: article.publishedTime.slice(0, 10),
          changefreq: 'monthly',
          priority: article.priority,
        },
        {
          path: localizedPath('RU', blogArticlePath(article.slug)),
          lastmod: article.publishedTime.slice(0, 10),
          changefreq: 'monthly',
          priority: article.priority,
        },
      ]),
    },
  ]
}

/** Published Works case studies are statically emitted as their own routes. */
function buildCaseStudySitemapSections(): SitemapSection[] {
  return [
    {
      comment: 'Works case studies',
      entries: CASE_STUDIES.flatMap((study): SitemapEntry[] => [
        { path: `/works/${study.projectId}`, changefreq: 'monthly', priority: 0.8 },
        { path: `/ru/works/${study.projectId}`, changefreq: 'monthly', priority: 0.8 },
      ]),
    },
  ]
}

/** The document's default sitemap sections, in emission order. */
export function buildDefaultSitemapSections(): SitemapSection[] {
  return [
    ...buildAppSitemapSections(),
    ...buildCaseStudySitemapSections(),
    ...buildBlogSitemapSections(),
  ]
}
