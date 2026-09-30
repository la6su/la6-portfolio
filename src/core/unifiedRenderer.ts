// src/core/unifiedRenderer.ts — Phase 6/7 unified renderer construction.
//
// One owner of "how a renderer instance is built": the unified
// `WebGPURenderer` (the only class the app constructs — the dev-forced
// classic `WebGLRenderer` QA owner was removed in Phase 10). Phase 7 moved
// the construction call site into the persistent SceneHost's custom
// renderer factory (the single factory owner); `Renderer` (the
// pipeline/lifecycle wrapper) adopts the created instance instead of
// building it.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'

/** The concrete renderer class this project constructs (Phase 6 fixed). */
export type UnifiedRenderSurface = WebGPURenderer

/**
 * Make renderer teardown safe across the Tres manager and application owner.
 * Tres keeps its own disposal callback, while Renderer/SceneHost also dispose
 * the live owner during recovery and unmount. The underlying Three renderer
 * is not guaranteed to tolerate those independent calls.
 */
export function makeRendererDisposeIdempotent<T extends { dispose: () => void }>(renderer: T): T {
  const dispose = renderer.dispose.bind(renderer)
  let disposed = false
  renderer.dispose = () => {
    if (disposed) return
    disposed = true
    dispose()
  }
  return renderer
}

/** Shared tone/color settings — identical for every construction path. */
function applySharedSettings(renderer: {
  toneMapping?: number
  toneMappingExposure?: number
  outputColorSpace?: string
}): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.outputColorSpace = THREE.SRGBColorSpace
}

/**
 * Create + async-init the unified `WebGPURenderer` on an existing canvas.
 * The caller (Tres in production, `Renderer` on the rollback path) awaits
 * `initUnifiedWebGPUInstance` exactly once — construction stays synchronous
 * because the custom renderer factory must return the instance immediately.
 */
export function createUnifiedWebGPUInstance(
  canvas: HTMLCanvasElement,
  forceWebGL: boolean,
): WebGPURenderer {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL })
  applySharedSettings(renderer)
  return makeRendererDisposeIdempotent(renderer)
}

/** The single async init call — awaited exactly once per instance. */
export async function initUnifiedWebGPUInstance(renderer: WebGPURenderer): Promise<void> {
  await (renderer as unknown as { init?: () => Promise<unknown> }).init?.()
}

/** Inspect the actual backend + software-adapter facts after init. */
export function inspectUnifiedBackend(renderer: unknown): {
  backendName: string | null
  isFallbackAdapter: boolean | null
} {
  const wg = renderer as {
    isWebGPURenderer?: boolean
    backend?: {
      constructor?: { name?: string }
      isWebGPUBackend?: boolean
      isWebGLBackend?: boolean
      device?: { adapterInfo?: { isFallbackAdapter?: boolean } }
    }
  } | null
  const backend = wg?.backend
  // Constructor names are minified in production (e.g. `jf`), while Three's
  // backend marker is an explicit public contract. Keep the constructor-name
  // fallback for older test doubles and development diagnostics.
  const backendName: string | null = wg?.isWebGPURenderer
    ? backend?.isWebGPUBackend === true
      ? 'WebGPUBackend'
      : backend?.isWebGLBackend === true
        ? 'WebGLBackend'
        : (backend?.constructor?.name ?? null)
    : null
  return {
    backendName,
    isFallbackAdapter: wg?.backend?.device?.adapterInfo?.isFallbackAdapter ?? null,
  }
}
