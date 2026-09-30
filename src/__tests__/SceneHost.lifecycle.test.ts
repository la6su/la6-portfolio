import { defineComponent, h, nextTick, onMounted } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loopStop: vi.fn(),
  loopStart: vi.fn(),
  onBeforeLoop: vi.fn((_callback?: (time: number) => void) => () => undefined),
  invalidate: vi.fn(),
  replaceRenderFunction: vi.fn(),
  candidate: {
    dispose: vi.fn(),
    backend: {},
    domElement: document.createElement('canvas'),
  },
  init: vi.fn(),
  rendererFactory: null as ((ctx: { canvas: unknown }) => unknown) | null,
}))

vi.mock('@tresjs/core', () => ({
  TresCanvas: defineComponent({
    emits: ['ready'],
    setup(_, { emit, attrs, slots }) {
      // The real TresCanvas calls the custom renderer factory during its
      // renderer-manager setup. The stub keeps that behavior out (so the
      // ready payload stays a fixed test double) but captures the factory
      // so a test can exercise its re-invocation guard directly.
      mocks.rendererFactory = attrs.renderer as (ctx: { canvas: unknown }) => unknown
      onMounted(() => {
        emit('ready', {
          scene: { value: new THREE.Scene() },
          renderer: {
            loop: {
              stop: mocks.loopStop,
              start: mocks.loopStart,
              onBeforeLoop: mocks.onBeforeLoop,
            },
            instance: {
              dispose: vi.fn(),
              domElement: document.createElement('canvas'),
              backend: {},
            },
            invalidate: mocks.invalidate,
            replaceRenderFunction: mocks.replaceRenderFunction,
          },
        })
      })
      // The real TresCanvas applies the caller's attrs (the pointer-events
      // style) to the canvas element it owns — forward them the same way.
      return () => h('div', [h('canvas', { style: attrs.style }), slots.default?.()])
    },
  }),
}))

vi.mock('../app/scene/CinematicLights.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() => emit('ready', {}))
      return () => null
    },
  }),
}))

vi.mock('../app/scene/CinematicCamera.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() => emit('ready', new THREE.PerspectiveCamera()))
      return () => null
    },
  }),
}))

vi.mock('../app/scene/GroundPlane.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() => emit('ready', {}))
      return () => null
    },
  }),
}))

vi.mock('../app/scene/SectionGroupRoots.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() => emit('ready', []))
      return () => null
    },
  }),
}))

vi.mock('../app/scene/ServicesStageOwner.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() => emit('ready', new THREE.Group()))
      return () => null
    },
  }),
}))

vi.mock('../app/scene/EnvSphereOwner.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() =>
        emit(
          'ready',
          Object.assign(new THREE.Group(), { skyMaterial: new THREE.MeshBasicMaterial() }),
        ),
      )
      return () => null
    },
  }),
}))

vi.mock('../app/scene/EnvSky.vue', () => ({
  default: defineComponent({
    emits: ['ready'],
    setup(_, { emit }) {
      onMounted(() => emit('ready'))
      return () => null
    },
  }),
}))

vi.mock('../app/scene/WorksStageOwner.vue', () => ({
  default: defineComponent({
    props: { stage: Object, installation: Object },
    setup(props) {
      return () =>
        h('div', {
          'data-stage-mounted': props.stage ? 'true' : 'false',
          'data-installation-mounted': props.installation ? 'true' : 'false',
        })
    },
  }),
}))

vi.mock('../core/unifiedRenderer', () => ({
  createUnifiedWebGPUInstance: vi.fn(() => mocks.candidate),
  initUnifiedWebGPUInstance: mocks.init,
  inspectUnifiedBackend: vi.fn(() => ({ backendName: 'WebGPU', isFallbackAdapter: true })),
}))

vi.mock('../core/rendererBackend', () => ({
  planUnifiedBackend: vi.fn(() => ({ recreate: true, mode: 'webgl' })),
}))

// The Lab exploration decision reads the router location. Tests pin the
// publish contract per route by swapping this return value.
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ name: 'home' })),
}))

// The Lab controls wrapper needs a live Tres context (useTres/useLoop);
// the stubbed TresCanvas provides none. The stub renders a marker so tests
// can assert SceneHost's own mount decision (v-if gating + camera
// readiness). SceneHost loads the real wrapper through defineAsyncComponent,
// so the mock targets the wrapper module; the runtime probes the module
// namespace for the standard flags while resolving the async component.
vi.mock('../app/scene/LabCameraControls.vue', () => ({
  __esModule: true,
  __isTeleport: false,
  default: defineComponent({
    props: { camera: Object },
    setup() {
      return () => h('div', { 'data-lab-controls': 'true' })
    },
  }),
}))

import SceneHost from '../app/SceneHost.vue'
import { __resetSceneHostForTests, sceneHost } from '../app/sceneHost'
import { createUnifiedWebGPUInstance } from '../core/unifiedRenderer'
import { useRoute } from 'vue-router'
import { isLabCameraActive, setLabCameraActive } from '../core/labCameraPolicy'
import { reactive } from 'vue'

const routeMock = vi.mocked(useRoute)
// The real useRoute() hands out the live reactive location — tests mutate
// this one to simulate navigation. The cast narrows the stub to the fields
// SceneHost reads; a full RouteLocationNormalizedLoaded is router-internal.
const routeLocation = reactive({ name: 'home' }) as unknown as ReturnType<typeof useRoute>

function stubFinePointerMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query === '(pointer: fine)',
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })),
  )
}

describe('SceneHost async lifecycle', () => {
  beforeEach(() => {
    routeLocation.name = 'home'
    routeMock.mockReturnValue(routeLocation)
    mocks.candidate.dispose.mockReset()
    mocks.loopStop.mockReset()
    mocks.loopStart.mockReset()
    mocks.onBeforeLoop.mockClear()
    mocks.invalidate.mockReset()
    mocks.replaceRenderFunction.mockReset()
    mocks.init.mockReset()
    vi.mocked(createUnifiedWebGPUInstance).mockClear()
    mocks.rendererFactory = null
    __resetSceneHostForTests()
  })

  afterEach(() => {
    setLabCameraActive(false)
    vi.unstubAllGlobals()
    document.body.removeAttribute('data-lab-camera')
  })

  it('disposes a late fallback candidate after unmount', async () => {
    let resolveInit!: () => void
    mocks.init.mockImplementationOnce(() => new Promise<void>((resolve) => (resolveInit = resolve)))

    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()
    wrapper.unmount()
    resolveInit()
    await flushPromises()

    expect(mocks.candidate.dispose).toHaveBeenCalledOnce()
    expect(sceneHost.isSettled).toBe(false)
    expect(mocks.loopStop).toHaveBeenCalled()
  })

  it('installs the ADR 0005 bridges and stops Tres internal loop when ready hands ownership to RenderScheduler', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    // The render step is delegated away from Tres's default render function.
    expect(mocks.replaceRenderFunction).toHaveBeenCalledOnce()
    // The scheduler frame bridge runs inside Tres's before-render hooks.
    expect(mocks.onBeforeLoop).toHaveBeenCalledOnce()
    // Tres auto-starts its loop on ready; SceneHost pauses it immediately —
    // the RenderScheduler owns start/stop from here.
    expect(mocks.loopStop).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('forwards the before-loop bridge to the registered scheduler frame callback', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()
    const host = await sceneHost.ready

    const frames: number[] = []
    host.loop.onFrame((time) => frames.push(time))
    // SceneHost installs exactly one bridge into the Tres loop; driving it
    // (what the Tres loop does every RAF tick) runs the registered callback
    // with a ms timestamp (the Experience Time.update contract).
    expect(mocks.onBeforeLoop).toHaveBeenCalledOnce()
    const bridge = mocks.onBeforeLoop.mock.calls[0]?.[0] as (time: number) => void
    bridge(0)
    expect(frames).toHaveLength(1)
    expect(typeof frames[0]).toBe('number')

    // After unmount the port clears the callback: a late RAF tick is a no-op.
    wrapper.unmount()
    expect(() => bridge(0)).not.toThrow()
    expect(frames).toHaveLength(1)
  })

  it('routes ecosystem invalidate() calls through the typed wake handler', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()
    const host = await sceneHost.ready

    const wake = vi.fn()
    const unbind = host.loop.onExternalInvalidate(wake)
    // After the ADR 0005 wrap, the manager's invalidate is the bridging one:
    // the base manager call keeps its arguments and the scheduler wake fires.
    const wrapped = (host.context.renderer as { invalidate: (...args: unknown[]) => void })
      .invalidate
    wrapped('frame')
    expect(mocks.invalidate).toHaveBeenCalledWith('frame')
    expect(wake).toHaveBeenCalledOnce()

    // Unsubscribing removes the wake handler without breaking the base call.
    unbind()
    wrapped('frame')
    expect(mocks.invalidate).toHaveBeenCalledTimes(2)
    expect(wake).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('loop port calls after unmount are safe no-ops (documented port contract)', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()
    const host = await sceneHost.ready
    wrapper.unmount()

    expect(() => {
      host.loop.start()
      host.loop.stop()
      host.loop.onFrame(null)
      host.loop.onExternalInvalidate(null)
    }).not.toThrow()
  })

  it('publishes the lazy Works attachment boundary with the ready host', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    const host = await sceneHost.ready
    const stage =
      new THREE.Group() as unknown as import('../Experience/World/WorksPlaneStage').WorksPlaneStage
    const installation =
      new THREE.Group() as unknown as import('../Experience/World/WorksInstallation').WorksInstallation
    await host.stages.works.mountStage(stage)
    await host.stages.works.mountInstallation(stage, installation)
    expect(
      document
        .querySelector('[data-stage-mounted="true"]')
        ?.getAttribute('data-installation-mounted'),
    ).toBe('true')

    const staleStage =
      new THREE.Group() as unknown as import('../Experience/World/WorksPlaneStage').WorksPlaneStage
    await host.stages.works.unmountStage(staleStage)
    expect(
      document
        .querySelector('[data-stage-mounted="true"]')
        ?.getAttribute('data-installation-mounted'),
    ).toBe('true')

    await host.stages.works.unmountStage(stage)
    expect(
      document
        .querySelector('[data-stage-mounted="false"]')
        ?.getAttribute('data-installation-mounted'),
    ).toBe('false')
    wrapper.unmount()
  })

  it('disposes and rejects when fallback initialization fails', async () => {
    const error = new Error('fallback init failed')
    mocks.init.mockRejectedValueOnce(error)

    const readyRejection = expect(sceneHost.ready).rejects.toBe(error)
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    expect(mocks.candidate.dispose).toHaveBeenCalledOnce()
    await readyRejection
    wrapper.unmount()
  })

  it('disposes the resolved renderer when the host unmounts', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    wrapper.unmount()

    expect(mocks.candidate.dispose).toHaveBeenCalledOnce()
  })

  it('disposes a recovered renderer when the host unmounts', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    const replacement = {
      dispose: vi.fn(),
    } as unknown as import('../core/unifiedRenderer').UnifiedRenderSurface
    sceneHost.replaceRenderer(replacement)
    wrapper.unmount()

    expect(replacement.dispose).toHaveBeenCalledOnce()
  })

  it('returns the same live renderer when the factory is re-invoked (single construction owner)', async () => {
    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    // The stubbed TresCanvas captured SceneHost's custom renderer factory
    // without calling it; the ready path already holds a live renderer
    // (`createdRenderer` is the adopted candidate).
    expect(mocks.rendererFactory).toBeTypeOf('function')
    const create = vi.mocked(createUnifiedWebGPUInstance)
    const callsBefore = create.mock.calls.length

    // A re-invocation while a live renderer exists returns that same
    // instance — no second construction and no lost owner.
    const canvas = document.createElement('canvas')
    const first = mocks.rendererFactory!({ canvas })
    const second = mocks.rendererFactory!({ canvas })
    expect(second).toBe(first)
    expect(first).toBe(mocks.candidate)
    expect(create).toHaveBeenCalledTimes(callsBefore)

    wrapper.unmount()
  })

  it('mounts the Lab controls and publishes the exploration state on the lab route', async () => {
    stubFinePointerMedia()
    routeLocation.name = 'lab'

    const wrapper = mount(SceneHost, { attachTo: document.body })
    // Two flush rounds: one for the scene-host ready slots, one for the
    // defineAsyncComponent boundary's dynamic import to resolve and render.
    await flushPromises()
    await nextTick()
    await flushPromises()

    // The CSS choreography port is on, the typed policy port matches, the
    // canvas takes pointer input and the controls mounted next to the camera.
    expect(document.body.getAttribute('data-lab-camera')).toBe('on')
    expect(isLabCameraActive()).toBe(true)
    expect(wrapper.find('canvas').attributes('style')).toContain('pointer-events: auto')
    expect(wrapper.find('[data-lab-controls]').exists()).toBe(true)

    // Leaving the lab route unmounts the controls and clears every port.
    routeLocation.name = 'home'
    await flushPromises()

    expect(document.body.hasAttribute('data-lab-camera')).toBe(false)
    expect(isLabCameraActive()).toBe(false)
    expect(wrapper.find('canvas').attributes('style')).toContain('pointer-events: none')
    expect(wrapper.find('[data-lab-controls]').exists()).toBe(false)

    wrapper.unmount()
  })

  it('keeps the canvas inert when the lab route runs without a fine pointer', async () => {
    // Touch devices: no (pointer: fine) match — the exploration stays off so
    // the page-scroll contract survives (canvas keeps touch-action: none).
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })),
    )
    routeLocation.name = 'lab'

    const wrapper = mount(SceneHost, { attachTo: document.body })
    await flushPromises()

    expect(document.body.hasAttribute('data-lab-camera')).toBe(false)
    expect(isLabCameraActive()).toBe(false)
    expect(wrapper.find('canvas').attributes('style')).toContain('pointer-events: none')
    expect(wrapper.find('[data-lab-controls]').exists()).toBe(false)

    wrapper.unmount()
  })
})
