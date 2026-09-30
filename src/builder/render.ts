import { BUILDER_ICON_NAMES } from './catalog'
import { resolveBuilderListItems } from './sources'
import { localizedProp, type BuilderLocale } from './localization'
import type { BuilderDocument, BuilderNode } from './schema'

interface BuilderRenderOptions {
  editable?: boolean
  locale?: BuilderLocale
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character] ??
      character,
  )

/**
 * Clamp a prop to an allowlist. Framework-neutral core helper — shared with
 * the Vue element registry (`./vue/elements.ts`) so both renderers make
 * identical prop decisions.
 */
export const safeChoice = (
  value: string | undefined,
  choices: readonly string[],
  fallback: string,
) => (value && choices.includes(value) ? value : fallback)

/**
 * Validate an authored href (internal paths, anchors, mailto, HTTPS only)
 * and return the raw value. Framework-neutral core helper — the single
 * href policy shared by both renderers.
 */
export const sanitizeHref = (value: string | undefined): string => {
  const href = value?.trim() ?? '#'
  if (href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:')) return href
  try {
    const url = new URL(href)
    return url.protocol === 'https:' ? url.toString() : '#'
  } catch {
    return '#'
  }
}

/**
 * The string renderer's href attribute value: `sanitizeHref` + HTML
 * escaping (the Vue element registry passes the raw `sanitizeHref` value to
 * Vue's attribute binding, which escapes it itself).
 */
export const safeHref = (value: string | undefined): string => escapeHtml(sanitizeHref(value))

/** The image source policy mirrors schema validation for runtime safety. */
export const sanitizeMediaSrc = (value: string | undefined): string => {
  const src = value?.trim() ?? ''
  if (src.startsWith('/') && !src.startsWith('//')) return src
  try {
    return new URL(src).protocol === 'https:' ? src : '#'
  } catch {
    return '#'
  }
}

function editorAttributes(node: BuilderNode, options: BuilderRenderOptions): string {
  return options.editable
    ? ` data-builder-id="${escapeHtml(node.id)}" data-builder-type="${node.type}" tabindex="0"`
    : ''
}

function renderNode(node: BuilderNode, options: BuilderRenderOptions): string {
  const locale = options.locale ?? 'EN'
  const children = node.children.map((child) => renderNode(child, options)).join('')
  const attrs = editorAttributes(node, options)

  switch (node.type) {
    case 'section': {
      const style = safeChoice(
        node.props.style,
        ['default', 'muted', 'primary', 'secondary'],
        'default',
      )
      const size = safeChoice(node.props.size, ['small', 'default', 'large', 'xlarge'], 'default')
      const container = safeChoice(
        node.props.container,
        ['default', 'small', 'large', 'expand'],
        'default',
      )
      const styleClass = style === 'default' ? 'uk-section-default' : `uk-section-${style}`
      const sizeClass = size === 'default' ? '' : ` uk-section-${size}`
      const containerClass = container === 'default' ? '' : ` uk-container-${container}`
      return `<section class="uk-section ${styleClass}${sizeClass} jlz-builder-section"${attrs}><div class="uk-container${containerClass}">${children}</div></section>`
    }
    case 'grid': {
      const columns = safeChoice(node.props.columns, ['1', '2', '3', '4'], '2')
      const gap = safeChoice(node.props.gap, ['small', 'default', 'large', 'collapse'], 'default')
      const gapClass = gap === 'default' ? '' : ` uk-grid-${gap}`
      const items = node.children
        .map((child) => `<div>${renderNode(child, options)}</div>`)
        .join('')
      return `<div class="uk-grid uk-child-width-1-${columns}@m${gapClass} jlz-builder-grid" data-columns="${columns}" uk-grid${attrs}>${items}</div>`
    }
    case 'heading': {
      const level = safeChoice(node.props.level, ['h1', 'h2', 'h3', 'h4'], 'h2')
      const size = safeChoice(
        node.props.size,
        ['default', 'small', 'medium', 'large', 'xlarge', '2xlarge'],
        'default',
      )
      const sizeClass = size === 'default' ? '' : ` class="uk-heading-${size}"`
      return `<${level}${sizeClass}${attrs}>${escapeHtml(localizedProp(node.props, 'content', locale))}</${level}>`
    }
    case 'text': {
      const style = safeChoice(node.props.style, ['default', 'lead', 'meta', 'muted'], 'default')
      const styleClass = style === 'default' ? '' : ` class="uk-text-${style}"`
      return `<p${styleClass}${attrs}>${escapeHtml(localizedProp(node.props, 'content', locale))}</p>`
    }
    case 'button': {
      const style = safeChoice(
        node.props.style,
        ['default', 'primary', 'secondary', 'text'],
        'default',
      )
      return `<a class="uk-button uk-button-${style}" href="${safeHref(node.props.href)}"${attrs}>${escapeHtml(localizedProp(node.props, 'label', locale))}</a>`
    }
    case 'card': {
      const style = safeChoice(node.props.style, ['default', 'primary', 'secondary'], 'default')
      const size = safeChoice(node.props.size, ['small', 'default', 'large'], 'default')
      const sizeClass = size === 'default' ? '' : ` uk-card-${size}`
      return `<article class="uk-card uk-card-${style} uk-card-body${sizeClass} jlz-builder-card"${attrs}>${children}</article>`
    }
    case 'divider': {
      const style = safeChoice(node.props.style, ['default', 'small'], 'default')
      const styleClass = style === 'default' ? '' : ` uk-divider-small`
      return `<hr class="uk-divider${styleClass}"${attrs} />`
    }
    case 'list': {
      const style = safeChoice(
        node.props.style,
        ['default', 'hyphen', 'divider', 'ordered'],
        'default',
      )
      const items = resolveBuilderListItems(node.props, locale)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')
      const tag = style === 'ordered' ? 'ol' : 'ul'
      const styleClass =
        style === 'default' || style === 'ordered'
          ? ''
          : ` uk-list-${style === 'ordered' ? '' : style}`
      const orderedClass = style === 'ordered' ? ' uk-list-ordered' : ''
      return `<${tag} class="uk-list${styleClass}${orderedClass}"${attrs}>${items}</${tag}>`
    }
    case 'link': {
      const style = safeChoice(node.props.style, ['default', 'muted', 'reset'], 'default')
      const styleClass =
        style === 'muted' ? ' uk-link-muted' : style === 'reset' ? ' uk-link-reset' : ''
      return `<a class="jlz-builder-link${styleClass}" href="${safeHref(node.props.href)}"${attrs}>${escapeHtml(localizedProp(node.props, 'label', locale))}</a>`
    }
    case 'icon': {
      const name = safeChoice(node.props.name, BUILDER_ICON_NAMES, 'arrow-up-right')
      const ratio = /^\d+(?:\.\d+)?$/.test(node.props.ratio ?? '')
        ? (node.props.ratio as string)
        : '1'
      const ratioAttr = ratio === '1' ? '' : `; ratio: ${ratio}`
      return `<span class="jlz-builder-icon" uk-icon="icon: ${name}${ratioAttr}" aria-hidden="true"${attrs}></span>`
    }
    case 'image': {
      const loading = safeChoice(node.props.loading, ['lazy', 'eager'], 'lazy')
      return `<img class="jlz-builder-image" src="${safeHref(sanitizeMediaSrc(node.props.src))}" alt="${escapeHtml(localizedProp(node.props, 'alt', locale))}" loading="${loading}" decoding="async"${attrs} />`
    }
    case 'video': {
      const preload = safeChoice(node.props.preload, ['none', 'metadata'], 'metadata')
      const poster = node.props.poster
        ? ` poster="${safeHref(sanitizeMediaSrc(node.props.poster))}"`
        : ''
      return `<video class="jlz-builder-video" src="${safeHref(sanitizeMediaSrc(node.props.src))}" controls preload="${preload}" playsinline aria-label="${escapeHtml(localizedProp(node.props, 'ariaLabel', locale))}"${poster}${attrs}></video>`
    }
  }
}

export function renderBuilderDocument(
  document: BuilderDocument,
  options: BuilderRenderOptions = {},
): string {
  return document.nodes.map((node) => renderNode(node, options)).join('')
}
