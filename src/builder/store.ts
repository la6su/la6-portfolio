// src/builder/store.ts — Phase 4 typed builder store.
//
// The builder editor's mutable state (the document, the selected node, the
// undo/redo history and the last-saved baseline) used to be module-level
// lets plus inline functions in the admin entry. This class is their single
// framework-neutral source of truth. It imports no Vue, TresJS, Three.js,
// UIkit or DOM — it is a plain state container, so it is unit-testable in a
// bare vitest environment.
//
// It does not render anything. The consumer (the admin editor today, the
// Vue SFCs later) reads the state and re-renders after each action it
// dispatches — the consumer already does exactly that, so wiring this in is
// a 1:1 source-of-fact swap with no timing change.
//
// Two atomic paths, preserved verbatim from the legacy admin logic:
//
//   - `commit(change)` — structural edits (add / move / duplicate / remove):
//     clone the document, apply the change to the clone, validate the clone.
//     On a validation failure nothing changes and the error is returned; on
//     success the clone replaces the document and a history snapshot is
//     pushed (capped at HISTORY_CAP).
//   - `recordSnapshot()` — field edits (theme / prop / title): the consumer
//     mutates the live document in place, then this validates and pushes a
//     history snapshot only when the document actually changed.
//
// `markSaved` advances the saved baseline (the dirty check target); it is
// only called on a successful save or a fresh load, never on an edit.

import { validateBuilderDocument, type BuilderDocument, type BuilderNode } from './schema'

/** The undo/redo history cap (oldest snapshots are dropped first). */
export const HISTORY_CAP = 50

/** A node's location in the document tree. */
export interface NodeLocation {
  node: BuilderNode
  /** The array the node sits in (its parent's children, or the root list). */
  siblings: BuilderNode[]
  parent: BuilderNode | null
  index: number
}

export interface CommitResult {
  ok: boolean
  error?: string
}

interface SnapshotResult {
  ok: boolean
  /** True when a new history snapshot was actually pushed. */
  changed: boolean
  error?: string
}

const cloneDocument = (document: BuilderDocument): BuilderDocument => structuredClone(document)

const serialize = (document: BuilderDocument): string => JSON.stringify(document)

export class BuilderStore {
  document: BuilderDocument
  selectedId: string | null = null
  /** Undo/redo snapshots (oldest first); only `historyIndex` is mutable. */
  private snapshots: BuilderDocument[]
  historyIndex: number
  /** JSON snapshot of the last saved / loaded document (the dirty baseline). */
  savedSnapshot: string

  constructor(initial: BuilderDocument) {
    this.document = cloneDocument(initial)
    this.snapshots = [cloneDocument(initial)]
    this.historyIndex = 0
    this.savedSnapshot = serialize(this.document)
  }

  /** The undo/redo history (read-only view). */
  get history(): readonly BuilderDocument[] {
    return this.snapshots
  }

  /** Structural edit: apply `change` to a clone; keep it only when valid. */
  commit(change: (draft: BuilderDocument) => void): CommitResult {
    const draft = cloneDocument(this.document)
    change(draft)
    const validation = validateBuilderDocument(draft)
    if (!validation.ok) {
      return { ok: false, error: validation.errors[0] ?? 'Invalid document change' }
    }
    this.document = draft
    this.pushHistory()
    return { ok: true }
  }

  /** Field edit: the live document was mutated in place; snapshot it. */
  recordSnapshot(): SnapshotResult {
    const validation = validateBuilderDocument(this.document)
    if (!validation.ok) {
      return { ok: false, changed: false, error: validation.errors[0] }
    }
    if (serialize(this.history[this.historyIndex]!) === serialize(this.document)) {
      return { ok: true, changed: false }
    }
    this.pushHistory()
    return { ok: true, changed: true }
  }

  /** Restore a history snapshot; drop a stale selection. */
  restore(nextIndex: number): void {
    const snapshot = this.snapshots[nextIndex]
    if (!snapshot) return
    this.historyIndex = nextIndex
    this.document = cloneDocument(snapshot)
    if (this.selectedId && !this.findNode(this.selectedId)) this.selectedId = null
  }

  /** Replace the document, reset history and set the dirty baseline. */
  load(document: BuilderDocument): void {
    this.document = cloneDocument(document)
    this.snapshots = [cloneDocument(document)]
    this.historyIndex = 0
    this.savedSnapshot = serialize(this.document)
  }

  /** Mark the current document as the saved baseline. */
  markSaved(): void {
    this.savedSnapshot = serialize(this.document)
  }

  isDirty(): boolean {
    return serialize(this.document) !== this.savedSnapshot
  }

  get canUndo(): boolean {
    return this.historyIndex > 0
  }

  get canRedo(): boolean {
    return this.historyIndex < this.history.length - 1
  }

  /** Find a node by id (its parent context and position). */
  findNode(
    id: string,
    nodes = this.document.nodes,
    parent: BuilderNode | null = null,
  ): NodeLocation | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      if (!node) continue
      if (node.id === id) return { node, siblings: nodes, parent, index }
      const nested = this.findNode(id, node.children, node)
      if (nested) return nested
    }
    return null
  }

  /** Find a node inside an arbitrary document (drafts during commits). */
  static findLocationInDocument(
    document: BuilderDocument,
    id: string,
    nodes = document.nodes,
    parent: BuilderNode | null = null,
  ): NodeLocation | null {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]
      if (!node) continue
      if (node.id === id) return { node, siblings: nodes, parent, index }
      const nested = BuilderStore.findLocationInDocument(document, id, node.children, node)
      if (nested) return nested
    }
    return null
  }

  private pushHistory(): void {
    this.snapshots = this.snapshots.slice(0, this.historyIndex + 1)
    this.snapshots.push(cloneDocument(this.document))
    if (this.snapshots.length > HISTORY_CAP) this.snapshots.shift()
    this.historyIndex = this.snapshots.length - 1
  }
}
