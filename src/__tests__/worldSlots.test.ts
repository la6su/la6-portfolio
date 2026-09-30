import { describe, it, expect } from 'vitest'
import { WORLD_SLOTS, WORLD_SLOT_COUNT, worldSlotAt, worldSlotIndex } from '../core/worldSlots'
import { DEFAULT_CAMERA_SMOOTHING, getWorldConfigForPage } from '../core/WorldConfig'
import { SplashCube } from '../Experience/World/SplashCube'

/** The former inline literals, kept as the regression baseline. */
const LEGACY_FACE_ROTATIONS = [0, -Math.PI / 2, Math.PI, Math.PI / 2, -Math.PI / 4, Math.PI / 4]

describe('world slot contract', () => {
  it('uses one shared camera smoothing default for generated section configs', () => {
    const configs = getWorldConfigForPage('home')
    expect(configs[1]?.camSmoothing).toBe(DEFAULT_CAMERA_SMOOTHING)
    expect(getWorldConfigForPage('services')[0]?.camSmoothing).toBe(DEFAULT_CAMERA_SMOOTHING)
  })
  it('declares exactly the six canonical slots in stable index order', () => {
    expect(WORLD_SLOT_COUNT).toBe(6)
    expect(WORLD_SLOTS.map((slot) => slot.id)).toEqual([
      'lab',
      'intro',
      'about',
      'works',
      'contact',
      'menu',
    ])
    WORLD_SLOTS.forEach((slot, index) => expect(slot.index).toBe(index))
  })

  it('slot 0 is the runtime lab slot with the public Contact finale role', () => {
    expect(worldSlotAt(0).id).toBe('lab')
    expect(worldSlotAt(0).role).toBe('Contact finale')
  })

  it('story ranges tile the track as contiguous fifths from 0 to 6/5', () => {
    for (const slot of WORLD_SLOTS) {
      const [start, end] = slot.range
      expect(end - start).toBeCloseTo(1 / 5)
      if (slot.index > 0) expect(start).toBeCloseTo(WORLD_SLOTS[slot.index - 1]!.range[1]!)
    }
    expect(WORLD_SLOTS[0]!.range[0]).toBe(0)
    expect(WORLD_SLOTS[5]!.range[1]).toBeCloseTo(6 / 5)
  })

  it('DOM anchors match the slot ids', () => {
    for (const slot of WORLD_SLOTS) {
      expect(slot.domSection).toBe(slot.id)
    }
  })

  it('face rotations match the former SplashCube literals', () => {
    const rotations = WORLD_SLOTS.map((slot) => slot.faceRotation)
    expect(rotations).toHaveLength(LEGACY_FACE_ROTATIONS.length)
    rotations.forEach((value, index) => expect(value).toBeCloseTo(LEGACY_FACE_ROTATIONS[index]!))
  })

  it('index lookup clamps out-of-range values', () => {
    expect(worldSlotAt(-3).index).toBe(0)
    expect(worldSlotAt(99).index).toBe(5)
    expect(worldSlotAt(2.9).index).toBe(2)
  })

  it('strict index lookup: every canonical id maps to its stable index', () => {
    expect(worldSlotIndex('lab')).toBe(0)
    expect(worldSlotIndex('intro')).toBe(1)
    expect(worldSlotIndex('about')).toBe(2)
    expect(worldSlotIndex('works')).toBe(3)
    expect(worldSlotIndex('contact')).toBe(4)
    expect(worldSlotIndex('menu')).toBe(5)
    for (const slot of WORLD_SLOTS) {
      expect(worldSlotIndex(slot.id)).toBe(slot.index)
    }
  })

  it('strict index lookup: unknown ids are undefined, never a default', () => {
    // The namespace lesson: a section id is not a PageId, not a route path,
    // and the page-section `page-` variants are not canonical slot ids.
    expect(worldSlotIndex('home')).toBeUndefined()
    expect(worldSlotIndex('/works')).toBeUndefined()
    expect(worldSlotIndex('page-lab')).toBeUndefined()
    expect(worldSlotIndex('content-0')).toBeUndefined()
    expect(worldSlotIndex('')).toBeUndefined()
  })

})

describe('world slot consumers', () => {
  it('home world config takes DOM anchors and ranges from the tuple', () => {
    const home = getWorldConfigForPage('home')
    expect(home).toHaveLength(WORLD_SLOT_COUNT)
    home.forEach((phase, index) => {
      const slot = worldSlotAt(index)
      expect(phase.domSection).toBe(slot.domSection)
      expect(phase.range).toEqual([...slot.range])
    })
  })

  it('SplashCube face rotations come from the tuple', () => {
    // private static, read through the prototype for the regression check
    const faceRotations = (SplashCube as unknown as { FACE_ROTATIONS: readonly number[] })
      .FACE_ROTATIONS
    expect(faceRotations).toHaveLength(WORLD_SLOT_COUNT)
    faceRotations.forEach((value, index) =>
      expect(value).toBeCloseTo(worldSlotAt(index).faceRotation),
    )
  })

  it('content page scenes reuse the tuple track geometry with their own DOM anchors', () => {
    const works = getWorldConfigForPage('works')
    expect(works).toHaveLength(WORLD_SLOT_COUNT)
    works.forEach((phase, index) => {
      const slot = worldSlotAt(index)
      expect(phase.range).toEqual([...slot.range])
      expect(phase.domSection).toBe(`content-${index}`)
    })
  })
})
