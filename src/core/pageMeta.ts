// src/core/pageMeta.ts — Route-based per-page meta tags (title/description/OG).
//
// Each route has its own <title>, <meta description>, and Open Graph tags.
// Values come from the i18n dictionary (meta.<page>.title / .description) so
// they switch language with the EN/RU toggle. applyMetaTags(page) is called
// by the router on every renderView + on jlz:lang-change.
//
// Canonical URL + og:url are built from window.location.origin + the page
// path. The path is read from the route manifest (`pathForPage`) — the single
// source of truth for public paths; the i18n copy keys + sitemap fields come
// from the pure metadata table (`pageMetaData`).
//

import { t, getLang } from './i18n'
import { pathForPage } from './routeManifest'
import { PAGE_META_DATA, type PageMetaData } from './pageMetaData'
import type { PageId } from './routeManifest'

const SITE_NAME = 'JUSTLOVEJAZZ'

export interface PageMetaOverrides {
  title?: string
  description?: string
  canonicalPath?: string
  type?: 'website' | 'article'
  robots?: string
}

/** Ensure a <meta> tag exists in <head>, creating it if missing. */
function ensureMeta(attr: 'name' | 'property', key: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  return el
}

/** Ensure a <link rel="canonical"> exists in <head>. */
function ensureCanonical(): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  return el
}

/**
 * Apply per-page meta tags for the given page. Uses i18n for
 * title/description and the route manifest for the canonical path.
 * Call on every route change and on language change.
 */
export function applyMetaTags(page: PageId, overrides: PageMetaOverrides = {}): void {
  const cfg: PageMetaData = PAGE_META_DATA[page]
  if (!cfg) return

  const title = overrides.title ?? t(cfg.titleKey)
  const description = overrides.description ?? t(cfg.descKey)
  const origin = window.location.origin
  const url = `${origin}${overrides.canonicalPath ?? pathForPage(page)}`

  // <title>
  document.title = title

  // <html lang> — reflect current language for screen readers + SEO
  document.documentElement.lang = getLang() === 'RU' ? 'ru' : 'en'

  // <meta name="description">
  ensureMeta('name', 'description').content = description

  // Open Graph
  ensureMeta('property', 'og:title').content = title
  ensureMeta('property', 'og:description').content = description
  ensureMeta('property', 'og:url').content = url
  ensureMeta('property', 'og:site_name').content = SITE_NAME
  ensureMeta('property', 'og:type').content = overrides.type ?? 'website'

  // Twitter Card (basic)
  ensureMeta('name', 'twitter:card').content = 'summary_large_image'
  ensureMeta('name', 'twitter:title').content = title
  ensureMeta('name', 'twitter:description').content = description

  const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
  if (overrides.robots) ensureMeta('name', 'robots').content = overrides.robots
  else robots?.remove()

  // Canonical
  ensureCanonical().href = url
}
