// src/core/sitemapEntries.ts — Default sitemap section assembly (Phase 9).
//
// Builds the document's default sitemap sections from the manifest-driven
// sources only: the route manifest (paths) + the page metadata table
// (changefreq/priority) + the canonical blog index (paths + content dates).
// Pure — no DOM, no fs — so the build-time generator and the unit tests share
// one assembly. Section ordering + comments mirror the hand-maintained
// sitemap the generator replaces.

import { builderPagePath } from '../builder/publish'
import { BLOG_ARTICLES, BLOG_INDEX, blogArticlePath } from './blogPages'
import { PAGE_META_DATA } from './pageMetaData'
import { ROUTE_MANIFEST } from './routeManifest'
import type { SitemapEntry } from './sitemap'
import type { PageId } from './routeManifest'

/** Fixed sitemap policy for approved builder pages. */
export const BUILDER_PAGE_SITEMAP = {
  changefreq: 'weekly' as const,
  priority: 0.5,
}

interface SitemapSection {
  /** The `<!-- ... -->` comment above the section's entries. */
  comment: string
  entries: readonly SitemapEntry[]
}

/** The app-route sections: the canonical home entry, then the SPA routes. */
function buildAppSitemapSections(): SitemapSection[] {
  const [home, ...spaRoutes] = ROUTE_MANIFEST
  const toEntry = (path: string, page: PageId): SitemapEntry => ({
    path,
    changefreq: PAGE_META_DATA[page].changefreq,
    priority: PAGE_META_DATA[page].priority,
  })
  return [
    {
      comment: 'Main page — 3D experience (canonical entry)',
      entries: home ? [toEntry(home.path, home.page)] : [],
    },
    {
      comment: 'SPA pages (client-side routes, same HTML base)',
      entries: spaRoutes.map((entry) => toEntry(entry.path, entry.page)),
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
      ],
    },
    {
      comment: 'Blog articles',
      entries: BLOG_ARTICLES.map((article): SitemapEntry => ({
        path: blogArticlePath(article.slug),
        lastmod: article.lastmod,
        changefreq: 'monthly',
        priority: article.priority,
      })),
    },
  ]
}

/**
 * The builder section: the approved (`published: true`) documents rendered
 * to the static `/p/<slug>` routes (Phase 9, slice 5). The slugs come from
 * the admin-owned collection — the build-time generator reads
 * `documents.json` and passes `publishedPages(...)` here. Empty when nothing
 * is published (no section, no entries).
 */
export function buildBuilderSitemapSections(slugs: readonly string[]): SitemapSection[] {
  if (slugs.length === 0) return []
  return [
    {
      comment: 'Builder pages (approved documents — static, no app bundle)',
      entries: slugs.flatMap((slug): SitemapEntry[] => [
        {
          path: builderPagePath(slug, 'EN'),
          changefreq: BUILDER_PAGE_SITEMAP.changefreq,
          priority: BUILDER_PAGE_SITEMAP.priority,
        },
        {
          path: builderPagePath(slug, 'RU'),
          changefreq: BUILDER_PAGE_SITEMAP.changefreq,
          priority: BUILDER_PAGE_SITEMAP.priority,
        },
      ]),
    },
  ]
}

/** The document's default sitemap sections, in emission order. */
export function buildDefaultSitemapSections(): SitemapSection[] {
  return [...buildAppSitemapSections(), ...buildBlogSitemapSections()]
}
