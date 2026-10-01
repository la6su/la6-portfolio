import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const worksOwners = vi.hoisted(() => ({
  carousel: { dispose: vi.fn() },
  particles: { dispose: vi.fn() },
  ownedTextures: [{ dispose: vi.fn() }],
}))
const createWorksSection = vi.hoisted(() => vi.fn(() => worksOwners))
vi.mock('./WorksSection', () => ({ createWorksSection }))

import { SectionGroups } from './SectionGroups'
import { WORLD_SLOT_COUNT, WORKS_SLOT_INDEX } from '../../core/worldSlots'

describe('Vue-owned section roots', () => {
  beforeEach(() => {
    createWorksSection.mockClear()
    worksOwners.carousel.dispose.mockClear()
    worksOwners.particles.dispose.mockClear()
    worksOwners.ownedTextures[0]?.dispose.mockClear()
  })

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
    expect(owner.groups[WORKS_SLOT_INDEX]).toBe(roots[WORKS_SLOT_INDEX])
    expect(owner.works).toBe(worksOwners)
    expect(createWorksSection).toHaveBeenCalledWith(expect.any(Function), expect.any(Function))
    expect(scene.children).toEqual(roots)

    owner.dispose()
    owner.dispose()
    expect(scene.children).toEqual(roots)
    expect(roots.every((root) => root.parent === scene)).toBe(true)
    expect(worksOwners.carousel.dispose).toHaveBeenCalledTimes(1)
    expect(worksOwners.particles.dispose).toHaveBeenCalledTimes(1)
    expect(worksOwners.ownedTextures[0]?.dispose).toHaveBeenCalledTimes(1)
  })

  it('rejects incomplete roots rather than manufacturing Three groups', () => {
    const scene = new THREE.Scene()
    const roots = Array.from({ length: WORLD_SLOT_COUNT - 1 }, () => new THREE.Group())
    roots.forEach((root) => scene.add(root))

    expect(() => new SectionGroups(scene, () => 'home', () => 'center', roots)).toThrow(
      `Expected ${WORLD_SLOT_COUNT} Vue-owned section roots`,
    )
    expect(scene.children).toHaveLength(WORLD_SLOT_COUNT - 1)
    expect(createWorksSection).not.toHaveBeenCalled()
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
