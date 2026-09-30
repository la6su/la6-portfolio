// src/core/rendererBackend.ts — Phase 6 unified-renderer decisions.
//
// Production constructs ONE renderer class (`WebGPURenderer` from
// `three/webgpu`). What actually renders differs per device: real
// `WebGPUBackend`, Three's automatic `WebGLBackend` fallback (renders the
// scene directly, no TSL post — the Phase 2 accepted contract), or a forced
// `forceWebGL` re-creation after a software adapter is detected. These pure
// helpers make the backend-policy decisions explicit and unit-testable;
// `Renderer.init()` is the only caller that touches the live renderer.
//
// The dev-forced `?renderer=webgl` parity QA path was NOT part of this
// policy: it constructed the classic `WebGLRenderer` directly (the retained
// forced-WebGLBackend GLSL post owner). It was removed in Phase 10.

export type FinalMode = 'webgpu' | 'webgl'

export interface BackendFacts {
  /** `backend.constructor.name` on the initialized renderer. */
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
 *   (scene renders directly, no TSL post — the Phase 2 accepted contract).
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

type DeviceLostAction = 'recover' | 'exhausted'

/**
 * Decide whether a device-loss event may still trigger recovery.
 * `attemptsSoFar` is the number of recoveries already performed.
 */
export function deviceLostAction(
  attemptsSoFar: number,
  max: number = MAX_DEVICE_LOST_RECOVERIES,
): DeviceLostAction {
  return attemptsSoFar < max ? 'recover' : 'exhausted'
}
