// One construction path for WebGPURenderer instances adopted by SceneHost and
// the renderer recovery owner.

import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { traceDevLifecycle } from "./devLifecycleTrace";

/** The renderer class constructed and adopted by SceneHost. */
export type UnifiedRenderSurface = WebGPURenderer;

interface RendererDisposalControl {
  defer(): () => void;
  disposeNow(): void;
}

const rendererDisposalControls = new WeakMap<object, RendererDisposalControl>();

/** Make renderer cleanup idempotent and allow SceneHost to defer Tres's
 *  renderer-manager callback until its internal Vue scene tree has unmounted. */
export function makeRendererDisposeIdempotent<
  T extends { dispose: () => void },
>(renderer: T): T {
  const dispose = renderer.dispose.bind(renderer);
  let disposed = false;
  let deferred = false;
  const disposeNow = (): void => {
    if (disposed) return;
    disposed = true;
    dispose();
    if (import.meta.env.DEV) traceDevLifecycle("renderer:backend-disposed");
  };
  const control: RendererDisposalControl = {
    defer() {
      deferred = true;
      return () => {
        deferred = false;
        disposeNow();
      };
    },
    disposeNow,
  };
  rendererDisposalControls.set(renderer, control);
  renderer.dispose = () => {
    if (deferred) return;
    disposeNow();
  };
  return renderer;
}

/** Delay Tres's renderer-manager dispose call until the owning host releases
 *  the declarative Tres tree, then dispose immediately at the owner boundary. */
export function deferRendererDisposal(renderer: object): () => void {
  const control = rendererDisposalControls.get(renderer);
  if (!control)
    throw new Error(
      "Renderer disposal must be made idempotent before it can be deferred.",
    );
  return control.defer();
}

/** Bypass a pending Tres deferral for explicit recovery and failure cleanup. */
export function disposeUnifiedRendererNow(renderer: {
  dispose: () => void;
}): void {
  const control = rendererDisposalControls.get(renderer);
  if (control) control.disposeNow();
  else renderer.dispose();
}

/** Shared tone/color settings — identical for every construction path. */
function applySharedSettings(renderer: {
  toneMapping?: number;
  toneMappingExposure?: number;
  outputColorSpace?: string;
}): void {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: false,
    forceWebGL,
  });
  applySharedSettings(renderer);
  return makeRendererDisposeIdempotent(renderer);
}

/** The single async init call — awaited exactly once per instance. */
export async function initUnifiedWebGPUInstance(
  renderer: WebGPURenderer,
  signal?: AbortSignal,
): Promise<boolean> {
  // Ownership transfers only after init succeeds while the caller is still
  // live. A pre-aborted or late-aborted renderer is released here.
  if (signal?.aborted) {
    disposeUnifiedRendererNow(renderer);
    return false;
  }
  try {
    await renderer.init();
  } catch (initializationError) {
    // Recovery creates the renderer inside this async boundary, so the caller
    // cannot own it until this function resolves. Release it here on failure;
    // SceneHost's initial Tres path has a separate created-renderer owner.
    try {
      disposeUnifiedRendererNow(renderer);
    } catch (disposalError) {
      throw new AggregateError(
        [initializationError, disposalError],
        "WebGPU renderer initialization and cleanup both failed.",
        { cause: disposalError },
      );
    }
    throw new Error("WebGPU renderer initialization failed.", {
      cause: initializationError,
    });
  }
  if (signal?.aborted) {
    disposeUnifiedRendererNow(renderer);
    return false;
  }
  return true;
}

/** Inspect the actual backend + software-adapter facts after init. */
export function inspectUnifiedBackend(renderer: unknown): {
  backendName: string | null;
  isFallbackAdapter: boolean | null;
} {
  const wg = renderer as {
    isWebGPURenderer?: boolean;
    backend?: {
      constructor?: { name?: string };
      isWebGPUBackend?: boolean;
      isWebGLBackend?: boolean;
      device?: { adapterInfo?: { isFallbackAdapter?: boolean } };
    };
  } | null;
  const backend = wg?.backend;
  // Constructor names are minified in production (e.g. `jf`), while Three's
  // backend marker is an explicit public contract. Keep the constructor-name
  // fallback for older test doubles and development diagnostics.
  const backendName: string | null = wg?.isWebGPURenderer
    ? backend?.isWebGPUBackend === true
      ? "WebGPUBackend"
      : backend?.isWebGLBackend === true
        ? "WebGLBackend"
        : (backend?.constructor?.name ?? null)
    : null;
  return {
    backendName,
    isFallbackAdapter:
      wg?.backend?.device?.adapterInfo?.isFallbackAdapter ?? null,
  };
}
