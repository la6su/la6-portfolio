// src/__tests__/builderDocuments.test.ts — Phase 9, slice 3: the builder
// document collection model (src/builder/documents.ts) and the exported slug
// policy. The one-page publishing restriction is lifted at this layer: a
// collection may hold any number of documents, each with its own slug.

import { describe, expect, it } from 'vitest'

import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'
import {
  BUILDER_DOCUMENTS_VERSION,
  createBuilderDocument,
  findBuilderDocument,
  isSafeBuilderSlug,
  nextAvailableBuilderSlug,
  removeBuilderDocument,
  upsertBuilderDocument,
  validateBuilderDocuments,
  type BuilderDocuments,
} from '../builder/documents'
import { SAFE_BUILDER_SLUG } from '../builder/schema'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const collection = (...documents: Array<typeof DEFAULT_BUILDER_DOCUMENT>): BuilderDocuments => ({
  version: BUILDER_DOCUMENTS_VERSION,
  documents: documents.map((document) => clone(document)),
})

const withSlug = (slug: string, title: string): typeof DEFAULT_BUILDER_DOCUMENT => {
  const document = clone(DEFAULT_BUILDER_DOCUMENT)
  document.slug = slug
  document.title = title
  return document
}

describe('isSafeBuilderSlug', () => {
  it('accepts the schema slug alphabet (letters, digits, single hyphens)', () => {
    expect(isSafeBuilderSlug('studio-page')).toBe(true)
    expect(isSafeBuilderSlug('page-2')).toBe(true)
    expect(isSafeBuilderSlug('a1')).toBe(true)
    expect(SAFE_BUILDER_SLUG.test('a-b-c')).toBe(true)
  })

  it('rejects unsafe slugs', () => {
    expect(isSafeBuilderSlug('')).toBe(false)
    expect(isSafeBuilderSlug('Page')).toBe(false)
    expect(isSafeBuilderSlug('-page')).toBe(false)
    expect(isSafeBuilderSlug('page-')).toBe(false)
    expect(isSafeBuilderSlug('a--b')).toBe(false)
    expect(isSafeBuilderSlug('a_b')).toBe(false)
    expect(isSafeBuilderSlug('a/b')).toBe(false)
  })
})

describe('validateBuilderDocuments', () => {
  it('accepts a collection of valid documents with unique slugs', () => {
    const validation = validateBuilderDocuments(
      collection(DEFAULT_BUILDER_DOCUMENT, withSlug('about', 'About')),
    )
    expect(validation.ok).toBe(true)
    expect(validation.documents?.documents).toHaveLength(2)
  })

  it('accepts an empty collection (storage allows it; the delete endpoint keeps >= 1)', () => {
    const validation = validateBuilderDocuments({ version: 1, documents: [] })
    expect(validation.ok).toBe(true)
  })

  it('rejects a wrong version and a missing array', () => {
    expect(validateBuilderDocuments({ version: 99, documents: [] }).ok).toBe(false)
    expect(validateBuilderDocuments({ version: 1, documents: 'nope' }).ok).toBe(false)
    expect(validateBuilderDocuments('nope').ok).toBe(false)
  })

  it('rejects a duplicate slug and reports the index', () => {
    const validation = validateBuilderDocuments(
      collection(DEFAULT_BUILDER_DOCUMENT, clone(DEFAULT_BUILDER_DOCUMENT)),
    )
    expect(validation.ok).toBe(false)
    expect(validation.errors.join('; ')).toContain('duplicate slug')
  })

  it('rejects an invalid member and keeps the index in the error', () => {
    const broken = clone(DEFAULT_BUILDER_DOCUMENT)
    broken.title = ''
    const validation = validateBuilderDocuments({
      version: 1,
      documents: [DEFAULT_BUILDER_DOCUMENT, broken],
    })
    expect(validation.ok).toBe(false)
    expect(validation.errors.join('; ')).toContain('document 1')
  })
})

describe('upsertBuilderDocument', () => {
  it('appends a new slug and keeps the order of the others', () => {
    const base = collection(DEFAULT_BUILDER_DOCUMENT, withSlug('about', 'About'))
    const next = upsertBuilderDocument(base, withSlug('works', 'Works'))
    expect(next.documents.map((document) => document.slug)).toEqual([
      'studio-page',
      'about',
      'works',
    ])
    // the base collection is not mutated
    expect(base.documents).toHaveLength(2)
  })

  it('replaces an existing slug in place', () => {
    const base = collection(DEFAULT_BUILDER_DOCUMENT, withSlug('about', 'About'))
    const replacement = withSlug('about', 'About (v2)')
    const next = upsertBuilderDocument(base, replacement)
    expect(next.documents).toHaveLength(2)
    expect(next.documents[1]!.title).toBe('About (v2)')
  })
})

describe('removeBuilderDocument / findBuilderDocument', () => {
  it('removes by slug and returns the same collection when absent', () => {
    const base = collection(DEFAULT_BUILDER_DOCUMENT, withSlug('about', 'About'))
    const next = removeBuilderDocument(base, 'about')
    expect(next.documents.map((document) => document.slug)).toEqual(['studio-page'])
    expect(removeBuilderDocument(base, 'missing')).toBe(base)
  })

  it('finds by slug', () => {
    const base = collection(DEFAULT_BUILDER_DOCUMENT, withSlug('about', 'About'))
    expect(findBuilderDocument(base, 'about')?.title).toBe('About')
    expect(findBuilderDocument(base, 'missing')).toBeUndefined()
  })
})

describe('nextAvailableBuilderSlug', () => {
  it('starts at page and walks page-2, page-3, …', () => {
    expect(nextAvailableBuilderSlug([])).toBe('page')
    expect(nextAvailableBuilderSlug(['page'])).toBe('page-2')
    expect(nextAvailableBuilderSlug(['page', 'page-2'])).toBe('page-3')
    expect(nextAvailableBuilderSlug(['studio-page'])).toBe('page')
  })
})

describe('createBuilderDocument', () => {
  it('creates a fresh document from the default layout with the given slug', () => {
    const document = createBuilderDocument('page')
    expect(document.slug).toBe('page')
    expect(document.title).toBe('Untitled page')
    expect(document.nodes).toHaveLength(DEFAULT_BUILDER_DOCUMENT.nodes.length)
    // independent from the shared default (a clone, not a reference)
    document.nodes[0]!.id = 'mutated'
    expect(DEFAULT_BUILDER_DOCUMENT.nodes[0]!.id).not.toBe('mutated')
  })
})
