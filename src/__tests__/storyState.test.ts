import { describe, it, expect } from 'vitest'
import { storyProgressFromScroll, mainSectionFromPosition } from '../core/storyState'
import { sectionIndexAt } from '../core/storyProgress'
import { worldSlotIndex, WORLD_SLOT_COUNT } from '../core/worldSlots'

// Canonical scale, derived from the six-slot model (not re-declared):
const FIRST_MAIN = worldSlotIndex('intro')! // 1
const LAST_MAIN = worldSlotIndex('contact')! // 4
const MAIN_COUNT = LAST_MAIN - FIRST_MAIN + 1 // 4
const SECTIONS = WORLD_SLOT_COUNT // 6

describe('storyProgressFromScroll (the main→slot rescale)', () => {
  it('maps the four main stops to progress 1/5 .. 4/5 on the slot scale', () => {
    const h = 1000
    expect(storyProgressFromScroll(0, h, MAIN_COUNT, FIRST_MAIN, SECTIONS)).toBeCloseTo(1 / 5)
    expect(storyProgressFromScroll(h, h, MAIN_COUNT, FIRST_MAIN, SECTIONS)).toBeCloseTo(2 / 5)
    expect(storyProgressFromScroll(2 * h, h, MAIN_COUNT, FIRST_MAIN, SECTIONS)).toBeCloseTo(3 / 5)
    expect(storyProgressFromScroll(3 * h, h, MAIN_COUNT, FIRST_MAIN, SECTIONS)).toBeCloseTo(4 / 5)
  })

  it('clamps out-of-range scroll into the main span (progress stays in [1/5, 4/5] for the center side)', () => {
    const h = 1000
    expect(storyProgressFromScroll(-500, h, MAIN_COUNT, FIRST_MAIN, SECTIONS)).toBeCloseTo(1 / 5)
    expect(storyProgressFromScroll(10 * h, h, MAIN_COUNT, FIRST_MAIN, SECTIONS)).toBeCloseTo(4 / 5)
  })

  it('falls back to a 1px track height for a non-positive track height', () => {
    // 1:1 with the legacy Math.max(1, ...) guard: scrollTop / 1 is clamped
    // into the main span anyway, so a missing height cannot produce NaN.
    const p = storyProgressFromScroll(3, 0, MAIN_COUNT, FIRST_MAIN, SECTIONS)
    expect(p).toBeCloseTo(4 / 5)
    expect(Number.isFinite(p)).toBe(true)
  })
})

describe('mainSectionFromPosition (the main-section rounding rule)', () => {
  it('lands in the main whose span contains the position', () => {
    expect(mainSectionFromPosition(0, FIRST_MAIN, MAIN_COUNT)).toBe(1)
    expect(mainSectionFromPosition(0.49, FIRST_MAIN, MAIN_COUNT)).toBe(1)
    expect(mainSectionFromPosition(1, FIRST_MAIN, MAIN_COUNT)).toBe(2)
    expect(mainSectionFromPosition(2, FIRST_MAIN, MAIN_COUNT)).toBe(3)
    expect(mainSectionFromPosition(3, FIRST_MAIN, MAIN_COUNT)).toBe(4)
  })

  it('at an exact .5 boundary JS rounds up — the next main (same convention as the scene midpoint rule)', () => {
    expect(mainSectionFromPosition(0.5, FIRST_MAIN, MAIN_COUNT)).toBe(2)
    expect(mainSectionFromPosition(1.5, FIRST_MAIN, MAIN_COUNT)).toBe(3)
    expect(mainSectionFromPosition(2.5, FIRST_MAIN, MAIN_COUNT)).toBe(4)
  })

  it('clamps out-of-range positions to the end mains', () => {
    expect(mainSectionFromPosition(-2, FIRST_MAIN, MAIN_COUNT)).toBe(1)
    expect(mainSectionFromPosition(9, FIRST_MAIN, MAIN_COUNT)).toBe(4)
  })
})

describe('the route/story/scene desync invariant', () => {
  it('at every main stop point the DOM main index and the scene slot index are the same number', () => {
    // The DOM flips its chapter at main m (event-driven); the scene arrives
    // at slot round(progress × 5) (frame-driven, midpoint rule). Mains 1..4
    // ARE slots 1..4, so both observers must land on the same index at each
    // stop point — otherwise the DOM chapter and the 3D section desync.
    for (let m = 0; m < MAIN_COUNT; m++) {
      const progress = storyProgressFromScroll(m * 1000, 1000, MAIN_COUNT, FIRST_MAIN, SECTIONS)
      const domMain = mainSectionFromPosition(m, FIRST_MAIN, MAIN_COUNT)
      const sceneSlot = sectionIndexAt(progress, SECTIONS)
      expect(sceneSlot, `stop ${m}`).toBe(domMain)
      expect(sceneSlot, `stop ${m}`).toBe(FIRST_MAIN + m)
    }
  })

  it('throughout each main span both observers agree on that main', () => {
    // Sample each main's span — [m − 0.5, m + 0.5), HALF-OPEN on the right
    // because the .5 boundary belongs to the next main (JS rounds up, the
    // same convention as the scene's midpoint rule; the boundary itself is
    // covered by the dedicated .5 test above). The DOM main (rounded
    // position) and the scene slot (midpoint rule over the rescaled
    // progress) must agree at every sampled scroll position.
    for (let m = 0; m < MAIN_COUNT; m++) {
      for (let i = 0; i < 20; i++) {
        const p = m - 0.5 + i / 20 // [m − 0.5, m + 0.5)
        if (p < 0 || p > MAIN_COUNT - 1) continue
        const progress = storyProgressFromScroll(p * 1000, 1000, MAIN_COUNT, FIRST_MAIN, SECTIONS)
        const domMain = mainSectionFromPosition(p, FIRST_MAIN, MAIN_COUNT)
        const sceneSlot = sectionIndexAt(progress, SECTIONS)
        expect(sceneSlot, `main ${m + 1} @ p=${p.toFixed(3)}`).toBe(domMain)
        expect(domMain, `main ${m + 1} @ p=${p.toFixed(3)}`).toBe(FIRST_MAIN + m)
      }
    }
  })
})
