<script setup lang="ts">
// Persistent Tres root: owns the canvas and renderer across route changes.
// Experience adopts its scene and drives it through Tres's on-demand loop.
//
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onUnmounted,
  ref,
  toValue,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { TresCanvas } from '@tresjs/core'
import type { TresContext, TresRendererSetupContext } from '@tresjs/core'
import type { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry } from 'three'
import { planUnifiedBackend } from '../core/rendererBackend'
import { DeviceCapability, maxDprForMode } from '../core/DeviceCapability'
import { prefersReducedMotion, observeReducedMotion } from '../core/motionPolicy'
import { noSceneRequested } from '../core/sceneMode'
import { resolvePagePath } from '../core/routeManifest'
import type { PageId } from '../core/routeManifest'
import {
  createUnifiedWebGPUInstance,
  deferRendererDisposal,
  disposeUnifiedRendererNow,
  initUnifiedWebGPUInstance,
  inspectUnifiedBackend,
  type UnifiedRenderSurface,
} from '../core/unifiedRenderer'
import { sceneHost, type SceneLoopPort } from './sceneHost'
import { traceDevLifecycle } from '../core/devLifecycleTrace'
import { createReadySlot, readyNode } from './readySlot'
import { useSceneStages } from './useSceneStages'
import CinematicLights from './scene/CinematicLights.vue'
import CinematicCamera from './scene/CinematicCamera.vue'
import GroundPlane from './scene/GroundPlane.vue'
import SectionGroupRoots from './scene/SectionGroupRoots.vue'
import ServicesStageOwner from './scene/ServicesStageOwner.vue'
import EnvSphereOwner from './scene/EnvSphereOwner.vue'
import BakuCubeOwner from './scene/BakuCubeOwner.vue'
import IntroLightFramesOwner from './scene/IntroLightFramesOwner.vue'
import CursorTrailOwner from './scene/CursorTrailOwner.vue'
import EnvSky from './scene/EnvSky.vue'
import ContactCyprusStageOwner from './scene/ContactCyprusStageOwner.vue'
import ContactTypographyStageOwner from './scene/ContactTypographyStageOwner.vue'
import PointerInkStageOwner from './scene/PointerInkStageOwner.vue'
import ShowreelTheaterOwner from './scene/ShowreelTheaterOwner.vue'
import type { CinematicLightsNodes } from '../Experience/World/Lights'
import type { GroundPlaneNode } from '../Experience/Scene/GroundPlane'
import type { ServicesStage } from '../Experience/World/ServicesStage'
import type { EnvSphere } from '../Experience/World/EnvSphere'
import type { BakuCubeNodes } from '../Experience/World/SplashCube'
import type { IntroLightFramesNodes } from '../Experience/World/ParticleBurst'
import type { CursorTrailNodes } from '../Experience/World/DrawTrail'

const noScene = noSceneRequested
// Dev-only physical recovery seam. It preserves the shipped single-renderer
// topology (`WebGPURenderer` with its WebGLBackend), but lets the browser gate
// exercise a real WebGL context loss on hardware even when Chrome exposes
// native WebGPU. Vite folds this branch out of production builds.
const forceWebGLBackendForTest =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('force-webgl-backend')

// Tres owns the canvas size manager and re-applies its `dpr` option after
// renderer readiness AND on every internal sizes change (debounced after the
// Renderer owner's own resize write). The cap therefore must be LIVE: the
// boot-time hint (pre-init mode detection) differs from the final cap on the
// mobile WebGL-fallback path (1 vs 1.5), and a static prop would let Tres
// re-apply the stale cap over the finalized one on every resize/zoom.
const dprCap = ref(DeviceCapability.getInstance().maxDpr)

// Keep renderer construction in one place, including Tres re-setup/HMR.
// Construction is synchronous (Tres awaits the instance's `init()` itself);
// the backend is inspected AFTER init in `onReady`. The unified
// `WebGPURenderer` serves both WebGPU and WebGL backend modes.
const rendererFactory = (ctx: TresRendererSetupContext): UnifiedRenderSurface => {
  // Idempotent re-invocation guard: the Tres canvas is a persistent root,
  // but a re-setup (HMR or a topology change) would re-invoke the factory.
  // Returning the live instance keeps the single-construction owner and
  // prevents a second renderer on the same canvas — overwriting the owned
  // candidate would orphan the previous instance.
  if (ownedRenderer) return ownedRenderer
  const canvas = toValue(ctx.canvas) ?? document.createElement('canvas')
  const renderer = createUnifiedWebGPUInstance(canvas, forceWebGLBackendForTest)
  // TresJS 5.9.2 disposes its renderer manager before unmounting the custom
  // Vue scene tree. Defer that automatic call; SceneHost flushes it after all
  // declarative owners have released their GPU resources.
  ownedRendererDisposal = deferRendererDisposal(renderer)
  // Tres may report an initialization error before `onReady`; retain the
  // owned renderer so that the error path can release it as well.
  ownedRenderer = renderer
  return renderer
}

const tresRef = ref<{ $el: Element } | null>(null)
let disposed = false
let lifecycleGeneration = 0
let ownedRenderer: UnifiedRenderSurface | null = null
let ownedRendererDisposal: (() => Promise<void>) | null = null
let rendererDisposal: Promise<void> | null = null
let fallbackRendererInitController: AbortController | null = null
let fallbackRendererInit: Promise<boolean> | null = null
let unbindRendererOwner: (() => void) | null = null
let stopTresLoop: (() => void) | null = null

// Tres loop bridge state.
// Late-bound to the live Tres renderer manager in `onReady`; every port call
// before ready (or after unmount) is a safe no-op.
type RendererManager = TresContext['renderer']
let liveManager: RendererManager | null = null
let frameCallback: ((time: number) => void) | null = null
let externalInvalidateHandler: (() => void) | null = null

const loopPort: SceneLoopPort = {
  onFrame(callback) {
    frameCallback = callback
  },
  start() {
    liveManager?.loop.start()
  },
  stop() {
    liveManager?.loop.stop()
  },
  onExternalInvalidate(handler) {
    externalInvalidateHandler = handler
    return () => {
      if (externalInvalidateHandler === handler) externalInvalidateHandler = null
    }
  },
}
// ── Declarative node ready slots ──
// Each scene node reports itself through a slot: the template binds
// `@ready="slot.resolve"`, and `onReady` awaits the nodes it needs (sync
// fast path when the node already mounted).
const cameraSlot = createReadySlot<PerspectiveCamera>()
const worksRootSlot = createReadySlot<Group>()
const lightsSlot = createReadySlot<CinematicLightsNodes>()
const groundSlot = createReadySlot<GroundPlaneNode>()
const sectionRootsSlot = createReadySlot<readonly Group[]>()
const servicesStageSlot = createReadySlot<ServicesStage>()
const envSphereSlot = createReadySlot<EnvSphere>()
const bakuSlot = createReadySlot<BakuCubeNodes>()
const introFramesSlot = createReadySlot<IntroLightFramesNodes>()
const cursorTrailSlot = createReadySlot<CursorTrailNodes>()
const envSkySlot = createReadySlot<Mesh<PlaneGeometry, MeshBasicMaterial>>()
/** Template-facing alias: the env sphere must mount before the sky plane. */
const envSphereNode = envSphereSlot.value
/** Template-facing alias: the controls need the resolved cinematic camera. */
const cameraNode = cameraSlot.value

// Lab camera exploration is enabled only for fine-pointer users who can
// scroll the semantic page without being trapped by the canvas.
// The Lab route is where interactive camera exploration belongs: the
// declarative `<CameraControls>` (ecosystem camera-controls under the hood)
// orbits the gamepad while the cinematic writer yields. The decision lives
// HERE, once: lab route AND a fine pointer (touch keeps the page-scroll
// contract — the canvas sets touch-action: none, so 1-finger orbit would
// trap scrolling) AND no reduced-motion preference (no self-driven motion).
// Consumers: the policy port (Experience/Camera), this template's v-if and
// the `body[data-lab-camera]` CSS port the pass-through layers react to.
const route = useRoute()
const currentPage = (): PageId => resolvePagePath(route.path)
const hasMountedWorksRoute = ref(route.name === 'works')
watch(
  () => route.name,
  (name) => {
    if (name === 'works') hasMountedWorksRoute.value = true
  },
)
const pointerQuery =
  typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: fine)') : null
const pointerFine = ref(pointerQuery?.matches ?? false)
const motionReduced = ref(prefersReducedMotion())
const labCameraActive = computed(
  () => route?.name === 'lab' && pointerFine.value && !motionReduced.value,
)

if (pointerQuery) {
  const onPointerChange = (event: MediaQueryListEvent): void => {
    pointerFine.value = event.matches
  }
  pointerQuery.addEventListener('change', onPointerChange)
  onBeforeUnmount(() => pointerQuery.removeEventListener('change', onPointerChange))
}
const unobserveMotion = observeReducedMotion((reduced) => {
  motionReduced.value = reduced
})

watch(
  labCameraActive,
  (active) => {
    if (active) document.body.setAttribute('data-lab-camera', 'on')
    else document.body.removeAttribute('data-lab-camera')
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  unobserveMotion()
  document.body.removeAttribute('data-lab-camera')
})

// Rotate-only exploration limits and the wheel contract live inside the
// wrapper (src/app/scene/LabCameraControls.vue). The whole Cientos/
// camera-controls/stdlib dependency surface loads only when the exploration
// policy first activates on the Lab route (async component = lazy chunk).
const LabCameraControls = defineAsyncComponent(() => import('./scene/LabCameraControls.vue'))
const LabGamepadOwner = defineAsyncComponent(() => import('./scene/LabGamepadOwner.vue'))
// The Works scene root and installation only exist on the Works route. Keep
// that SFC and its stage leaves out of the persistent canvas's startup graph.
const WorksStageOwner = defineAsyncComponent(() => import('./scene/WorksStageOwner.vue'))

// Cold-start wake: camera-controls' own pointer handlers only dispatch
// events — the first drag must open a scheduler window itself. The wrapped
// manager invalidate translates into typed external render demand;
// every later frame keeps the window open through the controls' own
// 'update' → invalidate path until they go back to sleep.
function onLabControlsStart(): void {
  liveManager?.invalidate()
}

const {
  stages,
  declarativeWorksStage,
  declarativeWorksInstallation,
  declarativeContactHalo,
  declarativeManifestoInk,
  declarativeContactTypography,
  declarativeContactCyprus,
  declarativeLabGamepad,
  declarativeParticles,
  declarativeCarousel,
  declarativeShowreelTheater,
  clear: clearSceneStages,
} = useSceneStages(() => !disposed, () => readyNode(worksRootSlot))

async function disposeHostRenderer(renderer: UnifiedRenderSurface | null): Promise<void> {
  if (!renderer) return
  const flushDeferredDispose = ownedRenderer === renderer ? ownedRendererDisposal : null
  if (ownedRenderer === renderer) {
    ownedRenderer = null
    ownedRendererDisposal = null
  }
  const disposal = flushDeferredDispose
    ? flushDeferredDispose()
    : disposeUnifiedRendererNow(renderer)
  rendererDisposal = disposal
  try {
    await disposal
  } finally {
    if (rendererDisposal === disposal) rendererDisposal = null
  }
}

async function onReady(context: TresContext): Promise<void> {
  if (noScene || sceneHost.isSettled) return
  // Tres owns the persistent RAF host. Install the
  // bridges BEFORE any async work can yield so the first scheduler tick (and
  // any ecosystem invalidate) always lands on the final wiring.
  const manager = context.renderer
  liveManager = manager
  // The render STEP stays on the Experience pipeline (Renderer.update →
  // RenderPipeline). Tres's default render function would double-render
  // behind the pipeline's back — replace it with the frame-accounting
  // delegate that only drains Tres's pending-frame counter (public
  // `replaceRenderFunction` / `useLoop().render` seam).
  manager.replaceRenderFunction((notify) => notify())
  // The scheduler's frame callback runs inside Tres's before-render hooks,
  // so `useLoop` subscribers (Cientos components included) share this RAF.
  // Pass Tres's elapsed frame delta through; Experience clamps it in ms.
  manager.loop.onBeforeLoop(({ delta }) => frameCallback?.(delta * 1000))
  // Ecosystem wake path: Cientos components invalidate the manager on their
  // change events; the wrap translates each call into a typed scheduler
  // demand so external activity opens a render window.
  const baseInvalidate = manager.invalidate.bind(manager)
  manager.invalidate = (...args: Parameters<typeof baseInvalidate>) => {
    baseInvalidate(...args)
    externalInvalidateHandler?.()
  }
  // Tres auto-starts its loop when ready. The RenderScheduler owns
  // start/stop: pause the loop until Experience's first
  // invalidation opens the first window, and keep the cleanup handle for an
  // unmount during the async backend-fallback window below.
  stopTresLoop = () => manager.loop.stop()
  stopTresLoop()
  const generation = ++lifecycleGeneration
  const isCurrent = (): boolean => !disposed && generation === lifecycleGeneration
  const [camera, lights, ground, sectionRoots, servicesStage, envSphere, baku, introFrames, cursorTrail] =
    await Promise.all([
      readyNode(cameraSlot),
      readyNode(lightsSlot),
      readyNode(groundSlot),
      readyNode(sectionRootsSlot),
      readyNode(servicesStageSlot),
      readyNode(envSphereSlot),
      readyNode(bakuSlot),
      readyNode(introFramesSlot),
      readyNode(cursorTrailSlot),
    ])
  if (!envSkySlot.value.value) await envSkySlot.promise
  if (!isCurrent()) return
  const canvas =
    (tresRef.value?.$el as HTMLCanvasElement | undefined) ?? document.createElement('canvas')
  // The scene is the decorative visual layer over the semantic route content:
  // Canvas output is decorative; the route content remains independently
  // available to assistive technology.
  canvas.setAttribute('aria-hidden', 'true')
  let renderer = context.renderer.instance as UnifiedRenderSurface
  ownedRenderer = renderer
  let backend = inspectUnifiedBackend(renderer)
  let plan = planUnifiedBackend(backend)
  if (plan.recreate) {
    // Software WebGPU adapter (SwiftShader ~2 FPS) → hardware WebGL2 through
    // the same renderer class with its WebGL backend. The canvas is already in the DOM:
    // dispose the dead instance and swap in the replacement.
    await disposeHostRenderer(renderer)
    if (!isCurrent()) return
    const candidate = createUnifiedWebGPUInstance(canvas, true)
    ownedRendererDisposal = deferRendererDisposal(candidate)
    ownedRenderer = candidate
    const initController = new AbortController()
    fallbackRendererInitController = initController
    const initPromise = initUnifiedWebGPUInstance(candidate, initController.signal)
    fallbackRendererInit = initPromise
    try {
      await initPromise
    } catch (error) {
      await disposeHostRenderer(candidate)
      onError(error instanceof Error ? error : new Error(String(error)))
      return
    } finally {
      if (fallbackRendererInitController === initController) {
        fallbackRendererInitController = null
      }
      if (fallbackRendererInit === initPromise) fallbackRendererInit = null
    }
    if (!isCurrent()) {
      await disposeHostRenderer(candidate)
      return
    }
    renderer = candidate
    context.renderer.instance = renderer
    backend = inspectUnifiedBackend(renderer)
    plan = planUnifiedBackend(backend)
  }
  if (!isCurrent()) {
    await disposeHostRenderer(renderer)
    return
  }
  // Publish the selected backend's DPR cap so Tres and the renderer agree.
  // writers (Tres's size manager and the Renderer owner) agree from now on.
  dprCap.value = maxDprForMode(plan.mode, DeviceCapability.getInstance().isMobile)
  ownedRenderer = renderer
  ownedRendererDisposal ??= deferRendererDisposal(renderer)
  unbindRendererOwner = sceneHost.bindRendererOwner((replacement, mode) => {
    ownedRenderer = replacement
    // Recovery replaces the renderer Tres will dispose on unmount.
    ownedRendererDisposal = deferRendererDisposal(replacement)
    // Device-loss recovery may land on a different backend (webgpu → webgl);
    // re-publish the cap so the Tres size manager keeps agreeing with the
    // Renderer owner after the swap.
    dprCap.value = maxDprForMode(mode, DeviceCapability.getInstance().isMobile)
  })
  sceneHost.resolve({
    page: currentPage,
    isLabCameraActive: () => labCameraActive.value,
    scene: context.scene.value,
    context,
    renderer,
    canvas,
    camera,
    mode: plan.mode,
    backend,
    lights,
    ground,
    sectionRoots,
    servicesStage,
    envSphere,
    baku,
    introFrames,
    cursorTrail,
    loop: loopPort,
    stages,
  })
}

function onError(error: Error): void {
  if (sceneHost.isSettled || disposed) return
  void disposeHostRenderer(ownedRenderer).catch((disposeError: unknown) => {
    console.error('[SceneHost] renderer cleanup failed after initialization error:', disposeError)
  })
  sceneHost.reject(error)
}

onBeforeUnmount(() => {
  disposed = true
  lifecycleGeneration += 1
  fallbackRendererInitController?.abort()
  fallbackRendererInitController = null
  stopTresLoop?.()
  stopTresLoop = null
  unbindRendererOwner?.()
  unbindRendererOwner = null
  liveManager = null
  frameCallback = null
  externalInvalidateHandler = null
  clearSceneStages()
})

// Scene children release their adopted GPU resources during unmount. Keep the
// final renderer disposal until Vue has unmounted TresCanvas and those owners;
// otherwise the backend is torn down while its declarative resource owners are
// still running their before-unmount cleanup.
onUnmounted(async () => {
  // The software-adapter path initializes its replacement asynchronously.
  // Abort above, then let initUnifiedWebGPUInstance release the candidate
  // after init settles before this owner performs its terminal disposal.
  await fallbackRendererInit?.catch(() => undefined)
  await rendererDisposal?.catch(() => undefined)
  try {
    await disposeHostRenderer(ownedRenderer)
  } catch (error) {
    console.error('[SceneHost] renderer cleanup failed during unmount:', error)
  }
  if (import.meta.env.DEV) traceDevLifecycle('scene-host:renderer-disposed')
  ownedRenderer = null
})
</script>

<template>
  <div v-if="!noScene" class="jlz-scene-host" aria-hidden="true">
    <TresCanvas
      ref="tresRef"
      class="canvas jlz-scene-canvas"
      render-mode="on-demand"
      :dpr="[1, dprCap]"
      :renderer="rendererFactory"
      :style="{ pointerEvents: labCameraActive ? 'auto' : 'none' }"
      @ready="onReady"
      @error="onError"
    >
      <CinematicCamera @ready="cameraSlot.resolve" />
      <LabCameraControls
        v-if="labCameraActive && cameraNode"
        :camera="cameraNode"
        @start="onLabControlsStart"
      />
      <CinematicLights @ready="lightsSlot.resolve" />
      <GroundPlane @ready="groundSlot.resolve" />
      <SectionGroupRoots
        :particles="declarativeParticles"
        :carousel="declarativeCarousel"
        @ready="sectionRootsSlot.resolve"
      />
      <ShowreelTheaterOwner :theater="declarativeShowreelTheater" />
      <ServicesStageOwner @ready="servicesStageSlot.resolve" />
      <EnvSphereOwner @ready="envSphereSlot.resolve" />
      <BakuCubeOwner @ready="bakuSlot.resolve" />
      <IntroLightFramesOwner @ready="introFramesSlot.resolve" />
      <CursorTrailOwner @ready="cursorTrailSlot.resolve" />
      <EnvSky
        v-if="envSphereNode"
        :material="envSphereNode.skyMaterial"
        @ready="envSkySlot.resolve"
      />
      <PointerInkStageOwner v-if="declarativeContactHalo" :stage="declarativeContactHalo" />
      <PointerInkStageOwner v-if="declarativeManifestoInk" :stage="declarativeManifestoInk" />
      <ContactTypographyStageOwner
        v-if="declarativeContactTypography"
        :stage="declarativeContactTypography"
      />
      <ContactCyprusStageOwner
        v-if="declarativeContactCyprus"
        :stage="declarativeContactCyprus"
      />
      <LabGamepadOwner v-if="declarativeLabGamepad" :stage="declarativeLabGamepad" />
      <WorksStageOwner
        v-if="hasMountedWorksRoute"
        :stage="declarativeWorksStage"
        :installation="declarativeWorksInstallation"
        @root-ready="worksRootSlot.resolve"
      />
    </TresCanvas>
  </div>
</template>
