// src/core/sitemap.ts — Pure sitemap.xml builder (Phase 9).
//
// Builds the document's sitemap from manifest-driven entries. Pure by design
// — no DOM, no window, no fs — so the build-time generator
// (`scripts/generate-sitemap.ts`) and the unit tests share one implementation.
// The output mirrors the hand-maintained sitemap the generator replaces:
// the same entry ordering (home first, then SPA routes, blog index,
// articles) and the same section comments.

import type { Changefreq } from './pageMetaData'

export interface SitemapEntry {
  /** Site-relative path (`/`, `/works`, `/blog/<slug>`). */
  path: string
  priority: number
  changefreq: Changefreq
  /** Optional `<lastmod>` date (YYYY-MM-DD). */
  lastmod?: string
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/** XML-escape a text value. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character)
}

function entryXml(origin: string, entry: SitemapEntry): string {
  const lines = ['  <url>', `    <loc>${escapeXml(`${origin}${entry.path}`)}</loc>`]
  if (entry.lastmod) lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`)
  lines.push(`    <changefreq>${entry.changefreq}</changefreq>`)
  lines.push(`    <priority>${entry.priority.toFixed(1)}</priority>`)
  lines.push('  </url>')
  return lines.join('\n')
}

/**
 * Build the full sitemap.xml text. `origin` must be a bare
 * `https://host[:port]` (no trailing slash); entries are emitted in the
 * given order with the given section comments.
 */
export function buildSitemapXml(
  origin: string,
  sections: Array<{ comment: string; entries: readonly SitemapEntry[] }>,
): string {
  const urls = sections.flatMap((section) => [
    `  <!-- ${escapeXml(section.comment)} -->`,
    ...section.entries.map((entry) => entryXml(origin, entry)),
  ])
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
