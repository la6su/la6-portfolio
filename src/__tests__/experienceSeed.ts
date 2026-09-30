// Shared Experience test seed (constructor bypass).
//
// The Experience constructor is heavy (renderer capability detection, UI
// construction), so lifecycle-method tests build a bare instance via
// Object.create(Experience.prototype) and seed exactly the state the tested
// methods touch. The six route-owned lazy stages live in StageRegistry; this
// harness installs that real owner and maps the fixture's stage properties to
// its slots. The registry context reads the seeded instance lazily, so page,
// camera, host, polarity, reduced motion and coordinator remain live at the
// contract boundary.

import * as THREE from 'three'
import { Experience } from '../Experience/Experience'
import { StageRegistry } from '../Experience/StageRegistry'
import type { SceneStagePorts } from '../app/sceneHost'
import type { LazyStageSlot } from '../Experience/LazyStage'
import type { PageId } from '../core/routeManifest'

/** The six route-owned lazy-stage slot names (StageRegistry.slots keys). */
export type LazyStageSlotName =
  | 'worksPlane'
  | 'contactTypography'
  | 'contactCyprus'
  | 'contactHalo'
  | 'manifestoInk'
  | 'labGamepad'

/** The no-op `works` two-level port (the tests that exercise it seed their
 *  own `_host`); the plain stage ports attach to the seed scene so the
 *  port-backed contracts keep their "stage joins the scene" behavior under
 *  the constructor-bypass seed (production realizes the same boundary via
 *  SceneHost's Vue `<primitive>` slots). */
function makeEmptyPorts(scene: THREE.Scene): SceneStagePorts {
  // Method parameter bivariance lets one Object3D-typed double satisfy every
  // `StagePort<StageType>` field without per-stage type imports here.
  const slotPort = (): {
    mount(object: THREE.Object3D): Promise<void>
    unmount(object: THREE.Object3D): Promise<void>
  } => ({
    mount: async (object) => {
      scene.add(object)
    },
    unmount: async (object) => {
      object.removeFromParent()
    },
  })
  return {
    works: {
      mountStage: async () => undefined,
      unmountStage: async () => undefined,
      mountInstallation: async () => undefined,
      unmountInstallation: async () => undefined,
    },
    contactHalo: slotPort(),
    manifestoInk: slotPort(),
    contactTypography: slotPort(),
    contactCyprus: slotPort(),
    labGamepad: slotPort(),
  }
}

/** Fixture property names that seed a registry slot. */
const SLOT_KEY_TO_NAME = {
  worksPlaneStage: 'worksPlane',
  contactTypographyStage: 'contactTypography',
  contactCyprusStage: 'contactCyprus',
  labGamepad: 'labGamepad',
} as const satisfies Record<string, LazyStageSlotName>

type StageSeedKey = keyof typeof SLOT_KEY_TO_NAME

function stageSlotName(key: string): LazyStageSlotName | undefined {
  return key in SLOT_KEY_TO_NAME ? SLOT_KEY_TO_NAME[key as StageSeedKey] : undefined
}

export interface SeededExperience {
  exp: Experience
  registry: StageRegistry
  /** Per-stage registry slots, for live stage reads and request-id
   *  assertions. Stages are `unknown` — tests narrow with the assertions
   *  they need. */
  slots: Record<LazyStageSlotName, LazyStageSlot<unknown>>
}

/** Explicit constructor-bypass fields used by Experience lifecycle tests.
 *  Keep keys closed so misspelled or obsolete fixture fields fail typecheck;
 *  owner doubles stay unknown because each test supplies only its exercised
 *  structural surface. */
export interface ExperienceSeed {
  _cancelBreath?: unknown
  _contactCyprusActive?: boolean
  _contactIsLight?: boolean
  _destroyed?: boolean
  _environment?: unknown
  _host?: unknown
  _lifecycleGeneration?: number
  _mouseTrailRafId?: unknown
  _mouseTrailRafPending?: boolean
  _onMouseMoveForTrail?: unknown
  _raiseRenderDemand?: unknown
  _readinessGate?: unknown
  _reducedMotion?: boolean
  _scheduler?: unknown
  _showreel?: unknown
  baku?: unknown
  camera?: unknown
  contactCyprusStage?: unknown
  contactTypographyStage?: unknown
  contentReveal?: unknown
  coordinator?: unknown
  currentPage?: () => PageId
  cursor?: unknown
  devPanel?: unknown
  drawTrail?: unknown
  envSphere?: unknown
  features?: unknown
  ground?: unknown
  labGamepad?: unknown
  lights?: unknown
  page?: () => PageId
  particleBurst?: unknown
  renderer?: unknown
  scene?: THREE.Scene
  sectionGroups?: unknown
  servicesStage?: unknown
  sfx?: unknown
  sizes?: unknown
  worksPlaneStage?: unknown
}

/** Bare Experience harness for lifecycle-method tests. */
export function seedExperience(seed: ExperienceSeed = {}): SeededExperience {
  const slotValues: Record<string, unknown> = {}
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(seed)) {
    const slotName = stageSlotName(key)
    if (slotName) slotValues[key] = value
    else rest[key] = value
  }
  const exp = Object.assign(Object.create(Experience.prototype), rest) as Experience
  const seeded = exp as unknown as {
    _stages?: StageRegistry
    currentPage?: unknown
    camera?: { instance: THREE.Camera }
    _host?: unknown
    _contactIsLight?: boolean
    _contactCyprusActive?: boolean
    _reducedMotion?: boolean
    coordinator?: { syncRouteVisuals(): void }
  }
  const scene = (rest.scene as THREE.Scene | undefined) ?? new THREE.Scene()
  const registry = new StageRegistry({
    // Use the route input directly. Calling the constructor-bypass instance's
    // inherited currentPage method here would couple the registry fixture to
    // Experience's private adapter and its constructor-owned `page` field.
    currentPage: () => seed.currentPage?.() ?? seed.page?.() ?? 'home',
    camera: () => seeded.camera ?? { instance: new THREE.PerspectiveCamera() },
    host: () =>
      (seeded._host as { stages?: SceneStagePorts } | undefined)?.stages ?? makeEmptyPorts(scene),
    isContactLight: () => Boolean(seeded._contactIsLight),
    isCyprusActive: () => Boolean(seeded._contactCyprusActive),
    setCyprusActive: (active) => {
      seeded._contactCyprusActive = active
    },
    reducedMotion: () => Boolean(seeded._reducedMotion),
    syncRouteVisuals: () => seeded.coordinator?.syncRouteVisuals(),
  })
  seeded._stages = registry
  for (const [key, value] of Object.entries(slotValues)) {
    const slotName = stageSlotName(key)
    if (value != null && slotName) {
      ;(registry.slots[slotName] as LazyStageSlot<unknown>).setStage(value)
    }
  }
  return {
    exp,
    registry,
    slots: registry.slots as unknown as Record<LazyStageSlotName, LazyStageSlot<unknown>>,
  }
}
