<script setup lang="ts">
// src/app/SceneHost.vue — Phase 7: the persistent Tres root.
//
// Mounted ONCE by AppShell (outside RouterView, so route navigation never
// remounts the scene root). It owns, each with exactly one owner:
//
// - the canvas (the Vue-rendered `<canvas>` inside TresCanvas — the single
//   canvas, e2e `canvas.canvas`);
// - the renderer (the custom renderer factory — the single construction
//   owner; Tres awaits its async `init()` before the ready event);
// - the camera (declared by `CinematicCamera`, passed to Experience through
//   the bridge and adopted by its cinematic controller);
// - the scene (the Tres context scene — Experience stops creating its own);
//
// and resolves the `sceneHost` bridge after renderer init + actual-backend
// inspection (software-adapter re-creation through the pure
// `planUnifiedBackend` policy). Scene owners enter Tres through explicit
// `primitive` adapters (`:dispose="null"` — Experience stays the single
// disposal owner). RenderMode is `on-demand` and the Tres loop is the one
// RAF host (ADR 0005): the `RenderScheduler` (ADR 0004) owns its start/stop
// through the `SceneLoopPort`, the frame callback runs in the before-render
// hooks, and the render STEP stays on the Experience pipeline via the
// replaced Tres render function. On-demand avoids manual mode's delayed
// advance().
//
import { computed, defineAsyncComponent, onBeforeUnmount, ref, toValue, watch } from 'vue'
import { useRoute } from 'vue-router'
import { TresCanvas } from '@tresjs/core'
import type { TresContext, TresRendererSetupContext } from '@tresjs/core'
import type { PerspectiveCamera } from 'three'
import { planUnifiedBackend } from '../core/rendererBackend'
import { DeviceCapability, maxDprForMode } from '../core/DeviceCapability'
import { prefersReducedMotion, observeReducedMotion } from '../core/motionPolicy'
import { setLabCameraActive } from '../core/labCameraPolicy'
import {
  createUnifiedWebGPUInstance,
  initUnifiedWebGPUInstance,
  inspectUnifiedBackend,
  type UnifiedRenderSurface,
} from '../core/unifiedRenderer'
import { sceneHost, type SceneLoopPort, type SceneStagePorts } from './sceneHost'
import { createReadySlot, readyNode } from './readySlot'
import { createStageSlot } from './stageSlot'
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
import WorksStageOwner from './scene/WorksStageOwner.vue'
import type { CinematicLightsNodes } from '../Experience/World/Lights'
import type { GroundPlaneNode } from '../Experience/Scene/GroundPlane'
import type { Group } from 'three'
import type { ServicesStage } from '../Experience/World/ServicesStage'
import type { EnvSphere } from '../Experience/World/EnvSphere'
import type { BakuCubeNodes } from '../Experience/World/SplashCube'
import type { IntroLightFramesNodes } from '../Experience/World/ParticleBurst'
import type { CursorTrailNodes } from '../Experience/World/DrawTrail'
import type { WorksPlaneStage } from '../Experience/World/WorksPlaneStage'
import type { WorksInstallation } from '../Experience/World/WorksInstallation'
import type { ContactHaloStage } from '../Experience/World/ContactHaloStage'
import type { ContactTypographyStage } from '../Experience/World/ContactTypographyStage'
import type { ManifestoInkStage } from '../Experience/World/ManifestoInkStage'
import type { ContactCyprusStage } from '../Experience/World/ContactCyprusStage'
import type { LabExperimentObject } from '../Experience/Lab/manifest'

const noScene = new URLSearchParams(window.location.search).has('no-scene')
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

// Single renderer-construction owner (Phase 7): the custom renderer factory.
// Construction is synchronous (Tres awaits the instance's `init()` itself);
// the backend is inspected AFTER init in `onReady`. The unified
// `WebGPURenderer` is the only class constructed (Phase 6 production default;
// the dev-forced classic `?renderer=webgl` QA owner was removed in Phase 10).
const rendererFactory = (ctx: TresRendererSetupContext): UnifiedRenderSurface => {
  // Idempotent re-invocation guard: the Tres canvas is a persistent root,
  // but a re-setup (HMR or a topology change) would re-invoke the factory.
  // Returning the live instance keeps the single-construction owner and
  // prevents a second renderer on the same canvas — overwriting
  // `createdRenderer` would orphan the previous instance.
  if (createdRenderer && !disposedRenderers.has(createdRenderer)) {
    return createdRenderer
  }
  const canvas = toValue(ctx.canvas) ?? document.createElement('canvas')
  const renderer = createUnifiedWebGPUInstance(canvas, forceWebGLBackendForTest)
  // Tres may report an initialization error before `onReady`; retain the
  // created owner so that the error path can release it as well.
  createdRenderer = renderer
  return renderer
}

const tresRef = ref<{ $el: Element } | null>(null)
let resolved = false
let disposed = false
let lifecycleGeneration = 0
let liveRenderer: UnifiedRenderSurface | null = null
let createdRenderer: UnifiedRenderSurface | null = null
let unbindRendererOwner: (() => void) | null = null
let stopTresLoop: (() => void) | null = null

// ── ADR 0005: Tres-native loop port state ──
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
const lightsSlot = createReadySlot<CinematicLightsNodes>()
const groundSlot = createReadySlot<GroundPlaneNode>()
const sectionRootsSlot = createReadySlot<readonly Group[]>()
const servicesStageSlot = createReadySlot<ServicesStage>()
const envSphereSlot = createReadySlot<EnvSphere>()
const bakuSlot = createReadySlot<BakuCubeNodes>()
const introFramesSlot = createReadySlot<IntroLightFramesNodes>()
const cursorTrailSlot = createReadySlot<CursorTrailNodes>()
const envSkySlot = createReadySlot<unknown>()
/** Template-facing alias: the env sphere must mount before the sky plane. */
const envSphereNode = envSphereSlot.value
/** Template-facing alias: the controls need the resolved cinematic camera. */
const cameraNode = cameraSlot.value

// ── Lab camera exploration (ADR 0005's first Cientos adoption) ──
// The Lab route is where interactive camera exploration belongs: the
// declarative `<CameraControls>` (ecosystem camera-controls under the hood)
// orbits the gamepad while the cinematic writer yields. The decision lives
// HERE, once: lab route AND a fine pointer (touch keeps the page-scroll
// contract — the canvas sets touch-action: none, so 1-finger orbit would
// trap scrolling) AND no reduced-motion preference (no self-driven motion).
// Consumers: the policy port (Experience/Camera), this template's v-if and
// the `body[data-lab-camera]` CSS port the pass-through layers react to.
const route = useRoute()
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
    setLabCameraActive(active)
    if (active) document.body.setAttribute('data-lab-camera', 'on')
    else document.body.removeAttribute('data-lab-camera')
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  unobserveMotion()
  setLabCameraActive(false)
  document.body.removeAttribute('data-lab-camera')
})

// Rotate-only exploration limits and the wheel contract live inside the
// wrapper (src/app/scene/LabCameraControls.vue). The whole Cientos/
// camera-controls/stdlib dependency surface loads only when the exploration
// policy first activates on the Lab route (async component = lazy chunk).
const LabCameraControls = defineAsyncComponent(() => import('./scene/LabCameraControls.vue'))

// Cold-start wake: camera-controls' own pointer handlers only dispatch
// events — the first drag must open a scheduler window itself. The wrapped
// manager invalidate translates into the typed 'external' demand (ADR 0005);
// every later frame keeps the window open through the controls' own
// 'update' → invalidate path until they go back to sleep.
function onLabControlsStart(): void {
  liveManager?.invalidate()
}

// ── Declarative stage slots (mount/unmount boundaries) ──
// One slot per stage family replaces the hand-written mount/unmount pairs.
// The works installation is a child of the works stage, so its port keeps the
// two-level guard (the child never attaches to — or outlives — a retired stage).
const worksStageSlot = createStageSlot<WorksPlaneStage>({ isAlive: () => !disposed })
const worksInstallationSlot = createStageSlot<WorksInstallation>({ isAlive: () => !disposed })
const contactHaloSlot = createStageSlot<ContactHaloStage>({ isAlive: () => !disposed })
const manifestoInkSlot = createStageSlot<ManifestoInkStage>({ isAlive: () => !disposed })
const contactTypographySlot = createStageSlot<ContactTypographyStage>({
  isAlive: () => !disposed,
})
const contactCyprusSlot = createStageSlot<ContactCyprusStage>({ isAlive: () => !disposed })
const labGamepadSlot = createStageSlot<LabExperimentObject>({ isAlive: () => !disposed })

// Top-level aliases keep the template's declarative bindings unchanged
// (setup-scope refs auto-unwrap, so `:object` receives the raw object).
const declarativeWorksStage = worksStageSlot.object
const declarativeWorksInstallation = worksInstallationSlot.object
const declarativeContactHalo = contactHaloSlot.object
const declarativeManifestoInk = manifestoInkSlot.object
const declarativeContactTypography = contactTypographySlot.object
const declarativeContactCyprus = contactCyprusSlot.object
const declarativeLabGamepad = labGamepadSlot.object

const stages: SceneStagePorts = {
  works: {
    mountStage: (stage) => worksStageSlot.mount(stage),
    unmountStage: async (stage) => {
      if (worksStageSlot.object.value !== stage) return
      // The installation is a child of this stage. Clear the child boundary
      // with its parent so a later stage can never inherit a retired installation.
      worksInstallationSlot.object.value = null
      await worksStageSlot.unmount(stage)
    },
    mountInstallation: (stage, installation) => {
      if (worksStageSlot.object.value !== stage) return Promise.resolve()
      return worksInstallationSlot.mount(installation)
    },
    unmountInstallation: (stage, installation) => {
      if (worksStageSlot.object.value !== stage) return Promise.resolve()
      return worksInstallationSlot.unmount(installation)
    },
  },
  contactHalo: contactHaloSlot,
  manifestoInk: manifestoInkSlot,
  contactTypography: contactTypographySlot,
  contactCyprus: contactCyprusSlot,
  labGamepad: labGamepadSlot,
}

const disposedRenderers = new WeakSet<object>()

function disposeRendererOnce(renderer: UnifiedRenderSurface | null): void {
  if (!renderer || disposedRenderers.has(renderer)) return
  disposedRenderers.add(renderer)
  renderer.dispose()
}

async function onReady(context: TresContext): Promise<void> {
  if (noScene || resolved) return
  // ADR 0005: the persistent Tres loop is the one RAF host. Install the
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
  // The frame contract expects a ms timestamp (Experience `Time.update`).
  manager.loop.onBeforeLoop(() => frameCallback?.(performance.now()))
  // Ecosystem wake path: Cientos components invalidate the manager on their
  // change events; the wrap translates each call into a typed scheduler
  // demand so external activity opens a render window.
  const baseInvalidate = manager.invalidate.bind(manager)
  manager.invalidate = (...args: Parameters<typeof baseInvalidate>) => {
    baseInvalidate(...args)
    externalInvalidateHandler?.()
  }
  // Tres auto-starts its loop when ready. The RenderScheduler owns
  // start/stop (ADR 0004/0005): pause it until Experience's first
  // invalidation opens the first window, and keep the cleanup handle for an
  // unmount during the async backend-fallback window below.
  stopTresLoop = () => manager.loop.stop()
  stopTresLoop()
  const generation = ++lifecycleGeneration
  const isCurrent = (): boolean => !disposed && generation === lifecycleGeneration
  const camera = await readyNode(cameraSlot)
  const lights = await readyNode(lightsSlot)
  const ground = await readyNode(groundSlot)
  const sectionRoots = await readyNode(sectionRootsSlot)
  const servicesStage = await readyNode(servicesStageSlot)
  const envSphere = await readyNode(envSphereSlot)
  const baku = await readyNode(bakuSlot)
  const introFrames = await readyNode(introFramesSlot)
  const cursorTrail = await readyNode(cursorTrailSlot)
  if (!envSkySlot.value.value) await envSkySlot.promise
  if (!isCurrent()) return
  const canvas =
    (tresRef.value?.$el as HTMLCanvasElement | undefined) ?? document.createElement('canvas')
  // The scene is the decorative visual layer over the semantic route content:
  // hidden from the accessibility tree (AGENTS.md: canvas hidden). The
  // wrapper carries the same attribute; the e2e contract asserts it on the
  // canvas element (TresCanvas does not forward fallthrough attributes).
  canvas.setAttribute('aria-hidden', 'true')
  let renderer = context.renderer.instance as UnifiedRenderSurface
  createdRenderer = renderer
  let backend = inspectUnifiedBackend(renderer)
  let plan = planUnifiedBackend(backend)
  if (plan.recreate) {
    // Software WebGPU adapter (SwiftShader ~2 FPS) → hardware WebGL2 through
    // the SAME class (Phase 6 policy). The canvas is already in the DOM:
    // dispose the dead instance and swap in the replacement.
    disposeRendererOnce(renderer)
    const candidate = createUnifiedWebGPUInstance(canvas, true)
    createdRenderer = candidate
    try {
      await initUnifiedWebGPUInstance(candidate)
    } catch (error) {
      disposeRendererOnce(candidate)
      if (createdRenderer === candidate) createdRenderer = null
      onError(error instanceof Error ? error : new Error(String(error)))
      return
    }
    if (!isCurrent()) {
      disposeRendererOnce(candidate)
      return
    }
    renderer = candidate
    context.renderer.instance = renderer
    backend = inspectUnifiedBackend(renderer)
    plan = planUnifiedBackend(backend)
  }
  if (!isCurrent()) {
    disposeRendererOnce(renderer)
    return
  }
  // The backend decision is final here (SceneHost owns planUnifiedBackend).
  // Publish the finalized DPR cap into the TresCanvas prop so both DPR
  // writers (Tres's size manager and the Renderer owner) agree from now on.
  dprCap.value = maxDprForMode(plan.mode, DeviceCapability.getInstance().isMobile)
  resolved = true
  liveRenderer = renderer
  unbindRendererOwner = sceneHost.bindRendererOwner((replacement) => {
    liveRenderer = replacement
    // Device-loss recovery may land on a different backend (webgpu → webgl);
    // re-publish the cap so the Tres size manager keeps agreeing with the
    // Renderer owner after the swap.
    dprCap.value = maxDprForMode(
      planUnifiedBackend(inspectUnifiedBackend(replacement)).mode,
      DeviceCapability.getInstance().isMobile,
    )
  })
  sceneHost.resolve({
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
  if (resolved || disposed) return
  resolved = true
  disposeRendererOnce(createdRenderer)
  createdRenderer = null
  sceneHost.reject(error)
}

onBeforeUnmount(() => {
  disposed = true
  lifecycleGeneration += 1
  stopTresLoop?.()
  stopTresLoop = null
  unbindRendererOwner?.()
  unbindRendererOwner = null
  liveManager = null
  frameCallback = null
  externalInvalidateHandler = null
  disposeRendererOnce(liveRenderer)
  if (createdRenderer !== liveRenderer) disposeRendererOnce(createdRenderer)
  liveRenderer = null
  createdRenderer = null
  worksStageSlot.object.value = null
  worksInstallationSlot.object.value = null
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
      <SectionGroupRoots @ready="sectionRootsSlot.resolve" />
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
      <primitive v-if="declarativeContactHalo" :object="declarativeContactHalo" :dispose="null" />
      <primitive v-if="declarativeManifestoInk" :object="declarativeManifestoInk" :dispose="null" />
      <primitive
        v-if="declarativeContactTypography"
        :object="declarativeContactTypography"
        :dispose="null"
      />
      <primitive
        v-if="declarativeContactCyprus"
        :object="declarativeContactCyprus"
        :dispose="null"
      />
      <primitive v-if="declarativeLabGamepad" :object="declarativeLabGamepad" :dispose="null" />
      <WorksStageOwner
        :stage="declarativeWorksStage"
        :installation="declarativeWorksInstallation"
      />
    </TresCanvas>
  </div>
</template>
