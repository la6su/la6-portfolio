// src/Experience/Renderer.ts
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { DeviceCapability } from "../core/DeviceCapability";
import { eventBus } from "../core/EventBus";
import { PostProcessingManager } from "../core/PostProcessingManager";
import { RenderPipeline } from "../core/RenderPipeline";
import {
  captureRuntimeResourceSnapshot,
  type RendererResourceInfo,
  type RuntimeResourceSnapshot,
} from "../core/RuntimeResourceSnapshot";
import {
  deviceLostAction,
  MAX_DEVICE_LOST_RECOVERIES,
  modeForBackend,
  type FinalMode,
} from "../core/rendererBackend";
import { waitForWebGLContextRestore } from "../core/webglContextRestore";
import { devDiagnostic } from "../core/devDiagnostic";
import {
  createUnifiedWebGPUInstance,
  disposeUnifiedRendererNow,
  initUnifiedWebGPUInstance,
  inspectUnifiedBackend,
} from "../core/unifiedRenderer";

export type RenderSurface = WebGPURenderer;

export interface Viewport {
  width: number
  height: number
  dpr: number
}

/** WebGPURenderer's device-loss hook is runtime-supported but not declared
 * by the Three type surface used by this project. Keep that narrow extension
 * at the integration boundary instead of weakening the whole renderer. */
type DeviceLossCapableRenderer = WebGPURenderer & {
  onDeviceLost?: (info: unknown) => void;
};

/**
 * The SceneHost renderer factory creates, initializes, and inspects the
 * actual backend. This owner adopts the instance for pipeline management,
 * capability, and recovery instead of constructing another renderer. `mode`
 * names the backend Three initialized.
 */
export interface AdoptedRenderer {
  instance: RenderSurface;
  mode: FinalMode;
  /** Sync the live instance after a device-loss recovery swap. */
  onInstanceReplaced?: (instance: RenderSurface, mode: FinalMode) => void;
}

export class Renderer {
  instance!: RenderSurface;
  private capabilities = DeviceCapability.getInstance();

  // Post-processing manager (section-aware crossfade)
  public postManager = new PostProcessingManager();

  // Shared Three TSL graph, skipped only by the low-tier quality policy.
  private pipeline: RenderPipeline | null = null;

  // Device-loss recovery is bounded by the backend policy.
  private _deviceLostAttempts = 0;
  private _recoveryFailed = false;
  private _disposed = false;
  private _lifecycleGeneration = 0;
  private _recoveryAbortController: AbortController | null = null;
  private _recoveryPromise: Promise<void> | null = null;
  private _disposePromise: Promise<void> | null = null;
  // Preserve the active backend during device-loss recovery. Initial backend
  // selection is left to Three; a recovered WebGL context is explicitly kept
  // on WebGL, and the dev-only forced-WebGL path stays forced for its smoke.
  private _forceWebGL = false;
  // The persistent SceneHost canvas is Vue-owned DOM. The replacement hook
  // keeps the Tres context in sync after device-loss recovery re-creates the
  // renderer on that same canvas.
  private _onInstanceReplaced: ((instance: RenderSurface, mode: FinalMode) => void) | null = null;
  // Failure-state DOM owner. Keep one overlay per renderer and remove it on
  // terminal teardown so repeated device-loss failures cannot accumulate UI.
  private _unsupportedOverlay: HTMLElement | null = null;

  constructor(private readonly viewport: () => Viewport) {}

  private showRendererFailure(): void {
    if (this._disposed || this._unsupportedOverlay) return;
    const overlay = document.createElement("div");
    overlay.className = "renderer-unsupported";
    overlay.innerHTML = `
      <h1>3D Rendering Unavailable</h1>
      <p>The graphics device could not be restored. Reload the page to try again.</p>
    `;
    document.body.appendChild(overlay);
    this._unsupportedOverlay = overlay;
  }

  async init(adopted: AdoptedRenderer): Promise<void> {
    this._disposed = false;
    this._disposePromise = null;
    this._recoveryPromise = null;
    this._recoveryFailed = false;
    this._lifecycleGeneration += 1;
    // SceneHost owns construction, async initialization and actual backend
    // inspection. This wrapper adopts the one live renderer for capability,
    // sizing, post-processing and device-loss recovery.
    this.instance = adopted.instance;
    this._onInstanceReplaced = adopted.onInstanceReplaced ?? null;
    // Recovery must preserve the final backend selected by SceneHost.
    this._forceWebGL = adopted.mode === "webgl";
    const backend = inspectUnifiedBackend(this.instance);
    this.capabilities.setFinalRendererMode(adopted.mode, backend.isFallbackAdapter);
    // Capability tier and post settings must reflect the backend selected
    // above, not merely the initial navigator.gpu feature detection. Tres
    // already applied the live size and DPR before publishing SceneHost.ready.
    this.postManager.refreshPreset();

    // ── Diagnostic: report the selected backend and TSL post policy ──
    const finalBackend = `WebGPU (${this.instance.backend?.constructor?.name ?? "?"})`;
    devDiagnostic(
      'info',
      `[Renderer.init] Final backend: ${finalBackend} | TSL post=${this.capabilities.postProcessing}`,
    );

    // Build the post pipeline around the adopted WebGPURenderer.
    this.pipeline = new RenderPipeline(this.instance, this.capabilities.postProcessing);

    // Bounded WebGPU device-loss recovery: a lost device (driver/GPU reset,
    // system memory pressure) re-creates the renderer on the same canvas and
    // rebuilds the post pipeline, up to MAX_DEVICE_LOST_RECOVERIES attempts.
    this.attachDeviceLossRecovery(this.instance);
  }

  /**
   * Hook bounded device-loss recovery onto a WebGPURenderer. Three invokes
   * `onDeviceLost` when the underlying device is lost; we run the bounded
   * recovery and then defer to Three's own handler for its internal
   * bookkeeping. The render loop remains owned by Tres; recovery only swaps
   * the adopted instance. Terminal failure emits `jlz:webgl-failed`, which
   * Experience handles by closing the scheduler window.
   */
  private attachDeviceLossRecovery(renderer: WebGPURenderer): void {
    const wg = renderer as DeviceLossCapableRenderer;
    if (typeof wg.onDeviceLost !== "function") return;
    const orig = wg.onDeviceLost.bind(wg);
    wg.onDeviceLost = (info: unknown) => {
      if (this._disposed) {
        orig(info);
        return;
      }
      if (import.meta.env.DEV) {
        console.error("[Renderer] WebGPU device lost", info);
      }
      const action = deviceLostAction(
        this._deviceLostAttempts,
        MAX_DEVICE_LOST_RECOVERIES,
        this._recoveryAbortController !== null,
      );
      if (action === "ignore") {
        orig(info);
        return;
      }
      if (action === "exhausted") {
        // Budget spent: surface an explicit failure state and stop. Experience
        // listens to `jlz:webgl-failed` and closes the render window.
        this._recoveryFailed = true;
        console.error(
          "[Renderer] device-loss recovery budget exhausted — surfacing failure state",
        );
        eventBus.emit("jlz:webgl-failed");
        this.showRendererFailure();
        orig(info);
        return;
      }
      const recovery = this.recoverFromDeviceLost(info as { api?: string });
      this._recoveryPromise = recovery;
      void recovery.finally(() => {
        if (this._recoveryPromise === recovery) this._recoveryPromise = null;
        orig(info);
      }).catch((error: unknown) => {
        console.error("[Renderer] device-loss callback failed:", error);
      });
    };
  }

  private isWebGLContextUsable(canvas: HTMLCanvasElement): boolean {
    try {
      const gl = canvas.getContext("webgl2");
      return (
        gl !== null &&
        !gl.isContextLost() &&
        gl.getParameter(gl.VIEWPORT) !== null
      );
    } catch {
      return false;
    }
  }

  /**
   * Re-create the renderer on the same canvas after a device loss and rebuild
   * the post pipeline. Bounded by MAX_DEVICE_LOST_RECOVERIES (see
   * deviceLostAction); the Tres-owned loop needs no re-attachment.
   */
  private async recoverFromDeviceLost(info?: { api?: string }): Promise<void> {
    if (this._disposed || this._recoveryAbortController) return;
    const generation = this._lifecycleGeneration;
    const abortController = new AbortController();
    this._recoveryAbortController = abortController;
    let replacement: WebGPURenderer | null = null;
    const discardReplacement = async (): Promise<void> => {
      const candidate = replacement;
      replacement = null;
      if (candidate) await disposeUnifiedRendererNow(candidate);
    };
    try {
      this._deviceLostAttempts += 1;
      const canvas = this.instance.domElement;
      // WebGLBackend emits device loss from `webglcontextlost`. The browser
      // must restore that context before a same-canvas renderer can be
      // initialized again; otherwise the replacement may fail immediately
      // against the still-lost context. WebGPU loss has no DOM restore event.
      if (info?.api === "WebGL") {
        const restored = await waitForWebGLContextRestore(
          canvas,
          undefined,
          abortController.signal,
        );
        // Chromium may dispatch `webglcontextrestored` before the restored
        // default framebuffer parameters are queryable again.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        if (!restored || !this.isWebGLContextUsable(canvas)) {
          throw new Error("WebGL context could not be restored by the browser");
        }
      }
      if (this._disposed || generation !== this._lifecycleGeneration) return;
      this.pipeline?.dispose();
      this.pipeline = null;
      // Three's WebGLBackend.dispose() intentionally calls
      // WEBGL_lose_context. Preserve that explicit lifecycle boundary, but
      // restore the same canvas context before initializing its replacement;
      // otherwise the old owner's cleanup leaves the new owner on a lost
      // context and recovery fails deterministically in Chromium.
      const restoreContext =
        info?.api === "WebGL"
          ? canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")
          : null;
      const restoredAfterDispose = restoreContext
        ? waitForWebGLContextRestore(
            canvas,
            restoreContext,
            abortController.signal,
          )
        : null;
      await disposeUnifiedRendererNow(this.instance);
      if (restoreContext && restoredAfterDispose) {
        restoreContext.restoreContext();
        const restored = await restoredAfterDispose;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        if (!restored || !this.isWebGLContextUsable(canvas)) {
          throw new Error(
            "WebGL context could not be restored after backend disposal",
          );
        }
      }
      if (this._disposed || generation !== this._lifecycleGeneration) return;

      replacement = await createUnifiedWebGPUInstanceAndInit(
        canvas,
        this._forceWebGL,
        abortController.signal,
      );
      if (!replacement) return;
      if (this._disposed || generation !== this._lifecycleGeneration) {
        await discardReplacement();
        return;
      }
      const backend = inspectUnifiedBackend(replacement);
      const mode = modeForBackend(backend.backendName);
      if (!mode) {
        throw new Error(
          `Recovered Three renderer has an unknown backend: ${backend.backendName ?? 'unknown'}`,
        );
      }
      if (this._disposed || generation !== this._lifecycleGeneration) {
        await discardReplacement();
        return;
      }
      this.instance = replacement;
      this.capabilities.setFinalRendererMode(mode, backend.isFallbackAdapter);

      const viewport = this.viewport()
      this.instance.setPixelRatio(Math.min(viewport.dpr, this.capabilities.maxDpr))
      this.instance.setSize(viewport.width, viewport.height)
      this.postManager.refreshPreset();
      this.pipeline = new RenderPipeline(this.instance, this.capabilities.postProcessing);
      this.attachDeviceLossRecovery(this.instance);
      // Keep Tres context aligned with the live replacement. The loop needs
      // no re-attachment because the pipeline reads the adopted instance.
      this._onInstanceReplaced?.(this.instance, mode);
      // The old PMREM environment died with the lost device — ask Experience
      // to regenerate it (and re-bind it to the glass cube).
      eventBus.emit("jlz:renderer-recovered");
      devDiagnostic("info", "[Renderer] device-loss recovery complete — renderer re-created");
      // Keep the local owner alive until every post-swap setup and bridge
      // callback has completed. If one of those steps throws, the catch block
      // must still be able to dispose the replacement it just installed.
      replacement = null;
    } catch (e) {
      let failure = e;
      try {
        await discardReplacement();
      } catch (disposalError) {
        failure = new AggregateError([e, disposalError], "Renderer recovery and replacement cleanup both failed.", { cause: disposalError });
      }
      if (this._disposed || generation !== this._lifecycleGeneration) return;
      this._recoveryFailed = true;
      eventBus.emit("jlz:webgl-failed");
      this.showRendererFailure();
      console.error("[Renderer] device-loss recovery failed:", failure);
    } finally {
      if (this._recoveryAbortController === abortController) {
        this._recoveryAbortController = null;
      }
    }
  }

  /** Render scene → post → screen. */
  update(scene: THREE.Scene, camera: THREE.Camera, dt: number): void {
    // During a device-loss recovery the pipeline is torn down and rebuilt;
    // skip the frame so we never render through a disposed renderer.
    if (this._recoveryAbortController || this._recoveryFailed || this._disposed) return;
    // ── Fog ──
    // Fog is managed by SceneCoordinator (per-section fog color + density
    // from WorldConfig). SceneCoordinator creates scene.fog on init and
    // updates it on section change. Do NOT touch scene.fog here — that
    // would overwrite the per-section fog with a stale envColor value.

    // Recovery closes the frame window while its replacement pipeline is built.
    const pipeline = this.pipeline
    if (!pipeline) return

    if (this.capabilities.postProcessing) {
      this.postManager.update(dt);
      // Quality-tier intensity scaling is applied by PostProcessingManager
      // (applyPreset — the single scaling owner). This side hands the
      // crossfaded display values straight to the pipeline; updateParams
      // remains the single change-detection owner (it diffs against its own
      // snapshot and force-pushes on a recreated pipeline's first render).
      pipeline.updateParams(this.postManager.postParams);
    }

    // Render scene → post → screen
    pipeline.render(scene, camera);
  }

  public getResourceSnapshot(scene: THREE.Scene): RuntimeResourceSnapshot {
    return captureRuntimeResourceSnapshot(
      scene,
      this.instance as unknown as RendererResourceInfo,
      {
        tslPostPipeline: this.pipeline?.hasTSLPostPipeline ?? false,
      },
    );
  }

  /** Dispose renderer-owned GPU resources. */
  public dispose(): Promise<void> {
    if (this._disposePromise) return this._disposePromise;
    if (this._disposed) return Promise.resolve();
    this._disposed = true;
    this._lifecycleGeneration += 1;
    this._recoveryAbortController?.abort();
    const recovery = this._recoveryPromise;
    this._onInstanceReplaced = null;
    this._disposePromise = Promise.resolve().then(async () => {
      await recovery?.catch((error: unknown) => {
        console.error("[Renderer] recovery cleanup failed during teardown:", error);
      });
      try {
        this.pipeline?.dispose();
      } finally {
        try {
          await this.instance.dispose();
        } finally {
          this._unsupportedOverlay?.remove();
          this._unsupportedOverlay = null;
        }
      }
    });
    return this._disposePromise;
  }
}

/** Create + async-init the unified WebGPURenderer (single init owner). */
async function createUnifiedWebGPUInstanceAndInit(
  canvas: HTMLCanvasElement,
  forceWebGL: boolean,
  signal: AbortSignal,
): Promise<WebGPURenderer | null> {
  const renderer = createUnifiedWebGPUInstance(canvas, forceWebGL);
  const initialized = await initUnifiedWebGPUInstance(renderer, signal);
  return initialized ? renderer : null;
}
