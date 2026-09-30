/** Bounded DEV-only frame-gap statistics without per-refresh array churn. */

interface FrameGapPercentiles {
  p50: number
  p95: number
}

export class FrameGapStats {
  private readonly _samples: Float64Array
  private readonly _sorted: Float64Array
  private _count = 0
  private _cursor = 0

  constructor(private readonly _capacity = 240) {
    if (!Number.isInteger(_capacity) || _capacity < 1) {
      throw new RangeError('FrameGapStats capacity must be a positive integer')
    }
    this._samples = new Float64Array(_capacity)
    this._sorted = new Float64Array(_capacity)
  }

  record(gap: number): void {
    this._samples[this._cursor] = gap
    this._cursor = (this._cursor + 1) % this._capacity
    this._count = Math.min(this._count + 1, this._capacity)
  }

  reset(): void {
    this._count = 0
    this._cursor = 0
  }

  snapshot(): FrameGapPercentiles | null {
    if (this._count === 0) return null
    this._sorted.set(this._samples.subarray(0, this._count))
    const sorted = this._sorted.subarray(0, this._count).sort()
    const p50Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1)
    const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
    const round = (value: number) => Math.round(value * 10) / 10
    return { p50: round(sorted[p50Index] ?? 0), p95: round(sorted[p95Index] ?? 0) }
  }
}
