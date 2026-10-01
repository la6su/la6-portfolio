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
  inspectUnifiedBackend,
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
  it("classifies the initialized backend by Three's explicit markers", () => {
    expect(
      inspectUnifiedBackend({
        isWebGPURenderer: true,
        backend: {
          isWebGPUBackend: true,
          device: { adapterInfo: { isFallbackAdapter: false } },
        },
      }),
    ).toEqual({ backendName: "WebGPUBackend", isFallbackAdapter: false });
    expect(
      inspectUnifiedBackend({
        isWebGPURenderer: true,
        backend: { isWebGLBackend: true },
      }),
    ).toEqual({ backendName: "WebGLBackend", isFallbackAdapter: null });
  });

  it("leaves an unmarked backend unknown instead of guessing by class name", () => {
    expect(
      inspectUnifiedBackend({
        isWebGPURenderer: true,
        backend: { constructor: { name: "WebGPUBackend" } },
      }),
    ).toEqual({ backendName: null, isFallbackAdapter: null });
  });

  it("makes Tres and the application share one awaitable idempotent dispose boundary", async () => {
    const dispose = vi.fn();
    const renderer = makeRendererDisposeIdempotent({ dispose });

    const first = renderer.dispose();
    const second = renderer.dispose();

    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("defers Tres disposal until the scene owner releases the renderer", async () => {
    const dispose = vi.fn();
    const renderer = makeRendererDisposeIdempotent({ dispose });
    const teardownOrder: string[] = [];
    const flush = deferRendererDisposal(renderer);

    await renderer.dispose();
    teardownOrder.push("Tres renderer-manager hook");
    expect(dispose).not.toHaveBeenCalled();
    teardownOrder.push("declarative scene owner cleanup");

    await flush();
    teardownOrder.push("backend dispose");
    expect(dispose).toHaveBeenCalledOnce();
    expect(teardownOrder).toEqual([
      "Tres renderer-manager hook",
      "declarative scene owner cleanup",
      "backend dispose",
    ]);
    await renderer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("keeps the backend alive through Vue owner cleanup in Tres unmount order", async () => {
    const order: string[] = [];
    const dispose = vi.fn(async () => {
      await Promise.resolve();
      order.push("backend dispose");
    });
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
    await flush();

    expect(order).toEqual([
      "Tres renderer-manager hook",
      "unmountCanvas",
      "declarative scene owner cleanup",
      "backend dispose",
    ]);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("allows explicit recovery cleanup to bypass deferred Tres disposal", async () => {
    const dispose = vi.fn();
    const renderer = makeRendererDisposeIdempotent({ dispose });
    const flush = deferRendererDisposal(renderer);

    await disposeUnifiedRendererNow(renderer);
    await renderer.dispose();
    await flush();

    expect(dispose).toHaveBeenCalledOnce();
  });

  it("waits for Three's asynchronous backend cleanup", async () => {
    let finishDisposal!: () => void;
    const dispose = vi.fn(
      () => new Promise<void>((resolve) => (finishDisposal = resolve)),
    );
    const renderer = makeRendererDisposeIdempotent({ dispose });
    let settled = false;

    const teardown = renderer.dispose().then(() => {
      settled = true;
    });
    expect(settled).toBe(false);
    finishDisposal();
    await teardown;

    expect(settled).toBe(true);
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
