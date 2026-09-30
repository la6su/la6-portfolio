import { describe, it, expect } from 'vitest'
import { clampStoryProgress, sectionIndexAt } from '../core/storyProgress'

describe('clampStoryProgress', () => {
  it('clamps into [0, 1]', () => {
    expect(clampStoryProgress(-0.4)).toBe(0)
    expect(clampStoryProgress(0)).toBe(0)
    expect(clampStoryProgress(0.5)).toBe(0.5)
    expect(clampStoryProgress(1)).toBe(1)
    expect(clampStoryProgress(1.7)).toBe(1)
  })

  it('non-finite input settles to 0 (NaN, ±Infinity)', () => {
    expect(clampStoryProgress(Number.NaN)).toBe(0)
    expect(clampStoryProgress(Infinity)).toBe(0)
    expect(clampStoryProgress(-Infinity)).toBe(0)
  })
})

describe('sectionIndexAt (the midpoint arrival rule)', () => {
  const SECTIONS = 6 // the canonical six-slot world

  it('progress 0 is the first section and progress 1 the last', () => {
    expect(sectionIndexAt(0, SECTIONS)).toBe(0)
    expect(sectionIndexAt(1, SECTIONS)).toBe(5)
  })

  it('clamps out-of-range progress to the edge sections', () => {
    expect(sectionIndexAt(-0.3, SECTIONS)).toBe(0)
    expect(sectionIndexAt(1.3, SECTIONS)).toBe(5)
    expect(sectionIndexAt(Number.NaN, SECTIONS)).toBe(0)
  })

  it('lands in the section whose midpoint span contains the progress', () => {
    // Section i is active from midpoint(i-1,i) to midpoint(i,i+1):
    // with 6 sections the midpoints are 0.1, 0.3, 0.5, 0.7, 0.9.
    expect(sectionIndexAt(0.05, SECTIONS)).toBe(0)
    expect(sectionIndexAt(0.2, SECTIONS)).toBe(1)
    expect(sectionIndexAt(0.4, SECTIONS)).toBe(2)
    expect(sectionIndexAt(0.6, SECTIONS)).toBe(3)
    expect(sectionIndexAt(0.8, SECTIONS)).toBe(4)
    expect(sectionIndexAt(0.95, SECTIONS)).toBe(5)
  })

  it('at an exact .5 boundary JS rounds up — the arrival lands in the next section', () => {
    // The documented neutral point: CinematicNav flips its DOM chapter at the
    // midpoint between two native scroll frames, and the 3D arrival must use
    // the same point. Math.round(0.5) === 1, so the boundary belongs to the
    // next section.
    expect(sectionIndexAt(0.1, SECTIONS)).toBe(1) // 0.1 * 5 = 0.5 → 1
    expect(sectionIndexAt(0.3, SECTIONS)).toBe(2) // 0.3 * 5 = 1.5 → 2
    expect(sectionIndexAt(0.5, SECTIONS)).toBe(3) // 0.5 * 5 = 2.5 → 3
    expect(sectionIndexAt(0.7, SECTIONS)).toBe(4) // 0.7 * 5 = 3.5 → 4
    expect(sectionIndexAt(0.9, SECTIONS)).toBe(5) // 0.9 * 5 = 4.5 → 5
  })

  it('the rule is symmetric: no direction-dependent second beat', () => {
    // The historical bug: deriving the index from the *from* range made
    // down-scroll arrivals land at the end of a frame while up-scroll
    // arrivals landed immediately after leaving it. The midpoint rule is a
    // pure function of progress, so a given progress always yields the same
    // index regardless of scroll direction.
    for (let i = 0; i <= 100; i++) {
      const p = i / 100
      expect(sectionIndexAt(p, SECTIONS)).toBe(sectionIndexAt(p, SECTIONS))
      expect(sectionIndexAt(p, SECTIONS)).toBe(Math.round(p * (SECTIONS - 1)))
    }
  })

  it('section counts: a single section is always 0; two sections split at 0.5', () => {
    expect(sectionIndexAt(0.9, 1)).toBe(0)
    expect(sectionIndexAt(0.49, 2)).toBe(0)
    expect(sectionIndexAt(0.5, 2)).toBe(1) // 0.5 * 1 = 0.5 → 1
    expect(sectionIndexAt(0.51, 2)).toBe(1)
  })

  it('a non-positive section count settles to a single section (defensive)', () => {
    expect(sectionIndexAt(0.5, 0)).toBe(0)
    expect(sectionIndexAt(0.5, -3)).toBe(0)
  })
})
