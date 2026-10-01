// Shared mount/unmount boundary for lazily created Three.js scene stages.
// It guards host teardown, keeps objects raw, ignores stale detach requests
// and waits for Vue to apply each scene-tree change.
import { markRaw, nextTick, shallowRef, type ShallowRef } from 'vue'
import type { StagePort } from './sceneHost'

/** One declarative stage slot: the `StagePort` boundary plus the live object
 *  store the template's `<primitive>` reads. */
interface StageSlot<T extends object> extends StagePort<T> {
  /** The mounted object, or `null` before mount / after unmount. */
  readonly object: ShallowRef<T | null>
}

interface StageSlotOptions {
  /** Live check — SceneHost passes its disposed guard. */
  isAlive(): boolean
}

export function createStageSlot<T extends object>(options: StageSlotOptions): StageSlot<T> {
  // The cast narrows shallowRef's overload union to the matching member.
  const object = shallowRef<T | null>(null) as ShallowRef<T | null>
  return {
    object,
    async mount(next: T): Promise<void> {
      if (!options.isAlive()) return
      object.value = markRaw(next)
      await nextTick()
    },
    async unmount(prev: T): Promise<void> {
      if (object.value !== prev) return
      object.value = null
      await nextTick()
    },
  }
}
