import { describe, it, expect } from 'vitest'

import { buildSitemapXml, escapeXml } from '../core/sitemap'
import { buildDefaultSitemapSections } from '../core/sitemapEntries'
import { BLOG_ARTICLES, BLOG_INDEX, blogArticlePath } from '../core/blogPages'
import { PAGE_META_DATA } from '../core/pageMetaData'
import { pathForPage, ROUTE_MANIFEST } from '../core/routeManifest'

const ORIGIN = 'https://example.test'

describe('sitemap — buildSitemapXml', () => {
  it('wraps entries in a declared urlset and preserves entry order', () => {
    const xml = buildSitemapXml(ORIGIN, [
      { comment: 'one', entries: [{ path: '/a', changefreq: 'monthly', priority: 1.0 }] },
      { comment: 'two', entries: [{ path: '/b', changefreq: 'weekly', priority: 0.5 }] },
    ])
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(locs).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`])
    // section comments precede their first entry
    expect(xml.indexOf('<!-- one -->')).toBeLessThan(xml.indexOf(`${ORIGIN}/a`))
    expect(xml.indexOf('<!-- two -->')).toBeLessThan(xml.indexOf(`${ORIGIN}/b`))
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('emits lastmod only when provided, before changefreq/priority', () => {
    const xml = buildSitemapXml(ORIGIN, [
      {
        comment: 'c',
        entries: [
          { path: '/x', lastmod: '2026-01-02', changefreq: 'monthly', priority: 0.7 },
          { path: '/y', changefreq: 'monthly', priority: 0.9 },
        ],
      },
    ])
    // entry order: loc → lastmod → changefreq → priority
    const xBlock = xml.slice(xml.indexOf('<loc>'), xml.indexOf('</url>', xml.indexOf('/x')))
    expect(xBlock.indexOf('</loc>')).toBeLessThan(xBlock.indexOf('<lastmod>2026-01-02</lastmod>'))
    expect(xBlock.indexOf('<lastmod>')).toBeLessThan(xBlock.indexOf('<changefreq>'))
    expect(xBlock.indexOf('<changefreq>')).toBeLessThan(xBlock.indexOf('<priority>'))
    // an entry without lastmod omits the element entirely
    const yBlock = xml.slice(
      xml.indexOf('<loc>https://example.test/y</loc>'),
      xml.indexOf('</url>', xml.indexOf('/y')),
    )
    expect(yBlock).not.toContain('<lastmod>')
    expect(xml).toContain('<priority>0.7</priority>')
    expect(xml).toContain('<priority>0.9</priority>')
  })

  it('escapes xml metacharacters in comments and values', () => {
    expect(escapeXml('a & b < c > d "e" \'f\'')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;',
    )
    const xml = buildSitemapXml(ORIGIN, [
      { comment: 'weird <section>', entries: [{ path: '/z', changefreq: 'daily', priority: 1.0 }] },
    ])
    expect(xml).toContain('<!-- weird &lt;section&gt; -->')
    expect(xml).not.toContain('<section>')
  })

  it('formats priority to a single decimal', () => {
    const xml = buildSitemapXml(ORIGIN, [
      { comment: 'c', entries: [{ path: '/p', changefreq: 'monthly', priority: 1 }] },
    ])
    expect(xml).toContain('<priority>1.0</priority>')
  })
})

describe('sitemap — default sections (manifest + blog sources)', () => {
  const sections = buildDefaultSitemapSections()
  const entries = sections.flatMap((s) => s.entries)

  it('lists every manifest route, then the blog index and every published article', () => {
    const expectedPaths = [
      ...ROUTE_MANIFEST.map((entry) => entry.path),
      BLOG_INDEX.path,
      ...BLOG_ARTICLES.map((article) => blogArticlePath(article.slug)),
    ]
    expect(entries.map((entry) => entry.path)).toEqual(expectedPaths)
    expect(entries).toHaveLength(11)
  })

  it('derives route fields from the manifest + page metadata, never re-declaring paths', () => {
    for (const entry of ROUTE_MANIFEST) {
      const found = entries.find((candidate) => candidate.path === pathForPage(entry.page))
      expect(found).toBeDefined()
      expect(found!.path).toBe(entry.path)
      expect(found!.changefreq).toBe(PAGE_META_DATA[entry.page].changefreq)
      expect(found!.priority).toBe(PAGE_META_DATA[entry.page].priority)
      expect(found!.lastmod).toBeUndefined()
    }
  })

  it('carries blog content metadata (lastmod + priority) from the canonical index', () => {
    for (const article of BLOG_ARTICLES) {
      const found = entries.find((candidate) => candidate.path === blogArticlePath(article.slug))
      expect(found).toBeDefined()
      expect(found!.lastmod).toBe(article.lastmod)
      expect(found!.priority).toBe(article.priority)
      expect(found!.changefreq).toBe('monthly')
    }
    const index = entries.find((candidate) => candidate.path === BLOG_INDEX.path)
    expect(index!.changefreq).toBe(BLOG_INDEX.changefreq)
    expect(index!.priority).toBe(BLOG_INDEX.priority)
  })

  it('has no duplicate paths', () => {
    const paths = entries.map((entry) => entry.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('produces a stable document for the production origin', () => {
    const xml = buildSitemapXml('https://justlovejazz.dev', sections)
    // the canonical home entry is first (the canonical entry comment)
    const firstLoc = xml.match(/<loc>([^<]*)<\/loc>/)![1]
    expect(firstLoc).toBe('https://justlovejazz.dev/')
    // all 11 urls resolve to the origin
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]!)
    expect(locs).toHaveLength(11)
    for (const loc of locs) expect(loc.startsWith('https://justlovejazz.dev/')).toBe(true)
  })
})

describe('sitemap — blog canonical index', () => {
  it('keeps slugs sitemap-safe and ordered newest first', () => {
    for (const article of BLOG_ARTICLES) {
      expect(article.slug).toMatch(/^[a-z0-9][a-z0-9]*(-[a-z0-9]+)*$/)
      expect(article.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    const dates = BLOG_ARTICLES.map((article) => article.lastmod)
    expect([...dates].sort((a, b) => b.localeCompare(a))).toEqual(dates)
  })

  it('derives article paths from the list-page prefix', () => {
    expect(blogArticlePath('some-post')).toBe('/blog/some-post')
  })
})
