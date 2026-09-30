import { describe, it, expect } from 'vitest'
import { BuilderStore, HISTORY_CAP, type NodeLocation } from '../builder/store'
import { validateBuilderDocument, type BuilderDocument } from '../builder/schema'
import { DEFAULT_BUILDER_DOCUMENT } from '../builder/default-document'

const clone = (document: BuilderDocument): BuilderDocument => structuredClone(document)
const firstSectionId = (): string => DEFAULT_BUILDER_DOCUMENT.nodes[0]!.id

describe('BuilderStore — constructor baseline', () => {
  it('starts with the initial document, empty selection and a single history entry', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    expect(store.document).toEqual(DEFAULT_BUILDER_DOCUMENT)
    expect(store.selectedId).toBeNull()
    expect(store.history.length).toBe(1)
    expect(store.historyIndex).toBe(0)
    expect(store.isDirty()).toBe(false)
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })
})

describe('BuilderStore — commit (structural edits)', () => {
  it('applies a valid change, replaces the document and pushes history', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const before = clone(store.document)
    const result = store.commit((draft) => {
      draft.nodes[0]!.children.push({
        id: 'heading-test',
        type: 'heading',
        props: { content: 'Hello' },
        children: [],
      })
    })
    expect(result.ok).toBe(true)
    expect(store.document.nodes[0]!.children.length).toBe(before.nodes[0]!.children.length + 1)
    expect(store.history.length).toBe(2)
    expect(store.historyIndex).toBe(1)
    expect(store.isDirty()).toBe(true)
  })

  it('rejects an invalid change without touching the document or history', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const before = clone(store.document)
    const result = store.commit((draft) => {
      draft.title = '' // violates the 1..120 char rule
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
    expect(store.document).toEqual(before)
    expect(store.history.length).toBe(1)
    expect(store.historyIndex).toBe(0)
  })

  it('hands the change a private clone and discards rejected drafts', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const liveBefore = store.document
    let spy: BuilderDocument | null = null
    const result = store.commit((draft) => {
      spy = draft
      draft.title = '' // invalid: the change must never reach the live document
    })
    expect(result.ok).toBe(false)
    expect(spy).not.toBe(liveBefore)
    expect(liveBefore.title).toBe(DEFAULT_BUILDER_DOCUMENT.title)
  })
})

describe('BuilderStore — recordSnapshot (field edits)', () => {
  it('is a no-op when the document is unchanged', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const result = store.recordSnapshot()
    expect(result).toEqual({ ok: true, changed: false })
    expect(store.history.length).toBe(1)
  })

  it('pushes a snapshot when the live document was mutated', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    store.document.title = 'Edited title'
    const result = store.recordSnapshot()
    expect(result).toEqual({ ok: true, changed: true })
    expect(store.history.length).toBe(2)
    expect(store.history[1]!.title).toBe('Edited title')
    // A second record without changes is a no-op again.
    expect(store.recordSnapshot().changed).toBe(false)
  })
})

describe('BuilderStore — history restore', () => {
  it('restores the snapshot and keeps a valid selection', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const id = firstSectionId()
    store.selectedId = id
    const before = store.document.title
    store.commit((draft) => {
      draft.title = before + '!'
    })
    expect(store.document.title).toBe(before + '!')
    store.restore(0)
    expect(store.document.title).toBe(before)
    expect(store.selectedId).toBe(id)
  })

  it('clears the selection when the restored snapshot lacks the selected node', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    store.commit((draft) => {
      draft.nodes[0]!.children.push({
        id: 'heading-temp',
        type: 'heading',
        props: { content: 'Temp' },
        children: [],
      })
    })
    store.selectedId = 'heading-temp'
    store.restore(0)
    expect(store.selectedId).toBeNull()
  })

  it('ignores out-of-range restore indices', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const before = clone(store.document)
    store.restore(99)
    expect(store.document).toEqual(before)
    expect(store.historyIndex).toBe(0)
  })
})

describe('BuilderStore — saved baseline (dirty tracking)', () => {
  it('markSaved clears the dirty flag; edits set it again', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    store.commit(() => {}) // no-op commit still pushes a snapshot but not a change
    store.commit((draft) => {
      draft.title = 'After save'
    })
    expect(store.isDirty()).toBe(true)
    store.markSaved()
    expect(store.isDirty()).toBe(false)
    store.document.title = 'After edit'
    store.recordSnapshot()
    expect(store.isDirty()).toBe(true)
  })

  it('load replaces the document, resets history and the baseline', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    store.commit((draft) => {
      draft.title = 'Mutated'
    })
    const loaded = validateBuilderDocument(DEFAULT_BUILDER_DOCUMENT)
    expect(loaded.ok).toBe(true)
    store.load(loaded.document!)
    expect(store.document.title).toBe(DEFAULT_BUILDER_DOCUMENT.title)
    expect(store.history.length).toBe(1)
    expect(store.isDirty()).toBe(false)
    expect(store.canUndo).toBe(false)
  })
})

describe('BuilderStore — history cap', () => {
  it('caps the history at HISTORY_CAP, dropping the oldest snapshot', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    let title = 'a'
    for (let i = 0; i < HISTORY_CAP + 5; i += 1) {
      title += 'b'
      store.commit((draft) => {
        draft.title = title
      })
    }
    expect(store.history.length).toBe(HISTORY_CAP)
    expect(store.historyIndex).toBe(HISTORY_CAP - 1)
    expect(store.history[0]!.title).not.toBe('ab')
    expect(store.canUndo).toBe(true)
    expect(store.canRedo).toBe(false)
  })
})

describe('BuilderStore — node lookup', () => {
  it('finds nested nodes with their parent context and index', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    const id = firstSectionId()
    const location: NodeLocation | null = store.findNode(id)
    expect(location).not.toBeNull()
    expect(location!.parent).toBeNull()
    expect(location!.siblings).toBe(store.document.nodes)
    expect(location!.index).toBe(0)
  })

  it('returns null for unknown ids', () => {
    const store = new BuilderStore(DEFAULT_BUILDER_DOCUMENT)
    expect(store.findNode('does-not-exist')).toBeNull()
    expect(BuilderStore.findLocationInDocument(store.document, 'does-not-exist')).toBeNull()
  })
})
