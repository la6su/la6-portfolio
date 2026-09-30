import { describe, expect, it, vi } from 'vitest'
import { toRaw } from 'vue'
import * as THREE from 'three'
import { createStageSlot } from '../app/stageSlot'

describe('stageSlot lifecycle', () => {
  it('mounts raw, flushes the template boundary and clears on unmount', async () => {
    const slot = createStageSlot<THREE.Group>({ isAlive: () => true })
    const group = new THREE.Group()

    await slot.mount(group)
    expect(slot.object.value).toBe(group)
    // The three object must never enter Vue's reactive graph.
    expect(toRaw(slot.object.value)).toBe(group)
    expect(group).toHaveProperty('__v_skip', true)

    await slot.unmount(group)
    expect(slot.object.value).toBeNull()
  })

  it('never mounts once the host is no longer alive', async () => {
    const alive = vi.fn(() => true)
    const slot = createStageSlot<THREE.Group>({ isAlive: alive })
    const group = new THREE.Group()
    await slot.mount(group)
    alive.mockReturnValue(false)

    const late = new THREE.Group()
    await slot.mount(late)
    expect(slot.object.value).toBe(group)
  })

  it('ignores an unmount for a different object (stale retired request)', async () => {
    const slot = createStageSlot<THREE.Group>({ isAlive: () => true })
    const mounted = new THREE.Group()
    const stale = new THREE.Group()
    await slot.mount(mounted)

    await slot.unmount(stale)
    expect(slot.object.value).toBe(mounted)

    await slot.unmount(mounted)
    expect(slot.object.value).toBeNull()
  })
})
