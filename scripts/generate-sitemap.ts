// scripts/generate-sitemap.ts — build-time sitemap generator (Phase 9).
//
// Regenerates `public/sitemap.xml` from the shared section assembly
// (`src/core/sitemapEntries.ts`), which consumes only the manifest-driven
// sources: the route manifest (paths), the page metadata table
// (changefreq/priority) and the canonical blog index (paths + content
// dates). Replaces the hand-maintained file with a generated artifact (the
// same committed-artifact pattern as the builder's `page.json`).
//
// Run as a prebuild step: `bun scripts/generate-sitemap.ts` (wired into the
// `build` script). The origin comes from `JLZ_SITE_ORIGIN` (defaults to the
// production origin). The output is byte-stable for unchanged inputs, so a
// hand-edited or stale sitemap is corrected on the next build.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { publishedPages, validateBuilderDocuments } from '../src/builder/documents'
import { PAGE_META_DATA } from '../src/core/pageMetaData'
import { pathForPage, ROUTE_MANIFEST } from '../src/core/routeManifest'
import { buildSitemapXml } from '../src/core/sitemap'
import {
  buildBuilderSitemapSections,
  buildDefaultSitemapSections,
} from '../src/core/sitemapEntries'

const DEFAULT_ORIGIN = 'https://justlovejazz.dev'
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

const origin = process.env.JLZ_SITE_ORIGIN?.replace(/\/+$/, '') ?? DEFAULT_ORIGIN

// The approved builder documents (Phase 9, slice 5) join the sitemap from
// the same admin-owned collection the publish pipeline renders — the
// pipeline runs earlier in the `build` script, so the committed set matches
// the committed `/p/<slug>` outputs.
const collectionPath = resolve(root, 'src/builder/generated/documents.json')
const builderSlugs = (() => {
  if (!existsSync(collectionPath)) return [] as string[]
  const validation = validateBuilderDocuments(
    JSON.parse(readFileSync(collectionPath, 'utf8')) as unknown,
  )
  if (!validation.ok || !validation.documents)
    throw new Error(`documents.json is invalid: ${validation.errors.join('; ')}`)
  return publishedPages(validation.documents).map((document) => document.slug)
})()

const sections = [...buildDefaultSitemapSections(), ...buildBuilderSitemapSections(builderSlugs)]
const xml = buildSitemapXml(origin, sections)
const out = resolve(root, 'public', 'sitemap.xml')
writeFileSync(out, xml, 'utf8')
const entryCount = sections.reduce((sum, s) => sum + s.entries.length, 0)
console.log(
  `[generate-sitemap] wrote ${out} (${xml.length} bytes, ${entryCount} urls, origin ${origin})`,
)
