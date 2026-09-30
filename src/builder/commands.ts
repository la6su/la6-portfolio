// src/builder/commands.ts — Phase 4 structural editor commands.
//
// The add / move / duplicate / remove / theme-reset actions used to be inline
// closures in the admin entry, each wrapping a `store.commit(...)`. They are
// the editor's structural edits and are pure functions of the store: given a
// store and an intent they produce a validated commit (or the first error).
//
// Keeping them out of the DOM layer makes them unit-testable against a bare
// BuilderStore and gives the SFC panels (the Vue admin editor) a single,
// framework-neutral surface to dispatch — exactly like the store they build
// on. They import no Vue, DOM, UIkit or Three.

import { BUILDER_CATALOG } from './catalog'
import { DEFAULT_BUILDER_THEME } from './style'
import { BuilderStore, type CommitResult } from './store'
import type { BuilderElementType, BuilderNode } from './schema'

/** A stable, type-prefixed node id (collision-safe for editor-local ids). */
export function makeId(type: BuilderElementType): string {
  const suffix = crypto.randomUUID?.().slice(0, 8) ?? Date.now().toString(36)
  return `${type}-${suffix.toLowerCase()}`
}

/**
 * Append a new element of `type`. A section is added at the root; anything
 * else is inserted into the selected container (or the selected node's
 * parent, or the last root node) and becomes the new selection.
 */
export function addElement(store: BuilderStore, type: BuilderElementType): CommitResult {
  const node = BUILDER_CATALOG[type].create(makeId(type))
  return store.commit((draft) => {
    if (type === 'section') {
      draft.nodes.push(node)
      store.selectedId = node.id
      return
    }

    const selected = store.selectedId
      ? BuilderStore.findLocationInDocument(draft, store.selectedId)
      : null
    if (selected && BUILDER_CATALOG[selected.node.type].container) {
      selected.node.children.push(node)
    } else if (selected?.parent) {
      selected.parent.children.push(node)
    } else {
      draft.nodes.at(-1)?.children.push(node)
    }
    store.selectedId = node.id
  })
}

/** Move the selected node up (-1) or down (+1) among its siblings. */
export function moveSelected(store: BuilderStore, offset: -1 | 1): CommitResult {
  if (!store.selectedId) return { ok: true }
  return store.commit((draft) => {
    const location = BuilderStore.findLocationInDocument(draft, store.selectedId as string)
    if (!location) return
    const target = location.index + offset
    if (target < 0 || target >= location.siblings.length) return
    const [node] = location.siblings.splice(location.index, 1)
    if (node) location.siblings.splice(target, 0, node)
  })
}

/** Move one node before another without changing its parent. */
export function moveNodeBefore(
  store: BuilderStore,
  nodeId: string,
  targetId: string,
): CommitResult {
  if (nodeId === targetId) return { ok: true }
  const sourceLocation = store.findNode(nodeId)
  const targetLocation = store.findNode(targetId)
  if (!sourceLocation || !targetLocation || sourceLocation.siblings !== targetLocation.siblings)
    return { ok: true }
  if (targetLocation.index === sourceLocation.index + 1) return { ok: true }
  return store.commit((draft) => {
    const source = BuilderStore.findLocationInDocument(draft, nodeId)
    const target = BuilderStore.findLocationInDocument(draft, targetId)
    if (!source || !target || source.siblings !== target.siblings) return
    const [node] = source.siblings.splice(source.index, 1)
    if (!node) return
    const targetIndex = source.siblings.indexOf(target.node)
    if (targetIndex < 0) return
    source.siblings.splice(targetIndex, 0, node)
    store.selectedId = node.id
  })
}

/** Duplicate the selected node (deep clone with fresh ids) right after it. */
export function duplicateSelected(store: BuilderStore): CommitResult {
  if (!store.selectedId) return { ok: true }
  return store.commit((draft) => {
    const location = BuilderStore.findLocationInDocument(draft, store.selectedId as string)
    if (!location) return
    const cloneNode = (node: BuilderNode): BuilderNode => ({
      ...structuredClone(node),
      id: makeId(node.type),
      children: node.children.map(cloneNode),
    })
    const duplicate = cloneNode(location.node)
    location.siblings.splice(location.index + 1, 0, duplicate)
    store.selectedId = duplicate.id
  })
}

/** Remove the selected node (the last root node is never removed). */
export function removeSelected(store: BuilderStore): CommitResult {
  if (!store.selectedId) return { ok: true }
  return store.commit((draft) => {
    const location = BuilderStore.findLocationInDocument(draft, store.selectedId as string)
    if (!location || (location.parent === null && location.siblings.length === 1)) return
    location.siblings.splice(location.index, 1)
    store.selectedId = location.parent?.id ?? location.siblings[location.index - 1]?.id ?? null
  })
}

/** Reset the theme to the JUSTLOVEJAZZ defaults (an undo-able commit). */
export function resetTheme(store: BuilderStore): CommitResult {
  return store.commit((draft) => {
    draft.theme = structuredClone(DEFAULT_BUILDER_THEME)
  })
}
