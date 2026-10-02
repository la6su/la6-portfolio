// Backend policy for the single `WebGPURenderer` class. The active backend may
// be WebGPU or Three's WebGL fallback; these pure helpers keep device policy
// explicit and unit-testable.

export type FinalMode = 'webgpu' | 'webgl'

export interface BackendFacts {
  /** Backend class identified through Three's explicit backend marker. */
  backendName: string | null
  /**
   * Tri-state classification for the WebGPU adapter:
   * - `true` : software fallback adapter (SwiftShader) detected
   * - `false`: hardware WebGPU adapter confirmed
   * - `null` : adapter classification unavailable/unknown — never coerce to false
   */
  isFallbackAdapter: boolean | null
}

type UnifiedPlan = { recreate: false; mode: FinalMode } | { recreate: true; mode: FinalMode }

/**
 * Decide what to do after `WebGPURenderer.init()` on the unified path.
 *
 * - `WebGPUBackend` + `true` (fallback adapter) → recreate with `forceWebGL: true`
 *   for hardware WebGL2 (same class, different backend — no classic renderer).
 * - `WebGPUBackend` + `false` (hardware adapter) → keep the instance, mode
 *   `webgpu` (premium TSL post path active).
 * - `WebGPUBackend` + `null` (unknown adapter) → keep as `webgpu`, no re-create
 *   (actual backend is WebGPUBackend; returning webgl desyncs DeviceCapability).
 * - `WebGLBackend` or unknown backend name → keep as `webgl`, no re-create
 *   (scene renders directly, no TSL post).
 */
export function planUnifiedBackend(facts: BackendFacts): UnifiedPlan {
  if (facts.backendName === 'WebGPUBackend') {
    if (facts.isFallbackAdapter === true) return { recreate: true, mode: 'webgl' }
    // false confirms hardware; null keeps the actual backend without guessing.
    return { recreate: false, mode: 'webgpu' }
  }
  return { recreate: false, mode: 'webgl' }
}

// Bounded device-loss recovery budget. A WebGPU device can be lost
// (driver reset, GPU reset, system memory pressure). Recovery re-creates
// the renderer on the same canvas and rebuilds the post pipeline; it is
// bounded so a flapping device cannot loop forever.
export const MAX_DEVICE_LOST_RECOVERIES = 1

type DeviceLostAction = 'recover' | 'exhausted' | 'ignore'

/**
 * Decide whether a device-loss event may still trigger recovery.
 * `attemptsSoFar` is the number of recoveries already performed.
 */
export function deviceLostAction(
  attemptsSoFar: number,
  max: number = MAX_DEVICE_LOST_RECOVERIES,
  recoveryInProgress = false,
): DeviceLostAction {
  if (recoveryInProgress) return 'ignore'
  return attemptsSoFar < max ? 'recover' : 'exhausted'
}
