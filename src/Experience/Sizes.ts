// src/Experience/Sizes.ts

/**
 * Renderer DPR cap: beyond 2 the fill-rate cost is not worth the visual
 * difference at this project's viewport sizes.
 */
const MAX_DEVICE_PIXEL_RATIO = 2

/**
 * Normalize browser DPR input to the supported rendering range.
 * Browsers normally report a finite value >= 1, but test environments,
 * software adapters and transient viewport updates may expose 0/NaN.
 */
function clampDpr(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 1
  return Math.min(Math.max(numeric, 1), MAX_DEVICE_PIXEL_RATIO)
}

export class Sizes {
  private _destroyed = false
  width: number = window.innerWidth
  height: number = window.innerHeight
  dpr: number = clampDpr(window.devicePixelRatio)

  // Resize callback — set by Experience to propagate to scene owners.
  private _resizeCb: (() => void) | null = null

  // Bound handler ref so removeEventListener works in destroy().
  private readonly _onResize = () => this.resize()

  constructor() {
    window.addEventListener('resize', this._onResize, { passive: true })
  }

  /** Register a callback to be called on resize. */
  onResize(cb: () => void): void {
    if (this._destroyed) return
    this._resizeCb = cb
  }

  resize() {
    if (this._destroyed) return
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.dpr = clampDpr(window.devicePixelRatio)
    // Notify Experience → scene-owner resize fan-out.
    this._resizeCb?.()
  }

  /** Remove the window resize listener. Call from Experience.destroy(). */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    window.removeEventListener('resize', this._onResize)
    this._resizeCb = null
  }
}
