/** Bounded DEV-only ring of frame measurements: one p50/p95/latest summary per named metric. */

export interface FrameMetricSummary {
  p50: number
  p95: number
  latest: number
}

export type FrameStatsSnapshot<M extends string> = { samples: number } & Record<
  M,
  FrameMetricSummary
>

export class FrameStats<M extends string> {
  private readonly _metrics: readonly M[]
  private readonly _samples: Record<M, Float64Array>
  private readonly _sorted: Float64Array
  private _count = 0
  private _cursor = 0

  constructor(
    metrics: readonly M[],
    private readonly _capacity = 120,
  ) {
    if (!Number.isInteger(_capacity) || _capacity < 1) {
      throw new RangeError('FrameStats capacity must be a positive integer')
    }
    this._metrics = metrics
    this._samples = Object.fromEntries(
      metrics.map((metric) => [metric, new Float64Array(_capacity)]),
    ) as Record<M, Float64Array>
    this._sorted = new Float64Array(_capacity)
  }

  record(sample: Record<M, number>): void {
    const index = this._cursor
    for (const metric of this._metrics) {
      this._samples[metric][index] = sample[metric]
    }
    this._cursor = (index + 1) % this._capacity
    this._count = Math.min(this._count + 1, this._capacity)
  }

  reset(): void {
    this._count = 0
    this._cursor = 0
  }

  snapshot(): FrameStatsSnapshot<M> | null {
    if (this._count === 0) return null
    const summaries = {} as Record<M, FrameMetricSummary>
    const latestIndex = (this._cursor + this._capacity - 1) % this._capacity
    for (const metric of this._metrics) {
      const values = this._samples[metric]
      this._sorted.set(values.subarray(0, this._count))
      // TypedArray#sort is numeric and mutates the reused scratch buffer.
      // Keeping the sort in-place avoids allocating an Array on every DevPanel
      // refresh while leaving the owner ring untouched.
      const sorted = this._sorted.subarray(0, this._count).sort()
      const p50Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1)
      const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
      const round = (value: number) => Math.round(value * 100) / 100
      summaries[metric] = {
        p50: round(sorted[p50Index] ?? 0),
        p95: round(sorted[p95Index] ?? 0),
        latest: round(values[latestIndex] ?? 0),
      }
    }
    return { samples: this._count, ...summaries }
  }
}
