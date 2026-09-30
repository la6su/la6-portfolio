// src/Experience/Renderer.ts
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Sizes } from './Sizes'
import { DeviceCapability } from '../core/DeviceCapability'
import { eventBus } from '../core/EventBus'
import { PostProcessingManager } from '../core/PostProcessingManager'
import { RenderPipeline } from '../core/RenderPipeline'
import {
  captureRuntimeResourceSnapshot,
  type RendererResourceInfo,
  type RuntimeResourceSnapshot,
} from '../core/RuntimeResourceSnapshot'
import { deviceLostAction, planUnifiedBackend, type FinalMode } from '../core/rendererBackend'
import {
  createUnifiedWebGPUInstance,
  initUnifiedWebGPUInstance,
  inspectUnifiedBackend,
} from '../core/unifiedRenderer'

export type RenderSurface = WebGPURenderer

/** WebGPURenderer's device-loss hook is runtime-supported but not declared
 * by the Three type surface used by this project. Keep that narrow extension
 * at the integration boundary instead of weakening the whole renderer. */
type DeviceLossCapableRenderer = WebGPURenderer & {
  onDeviceLost?: (info: unknown) => void
}

/**
 * Phase 7 adoption input: the SceneHost custom renderer factory already
 * created + init'd the instance and inspected the actual backend. The
 * Renderer wrapper adopts it (pipeline / capability / device-loss owner)
 * instead of constructing one. `mode` is the final backend mode after the
 * software-adapter policy decision.
 */
export interface AdoptedRenderer {
  instance: RenderSurface
  /** Persistent Vue-owned canvas — never removed by `dispose()`. */
  canvas: HTMLCanvasElement
  mode: FinalMode
  /** Sync the live instance after a device-loss recovery swap. */
  onInstanceReplaced?: (instance: RenderSurface) => void
}

export class Renderer {
  instance!: RenderSurface
  private capabilities = DeviceCapability.getInstance()
  private sizes: Sizes

  // Post-processing manager (section-aware crossfade)
  public postManager = new PostProcessingManager()

  // Junni-style multi-pass post-processing pipeline (typed, explicit fallback)
  pipeline: RenderPipeline | null = null

  // Phase 6 device-loss recovery state (bounded — see rendererBackend.ts).
  private _deviceLostAttempts = 0
  private _recovering = false
  private _recoveryFailed = false
  private _disposed = false
  private _lifecycleGeneration = 0
  // forceWebGL the current instance was created with (software-adapter
  // policy: a SwiftShader WebGPU adapter re-creates on the WebGL backend)
  // — device-loss recovery must match it.
  private _forceWebGL = false
  // The persistent SceneHost canvas is Vue-owned DOM. The replacement hook
  // keeps the Tres context in sync after device-loss recovery re-creates the
  // renderer on that same canvas.
  private _onInstanceReplaced: ((instance: RenderSurface) => void) | null = null
  // Failure-state DOM owner. Keep one overlay per renderer and remove it on
  // terminal teardown so repeated device-loss failures cannot accumulate UI.
  private _unsupportedOverlay: HTMLElement | null = null

  constructor(sizes: Sizes) {
    this.sizes = sizes
    if (this.capabilities.mode === 'unsupported') {
      if (!this._disposed) this.showUnsupportedMessage()
      throw new Error('Neither WebGPU nor WebGL2 is supported by this browser.')
    }
  }

  private showUnsupportedMessage(): void {
    if (this._disposed || this._unsupportedOverlay) return
    const overlay = document.createElement('div')
    overlay.className = 'renderer-unsupported'
    overlay.innerHTML = `
      <h1>Hardware Acceleration Required</h1>
      <p>This experience requires WebGL2. WebGPU is optional. Please use a current browser with hardware acceleration enabled.</p>
    `
    document.body.appendChild(overlay)
    this._unsupportedOverlay = overlay
  }

  async init(adopted: AdoptedRenderer): Promise<void> {
    this._disposed = false
    this._recoveryFailed = false
    this._lifecycleGeneration += 1
    // SceneHost owns construction, async initialization and actual backend
    // inspection. This wrapper adopts the one live renderer for capability,
    // sizing, post-processing and device-loss recovery.
    this.instance = adopted.instance
    this._onInstanceReplaced = adopted.onInstanceReplaced ?? null
    // Recovery must preserve the final backend selected by SceneHost.
    this._forceWebGL = adopted.mode === 'webgl'
    this.capabilities.setFinalRendererMode(adopted.mode)
    this.instance.setPixelRatio(Math.min(this.sizes.dpr, this.capabilities.maxDpr))
    this.instance.setSize(this.sizes.width, this.sizes.height)

    // Capability tier and post settings must reflect the backend selected
    // above, not merely the initial navigator.gpu feature detection.
    this.postManager.refreshQualityTier()

    // ── Diagnostic: log final render path + EnvSphere path ──
    // Helps debug "I don't see the shader background" — the console will show
    // which path is active: premium WebGPU (TSL shader) vs parity WebGL2
    // (CanvasTexture fallback).
    const finalBackend = `WebGPU (${this.instance.backend?.constructor?.name ?? '?'})`
    if (import.meta.env.DEV) {
      console.info(
        `[Renderer.init] Final path: ${finalBackend} | isRealWebGPU=${this.capabilities.isRealWebGPU} | ` +
          `EnvSphere=${this.capabilities.isRealWebGPU ? 'TSL shader (premium)' : 'CanvasTexture (parity)'}`,
      )
    }

    // Pipeline — the single WebGPURenderer instance (Phase 6 production
    // default; the classic WebGLRenderer path was removed in Phase 10).
    this.pipeline = RenderPipeline.create(this.instance, this.capabilities.postProcessing)

    // Transmission is disabled on ALL paths (see SplashCube.ts comment).
    // setTransmissionEnabled() is now a no-op, kept for API compat.
    //
    // Bounded WebGPU device-loss recovery: a lost device (driver/GPU reset,
    // system memory pressure) re-creates the renderer on the same canvas and
    // rebuilds the post pipeline, up to MAX_DEVICE_LOST_RECOVERIES attempts.
    this.attachDeviceLossRecovery(this.instance)
  }

  /**
   * Hook bounded device-loss recovery onto a WebGPURenderer. Three invokes
   * `onDeviceLost` when the underlying device is lost; we run the bounded
   * recovery and then defer to Three's own handler for its internal
   * bookkeeping. The render loop itself lives on the Tres host (ADR 0005):
   * a recovery only swaps the adopted instance, so nothing to re-attach —
   * and a terminal failure emits `jlz:webgl-failed`, which Experience
   * answers by closing the scheduler window.
   */
  private attachDeviceLossRecovery(renderer: WebGPURenderer): void {
    const wg = renderer as DeviceLossCapableRenderer
    if (typeof wg.onDeviceLost !== 'function') return
    const orig = wg.onDeviceLost.bind(wg)
    wg.onDeviceLost = (info: unknown) => {
      if (import.meta.env.DEV) {
        console.error('[Renderer] WebGPU device lost', info)
      }
      const action = deviceLostAction(this._deviceLostAttempts)
      if (action === 'exhausted') {
        // Budget spent: surface an explicit failure state and stop. Experience
        // listens to `jlz:webgl-failed` and closes the render window.
        this._recoveryFailed = true
        console.error('[Renderer] device-loss recovery budget exhausted — surfacing failure state')
        eventBus.emit('jlz:webgl-failed')
        this.showUnsupportedMessage()
        orig(info)
        return
      }
      void this.recoverFromDeviceLost(info as { api?: string }).finally(() => orig(info))
    }
  }

  /**
   * Wait for the browser to restore a lost WebGL2 context on this canvas
   * (bounded — 5 s), optionally requesting the restore ourselves.
   */
  private async waitForWebGLContextRestore(
    canvas: HTMLCanvasElement,
    restoreContext?: { restoreContext: () => void },
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (restored: boolean) => {
        if (settled) return
        settled = true
        if (restoreContext) canvas.removeEventListener('webglcontextlost', onLost)
        canvas.removeEventListener('webglcontextrestored', onRestored)
        clearTimeout(timeout)
        resolve(restored)
      }
      const onLost = (event: Event) => {
        // WebGLBackend.dispose() deliberately loses the context after it has
        // removed its own listener. Keep the temporary lifecycle listener in
        // place so the browser permits restoration of the same canvas.
        event.preventDefault()
        restoreContext?.restoreContext()
      }
      const onRestored = () => finish(true)
      const timeout = window.setTimeout(() => finish(false), 5000)
      if (restoreContext) canvas.addEventListener('webglcontextlost', onLost, { once: true })
      canvas.addEventListener('webglcontextrestored', onRestored, { once: true })
    })
  }

  private isWebGLContextUsable(canvas: HTMLCanvasElement): boolean {
    try {
      const gl = canvas.getContext('webgl2')
      return gl !== null && !gl.isContextLost() && gl.getParameter(gl.VIEWPORT) !== null
    } catch {
      return false
    }
  }

  /**
   * Re-create the renderer on the same canvas after a device loss and rebuild
   * the post pipeline. Bounded by MAX_DEVICE_LOST_RECOVERIES (see
   * deviceLostAction); the Tres-owned loop needs no re-attachment (ADR 0005).
   */
  private async recoverFromDeviceLost(info?: { api?: string }): Promise<void> {
    if (this._disposed || this._recovering) return
    this._recovering = true
    const generation = this._lifecycleGeneration
    let replacement: WebGPURenderer | null = null
    try {
      this._deviceLostAttempts += 1
      const canvas = this.instance.domElement
      // WebGLBackend emits device loss from `webglcontextlost`. The browser
      // must restore that context before a same-canvas renderer can be
      // initialized again; otherwise the replacement may fail immediately
      // against the still-lost context. WebGPU loss has no DOM restore event.
      if (info?.api === 'WebGL') {
        const restored = await this.waitForWebGLContextRestore(canvas)
        // Chromium may dispatch `webglcontextrestored` before the restored
        // default framebuffer parameters are queryable again.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        if (!restored || !this.isWebGLContextUsable(canvas)) {
          throw new Error('WebGL context could not be restored by the browser')
        }
      }
      if (this._disposed || generation !== this._lifecycleGeneration) return
      this.pipeline?.dispose()
      this.pipeline = null
      // Three's WebGLBackend.dispose() intentionally calls
      // WEBGL_lose_context. Preserve that explicit lifecycle boundary, but
      // restore the same canvas context before initializing its replacement;
      // otherwise the old owner's cleanup leaves the new owner on a lost
      // context and recovery fails deterministically in Chromium.
      const restoreContext =
        info?.api === 'WebGL'
          ? canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')
          : null
      const restoredAfterDispose = restoreContext
        ? this.waitForWebGLContextRestore(canvas, restoreContext)
        : null
      this.instance.dispose()
      if (restoreContext && restoredAfterDispose) {
        restoreContext.restoreContext()
        const restored = await restoredAfterDispose
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        if (!restored || !this.isWebGLContextUsable(canvas)) {
          throw new Error('WebGL context could not be restored after backend disposal')
        }
      }
      if (this._disposed || generation !== this._lifecycleGeneration) return

      replacement = await createUnifiedWebGPUInstanceAndInit(canvas, this._forceWebGL)
      if (this._disposed || generation !== this._lifecycleGeneration) {
        replacement.dispose()
        replacement = null
        return
      }
      let plan = planUnifiedBackend(inspectUnifiedBackend(replacement))
      if (plan.recreate) {
        // The replacement landed on a software adapter again — force WebGL2.
        this._forceWebGL = true
        replacement.dispose()
        replacement = null
        // Re-create on the same persistent SceneHost canvas.
        replacement = await createUnifiedWebGPUInstanceAndInit(canvas, true)
        if (this._disposed || generation !== this._lifecycleGeneration) {
          replacement.dispose()
          replacement = null
          return
        }
        plan = planUnifiedBackend(inspectUnifiedBackend(replacement))
      }
      if (this._disposed || generation !== this._lifecycleGeneration) {
        replacement.dispose()
        replacement = null
        return
      }
      this.instance = replacement
      this.capabilities.setFinalRendererMode(plan.mode)

      this.instance.setPixelRatio(Math.min(this.sizes.dpr, this.capabilities.maxDpr))
      this.instance.setSize(this.sizes.width, this.sizes.height)
      this.postManager.refreshQualityTier()
      this.pipeline = RenderPipeline.create(this.instance, this.capabilities.postProcessing)
      this.attachDeviceLossRecovery(this.instance)
      // Phase 7: sync the persistent Tres context to the replacement so the
      // SceneHost bridge keeps describing the live renderer. The Tres-owned
      // loop (ADR 0005) needs no re-attachment — the pipeline delegate reads
      // the adopted instance through this swap.
      this._onInstanceReplaced?.(this.instance)
      // The old PMREM environment died with the lost device — ask Experience
      // to regenerate it (and re-bind it to the glass cube).
      eventBus.emit('jlz:renderer-recovered')
      if (import.meta.env.DEV) {
        console.info('[Renderer] device-loss recovery complete — renderer re-created')
      }
      // Keep the local owner alive until every post-swap setup and bridge
      // callback has completed. If one of those steps throws, the catch block
      // must still be able to dispose the replacement it just installed.
      replacement = null
    } catch (e) {
      replacement?.dispose()
      if (this._disposed || generation !== this._lifecycleGeneration) return
      this._recoveryFailed = true
      eventBus.emit('jlz:webgl-failed')
      this.showUnsupportedMessage()
      console.error('[Renderer] device-loss recovery failed:', e)
    } finally {
      this._recovering = false
    }
  }

  /** Render scene → post → screen. */
  update(scene: THREE.Scene, camera: THREE.Camera, dt: number): void {
    // During a device-loss recovery the pipeline is torn down and rebuilt;
    // skip the frame so we never render through a disposed renderer.
    if (this._recovering || this._recoveryFailed || this._disposed) return
    // ── Fog ──
    // Fog is managed by SceneCoordinator (per-section fog color + density
    // from WorldConfig). SceneCoordinator creates scene.fog on init and
    // updates it on section change. Do NOT touch scene.fog here — that
    // would overwrite the per-section fog with a stale envColor value.

    // Native WebGPU owns the TSL post graph. WebGLBackend is a direct-render
    // parity path, so skip the otherwise-unused crossfade and uniform writes.
    if (this.capabilities.isRealWebGPU) {
      this.postManager.update(dt)
      // Quality-tier intensity scaling is applied by PostProcessingManager
      // (applyPreset — the single scaling owner). This side hands the
      // crossfaded display values straight to the pipeline; updateParams
      // remains the single change-detection owner (it diffs against its own
      // snapshot and force-pushes on a recreated pipeline's first render).
      if (this.pipeline) {
        this.pipeline.updateParams(this.postManager.postParams)
      }
    }

    // Render scene → post → screen
    if (this.pipeline) {
      this.pipeline.render(scene, camera)
    } else {
      this.instance.render(scene, camera)
    }
  }

  /** Resize: propagate viewport changes to canvas, renderer, pipeline, and world. */
  public resize(): void {
    if (this._recoveryFailed || this._disposed) return
    const w = this.sizes.width
    const h = this.sizes.height
    this.instance.setPixelRatio(Math.min(this.sizes.dpr, this.capabilities.maxDpr))
    this.instance.setSize(w, h)
  }

  public getResourceSnapshot(scene: THREE.Scene): RuntimeResourceSnapshot {
    const post = this.pipeline?.getResourceInfo()
    return captureRuntimeResourceSnapshot(scene, this.instance as unknown as RendererResourceInfo, {
      renderTargets: post?.renderTargets ?? 0,
      passes: post?.passes ?? 0,
      webgpuPipeline: post?.webgpuPipeline ?? false,
    })
  }

  /** Dispose renderer-owned GPU resources. */
  public dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._lifecycleGeneration += 1
    this._onInstanceReplaced = null
    this.pipeline?.dispose()
    this.instance.dispose()
    this._unsupportedOverlay?.remove()
    this._unsupportedOverlay = null
    // SceneHost owns the persistent canvas and removes it on Vue root teardown.
  }
}

/** Create + async-init the unified WebGPURenderer (single init owner). */
async function createUnifiedWebGPUInstanceAndInit(
  canvas: HTMLCanvasElement,
  forceWebGL: boolean,
): Promise<WebGPURenderer> {
  const renderer = createUnifiedWebGPUInstance(canvas, forceWebGL)
  await initUnifiedWebGPUInstance(renderer)
  return renderer
}
