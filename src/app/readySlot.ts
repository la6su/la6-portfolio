// src/app/readySlot.ts — one declarative scene-node ready slot.
//
// Every declarative node under TresCanvas reports itself to SceneHost the
// same way: a live shallow value plus a one-shot promise the host awaits
// before resolving the bridge. One slot factory replaces the
// let/resolver/promise triple a node used to need (ADR 0005 DX pass).
import { shallowRef, type ShallowRef } from 'vue'

interface ReadySlot<T> {
  /** The mounted node, or `null` before its `ready` emit. */
  value: ShallowRef<T | null>
  /** Resolves with the node on its `ready` emit. */
  promise: Promise<T>
  /** The `ready` handler (`@ready="slot.resolve"`). */
  resolve(node: T): void
}

export function createReadySlot<T>(): ReadySlot<T> {
  let resolve!: (node: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  const value = shallowRef<T | null>(null)
  return {
    value,
    promise,
    resolve(node: T) {
      value.value = node
      resolve(node)
    },
  }
}

/**
 * The slot's node or its pending promise: `await readyNode(slot)` resolves
 * immediately on the sync fast path and waits on the mount race otherwise.
 */
export function readyNode<T>(slot: ReadySlot<T>): T | Promise<T> {
  return slot.value.value ?? slot.promise
}
