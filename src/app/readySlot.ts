// A scene-node readiness handshake: expose a shallow value for the template
// and a promise for the host initialization path.
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
