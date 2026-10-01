import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const attachWorksSection = vi.hoisted(() => vi.fn((root: THREE.Group) => root))
vi.mock('./WorksSection', () => ({ attachWorksSection }))

import { SectionGroups } from './SectionGroups'
import { WORLD_SLOT_COUNT, WORKS_SLOT_INDEX } from '../../core/worldSlots'

describe('Vue-owned section roots', () => {
  beforeEach(() => attachWorksSection.mockClear())

  it('adopts exactly the mounted roots and leaves their scene lifetime to Vue', () => {
    const scene = new THREE.Scene()
    const roots = Array.from({ length: WORLD_SLOT_COUNT }, (_, index) => {
      const root = new THREE.Group()
      root.name = `section-${index}`
      scene.add(root)
      return root
    })
    const owner = new SectionGroups(scene, () => 'home', () => 'center', roots)

    expect(owner.groups).toEqual(roots)
    expect(owner.at(WORKS_SLOT_INDEX)).toBe(roots[WORKS_SLOT_INDEX])
    expect(attachWorksSection).toHaveBeenCalledWith(roots[WORKS_SLOT_INDEX], expect.any(Function), expect.any(Function))
    expect(scene.children).toEqual(roots)

    owner.dispose()
    owner.dispose()
    expect(owner.at(0)).toBeUndefined()
    expect(scene.children).toEqual(roots)
    expect(roots.every((root) => root.parent === scene)).toBe(true)
  })

  it('rejects incomplete roots rather than manufacturing Three groups', () => {
    const scene = new THREE.Scene()
    const roots = Array.from({ length: WORLD_SLOT_COUNT - 1 }, () => new THREE.Group())
    roots.forEach((root) => scene.add(root))

    expect(() => new SectionGroups(scene, () => 'home', () => 'center', roots)).toThrow(
      `Expected ${WORLD_SLOT_COUNT} Vue-owned section roots`,
    )
    expect(scene.children).toHaveLength(WORLD_SLOT_COUNT - 1)
    expect(attachWorksSection).not.toHaveBeenCalled()
  })

  it('rejects roots not attached to the Tres-owned scene', () => {
    const scene = new THREE.Scene()
    const roots = Array.from({ length: WORLD_SLOT_COUNT }, () => new THREE.Group())

    expect(() => new SectionGroups(scene, () => 'home', () => 'center', roots)).toThrow(
      'is not attached to the Tres scene',
    )
    expect(scene.children).toHaveLength(0)
  })
})
