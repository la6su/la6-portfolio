import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyMetaTags } from '../core/pageMeta'
import { initI18n, getLang, toggleLang } from '../core/i18n'
import { pathForPage, ROUTE_MANIFEST } from '../core/routeManifest'
import { PAGE_META_DATA } from '../core/pageMetaData'
import type { PageId } from '../core/routeManifest'

// pageMeta reads from i18n + writes <title>, <meta>, <link rel=canonical>,
// and <html lang>. Tests verify that each route produces the expected tags
// AND that switching language updates them (router calls applyMetaTags on
// jlz:lang-change too).

describe('pageMeta — applyMetaTags', () => {
  beforeEach(() => {
    // Clean <head> so each test starts fresh (meta tags from previous runs
    // would otherwise leak across tests).
    document.head
      .querySelectorAll('meta[name], meta[property], link[rel="canonical"]')
      .forEach((el) => el.remove())
    document.title = ''
    document.documentElement.lang = ''
    localStorage.clear()
    if (getLang() === 'RU') toggleLang()
    initI18n()
  })

  afterEach(() => {
    localStorage.clear()
    if (getLang() === 'RU') toggleLang()
    vi.restoreAllMocks()
  })

  describe('per-page tags (EN)', () => {
    const cases: Array<{ page: PageId; path: string; titleKey: string; descKey: string }> = [
      { page: 'home', path: '/', titleKey: 'meta.home.title', descKey: 'meta.home.description' },
      {
        page: 'services',
        path: '/services',
        titleKey: 'meta.services.title',
        descKey: 'meta.services.description',
      },
      {
        page: 'works',
        path: '/works',
        titleKey: 'meta.works.title',
        descKey: 'meta.works.description',
      },
      {
        page: 'manifesto',
        path: '/manifesto',
        titleKey: 'meta.manifesto.title',
        descKey: 'meta.manifesto.description',
      },
      { page: 'lab', path: '/lab', titleKey: 'meta.lab.title', descKey: 'meta.lab.description' },
      {
        page: 'contact',
        path: '/contact',
        titleKey: 'meta.contact.title',
        descKey: 'meta.contact.description',
      },
    ]

    for (const { page, path } of cases) {
      it(`sets <title> for ${page} (${path})`, () => {
        applyMetaTags(page)
        // Title should be non-empty and not the raw key
        expect(document.title).not.toBe('')
        expect(document.title).not.toBe(`meta.${page}.title`)
      })

      it(`sets canonical URL to origin + ${path} for ${page}`, () => {
        applyMetaTags(page)
        const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        expect(canonical).not.toBeNull()
        expect(canonical!.href).toBe(`${window.location.origin}${path}`)
      })

      it(`sets og:url to origin + ${path} for ${page}`, () => {
        applyMetaTags(page)
        const ogUrl = document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')
        expect(ogUrl).not.toBeNull()
        expect(ogUrl!.content).toBe(`${window.location.origin}${path}`)
      })
    }
  })

  describe('meta tag presence + content', () => {
    beforeEach(() => {
      applyMetaTags('home')
    })

    it('sets <meta name="description">', () => {
      const desc = document.head.querySelector<HTMLMetaElement>('meta[name="description"]')
      expect(desc).not.toBeNull()
      expect(desc!.content).not.toBe('')
      expect(desc!.content).not.toBe('meta.home.description')
    })

    it('sets Open Graph title', () => {
      const ogTitle = document.head.querySelector<HTMLMetaElement>('meta[property="og:title"]')
      expect(ogTitle).not.toBeNull()
      expect(ogTitle!.content).toBe(document.title)
    })

    it('sets og:site_name to JUSTLOVEJAZZ', () => {
      const siteName = document.head.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')
      expect(siteName).not.toBeNull()
      expect(siteName!.content).toBe('JUSTLOVEJAZZ')
    })

    it('sets og:type to website', () => {
      const ogType = document.head.querySelector<HTMLMetaElement>('meta[property="og:type"]')
      expect(ogType).not.toBeNull()
      expect(ogType!.content).toBe('website')
    })

    it('sets twitter:card to summary_large_image', () => {
      const card = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:card"]')
      expect(card).not.toBeNull()
      expect(card!.content).toBe('summary_large_image')
    })

    it('sets twitter:title = document.title', () => {
      const twTitle = document.head.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')
      expect(twTitle).not.toBeNull()
      expect(twTitle!.content).toBe(document.title)
    })
  })

  describe('<html lang> reflects current language', () => {
    it('sets lang="en" when lang=EN', () => {
      applyMetaTags('home')
      expect(document.documentElement.lang).toBe('en')
    })

    it('sets lang="ru" after toggleLang to RU', () => {
      toggleLang() // → RU
      applyMetaTags('home')
      expect(document.documentElement.lang).toBe('ru')
    })
  })

  describe('language switch updates title + description', () => {
    it('title changes when switching EN → RU', () => {
      applyMetaTags('home')
      const enTitle = document.title
      toggleLang() // → RU
      applyMetaTags('home')
      const ruTitle = document.title
      expect(enTitle).not.toBe(ruTitle)
      // RU title should contain Cyrillic (just a sanity check)
      expect(/[\u0400-\u04FF]/.test(ruTitle)).toBe(true)
    })

    it('description changes when switching EN → RU', () => {
      applyMetaTags('services')
      const enDesc = document.head.querySelector<HTMLMetaElement>(
        'meta[name="description"]',
      )!.content
      toggleLang()
      applyMetaTags('services')
      const ruDesc = document.head.querySelector<HTMLMetaElement>(
        'meta[name="description"]',
      )!.content
      expect(enDesc).not.toBe(ruDesc)
    })
  })

  describe('idempotency (re-apply does not duplicate tags)', () => {
    it('calling applyMetaTags twice produces exactly one canonical link', () => {
      applyMetaTags('home')
      applyMetaTags('home')
      const canonicals = document.head.querySelectorAll('link[rel="canonical"]')
      expect(canonicals.length).toBe(1)
    })

    it('calling applyMetaTags twice produces exactly one og:title', () => {
      applyMetaTags('works')
      applyMetaTags('works')
      const ogTitles = document.head.querySelectorAll('meta[property="og:title"]')
      expect(ogTitles.length).toBe(1)
    })

    it('switching pages updates the canonical href (no duplicates)', () => {
      applyMetaTags('home')
      applyMetaTags('contact')
      const canonicals = document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]')
      expect(canonicals.length).toBe(1)
      expect(canonicals[0]!.href).toBe(`${window.location.origin}/contact`)
    })
  })

  describe('edge cases', () => {
    it('does not throw for any valid PageId', () => {
      const pages: PageId[] = ['home', 'services', 'works', 'manifesto', 'lab', 'contact']
      for (const p of pages) {
        expect(() => applyMetaTags(p)).not.toThrow()
      }
    })
  })

  describe('manifest drift (Phase 9)', () => {
    // The runtime path is read from the route manifest — the canonical
    // href must equal origin + pathForPage(page) for every manifest page.
    // A manifest rename fails this suite (and the sitemap generator)
    // instead of silently desyncing the runtime from the manifest.
    it('canonical href derives from the manifest path for every page', () => {
      for (const entry of ROUTE_MANIFEST) {
        applyMetaTags(entry.page)
        const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        expect(canonical).not.toBeNull()
        expect(canonical!.href).toBe(`${window.location.origin}${pathForPage(entry.page)}`)
        expect(pathForPage(entry.page)).toBe(entry.path)
      }
    })

    it('the metadata table covers exactly the manifest pages', () => {
      const tablePages = Object.keys(PAGE_META_DATA) as PageId[]
      expect(new Set(tablePages)).toEqual(new Set(ROUTE_MANIFEST.map((entry) => entry.page)))
      for (const page of tablePages) {
        expect(PAGE_META_DATA[page].titleKey).toBe(`meta.${page}.title`)
        expect(PAGE_META_DATA[page].descKey).toBe(`meta.${page}.description`)
      }
    })
  })
})
