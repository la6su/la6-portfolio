import { describe, expect, it } from 'vitest'

import { BUILDER_CATALOG, BUILDER_CATALOG_GROUPS, BUILDER_ICON_NAMES } from '../builder/catalog'
import {
  generateBuilderComponentLess,
  generateBuilderThemeLess,
  getBuilderUIKitComponents,
} from '../builder/compiler'
import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'
import { renderBuilderDocument } from '../builder/render'
import { validateBuilderDocument } from '../builder/schema'
import { STYLE_GROUPS } from '../builder/style'
import { renderStyleShowcase } from '../builder/style-showcase'

describe('Page Builder document', () => {
  it('accepts the checked-in generated document shape', () => {
    const result = validateBuilderDocument(DEFAULT_BUILDER_DOCUMENT)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('rejects Less injection in theme values', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    document.theme.accent = '#fff; @import "evil.less"'

    const result = validateBuilderDocument(document)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('theme.accent must be a six-digit hex color')
  })

  it('rejects unsupported component style values', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    document.theme.cardShadow = 'url(https://example.com/evil.css)'

    const result = validateBuilderDocument(document)
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('theme.cardShadow has an unsupported value')
  })

  it('escapes copy and refuses unsafe links in rendered output', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    const card = document.nodes[0]?.children[0]?.children[0]
    const heading = card?.children[0]
    const button = card?.children[2]
    if (!heading || !button) throw new Error('default builder fixture changed')
    heading.props.content = '<img src=x onerror=alert(1)>'
    button.props.href = 'javascript:alert(1)'

    const html = renderBuilderDocument(document)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('href="#"')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('javascript:')
  })

  it('emits only optional UIkit components missing from the app baseline', () => {
    expect(getBuilderUIKitComponents(DEFAULT_BUILDER_DOCUMENT)).toContain('card')
    const less = generateBuilderComponentLess(DEFAULT_BUILDER_DOCUMENT)
    expect(less).not.toContain('/card.less')
    expect(less).not.toContain('/grid.less')
    expect(less).not.toContain('/button.less')
  })

  it('keeps baseline ownership aligned with generated builder deltas', async () => {
    const { readFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const baseline = await readFile(resolve(process.cwd(), 'src/assets/_import.less'), 'utf8')
    const generated = await readFile(
      resolve(process.cwd(), 'src/assets/builder/components.generated.less'),
      'utf8',
    )

    expect(baseline).toContain("components/card.less';")
    expect(generated).not.toContain('/card.less')
  })

  it('compiles global, inverse and component decisions into whitelisted Less', () => {
    const less = generateBuilderThemeLess(DEFAULT_BUILDER_DOCUMENT)
    expect(less).toContain('@jlz-inverse-bg: #e9eef5;')
    expect(less).toContain('@jlz-color-accent-secondary: #58e6a9;')
    expect(less).toContain('@link-muted-color: #8b949e;')
    expect(less).toContain('@list-margin-top: 8px;')
    expect(less).toContain('@base-hr-border: #2a313c;')
    expect(less).toContain('@base-hr-margin-vertical: 32px;')
    expect(less).toContain('@button-line-height: 44px;')
    expect(less).toContain('@card-body-padding-horizontal: 32px;')
    expect(less).not.toContain('undefined')
  })

  it('exposes every element family the project composes, grouped once', () => {
    const grouped = BUILDER_CATALOG_GROUPS.flatMap((group) => [...group.types])
    expect(new Set(grouped).size).toBe(grouped.length)
    expect(grouped.sort()).toEqual(Object.keys(BUILDER_CATALOG).sort())
    expect(grouped).toEqual(
      expect.arrayContaining(['heading', 'link', 'icon', 'list', 'divider', 'image', 'video']),
    )
    for (const definition of Object.values(BUILDER_CATALOG)) {
      expect(definition.fieldGroups.length, definition.type).toBeGreaterThan(0)
    }
    expect(BUILDER_ICON_NAMES).toContain('telegram')
  })

  it('the Style workspace covers every element family the catalogue composes', () => {
    const groupIds = new Set(STYLE_GROUPS.map((group) => group.id))
    for (const type of Object.keys(BUILDER_CATALOG)) {
      expect(groupIds.has(type as never), `missing style group for ${type}`).toBe(true)
    }
    for (const group of STYLE_GROUPS) {
      expect(group.icon, group.id).toBeTruthy()
      expect(group.fields.length, group.id).toBeGreaterThan(0)
    }
  })

  it('renders the new content types with safe fallbacks', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    const section = document.nodes[0]
    if (!section) throw new Error('default builder fixture changed')
    section.children.push(
      {
        id: 'icon-x1',
        type: 'icon',
        props: { name: 'javascript:alert(1)', ratio: 'abc' },
        children: [],
      },
      {
        id: 'list-x1',
        type: 'list',
        props: { items: '<b>bold</b>\n\nplain', style: 'ordered' },
        children: [],
      },
      {
        id: 'divider-x1',
        type: 'divider',
        props: { style: 'evil' },
        children: [],
      },
      {
        id: 'link-x1',
        type: 'link',
        props: { label: 'Read <more>', href: 'javascript:alert(1)', style: 'muted' },
        children: [],
      },
      {
        id: 'image-x1',
        type: 'image',
        props: { src: 'javascript:alert(1)', alt: 'A <cover>', loading: 'invalid' },
        children: [],
      },
      {
        id: 'video-x1',
        type: 'video',
        props: {
          src: 'javascript:alert(1)',
          poster: 'javascript:alert(1)',
          ariaLabel: 'Preview <video>',
          preload: 'invalid',
        },
        children: [],
      },
    )

    const html = renderBuilderDocument(document)
    expect(html).toContain('uk-icon="icon: arrow-up-right"')
    expect(html).toContain('<ol class="uk-list uk-list-ordered">')
    expect(html).toContain('<li>&lt;b&gt;bold&lt;/b&gt;</li>')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('<hr class="uk-divider"')
    expect(html).toContain('class="jlz-builder-link uk-link-muted"')
    expect(html).toContain('href="#"')
    expect(html).toContain('class="jlz-builder-image"')
    expect(html).toContain('alt="A &lt;cover&gt;"')
    expect(html).toContain('class="jlz-builder-video"')
    expect(html).toContain('aria-label="Preview &lt;video&gt;"')
    expect(html).toContain('preload="metadata"')
    expect(html).not.toContain('javascript:')
  })

  it('routes list and divider through the optional component pipeline', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    document.nodes[0]?.children.push(
      { id: 'list-x2', type: 'list', props: { items: 'a', style: 'default' }, children: [] },
      { id: 'divider-x2', type: 'divider', props: { style: 'small' }, children: [] },
    )
    expect(getBuilderUIKitComponents(document)).toEqual(expect.arrayContaining(['list', 'divider']))
    const less = generateBuilderComponentLess(document)
    expect(less).toContain('/list.less')
    expect(less).toContain('/divider.less')
  })

  it('resolves a bounded trusted project source for lists', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    document.nodes[0]?.children.push({
      id: 'projects-list',
      type: 'list',
      props: {
        items: 'ignored',
        source: 'projects',
        sourceField: 'title',
        sourceLimit: '3',
        style: 'default',
      },
      children: [],
    })
    const result = validateBuilderDocument(document)
    expect(result.ok).toBe(true)
    const html = renderBuilderDocument(document)
    expect(html).toContain('<li>Porsche 911 Spider</li>')
    expect(html).toContain('<li>Alise</li>')
    expect(html).toContain('<li>19 Lab</li>')
    expect(html).not.toContain('<li>Pro193</li>')
  })

  it('selects Russian authored copy while keeping English as the fallback', () => {
    const document = structuredClone(DEFAULT_BUILDER_DOCUMENT)
    const heading = document.nodes[0]?.children[0]?.children[0]?.children[0]
    if (!heading) throw new Error('default builder fixture changed')
    heading.props.content = 'English heading'
    heading.props.contentRu = 'Русский заголовок'
    expect(renderBuilderDocument(document)).toContain('English heading')
    expect(renderBuilderDocument(document, { locale: 'RU' })).toContain('Русский заголовок')
  })

  it('keeps the complete style showcase visible and marks the selected group', () => {
    const showcase = renderStyleShowcase('button')

    expect(showcase).toContain('data-style-sample="global"')
    expect(showcase).toContain('data-style-sample="card"')
    expect(showcase).toContain('data-style-sample="navbar"')
    expect(showcase).toContain('class="jlz-style-sample is-active" data-style-sample="button"')
    expect(showcase).not.toContain('class="jlz-style-sample is-active" data-style-sample="card"')
  })
})
