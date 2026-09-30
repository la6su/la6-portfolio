import { describe, expect, it } from 'vitest'
import { FrameTiming } from '../core/FrameTiming'

const sample = (value: number) => ({
  scene: value,
  camera: value + 1,
  renderer: value + 2,
  total: value + 3,
})

describe('FrameTiming', () => {
  it('returns no snapshot before the first rendered frame', () => {
    expect(new FrameTiming(3).snapshot()).toBeNull()
  })

  it('keeps a bounded ring and reports deterministic percentiles', () => {
    const timing = new FrameTiming(3)
    timing.record(sample(1))
    timing.record(sample(2))
    timing.record(sample(9))
    timing.record(sample(4))

    expect(timing.snapshot()).toEqual({
      samples: 3,
      scene: { p50: 4, p95: 9, latest: 4 },
      camera: { p50: 5, p95: 10, latest: 5 },
      renderer: { p50: 6, p95: 11, latest: 6 },
      total: { p50: 7, p95: 12, latest: 7 },
    })
  })

  it('reuses the ring values across repeated snapshots', () => {
    const timing = new FrameTiming(4)
    timing.record(sample(8))
    timing.record(sample(2))

    expect(timing.snapshot()?.scene).toEqual({ p50: 2, p95: 8, latest: 2 })
    timing.record(sample(5))
    expect(timing.snapshot()?.scene).toEqual({ p50: 5, p95: 8, latest: 5 })
  })

  it('rejects an invalid capacity before allocating samples', () => {
    expect(() => new FrameTiming(0)).toThrow(RangeError)
    expect(() => new FrameTiming(1.5)).toThrow(RangeError)
  })
})
