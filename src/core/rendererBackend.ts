// Facts and recovery policy for the single `WebGPURenderer` class.

export type FinalMode = 'webgpu' | 'webgl'

export interface BackendFacts {
  /** Backend class identified through Three's explicit backend marker. */
  backendName: string | null
  /**
   * Diagnostic classification for the WebGPU adapter:
   * - `true` : software fallback adapter (SwiftShader) detected
   * - `false`: hardware WebGPU adapter confirmed
   * - `null` : adapter classification unavailable/unknown
   * Does not affect backend selection.
   */
  isFallbackAdapter: boolean | null
}

/** Map the backend Three actually initialized; don't select or recreate one. */
export function modeForBackend(backendName: string | null): FinalMode {
  return backendName === 'WebGPUBackend' ? 'webgpu' : 'webgl'
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
