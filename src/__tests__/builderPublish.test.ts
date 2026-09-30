// src/__tests__/builderPublish.test.ts — Phase 9, slice 5: the publish
// pipeline core.
//
// Locks the "approved → static route" contract:
//   - the schema fields that gate publishing (`published`, `description`);
//   - `publishedPages` (the closed set the pipeline renders and the sitemap
//     consumes);
//   - `renderBuilderPageDocument` (standalone HTML: canonical head, escaped
//     metadata, the registry-rendered body with SSR markers stripped, zero
//     application scripts, no admin surface);
//   - `renderBuilderPageLess` (per-page Less chain: app base first, the
//     document's own theme last — Less last-definition-wins);
//   - body parity: the published page's `<main>` carries the same tree the
//     trusted registry (and the string renderer) emit;
//   - the sitemap builder section.

import { describe, it, expect } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'

import {
  BUILDER_PAGE_PREFIX,
  builderPagePath,
  renderBuilderPageDocument,
  renderBuilderPageLess,
} from '../builder/publish'
import { publishedPages, type BuilderDocuments } from '../builder/documents'
import { renderBuilderDocument } from '../builder/render'
import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'
import { validateBuilderDocument, type BuilderDocument, type BuilderNode } from '../builder/schema'
import { BuilderPage } from '../builder/vue/BuilderPage'
import { BUILDER_PAGE_SITEMAP, buildBuilderSitemapSections } from '../core/sitemapEntries'

const el = (
  id: string,
  type: BuilderNode['type'],
  props: Record<string, string>,
  children: BuilderNode[] = [],
): BuilderNode => ({ id, type, props, children })

/** A minimal approved document: one section with a heading, text and button. */
const approvedDocument = (): BuilderDocument =>
  ({
    ...DEFAULT_BUILDER_DOCUMENT,
    slug: 'approved-page',
    title: 'Approved page',
    description: 'A published builder document.',
    published: true,
    nodes: [
      el('root', 'section', { style: 'default', size: 'large' }, [
        el('heading-1', 'heading', { level: 'h1', size: 'xlarge', content: 'Published heading' }),
        el('text-1', 'text', { style: 'lead', content: 'Published <&> copy' }),
        el('button-1', 'button', { style: 'primary', label: 'Button <&> button-1' }),
      ]),
    ],
  }) as BuilderDocument

const collection = (
  ...documents: Array<Partial<BuilderDocument> & { slug: string }>
): BuilderDocuments =>
  ({
    version: 1,
    documents: documents.map((document) => ({
      ...DEFAULT_BUILDER_DOCUMENT,
      ...document,
    })),
  }) as BuilderDocuments

/** Serialize a parsed subtree: tag, sorted attributes, text, children. */
const serialize = (element: Element): string => {
  const attrs = Array.from(element.attributes)
    .map((attribute) => `${attribute.name}=${attribute.value}`)
    .sort()
    .join(' ')
  const text = Array.from(element.childNodes)
    .filter((child) => child.nodeType === 3)
    .map((child) => child.textContent ?? '')
    .join('')
  const children = Array.from(element.children).map(serialize).join('')
  return `<${element.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ''}>${text}${children}`
}

describe('schema — the publish gate fields', () => {
  it('accepts published + a description on an otherwise valid document', () => {
    const validation = validateBuilderDocument({ ...approvedDocument(), published: true })
    expect(validation.ok).toBe(true)
  })

  it('rejects a non-boolean published flag', () => {
    const validation = validateBuilderDocument({
      ...approvedDocument(),
      published: 'yes',
    })
    expect(validation.ok).toBe(false)
    expect(validation.errors.join('; ')).toContain('published must be a boolean')
  })

  it('rejects a description outside 1–300 characters or of the wrong type', () => {
    for (const description of ['', 'x'.repeat(301), 42] as unknown as Array<string>) {
      const validation = validateBuilderDocument({ ...approvedDocument(), description })
      expect(validation.ok).toBe(false)
      expect(validation.errors.join('; ')).toContain('description must contain between 1 and 300')
    }
  })

  it('keeps documents without the fields valid (unpublished, title fallback)', () => {
    const validation = validateBuilderDocument(DEFAULT_BUILDER_DOCUMENT)
    expect(validation.ok).toBe(true)
  })
})

describe('publishedPages — the approved closed set', () => {
  it('selects exactly the published: true documents', () => {
    const published = publishedPages(
      collection(
        { slug: 'draft-a' },
        { slug: 'live-b', published: true },
        { slug: 'draft-c', published: false },
        { slug: 'live-d', published: true },
      ),
    )
    expect(published.map((document) => document.slug)).toEqual(['live-b', 'live-d'])
  })

  it('ignores a truthy-but-not-boolean flag', () => {
    const published = publishedPages(
      collection({ slug: 'weird', published: 'yes' as unknown as boolean }),
    )
    expect(published).toHaveLength(0)
  })

  it('returns a stable slug order regardless of the collection order', () => {
    const published = publishedPages(
      collection({ slug: 'zulu', published: true }, { slug: 'alpha', published: true }),
    )
    expect(published.map((document) => document.slug)).toEqual(['alpha', 'zulu'])
  })

  it('returns empty for an empty collection', () => {
    expect(publishedPages({ version: 1, documents: [] })).toHaveLength(0)
  })
})

describe('builderPagePath', () => {
  it('is the /p prefix with the document slug', () => {
    expect(BUILDER_PAGE_PREFIX).toBe('/p')
    expect(builderPagePath('approved-page')).toBe('/p/approved-page')
    expect(builderPagePath('approved-page', 'RU')).toBe('/p/approved-page/ru')
  })
})

describe('renderBuilderPageDocument', () => {
  it('wraps the body into a standalone document with the canonical head', () => {
    const html = renderBuilderPageDocument(approvedDocument(), '<section>body</section>')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title>Approved page | JUSTLOVEJAZZ</title>')
    expect(html).toContain('<meta name="description" content="A published builder document." />')
    expect(html).toContain(
      '<link rel="canonical" href="https://justlovejazz.dev/p/approved-page" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://justlovejazz.dev/p/approved-page" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="ru" href="https://justlovejazz.dev/p/approved-page/ru" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://justlovejazz.dev/p/approved-page" />',
    )
    expect(html).toContain(
      '<meta property="og:url" content="https://justlovejazz.dev/p/approved-page" />',
    )
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<main id="main" class="jlz-builder-page" role="main">')
    expect(html).toContain('<section>body</section>')
  })

  it('falls back to the title when the description is absent', () => {
    const document = { ...approvedDocument(), description: undefined }
    const html = renderBuilderPageDocument(document, '')
    expect(html).toContain('<meta name="description" content="Approved page" />')
    expect(html).toContain('<meta property="og:description" content="Approved page" />')
  })

  it('respects the origin override', () => {
    const html = renderBuilderPageDocument(approvedDocument(), '', 'https://example.test/')
    expect(html).toContain('<link rel="canonical" href="https://example.test/p/approved-page" />')
    expect(html).toContain(
      '<link rel="alternate" hreflang="ru" href="https://example.test/p/approved-page/ru" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://example.test/p/approved-page" />',
    )
  })

  it('renders a Russian static variant with localized metadata and canonical URL', () => {
    const document = {
      ...approvedDocument(),
      titleRu: 'Одобренная страница',
      descriptionRu: 'Русский документ builder.',
    }
    const html = renderBuilderPageDocument(document, '<section>тело</section>', undefined, 'RU')
    expect(html).toContain('<html lang="ru">')
    expect(html).toContain('<title>Одобренная страница | JUSTLOVEJAZZ</title>')
    expect(html).toContain('<meta property="og:locale" content="ru_RU" />')
    expect(html).toContain(
      '<link rel="canonical" href="https://justlovejazz.dev/p/approved-page/ru" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="en" href="https://justlovejazz.dev/p/approved-page" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="ru" href="https://justlovejazz.dev/p/approved-page/ru" />',
    )
    expect(html).toContain(
      '<link rel="alternate" hreflang="x-default" href="https://justlovejazz.dev/p/approved-page" />',
    )
    expect(html).toContain('<section>тело</section>')
  })

  it('escapes hostile metadata into the head attributes', () => {
    const document = { ...approvedDocument(), title: 'a"b<c>&d', description: undefined }
    const html = renderBuilderPageDocument(document, '')
    expect(html).toContain('<title>a&quot;b&lt;c&gt;&amp;d | JUSTLOVEJAZZ</title>')
    expect(html).toContain('<meta name="description" content="a&quot;b&lt;c&gt;&amp;d" />')
    expect(html).not.toContain('a"b<c>&d')
  })

  it('strips the Vue SSR fragment and v-if markers from the body', () => {
    const html = renderBuilderPageDocument(
      approvedDocument(),
      '<!----><!--[--><section>ok</section><!--]-->',
    )
    expect(html).toContain('<section>ok</section>')
    expect(html).not.toContain('<!--[-->')
    expect(html).not.toContain('<!--]-->')
    expect(html).not.toContain('<!---->')
  })

  it('links the per-page stylesheet and no other stylesheets of the app graph', () => {
    const html = renderBuilderPageDocument(approvedDocument(), '')
    expect(html).toContain(
      '<link rel="stylesheet" href="/src/assets/builder/approved-page.less" />',
    )
    // No Vite-hashed application assets (bundle CSS/JS of the 3D app).
    expect(html).not.toMatch('/assets/[A-Za-z0-9._-]+\\.(?:css|js)')
    expect(html).not.toContain('main.less')
  })

  it('ships zero application scripts and no admin surface', () => {
    const html = renderBuilderPageDocument(approvedDocument(), '<section></section>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('__jlz-admin')
    expect(html).not.toContain('/admin')
    expect(html).not.toContain('tres')
    expect(html).not.toContain('three')
  })
})

describe('renderBuilderPageLess', () => {
  it('assembles the per-page chain: app base, then the document theme, then the document components', () => {
    const less = renderBuilderPageLess(approvedDocument())
    expect(less).toContain('for document "approved-page"')
    const importIndex = less.indexOf("@import '../_import.less';")
    const themeIndex = less.indexOf('@jlz-color-accent:')
    const componentIndex = less.indexOf("@import '../../../node_modules/uikit/src/less/components/")
    expect(importIndex).toBeGreaterThanOrEqual(0)
    expect(themeIndex).toBeGreaterThan(importIndex)
    if (componentIndex >= 0) expect(componentIndex).toBeGreaterThan(themeIndex)
  })

  it("emits the document's own theme values (not the admin's last saved ones)", () => {
    const document = {
      ...approvedDocument(),
      theme: { ...approvedDocument().theme, accent: '#123456' },
    }
    expect(renderBuilderPageLess(document)).toContain('@jlz-color-accent: #123456;')
  })

  it('keeps the component imports relative to src/assets/builder/', () => {
    const document = { ...approvedDocument(), theme: { ...approvedDocument().theme } }
    // The compiler emits the delta beyond the app baseline; the default
    // document's component set decides what (if anything) is emitted.
    expect(renderBuilderPageLess(document)).toContain('// Generated by /admin/. Do not edit')
  })

  it('does not duplicate the card component owned by the application baseline', () => {
    const less = renderBuilderPageLess(approvedDocument())
    expect(less).not.toContain(
      "@import '../../../node_modules/uikit/src/less/components/card.less';",
    )
  })

  it('keeps separate card and button radius tokens in the generated theme', () => {
    const document = {
      ...approvedDocument(),
      theme: {
        ...approvedDocument().theme,
        buttonRadius: '4px',
        cardRadius: '18px',
      },
    }
    const less = renderBuilderPageLess(document)
    expect(less).toContain('@jlz-button-radius: 4px;')
    expect(less).toContain('@jlz-card-radius: 18px;')
  })
})

describe('published page body — registry parity', () => {
  it('carries the same tree as the trusted registry (and the string renderer)', async () => {
    const document = approvedDocument()
    const bodyHtml = await renderToString(createSSRApp(h(BuilderPage, { document })))
    const page = renderBuilderPageDocument(document, bodyHtml)

    const parsed = new DOMParser().parseFromString(page, 'text/html')
    const main = parsed.querySelector('main')
    expect(main).not.toBeNull()
    const publishedTree = Array.from(main!.children).map(serialize)

    const viaSsr = new DOMParser().parseFromString(bodyHtml, 'text/html')
    const registryTree = Array.from(viaSsr.body.children).map(serialize)
    const viaString = new DOMParser().parseFromString(
      renderBuilderDocument(document, { editable: false }),
      'text/html',
    )
    const stringTree = Array.from(viaString.body.children).map(serialize)

    expect(publishedTree).toHaveLength(1)
    expect(publishedTree).toEqual(registryTree)
    expect(publishedTree).toEqual(stringTree)
  })

  it('renders no editor delegation attributes in the public output', async () => {
    const document = approvedDocument()
    const bodyHtml = await renderToString(
      createSSRApp(h(BuilderPage, { document, editable: false })),
    )
    const page = renderBuilderPageDocument(document, bodyHtml)
    expect(page).not.toContain('data-builder-id')
    expect(page).not.toContain('data-builder-type')
  })
})

describe('sitemap — the builder section', () => {
  it('emits nothing when nothing is published', () => {
    expect(buildBuilderSitemapSections([])).toEqual([])
  })

  it('emits EN and RU entries per approved slug', () => {
    const sections = buildBuilderSitemapSections(['approved-page', 'other-page'])
    expect(sections).toHaveLength(1)
    expect(sections[0]!.comment).toContain('Builder pages')
    expect(sections[0]!.entries).toHaveLength(4)
    expect(sections[0]!.entries.map((entry) => entry.path)).toEqual([
      '/p/approved-page',
      '/p/approved-page/ru',
      '/p/other-page',
      '/p/other-page/ru',
    ])
    for (const entry of sections[0]!.entries) {
      expect(entry.changefreq).toBe(BUILDER_PAGE_SITEMAP.changefreq)
      expect(entry.priority).toBe(BUILDER_PAGE_SITEMAP.priority)
      expect(entry.lastmod).toBeUndefined()
    }
  })
})
