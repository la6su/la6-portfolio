// scripts/generate-sitemap.ts — build-time sitemap generator (Phase 9).
//
// Regenerates `public/sitemap.xml` from the shared section assembly
// (`src/core/sitemapEntries.ts`), which consumes only the manifest-driven
// sources: the route manifest (paths), the page metadata table
// (changefreq/priority) and the canonical blog index (paths + content
// dates). Replaces the hand-maintained file with a generated artifact.
//
// Run as a prebuild step: `bun scripts/generate-sitemap.ts` (wired into the
// `build` script). The origin comes from `JLZ_SITE_ORIGIN` (defaults to the
// production origin). The output is byte-stable for unchanged inputs, so a
// hand-edited or stale sitemap is corrected on the next build.

import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PAGE_META_DATA } from '../src/core/pageMetaData'
import { pathForPage, ROUTE_MANIFEST } from '../src/core/routeManifest'
import { buildSitemapXml } from '../src/core/sitemap'
import { SITE_ORIGIN } from '../src/core/siteConfig'
import { buildDefaultSitemapSections } from '../src/core/sitemapEntries'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Invariant (checked before any write): every page-metadata entry resolves
// to a manifest-owned path — a closed-set mismatch fails the build instead
// of emitting a broken sitemap.
for (const page of Object.keys(PAGE_META_DATA) as Array<keyof typeof PAGE_META_DATA>) {
  const path = pathForPage(page)
  if (!path || !ROUTE_MANIFEST.some((entry) => entry.path === path)) {
    throw new Error(`page metadata without a manifest route: ${page}`)
  }
}

const origin = SITE_ORIGIN

const sections = buildDefaultSitemapSections()
const xml = buildSitemapXml(origin, sections)
const publicDir = resolve(root, 'public')
const sitemapPath = resolve(publicDir, 'sitemap.xml')
writeFileSync(sitemapPath, xml, 'utf8')
const robotsPath = resolve(publicDir, 'robots.txt')
writeFileSync(
  robotsPath,
  [
    'User-agent: *',
    '# English and Russian public pages are crawlable.',
    'Allow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n'),
  'utf8',
)
const entryCount = sections.reduce((sum, s) => sum + s.entries.length, 0)
console.log(
  `[generate-sitemap] wrote ${sitemapPath} (${xml.length} bytes, ${entryCount} urls) and ${robotsPath} (origin ${origin})`,
)
