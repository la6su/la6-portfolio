// src/builder/vue/elements.ts — The trusted Vue element registry (Phase 9).
//
// One component per builder element type, rendering the exact same markup
// the framework-neutral string renderer (`src/builder/render.ts`) emits:
// the same tags, classes, prop allowlists (shared `safeChoice`/`safeHref`),
// escaping (Vue's interpolation) and — in editable mode — the same
// `data-builder-id` / `data-builder-type` / `tabindex` editor attributes.
//
// The registry is the single typed surface for builder documents in Vue:
// the admin editor preview and the public route rendering (Phase 9 slice 5)
// both render through it, so an element is implemented once and tested in
// both contexts (the parity test `src/__tests__/builderVueRegistry.test.ts`
// locks the registry output against `renderBuilderDocument`).
//
// Render-function components (no template compiler): SSR-safe, tree-shakeable
// and importable from the dev-only admin entry and the production public
// views alike — the registry itself carries no editor state.

import { h, type Component, type PropType } from 'vue'

import { BUILDER_ICON_NAMES } from '../catalog'
import { sanitizeHref, sanitizeMediaSrc, safeChoice } from '../render'
import { resolveBuilderListItems } from '../sources'
import { localizedProp, type BuilderLocale } from '../localization'
import type { BuilderElementType, BuilderNode } from '../schema'

/** Props every registry component accepts. */
interface BuilderElementProps {
  node: BuilderNode
  /** Emit the editor delegation attributes (admin preview only). */
  editable?: boolean
  locale?: BuilderLocale
}

interface ElementComponentOptions {
  name: string
  props: {
    node: { type: PropType<BuilderNode>; required: true }
    editable: { type: BooleanConstructor; default: false }
    locale?: { type: PropType<BuilderLocale>; default: 'EN' }
  }
  render(props: BuilderElementProps): ReturnType<typeof h>
}

/** The editor delegation attributes (same set + semantics as render.ts). */
const editorAttrs = (props: BuilderElementProps): Record<string, string> =>
  props.editable
    ? {
        'data-builder-id': props.node.id,
        'data-builder-type': props.node.type,
        tabindex: '0',
      }
    : {}

/** Render the node's children through the dispatcher (recursion root). */
const renderChildren = (props: BuilderElementProps): ReturnType<typeof h>[] =>
  props.node.children.map((child) =>
    h(BuilderElement, {
      key: child.id,
      node: child,
      editable: props.editable,
      locale: props.locale,
    }),
  )

const section: ElementComponentOptions = {
  name: 'BuilderSection',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(
      props.node.props.style,
      ['default', 'muted', 'primary', 'secondary'],
      'default',
    )
    const size = safeChoice(
      props.node.props.size,
      ['small', 'default', 'large', 'xlarge'],
      'default',
    )
    const container = safeChoice(
      props.node.props.container,
      ['default', 'small', 'large', 'expand'],
      'default',
    )
    const styleClass = style === 'default' ? 'uk-section-default' : `uk-section-${style}`
    const sizeClass = size === 'default' ? '' : ` uk-section-${size}`
    const containerClass = container === 'default' ? '' : ` uk-container-${container}`
    return h(
      'section',
      { class: `uk-section ${styleClass}${sizeClass} jlz-builder-section`, ...editorAttrs(props) },
      [h('div', { class: `uk-container${containerClass}` }, renderChildren(props))],
    )
  },
}

const grid: ElementComponentOptions = {
  name: 'BuilderGrid',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const columns = safeChoice(props.node.props.columns, ['1', '2', '3', '4'], '2')
    const gap = safeChoice(
      props.node.props.gap,
      ['small', 'default', 'large', 'collapse'],
      'default',
    )
    const gapClass = gap === 'default' ? '' : ` uk-grid-${gap}`
    return h(
      'div',
      {
        class: `uk-grid uk-child-width-1-${columns}@m${gapClass} jlz-builder-grid`,
        'data-columns': columns,
        'uk-grid': '',
        ...editorAttrs(props),
      },
      props.node.children.map((child) =>
        h('div', undefined, [
          h(BuilderElement, {
            key: child.id,
            node: child,
            editable: props.editable,
            locale: props.locale,
          }),
        ]),
      ),
    )
  },
}

const heading: ElementComponentOptions = {
  name: 'BuilderHeading',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const level = safeChoice(props.node.props.level, ['h1', 'h2', 'h3', 'h4'], 'h2')
    const size = safeChoice(
      props.node.props.size,
      ['default', 'small', 'medium', 'large', 'xlarge', '2xlarge'],
      'default',
    )
    // The class attribute is omitted for the default size — matching
    // render.ts, which only emits `class` when the size class is present.
    const attrs: Record<string, string> = { ...editorAttrs(props) }
    if (size !== 'default') attrs.class = `uk-heading-${size}`
    return h(level, attrs, localizedProp(props.node.props, 'content', props.locale))
  },
}

const text: ElementComponentOptions = {
  name: 'BuilderText',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(
      props.node.props.style,
      ['default', 'lead', 'meta', 'muted'],
      'default',
    )
    // Class omitted for the default style — matching render.ts.
    const attrs: Record<string, string> = { ...editorAttrs(props) }
    if (style !== 'default') attrs.class = `uk-text-${style}`
    return h('p', attrs, localizedProp(props.node.props, 'content', props.locale))
  },
}

const button: ElementComponentOptions = {
  name: 'BuilderButton',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(
      props.node.props.style,
      ['default', 'primary', 'secondary', 'text'],
      'default',
    )
    return h(
      'a',
      {
        class: `uk-button uk-button-${style}`,
        // raw sanitized value — Vue's attribute binding escapes it itself
        href: sanitizeHref(props.node.props.href),
        ...editorAttrs(props),
      },
      localizedProp(props.node.props, 'label', props.locale),
    )
  },
}

const card: ElementComponentOptions = {
  name: 'BuilderCard',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(props.node.props.style, ['default', 'primary', 'secondary'], 'default')
    const size = safeChoice(props.node.props.size, ['small', 'default', 'large'], 'default')
    const sizeClass = size === 'default' ? '' : ` uk-card-${size}`
    return h(
      'article',
      {
        class: `uk-card uk-card-${style} uk-card-body${sizeClass} jlz-builder-card`,
        ...editorAttrs(props),
      },
      renderChildren(props),
    )
  },
}

const divider: ElementComponentOptions = {
  name: 'BuilderDivider',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(props.node.props.style, ['default', 'small'], 'default')
    const styleClass = style === 'default' ? '' : ' uk-divider-small'
    return h('hr', { class: `uk-divider${styleClass}`, ...editorAttrs(props) })
  },
}

const list: ElementComponentOptions = {
  name: 'BuilderList',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(
      props.node.props.style,
      ['default', 'hyphen', 'divider', 'ordered'],
      'default',
    )
    const items = resolveBuilderListItems(props.node.props, props.locale)
    const tag = style === 'ordered' ? 'ol' : 'ul'
    const styleClass =
      style === 'default' || style === 'ordered'
        ? ''
        : ` uk-list-${style === 'ordered' ? '' : style}`
    const orderedClass = style === 'ordered' ? ' uk-list-ordered' : ''
    return h(
      tag,
      { class: `uk-list${styleClass}${orderedClass}`, ...editorAttrs(props) },
      items.map((item, index) => h('li', { key: index }, item)),
    )
  },
}

const link: ElementComponentOptions = {
  name: 'BuilderLink',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const style = safeChoice(props.node.props.style, ['default', 'muted', 'reset'], 'default')
    const styleClass =
      style === 'muted' ? ' uk-link-muted' : style === 'reset' ? ' uk-link-reset' : ''
    return h(
      'a',
      {
        class: `jlz-builder-link${styleClass}`,
        // raw sanitized value — Vue's attribute binding escapes it itself
        href: sanitizeHref(props.node.props.href),
        ...editorAttrs(props),
      },
      localizedProp(props.node.props, 'label', props.locale),
    )
  },
}

const icon: ElementComponentOptions = {
  name: 'BuilderIcon',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const name = safeChoice(props.node.props.name, BUILDER_ICON_NAMES, 'arrow-up-right')
    const ratio = /^\d+(?:\.\d+)?$/.test(props.node.props.ratio ?? '')
      ? (props.node.props.ratio as string)
      : '1'
    const ratioAttr = ratio === '1' ? '' : `; ratio: ${ratio}`
    return h('span', {
      class: 'jlz-builder-icon',
      'uk-icon': `icon: ${name}${ratioAttr}`,
      'aria-hidden': 'true',
      ...editorAttrs(props),
    })
  },
}

const image: ElementComponentOptions = {
  name: 'BuilderImage',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const loading = safeChoice(props.node.props.loading, ['lazy', 'eager'], 'lazy')
    return h('img', {
      class: 'jlz-builder-image',
      src: sanitizeMediaSrc(props.node.props.src),
      alt: localizedProp(props.node.props, 'alt', props.locale),
      loading,
      decoding: 'async',
      ...editorAttrs(props),
    })
  },
}

const video: ElementComponentOptions = {
  name: 'BuilderVideo',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(props: BuilderElementProps) {
    const preload = safeChoice(props.node.props.preload, ['none', 'metadata'], 'metadata')
    const poster = props.node.props.poster
      ? { poster: sanitizeMediaSrc(props.node.props.poster) }
      : {}
    return h('video', {
      class: 'jlz-builder-video',
      src: sanitizeMediaSrc(props.node.props.src),
      controls: true,
      preload,
      playsinline: '',
      'aria-label': localizedProp(props.node.props, 'ariaLabel', props.locale),
      ...poster,
      ...editorAttrs(props),
    })
  },
}

/**
 * The registry: one trusted component per builder element type. A type
 * without a registry entry is a registry bug — render it as a no-op comment
 * instead of crashing a public route (the schema validator already rejects
 * unknown types before a document can be saved).
 */
export const BUILDER_ELEMENT_REGISTRY: Record<BuilderElementType, Component> = {
  section,
  grid,
  heading,
  text,
  button,
  card,
  divider,
  list,
  link,
  icon,
  image,
  video,
} as unknown as Record<BuilderElementType, Component>

/**
 * The dispatcher: resolves `node.type` to its registry component. Used
 * recursively for children (and once per root section by `BuilderPage`).
 */
export const BuilderElement: Component = {
  name: 'BuilderElement',
  props: {
    node: { type: Object as PropType<BuilderNode>, required: true },
    editable: { type: Boolean, default: false },
    locale: { type: String as PropType<BuilderLocale>, default: 'EN' },
  },
  render(this: { node: BuilderNode; editable?: boolean; locale?: BuilderLocale }) {
    const target = BUILDER_ELEMENT_REGISTRY[this.node.type]
    if (!target) return null
    return h(target, {
      node: this.node,
      editable: this.editable ?? false,
      locale: this.locale ?? 'EN',
    })
  },
}
