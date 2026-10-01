import { describe, expect, it, vi } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  onBeforeUnmount,
  onUnmounted,
} from "vue";
import type { WebGPURenderer } from "three/webgpu";
import {
  deferRendererDisposal,
  disposeUnifiedRendererNow,
  initUnifiedWebGPUInstance,
  makeRendererDisposeIdempotent,
} from "./unifiedRenderer";

function rendererDouble(init: () => Promise<unknown>) {
  return {
    init: vi.fn(init),
    dispose: vi.fn(),
  } as unknown as WebGPURenderer;
}

describe("unified renderer initialization ownership", () => {
  it("makes Tres and the application share one idempotent dispose boundary", () => {
    const dispose = vi.fn();
    const renderer = makeRendererDisposeIdempotent({ dispose });

    renderer.dispose();
    renderer.dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("defers Tres disposal until the scene owner releases the renderer", () => {
    const dispose = vi.fn();
    const renderer = makeRendererDisposeIdempotent({ dispose });
    const teardownOrder: string[] = [];
    const flush = deferRendererDisposal(renderer);

    renderer.dispose();
    teardownOrder.push("Tres renderer-manager hook");
    expect(dispose).not.toHaveBeenCalled();
    teardownOrder.push("declarative scene owner cleanup");

    flush();
    teardownOrder.push("backend dispose");
    expect(dispose).toHaveBeenCalledOnce();
    expect(teardownOrder).toEqual([
      "Tres renderer-manager hook",
      "declarative scene owner cleanup",
      "backend dispose",
    ]);
    renderer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps the backend alive through Vue owner cleanup in Tres unmount order", () => {
    const order: string[] = [];
    const dispose = vi.fn(() => order.push("backend dispose"));
    const renderer = makeRendererDisposeIdempotent({ dispose });
    const flush = deferRendererDisposal(renderer);
    const sceneOwners = createApp(
      defineComponent({
        setup() {
          onBeforeUnmount(() => order.push("declarative scene owner cleanup"));
          return () => h("span");
        },
      }),
    );
    sceneOwners.mount(document.createElement("div"));

    const TresCanvasLifecycle = defineComponent({
      setup() {
        onUnmounted(() => {
          renderer.dispose();
          order.push("Tres renderer-manager hook");
        });
        onUnmounted(() => {
          order.push("unmountCanvas");
          sceneOwners.unmount();
        });
        return () => h("canvas");
      },
    });
    const SceneHostLifecycle = defineComponent({
      setup() {
        onUnmounted(flush);
        return () => h(TresCanvasLifecycle);
      },
    });
    const sceneHost = createApp(SceneHostLifecycle);
    sceneHost.mount(document.createElement("div"));

    sceneHost.unmount();

    expect(order).toEqual([
      "Tres renderer-manager hook",
      "unmountCanvas",
      "declarative scene owner cleanup",
      "backend dispose",
    ]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("allows explicit recovery cleanup to bypass deferred Tres disposal", () => {
    const dispose = vi.fn();
    const renderer = makeRendererDisposeIdempotent({ dispose });
    const flush = deferRendererDisposal(renderer);

    disposeUnifiedRendererNow(renderer);
    renderer.dispose();
    flush();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps an initialized instance alive for its caller", async () => {
    const renderer = rendererDouble(async () => undefined);

    await expect(initUnifiedWebGPUInstance(renderer)).resolves.toBe(true);

    expect(renderer.init).toHaveBeenCalledOnce();
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it("disposes an instance whose async initialization fails and keeps its cause", async () => {
    const initializationError = new Error("GPU initialization failed");
    const renderer = rendererDouble(async () => {
      throw initializationError;
    });

    await expect(initUnifiedWebGPUInstance(renderer)).rejects.toMatchObject({
      message: "WebGPU renderer initialization failed.",
      cause: initializationError,
    });

    expect(renderer.init).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("preserves both errors if failed initialization also fails cleanup", async () => {
    const initializationError = new Error("GPU initialization failed");
    const disposalError = new Error("GPU cleanup failed");
    const renderer = rendererDouble(async () => {
      throw initializationError;
    });
    vi.mocked(renderer.dispose).mockImplementation(() => {
      throw disposalError;
    });

    const result = initUnifiedWebGPUInstance(renderer);

    await expect(result).rejects.toBeInstanceOf(AggregateError);
    await expect(result).rejects.toMatchObject({
      errors: [initializationError, disposalError],
      cause: disposalError,
    });
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("does not initialize or retain a renderer when its owner is already aborted", async () => {
    const renderer = rendererDouble(async () => undefined);
    const controller = new AbortController();
    controller.abort();

    await expect(
      initUnifiedWebGPUInstance(renderer, controller.signal),
    ).resolves.toBe(false);

    expect(renderer.init).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it("disposes a renderer when async init completes after its owner aborts", async () => {
    let completeInitialization!: () => void;
    const initialization = new Promise<void>((resolve) => {
      completeInitialization = resolve;
    });
    const renderer = rendererDouble(() => initialization);
    const controller = new AbortController();
    const result = initUnifiedWebGPUInstance(renderer, controller.signal);

    controller.abort();
    expect(renderer.dispose).not.toHaveBeenCalled();
    completeInitialization();

    await expect(result).resolves.toBe(false);
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
