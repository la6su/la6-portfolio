// src/builder/documents.ts — the builder document collection model (Phase 9,
// slice 3).
//
// The builder stores a *collection* of documents on disk (the dev plugin
// owns `src/builder/generated/documents.json`); each document keeps its own
// slug and is validated independently by the v2 schema. The one-page
// publishing restriction is lifted at this storage layer: a collection may
// hold any number of documents. These helpers are framework-neutral and
// shared by the dev plugin (save / delete / load) and the
// unit tests so there is one validation decision, not one per consumer.

import { DEFAULT_BUILDER_DOCUMENT } from './default-document'
import { SAFE_BUILDER_SLUG, validateBuilderDocument, type BuilderDocument } from './schema'

/** The on-disk collection format version. */
export const BUILDER_DOCUMENTS_VERSION = 1 as const

/** A saved builder collection: every document keeps its own safe slug. */
export interface BuilderDocuments {
  version: typeof BUILDER_DOCUMENTS_VERSION
  documents: BuilderDocument[]
}

interface BuilderDocumentsValidation {
  ok: boolean
  errors: string[]
  documents?: BuilderDocuments
}

/** A slug may only contain lowercase letters, digits and single hyphens. */
export const isSafeBuilderSlug = (value: string): boolean => SAFE_BUILDER_SLUG.test(value)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a whole collection: the version, a documents array, each member
 * against the v2 document schema, and unique slugs across the collection.
 */
export function validateBuilderDocuments(value: unknown): BuilderDocumentsValidation {
  if (!isRecord(value)) return { ok: false, errors: ['document collection must be an object'] }

  const errors: string[] = []
  if (value.version !== BUILDER_DOCUMENTS_VERSION)
    errors.push(`collection version must be ${BUILDER_DOCUMENTS_VERSION}`)
  if (!Array.isArray(value.documents)) {
    errors.push('documents must be an array')
    return { ok: false, errors }
  }

  const slugs = new Set<string>()
  value.documents.forEach((member, index) => {
    const validation = validateBuilderDocument(member)
    if (!validation.ok || !validation.document) {
      errors.push(`document ${index}: ${validation.errors.join('; ')}`)
      return
    }
    const slug = validation.document.slug
    if (slugs.has(slug)) errors.push(`document ${index}: duplicate slug "${slug}"`)
    slugs.add(slug)
  })

  return errors.length === 0
    ? { ok: true, errors, documents: value as unknown as BuilderDocuments }
    : { ok: false, errors }
}

/** Find the first document with the given slug (undefined if absent). */
export const findBuilderDocument = (
  collection: BuilderDocuments,
  slug: string,
): BuilderDocument | undefined => collection.documents.find((document) => document.slug === slug)

/**
 * Insert a document or replace the existing one with the same slug,
 * preserving the order of every other member. Returns a new collection.
 */
export function upsertBuilderDocument(
  collection: BuilderDocuments,
  document: BuilderDocument,
): BuilderDocuments {
  const index = collection.documents.findIndex((member) => member.slug === document.slug)
  const documents =
    index === -1
      ? [...collection.documents, document]
      : collection.documents.map((member, memberIndex) =>
          memberIndex === index ? document : member,
        )
  return { ...collection, documents }
}

/** Remove the document with the given slug; returns the same collection when absent. */
export function removeBuilderDocument(
  collection: BuilderDocuments,
  slug: string,
): BuilderDocuments {
  const documents = collection.documents.filter((document) => document.slug !== slug)
  return documents.length === collection.documents.length
    ? collection
    : { ...collection, documents }
}

/**
 * The "approved" subset of a collection (Phase 9, slice 5): the documents
 * with `published: true`, in stable slug order. The publish pipeline renders
 * exactly this set into the static `/p/<slug>` routes and the sitemap
 * generator consumes the same list — one source of truth for what is public.
 */
export function publishedPages(collection: BuilderDocuments): BuilderDocument[] {
  return collection.documents
    .filter((document) => document.published === true)
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

/** `page`, `page-2`, … — the first slug not already used. */
export function nextAvailableBuilderSlug(slugs: Iterable<string>): string {
  const used = new Set(slugs)
  let candidate = 'page'
  while (used.has(candidate)) {
    candidate = candidate === 'page' ? 'page-2' : `page-${Number(candidate.slice(5)) + 1}`
  }
  return candidate
}

/** A fresh document: the default layout with a new slug and title. */
export function createBuilderDocument(slug: string): BuilderDocument {
  const document: BuilderDocument = JSON.parse(JSON.stringify(DEFAULT_BUILDER_DOCUMENT))
  document.slug = slug
  document.title = 'Untitled page'
  return document
}
