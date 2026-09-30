import { validateBuilderTheme, type BuilderTheme } from './style'
import { BUILDER_SOURCE_FIELDS, BUILDER_SOURCE_IDS } from './sources'

const BUILDER_DOCUMENT_VERSION = 2 as const

export type BuilderElementType =
  | 'section'
  | 'grid'
  | 'heading'
  | 'text'
  | 'button'
  | 'card'
  | 'link'
  | 'icon'
  | 'list'
  | 'divider'
  | 'image'
  | 'video'

export interface BuilderNode {
  id: string
  type: BuilderElementType
  props: Record<string, string>
  children: BuilderNode[]
}

export interface BuilderDocument {
  version: typeof BUILDER_DOCUMENT_VERSION
  slug: string
  title: string
  /** Optional Russian metadata; EN remains the canonical fallback. */
  titleRu?: string
  /**
   * SEO description for the published static route (1–300 characters).
   * Absent on documents created before Phase 9 slice 5 — the publish
   * pipeline falls back to the page title.
   */
  description?: string
  descriptionRu?: string
  /**
   * The "approved" marker (Phase 9 slice 5): only published documents are
   * rendered into the static `/p/<slug>` routes by the publish pipeline.
   * Absent means unpublished.
   */
  published?: boolean
  theme: BuilderTheme
  nodes: BuilderNode[]
}

interface BuilderValidationResult {
  ok: boolean
  errors: string[]
  document?: BuilderDocument
}

const ELEMENT_TYPES = new Set<BuilderElementType>([
  'section',
  'grid',
  'heading',
  'text',
  'button',
  'card',
  'link',
  'icon',
  'list',
  'divider',
  'image',
  'video',
])

const CONTAINER_TYPES = new Set<BuilderElementType>(['section', 'grid', 'card'])
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
export const SAFE_BUILDER_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function validateNode(
  value: unknown,
  errors: string[],
  ids: Set<string>,
  depth: number,
  count: { value: number },
): value is BuilderNode {
  if (!isRecord(value)) {
    errors.push('every builder node must be an object')
    return false
  }
  count.value += 1
  if (count.value > 200) errors.push('a builder document may contain at most 200 nodes')
  if (depth > 6) errors.push('builder nodes may be nested at most six levels deep')

  if (typeof value.id !== 'string' || !SAFE_ID.test(value.id)) {
    errors.push('every builder node needs a safe, stable id')
  } else if (ids.has(value.id)) {
    errors.push(`duplicate builder node id: ${value.id}`)
  } else {
    ids.add(value.id)
  }

  if (typeof value.type !== 'string' || !ELEMENT_TYPES.has(value.type as BuilderElementType)) {
    errors.push(`unsupported builder element type: ${String(value.type)}`)
  }

  if (!isRecord(value.props)) {
    errors.push(`node ${String(value.id)} props must be an object`)
  } else {
    for (const [key, prop] of Object.entries(value.props)) {
      if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) errors.push(`unsafe property name: ${key}`)
      if (typeof prop !== 'string') errors.push(`node property ${key} must be a string`)
      if (typeof prop === 'string' && prop.length > 5000)
        errors.push(`node property ${key} exceeds 5000 characters`)
    }
    if (value.type === 'image') {
      const src = typeof value.props.src === 'string' ? value.props.src.trim() : ''
      const alt = typeof value.props.alt === 'string' ? value.props.alt.trim() : ''
      if (!src || !isSafeMediaSource(src))
        errors.push(`image node ${String(value.id)} needs a safe src`)
      if (!alt) errors.push(`image node ${String(value.id)} needs alt text`)
    }
    if (value.type === 'video') {
      const src = typeof value.props.src === 'string' ? value.props.src.trim() : ''
      const label = typeof value.props.ariaLabel === 'string' ? value.props.ariaLabel.trim() : ''
      if (!src || !isSafeMediaSource(src))
        errors.push(`video node ${String(value.id)} needs a safe src`)
      if (!label) errors.push(`video node ${String(value.id)} needs an accessible label`)
      if (typeof value.props.poster === 'string' && !isSafeMediaSource(value.props.poster))
        errors.push(`video node ${String(value.id)} needs a safe poster`)
    }
    if (value.type === 'list' && value.props.source) {
      if (!BUILDER_SOURCE_IDS.includes(value.props.source as (typeof BUILDER_SOURCE_IDS)[number]))
        errors.push(`list node ${String(value.id)} needs a supported source`)
      if (
        value.props.sourceField &&
        !BUILDER_SOURCE_FIELDS.includes(
          value.props.sourceField as (typeof BUILDER_SOURCE_FIELDS)[number],
        )
      )
        errors.push(`list node ${String(value.id)} needs a supported source field`)
      if (
        typeof value.props.sourceLimit === 'string' &&
        !/^(?:[1-9]|1[0-2])$/.test(value.props.sourceLimit)
      )
        errors.push(`list node ${String(value.id)} needs a source limit from 1 to 12`)
    }
  }

  if (!Array.isArray(value.children)) {
    errors.push(`node ${String(value.id)} children must be an array`)
  } else {
    if (
      typeof value.type === 'string' &&
      ELEMENT_TYPES.has(value.type as BuilderElementType) &&
      !CONTAINER_TYPES.has(value.type as BuilderElementType) &&
      value.children.length > 0
    ) {
      errors.push(`${value.type} elements cannot contain child elements`)
    }
    value.children.forEach((child) => validateNode(child, errors, ids, depth + 1, count))
  }

  return errors.length === 0
}

/** Builder media accepts same-origin assets and HTTPS sources only. */
function isSafeMediaSource(value: string): boolean {
  const src = value.trim()
  if (src.startsWith('/') && !src.startsWith('//')) return true
  try {
    return new URL(src).protocol === 'https:'
  } catch {
    return false
  }
}

export function validateBuilderDocument(value: unknown): BuilderValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) return { ok: false, errors: ['document must be an object'] }

  if (value.version !== BUILDER_DOCUMENT_VERSION)
    errors.push(`document version must be ${BUILDER_DOCUMENT_VERSION}`)
  if (typeof value.title !== 'string' || value.title.length < 1 || value.title.length > 120)
    errors.push('title must contain between 1 and 120 characters')
  if (
    value.titleRu !== undefined &&
    (typeof value.titleRu !== 'string' || value.titleRu.length < 1 || value.titleRu.length > 120)
  )
    errors.push('titleRu must contain between 1 and 120 characters')
  if (typeof value.slug !== 'string' || !SAFE_BUILDER_SLUG.test(value.slug))
    errors.push('slug must contain lowercase letters, digits and single hyphens')
  if (
    value.description !== undefined &&
    (typeof value.description !== 'string' ||
      value.description.length < 1 ||
      value.description.length > 300)
  )
    errors.push('description must contain between 1 and 300 characters')
  if (
    value.descriptionRu !== undefined &&
    (typeof value.descriptionRu !== 'string' ||
      value.descriptionRu.length < 1 ||
      value.descriptionRu.length > 300)
  )
    errors.push('descriptionRu must contain between 1 and 300 characters')
  if (value.published !== undefined && typeof value.published !== 'boolean')
    errors.push('published must be a boolean')

  validateBuilderTheme(value.theme, errors)

  if (!Array.isArray(value.nodes)) {
    errors.push('nodes must be an array')
  } else {
    const ids = new Set<string>()
    const count = { value: 0 }
    value.nodes.forEach((node) => validateNode(node, errors, ids, 1, count))
    if (value.nodes.length === 0) errors.push('document must contain at least one root node')
    for (const node of value.nodes) {
      if (isRecord(node) && node.type !== 'section')
        errors.push('root builder nodes must be sections')
    }
  }

  return errors.length === 0
    ? { ok: true, errors, document: value as unknown as BuilderDocument }
    : { ok: false, errors }
}
