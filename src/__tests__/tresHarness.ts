import { h, type Component } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { TresCanvas, type TresContext } from '@tresjs/core'
import type { Scene } from 'three'
import { vi } from 'vitest'

/**
 * Shared TresCanvas test harness for the declarative lifecycle tests.
 *
 * Every `mount(TresCanvas, …)` test drives a manual-loop renderer double
 * with the same surface; this factory is the single copy of that double.
 * The returned object is intentionally loose: Tres only touches the
 * members below before the test stops the loop.
 */
export function createRendererMock() {
  const canvas = document.createElement('canvas')
  return {
    isRenderer: true,
    domElement: canvas,
    init: vi.fn().mockResolvedValue(undefined),
    render: vi.fn(),
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    shadowMap: { enabled: false, type: 0 },
  }
}

/** jsdom lacks the pointer-capture API the Tres canvas wires up on mount. */
export function installCanvasPointerShims(): void {
  HTMLCanvasElement.prototype.setPointerCapture ??= () => undefined
  HTMLCanvasElement.prototype.releasePointerCapture ??= () => undefined
  HTMLCanvasElement.prototype.hasPointerCapture ??= () => false
}

interface MountedSceneCanvas {
  wrapper: VueWrapper
  renderer: ReturnType<typeof createRendererMock>
  scene: Scene
  context: TresContext
  unmount(): void
}

/**
 * Mount a declarative scene component under a real TresCanvas with the shared
 * renderer double in manual render mode. Resolves after the canvas reports
 * ready and the internal loop is stopped — the shared preamble of the
 * declarative lifecycle tests. Component listeners (e.g. `onReady`) pass
 * through `props` like any Vue prop.
 */
export async function mountSceneCanvas(
  component: Component,
  props: Record<string, unknown> | (() => Record<string, unknown>) = {},
): Promise<MountedSceneCanvas> {
  const renderer = createRendererMock()
  const ready: { context: TresContext | null } = { context: null }
  const wrapper = mount(TresCanvas, {
    attachTo: document.body,
    props: {
      renderMode: 'manual',
      renderer: (() => renderer) as never,
      onReady: (context: TresContext) => {
        ready.context = context
        context.renderer.loop.stop()
      },
    },
    // A factory re-reads reactive sources at slot-render time (the
    // WorksStageOwner tests mutate refs after mount).
    slots: {
      default: () => h(component, typeof props === 'function' ? props() : props),
    },
  })
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (!ready.context) throw new Error('TresCanvas did not become ready')
  return {
    wrapper,
    renderer,
    scene: ready.context.scene.value,
    context: ready.context,
    unmount: () => wrapper.unmount(),
  }
}
