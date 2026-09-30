// src/app/stageSlot.ts — one declarative stage mount/unmount boundary.
//
// SceneHost mounts runtime-owned stage objects into the Tres scene at the
// request of the Experience runtime (Works plane stage + its installation,
// contact halo, manifesto ink). The boundary is identical for every stage:
// an aliveness guard (a disposed host never attaches), a raw store (three
// objects must never become Vue reactive proxies), an identity-checked
// unmount (a stale detach from a retired request is a no-op) and a
// nextTick flush (the template's <primitive> mounts before the runtime
// proceeds). One slot factory replaces the hand-written mount/unmount pair
// each stage used to need (ADR 0005 DX pass; sibling of readySlot.ts).
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
