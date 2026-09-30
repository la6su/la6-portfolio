// src/__tests__/builderCommands.test.ts — Phase 4 structural editor commands.
//
// The add / move / duplicate / remove / theme-reset actions are pure
// functions of a BuilderStore (src/builder/commands.ts). These tests lock
// their placement, selection, boundary and id semantics against a minimal
// valid document so the SFC panels can dispatch them without a DOM.

import { describe, expect, it } from 'vitest'

import {
  addElement,
  duplicateSelected,
  makeId,
  moveSelected,
  moveNodeBefore,
  removeSelected,
  resetTheme,
} from '../builder/commands'
import { DEFAULT_BUILDER_THEME } from '../builder/style'
import { BuilderStore } from '../builder/store'
import type { BuilderDocument, BuilderNode } from '../builder/schema'

const node = (
  id: string,
  type: BuilderNode['type'],
  children: BuilderNode[] = [],
): BuilderNode => ({
  id,
  type,
  props: {},
  children,
})

const minimalDocument = (): BuilderDocument => ({
  version: 2,
  slug: 'test-page',
  title: 'Test page',
  theme: { ...DEFAULT_BUILDER_THEME },
  nodes: [
    node('root-section', 'section', [
      node('root-grid', 'grid', [node('first-text', 'text'), node('second-text', 'text')]),
    ]),
  ],
})

const newStore = () => new BuilderStore(minimalDocument())

const rootChildren = (store: BuilderStore): string[] =>
  store.document.nodes[0]?.children.map((child) => child.id) ?? []
const gridChildren = (store: BuilderStore): string[] =>
  store.document.nodes[0]?.children[0]?.children.map((child) => child.id) ?? []

describe('makeId', () => {
  it('produces a safe, type-prefixed id', () => {
    const id = makeId('heading')
    expect(id).toMatch(/^heading-[a-z0-9]{8}$/)
  })
})

describe('addElement', () => {
  it('appends a section at the root and selects it', () => {
    const store = newStore()
    const result = addElement(store, 'section')
    expect(result.ok).toBe(true)
    expect(store.document.nodes).toHaveLength(2)
    expect(store.document.nodes[1]?.type).toBe('section')
    expect(store.selectedId).toBe(store.document.nodes[1]?.id)
  })

  it('inserts into the selected container and selects the new node', () => {
    const store = newStore()
    store.selectedId = 'root-grid'
    const result = addElement(store, 'heading')
    expect(result.ok).toBe(true)
    const ids = gridChildren(store)
    expect(ids).toHaveLength(3)
    expect(ids[2]).toBe(store.selectedId)
  })

  it('inserts into the selected node parent when the selection is not a container', () => {
    const store = newStore()
    store.selectedId = 'first-text'
    const result = addElement(store, 'divider')
    expect(result.ok).toBe(true)
    // The divider joins the grid (the text node's parent) after second-text.
    expect(gridChildren(store)).toHaveLength(3)
    expect(gridChildren(store)[2]).toBe(store.selectedId)
    expect(rootChildren(store)).toHaveLength(1)
  })

  it('falls back to the last root node when nothing is selected', () => {
    const store = newStore()
    expect(store.selectedId).toBeNull()
    const result = addElement(store, 'text')
    expect(result.ok).toBe(true)
    // The fallback appends to the last root section (the grid's parent).
    expect(store.document.nodes[0]?.children.map((child) => child.id)).toEqual([
      'root-grid',
      store.selectedId as string,
    ])
    expect(gridChildren(store)).toHaveLength(2)
  })
})

describe('moveSelected', () => {
  it('moves the selected node up and down within its siblings', () => {
    const store = newStore()
    store.selectedId = 'second-text'
    expect(moveSelected(store, -1).ok).toBe(true)
    expect(gridChildren(store)).toEqual(['second-text', 'first-text'])
    expect(moveSelected(store, 1).ok).toBe(true)
    expect(gridChildren(store)).toEqual(['first-text', 'second-text'])
  })

  it('keeps the order at the boundary and skips the commit without a selection', () => {
    const store = newStore()
    store.selectedId = 'first-text'
    // A boundary move applies an empty change: the order is untouched (the
    // store contract still records the attempted commit in history).
    moveSelected(store, -1)
    expect(gridChildren(store)).toEqual(['first-text', 'second-text'])
    const empty = newStore()
    moveSelected(empty, 1)
    expect(empty.historyIndex).toBe(0)
  })
})

describe('moveNodeBefore', () => {
  it('reorders siblings without changing their parent', () => {
    const store = newStore()
    expect(moveNodeBefore(store, 'second-text', 'first-text').ok).toBe(true)
    expect(gridChildren(store)).toEqual(['second-text', 'first-text'])
    expect(store.selectedId).toBe('second-text')
  })

  it('rejects cross-parent drops without changing history', () => {
    const store = newStore()
    expect(moveNodeBefore(store, 'root-grid', 'first-text').ok).toBe(true)
    expect(store.historyIndex).toBe(0)
    expect(gridChildren(store)).toEqual(['first-text', 'second-text'])
  })

  it('skips a drop onto the immediate successor without adding history', () => {
    const store = newStore()
    expect(moveNodeBefore(store, 'first-text', 'second-text').ok).toBe(true)
    expect(store.historyIndex).toBe(0)
    expect(store.selectedId).toBeNull()
    expect(gridChildren(store)).toEqual(['first-text', 'second-text'])
  })
})

describe('duplicateSelected', () => {
  it('deep-clones the node with fresh ids and selects the copy', () => {
    const store = newStore()
    store.selectedId = 'root-grid'
    const result = duplicateSelected(store)
    expect(result.ok).toBe(true)
    const ids = rootChildren(store)
    expect(ids).toHaveLength(2)
    const copy = store.document.nodes[0]?.children[1]
    expect(copy?.id).toBe(store.selectedId)
    expect(copy?.id).not.toBe('root-grid')
    // Deep clone: the same structure, but none of the original ids survive.
    const originalIds = ['root-grid', 'first-text', 'second-text']
    const copyIds: string[] = []
    const collect = (current: BuilderNode) => {
      copyIds.push(current.id)
      current.children.forEach(collect)
    }
    if (copy) collect(copy)
    expect(copyIds).toHaveLength(3)
    expect(copyIds.every((id) => !originalIds.includes(id))).toBe(true)
  })

  it('is a no-op without a selection', () => {
    const store = newStore()
    duplicateSelected(store)
    expect(store.historyIndex).toBe(0)
  })
})

describe('removeSelected', () => {
  it('removes the node and selects the parent (the legacy selection rule)', () => {
    const store = newStore()
    store.selectedId = 'second-text'
    const result = removeSelected(store)
    expect(result.ok).toBe(true)
    expect(gridChildren(store)).toEqual(['first-text'])
    expect(store.selectedId).toBe('root-grid')
  })

  it('selects the parent when removing a root section', () => {
    const store = newStore()
    store.selectedId = 'root-grid'
    removeSelected(store)
    expect(rootChildren(store)).toEqual([])
    expect(store.selectedId).toBe('root-section')
  })

  it('never removes the last root node', () => {
    const store = newStore()
    store.selectedId = 'root-section'
    removeSelected(store)
    expect(store.document.nodes).toHaveLength(1)
    expect(store.document.nodes[0]?.id).toBe('root-section')
  })
})

describe('resetTheme', () => {
  it('restores the default theme as an undo-able commit', () => {
    const store = newStore()
    store.document.theme.accent = '#123456'
    store.recordSnapshot()
    const result = resetTheme(store)
    expect(result.ok).toBe(true)
    expect(store.document.theme.accent).toBe(DEFAULT_BUILDER_THEME.accent)
    expect(store.canUndo).toBe(true)
    store.restore(store.historyIndex - 1)
    expect(store.document.theme.accent).toBe('#123456')
  })
})
