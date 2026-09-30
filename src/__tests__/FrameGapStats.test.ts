import { describe, expect, it } from 'vitest'
import { FrameGapStats } from '../core/FrameGapStats'

describe('FrameGapStats', () => {
  it('reports bounded ring percentiles after wrap-around', () => {
    const stats = new FrameGapStats(3)
    stats.record(1)
    stats.record(9)
    stats.record(4)
    stats.record(2)
    expect(stats.snapshot()).toEqual({ p50: 4, p95: 9 })
  })

  it('returns no stale values after reset', () => {
    const stats = new FrameGapStats(2)
    stats.record(8)
    expect(stats.snapshot()).toEqual({ p50: 8, p95: 8 })
    stats.reset()
    expect(stats.snapshot()).toBeNull()
  })

  it('rejects invalid capacities', () => {
    expect(() => new FrameGapStats(0)).toThrow(RangeError)
    expect(() => new FrameGapStats(1.5)).toThrow(RangeError)
  })
})
