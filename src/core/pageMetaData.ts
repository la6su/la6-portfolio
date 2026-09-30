// src/core/pageMetaData.ts — Pure per-page metadata table (Phase 9).
//
// The single source for a page's i18n copy keys + sitemap fields
// (changefreq, priority). Pure by design — no DOM, no window — so both the
// runtime meta applier (`pageMeta.ts`) and the build-time sitemap generator
// (`scripts/generate-sitemap.ts`) consume it without importing the DOM layer.
// Route paths are NOT re-declared here: they come from `routeManifest.ts`
// via `pathForPage` (adding or renaming a route is a manifest change only).

import type { PageId } from './routeManifest'

export type Changefreq = 'yearly' | 'monthly' | 'weekly' | 'daily' | 'hourly' | 'never'

export interface PageMetaData {
  /** i18n key of the page <title> (meta.<page>.title). */
  titleKey: string
  /** i18n key of the meta description (meta.<page>.description). */
  descKey: string
  /** Sitemap <changefreq>. */
  changefreq: Changefreq
  /** Sitemap <priority> (0.0–1.0). */
  priority: number
}

/** Every manifest page, in manifest presentation order. */
export const PAGE_META_DATA: Record<PageId, PageMetaData> = {
  home: {
    titleKey: 'meta.home.title',
    descKey: 'meta.home.description',
    changefreq: 'monthly',
    priority: 1.0,
  },
  services: {
    titleKey: 'meta.services.title',
    descKey: 'meta.services.description',
    changefreq: 'monthly',
    priority: 0.9,
  },
  works: {
    titleKey: 'meta.works.title',
    descKey: 'meta.works.description',
    changefreq: 'monthly',
    priority: 0.9,
  },
  manifesto: {
    titleKey: 'meta.manifesto.title',
    descKey: 'meta.manifesto.description',
    changefreq: 'monthly',
    priority: 0.8,
  },
  lab: {
    titleKey: 'meta.lab.title',
    descKey: 'meta.lab.description',
    changefreq: 'monthly',
    priority: 0.7,
  },
  contact: {
    titleKey: 'meta.contact.title',
    descKey: 'meta.contact.description',
    changefreq: 'monthly',
    priority: 0.8,
  },
}
