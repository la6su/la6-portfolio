// src/Experience/FpsTracker.ts — render-budget FPS tracker.
//
// Owned by Experience's frame path (one observe() call per frame) and read
// by DevPanel through Experience's lowFps getter. The tracker is pure
// measurement: it owns the rolling window and the low-FPS verdict; the
// auto-reduce policy (halve particle counts, one-way) stays in Experience,
// which knows the scene groups.

/** Rolling window size (frames) before the low-FPS verdict is issued. */
const LOW_FPS_WINDOW = 60
/** FPS below this counts as low. */
const LOW_FPS_THRESHOLD = 30

export class FpsTracker {
  // PERF-7 fix: circular buffer index + running sum for O(1) FPS tracking
  // (was array.shift() O(N) + reduce() O(N) every frame → ~7200 element-
  // touches/sec). Now O(1) per frame: subtract outgoing, add incoming,
  // advance ring index.
  private readonly _frameTimes: number[] = []
  private _idx = 0
  private _sum = 0
  private _lowFps = false

  /** True when FPS < 30 sustained over 60 frames. Read by DevPanel. */
  public get lowFps(): boolean {
    return this._lowFps
  }

  /** Feed one frame time (ms) and update the low-FPS verdict. */
  public observe(deltaMs: number): void {
    if (this._idx < LOW_FPS_WINDOW) {
      // Fill phase: accumulate
      this._sum += deltaMs
      this._frameTimes[this._idx] = deltaMs
      this._idx++
      if (this._idx === LOW_FPS_WINDOW) this._recompute()
    } else {
      // Circular phase: subtract outgoing, add incoming
      const idx = this._idx % LOW_FPS_WINDOW
      this._sum += deltaMs - this._frameTimes[idx]!
      this._frameTimes[idx] = deltaMs
      this._idx++
      this._recompute()
    }
  }

  private _recompute(): void {
    const avgMs = this._sum / LOW_FPS_WINDOW
    this._lowFps = 1000 / Math.max(1, avgMs) < LOW_FPS_THRESHOLD
  }
}
