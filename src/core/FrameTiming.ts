/** DEV-only CPU timing ring for one rendered frame. */

type FrameTimingMetric = 'scene' | 'camera' | 'renderer' | 'total'

interface FrameTimingSample {
  scene: number
  camera: number
  renderer: number
  total: number
}

interface FrameTimingMetricSummary {
  p50: number
  p95: number
  latest: number
}

interface FrameTimingSnapshot {
  samples: number
  scene: FrameTimingMetricSummary
  camera: FrameTimingMetricSummary
  renderer: FrameTimingMetricSummary
  total: FrameTimingMetricSummary
}

export class FrameTiming {
  private readonly _samples: Record<FrameTimingMetric, Float64Array>
  private readonly _sorted: Float64Array
  private _count = 0
  private _cursor = 0

  constructor(private readonly _capacity = 120) {
    if (!Number.isInteger(_capacity) || _capacity < 1) {
      throw new RangeError('FrameTiming capacity must be a positive integer')
    }
    this._samples = {
      scene: new Float64Array(_capacity),
      camera: new Float64Array(_capacity),
      renderer: new Float64Array(_capacity),
      total: new Float64Array(_capacity),
    }
    this._sorted = new Float64Array(_capacity)
  }

  record(sample: FrameTimingSample): void {
    const index = this._cursor
    this._samples.scene[index] = sample.scene
    this._samples.camera[index] = sample.camera
    this._samples.renderer[index] = sample.renderer
    this._samples.total[index] = sample.total
    this._cursor = (index + 1) % this._capacity
    this._count = Math.min(this._count + 1, this._capacity)
  }

  snapshot(): FrameTimingSnapshot | null {
    if (this._count === 0) return null

    const summary = (metric: FrameTimingMetric): FrameTimingMetricSummary => {
      const values = this._samples[metric]
      this._sorted.set(values.subarray(0, this._count))
      // TypedArray#sort is numeric and mutates the reused scratch buffer.
      // Keeping the sort in-place avoids allocating an Array on every DevPanel
      // refresh while leaving the owner ring untouched.
      const sorted = this._sorted.subarray(0, this._count).sort()
      const p50Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.5) - 1)
      const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
      const round = (value: number) => Math.round(value * 100) / 100
      return {
        p50: round(sorted[p50Index] ?? 0),
        p95: round(sorted[p95Index] ?? 0),
        latest: round(values[(this._cursor + this._capacity - 1) % this._capacity] ?? 0),
      }
    }

    return {
      samples: this._count,
      scene: summary('scene'),
      camera: summary('camera'),
      renderer: summary('renderer'),
      total: summary('total'),
    }
  }
}
