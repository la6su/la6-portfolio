// src/__tests__/builderVueRegistry.test.ts — Phase 9: the trusted Vue element
// registry renders the same DOM the framework-neutral string renderer emits.
//
// Parity contract (docs/PAGE_BUILDER.md — "a component is implemented once
// and tested in both contexts"): for a representative document covering all
// twelve element types (plus the prop allowlist clamps and escaping), the SSR
// output of `BuilderPage` and `renderBuilderDocument` parse to identical
// trees — tags, classes, attributes and text, in editable and
// read-only mode alike.

import { describe, it, expect } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'

import { renderBuilderDocument } from '../builder/render'
import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'
import { validateBuilderDocument, type BuilderDocument, type BuilderNode } from '../builder/schema'
import { BUILDER_ELEMENT_REGISTRY } from '../builder/vue/elements'
import { BuilderPage } from '../builder/vue/BuilderPage'

const el = (
  id: string,
  type: BuilderNode['type'],
  props: Record<string, string>,
  children: BuilderNode[] = [],
): BuilderNode => ({ id, type, props, children })

/**
 * A representative document: every element type once, nested (section →
 * grid → children; card → mixed children), the allowlist clamps exercised
 * (invalid style/level/columns fall back), unsafe hrefs rejected, and HTML
 * metacharacters in copy (escaping parity).
 */
const parityDocument = (): BuilderDocument =>
  ({
    ...DEFAULT_BUILDER_DOCUMENT,
    slug: 'parity',
    title: 'Parity',
    nodes: [
      el('root', 'section', { style: 'primary', size: 'large', container: 'expand' }, [
        el('grid-1', 'grid', { columns: '3', gap: 'large' }, [
          el('heading-1', 'heading', {
            level: 'h1',
            size: 'xlarge',
            content: 'Heading <&> "quoted" heading-1',
            contentRu: 'Русский заголовок',
          }),
          el('text-1', 'text', { style: 'lead', content: 'Text <&> "quoted" text-1' }),
          el('invalid-props', 'heading', { level: 'h9', size: 'giant' }),
        ]),
        el('button-1', 'button', {
          style: 'primary',
          href: 'https://justlovejazz.dev/?a=1&b=2',
          label: 'Button <&> button-1',
        }),
        el('button-unsafe', 'button', { style: 'javascript', href: 'javascript:alert(1)' }),
        el('card-1', 'card', { style: 'secondary', size: 'small' }, [
          el('divider-1', 'divider', { style: 'small' }),
          el('list-1', 'list', { style: 'ordered', items: 'One\n  Two\n\nThree' }),
          el('list-plain', 'list', { style: 'hyphen', items: 'a\nb' }),
          el('list-source', 'list', {
            style: 'default',
            source: 'projects',
            sourceField: 'category',
            sourceLimit: '3',
          }),
          el('link-1', 'link', { style: 'muted', href: '/works', label: 'Link <&> link-1' }),
          el('icon-1', 'icon', { name: 'arrow-up-right', ratio: '0.5' }),
          el('image-1', 'image', {
            src: '/assets/projects/ebb-vibes/cover.webp',
            alt: 'Project cover placeholder',
            loading: 'eager',
          }),
          el('video-1', 'video', {
            src: '/assets/video/coming-soon.mp4',
            poster: '/assets/video/coming-soon-cover.jpg',
            ariaLabel: 'Project preview video',
            preload: 'metadata',
          }),
        ]),
        el('copy', 'text', { style: 'muted', content: 'Copy <&> "quoted" copy' }),
      ]),
    ],
  }) as BuilderDocument

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

const parseTopLevel = (html: string): string[] => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(document.body.children).map(serialize)
}

const ssrRender = async (
  document: BuilderDocument,
  editable: boolean,
  locale: 'EN' | 'RU' = 'EN',
): Promise<{ html: string; tree: string[] }> => {
  const html = await renderToString(
    createSSRApp({
      render: () => h(BuilderPage, { document, editable, locale }),
    }),
  )
  return { html, tree: parseTopLevel(html) }
}

describe('builder Vue registry — parity with the string renderer', () => {
  it('registers a trusted component for every builder element type', () => {
    const types = [
      'section',
      'grid',
      'heading',
      'text',
      'button',
      'card',
      'divider',
      'list',
      'link',
      'icon',
      'image',
      'video',
    ] as const
    for (const type of types) {
      expect(BUILDER_ELEMENT_REGISTRY[type]).toBeDefined()
    }
  })

  it('the parity document is valid against the schema', () => {
    const validation = validateBuilderDocument(parityDocument())
    expect(validation.ok).toBe(true)
  })

  it('renders an identical tree in read-only mode', async () => {
    const document = parityDocument()
    const viaString = parseTopLevel(renderBuilderDocument(document, { editable: false }))
    const viaVue = (await ssrRender(document, false)).tree
    expect(viaVue).toEqual(viaString)
  })

  it('renders an identical tree in editable mode (the delegation attributes)', async () => {
    const document = parityDocument()
    const viaString = parseTopLevel(renderBuilderDocument(document, { editable: true }))
    const viaVue = (await ssrRender(document, true)).tree
    expect(viaVue).toEqual(viaString)
    // the editor attributes are present on the root section in editable mode
    expect(viaVue[0]!).toContain('data-builder-id=root')
    expect(viaVue[0]!).toContain('tabindex=0')
  })

  it('keeps Russian locale parity between Vue and string renderers', async () => {
    const document = parityDocument()
    const viaString = parseTopLevel(renderBuilderDocument(document, { locale: 'RU' }))
    const viaVue = (await ssrRender(document, false, 'RU')).tree
    expect(viaVue).toEqual(viaString)
    expect(viaVue.join('')).toContain('Русский заголовок')
  })

  it('escapes authored copy identically in both renderers', async () => {
    const document = parityDocument()
    const viaStringHtml = renderBuilderDocument(document, { editable: false })
    const { html: viaVueHtml, tree: viaVue } = await ssrRender(document, false)
    // source-level: both escape the metacharacters for HTML
    const escaped = 'Heading &lt;&amp;&gt; &quot;quoted&quot; heading-1'
    expect(viaStringHtml).toContain(escaped)
    expect(viaVueHtml).toContain(escaped)
    // DOM-level: both decode back to the raw authored copy
    const decoded = 'Heading <&> "quoted" heading-1'
    expect(viaVue.join('')).toContain(decoded)
  })

  it('clamps unsafe hrefs to # in both renderers (and keeps safe ones raw)', async () => {
    const document = parityDocument()
    const viaStringHtml = renderBuilderDocument(document, { editable: false })
    const { html: viaVueHtml, tree: viaVue } = await ssrRender(document, false)
    const viaString = parseTopLevel(viaStringHtml)
    expect(viaVueHtml).not.toContain('javascript:')
    expect(viaStringHtml).not.toContain('javascript:')
    // DOM-level: the https href survives with its query string (decoded),
    // the internal link survives, the unsafe one is #
    expect(viaVue.join('')).toContain('href=https://justlovejazz.dev/?a=1&b=2')
    expect(viaString.join('')).toContain('href=https://justlovejazz.dev/?a=1&b=2')
    expect(viaVue.join('')).toContain('href=/works')
    expect(viaVue.join('')).toContain('href=#')
    // source-level: both escape the query separator in the emitted HTML
    expect(viaVueHtml).toContain('href="https://justlovejazz.dev/?a=1&amp;b=2"')
    expect(viaStringHtml).toContain('href="https://justlovejazz.dev/?a=1&amp;b=2"')
  })
})
