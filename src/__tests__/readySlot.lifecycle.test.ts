import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createReadySlot, readyNode } from '../app/readySlot'

describe('readySlot lifecycle', () => {
  it('starts null with a pending promise and resolves both on ready', async () => {
    const slot = createReadySlot<THREE.Group>()
    const mesh = new THREE.Group()

    expect(slot.value.value).toBeNull()
    await expect(Promise.race([slot.promise, 'pending'])).resolves.toBe('pending')

    slot.resolve(mesh)
    expect(slot.value.value).toBe(mesh)
    await expect(slot.promise).resolves.toBe(mesh)
  })

  it('keeps the first resolved node as the awaited contract', async () => {
    const slot = createReadySlot<THREE.Group>()
    const first = new THREE.Group()
    slot.resolve(first)
    await expect(slot.promise).resolves.toBe(first)
  })

  it('readyNode returns the node on the sync fast path once resolved', async () => {
    const slot = createReadySlot<THREE.Group>()
    const mesh = new THREE.Group()
    slot.resolve(mesh)

    expect(readyNode(slot)).toBe(mesh)
  })

  it('readyNode returns the pending promise before ready', async () => {
    const slot = createReadySlot<THREE.Group>()
    const pending = readyNode(slot)

    expect(typeof (pending as Promise<THREE.Group>).then).toBe('function')
    slot.resolve(new THREE.Group())
    await expect(pending).resolves.toBeInstanceOf(THREE.Group)
  })
})
