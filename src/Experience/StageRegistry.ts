// src/Experience/StageRegistry.ts — the route-owned lazy-stage registry.
//
// Six route-owned stages (works plane, contact typography/halo/cyprus,
// manifesto ink, lab object) share LazyStage's lifecycle. The registry holds
// their slots and route-specific contracts. Experience and ExperienceUI use
// this owner directly through the UI host's typed getter.
//
// Every stage mounts through the declarative host ports (SceneStagePorts) —
// no runtime `scene.add`. The polarity cache (contactIsLight / cyprusActive)
// stays on Experience — the theme listener writes it per event; the
// contracts read it through the context so a lazy stage cannot miss the
// current polarity.

import type { Camera } from 'three'
import type { PageId } from '../core/routeManifest'
import type { SceneStagePorts } from '../app/sceneHost'
import {
  createLazyStageSlot,
  createImportedLazyStage,
  disposeLazyStage,
  ensureLazyStage,
  type LazyStageContract,
} from './LazyStage'
import { WorksPlaneStage } from './World/WorksPlaneStage'
import type { ContactTypographyStage } from './World/ContactTypographyStage'
import type { ContactHaloStage } from './World/ContactHaloStage'
import type { ManifestoInkStage } from './World/ManifestoInkStage'
import type { ContactCyprusStage } from './World/ContactCyprusStage'
import { getLabExperiment, type LabExperimentObject } from './Lab/manifest'

/** The world facts the contracts read at create/configure time. Getters, not
 *  values: every lazy stage can appear on any route and must observe the
 *  live route, camera, polarity and reduced-motion state at its own init. */
interface StageRegistryContext {
  currentPage: () => PageId
  camera: () => { instance: Camera }
  host: () => SceneStagePorts
  /** The effective text polarity (theme-listener cache on Experience). */
  isContactLight: () => boolean
  /** The target Cyprus-active state (the Agros frame replaces the cube). */
  isCyprusActive: () => boolean
  setCyprusActive: (active: boolean) => void
  reducedMotion: () => boolean
  /** Route-visual reconciliation after a late Cyprus activation. */
  syncRouteVisuals: () => void
}

export class StageRegistry {
  /** Per-stage slot state (stage reference + memoized promise + request id).
   *  Public readonly: the test seed pre-sets stages through these slots. */
  readonly slots = {
    worksPlane: createLazyStageSlot<WorksPlaneStage>(),
    contactTypography: createLazyStageSlot<ContactTypographyStage>(),
    contactCyprus: createLazyStageSlot<ContactCyprusStage>(),
    contactHalo: createLazyStageSlot<ContactHaloStage>(),
    manifestoInk: createLazyStageSlot<ManifestoInkStage>(),
    labGamepad: createLazyStageSlot<LabExperimentObject>(),
  }

  constructor(private readonly _ctx: StageRegistryContext) {}

  /** Stage references read through their slots (null until created / after dispose). */
  public get worksPlaneStage(): WorksPlaneStage | null {
    return this.slots.worksPlane.getStage()
  }
  public get contactTypographyStage(): ContactTypographyStage | null {
    return this.slots.contactTypography.getStage()
  }
  public get contactCyprusStage(): ContactCyprusStage | null {
    return this.slots.contactCyprus.getStage()
  }
  public get contactHaloStage(): ContactHaloStage | null {
    return this.slots.contactHalo.getStage()
  }
  public get manifestoInkStage(): ManifestoInkStage | null {
    return this.slots.manifestoInk.getStage()
  }
  public get labGamepad(): LabExperimentObject | null {
    return this.slots.labGamepad.getStage()
  }

  /** Lazily create rich `/works` media only on that route, never on first
   *  paint. The lifecycle flow (request guard, memoization, stale release)
   *  lives in LazyStage.ts; only the stage-specific wiring stays here. */
  private _worksPlaneStageContract(): LazyStageContract<WorksPlaneStage> {
    return {
      label: 'WorksPlaneStage',
      owner: this.slots.worksPlane.owner,
      create: () => new WorksPlaneStage(),
      attach: (stage) => this._ctx.host().works.mountStage(stage),
      load: async (stage, isCurrent) => {
        await stage.init()
        if (!isCurrent()) return
        const installation = stage.installationOwner
        if (installation) await this._ctx.host().works.mountInstallation(stage, installation)
      },
      configure: (stage) => {
        stage.setActive(this._ctx.currentPage() === 'works', 0)
        stage.resize(window.innerWidth, window.innerHeight)
        stage.setCamera(this._ctx.camera().instance)
      },
      release: (stage) => {
        const installation = stage.installationOwner
        if (installation) void this._ctx.host().works.unmountInstallation(stage, installation)
        void this._ctx.host().works.unmountStage(stage)
        stage.dispose()
      },
    }
  }

  public ensureWorksPlaneStageInitialized(): Promise<void> {
    return ensureLazyStage(this._worksPlaneStageContract())
  }

  /** Dispose the /works case-plane stage when leaving /works.
   *  Frees ~40-50 MB of GPU textures + TSL materials. The stage is lazily
   *  re-created on the next /works visit. */
  public disposeWorksPlaneStage(): void {
    disposeLazyStage(this._worksPlaneStageContract())
  }

  /** Lazily create the Contact greeting so FontLoader/TextGeometry stay out
   * of the shared initial scene graph. Lifecycle flow: LazyStage.ts. */
  private _contactTypographyStageContract(): LazyStageContract<ContactTypographyStage> {
    return {
      label: 'ContactTypographyStage',
      owner: this.slots.contactTypography.owner,
      create: createImportedLazyStage(
        () => import('./World/ContactTypographyStage'),
        ({ ContactTypographyStage }) => ContactTypographyStage,
      ),
      attach: (stage) => this._ctx.host().contactTypography.mount(stage),
      configure: (stage) => {
        stage.setActive(this._ctx.currentPage() === 'contact')
        stage.setTheme(this._ctx.isContactLight())
      },
      release: (stage) => {
        void this._ctx.host().contactTypography.unmount(stage)
        // The stage's dispose() also self-detaches (a harmless no-op after
        // the Vue-host unmount flush).
        stage.dispose()
      },
    }
  }

  public ensureContactTypographyStageInitialized(): Promise<void> {
    return ensureLazyStage(this._contactTypographyStageContract())
  }

  public disposeContactTypographyStage(): void {
    disposeLazyStage(this._contactTypographyStageContract())
  }

  /** Lazily load the Contact ink halo so the TSL graph stays out of the
   * shared initial scene graph. Lifecycle flow: LazyStage.ts. */
  private _contactHaloStageContract(): LazyStageContract<ContactHaloStage> {
    return {
      label: 'ContactHaloStage',
      owner: this.slots.contactHalo.owner,
      create: createImportedLazyStage(
        () => import('./World/ContactHaloStage'),
        ({ ContactHaloStage }) => ContactHaloStage,
      ),
      attach: (stage) => this._ctx.host().contactHalo.mount(stage),
      configure: (stage) => {
        stage.setTheme(this._ctx.isContactLight())
        stage.setReducedMotion(this._ctx.reducedMotion())
        stage.setActive(this._ctx.currentPage() === 'contact')
      },
      release: (stage) => {
        void this._ctx.host().contactHalo.unmount(stage)
        stage.dispose()
      },
    }
  }

  public ensureContactHaloStageInitialized(): Promise<void> {
    return ensureLazyStage(this._contactHaloStageContract())
  }

  public disposeContactHaloStage(): void {
    disposeLazyStage(this._contactHaloStageContract())
  }

  /** Lazily load the /manifesto ink wash so the TSL graph stays out of the
   *  shared initial scene graph (same contract as the contact halo).
   *  Lifecycle flow: LazyStage.ts. */
  private _manifestoInkStageContract(): LazyStageContract<ManifestoInkStage> {
    return {
      label: 'ManifestoInkStage',
      owner: this.slots.manifestoInk.owner,
      create: createImportedLazyStage(
        () => import('./World/ManifestoInkStage'),
        ({ ManifestoInkStage }) => ManifestoInkStage,
      ),
      attach: (stage) => this._ctx.host().manifestoInk.mount(stage),
      configure: (stage) => {
        // The effective-polarity cache is refreshed on every theme event
        // regardless of route, so a lazy stage cannot miss the current ink.
        stage.setTheme(this._ctx.isContactLight())
        stage.setReducedMotion(this._ctx.reducedMotion())
        stage.setActive(this._ctx.currentPage() === 'manifesto')
      },
      release: (stage) => {
        void this._ctx.host().manifestoInk.unmount(stage)
        stage.dispose()
      },
    }
  }

  public ensureManifestoInkStageInitialized(): Promise<void> {
    return ensureLazyStage(this._manifestoInkStageContract())
  }

  public disposeManifestoInkStage(): void {
    disposeLazyStage(this._manifestoInkStageContract())
  }

  /** Lazily load the Contact location asset instead of keeping it in the home
   *  scene. Lifecycle flow: LazyStage.ts. */
  private _contactCyprusStageContract(): LazyStageContract<ContactCyprusStage> {
    return {
      label: 'ContactCyprusStage',
      owner: this.slots.contactCyprus.owner,
      create: createImportedLazyStage(
        () => import('./World/ContactCyprusStage'),
        ({ ContactCyprusStage }) => ContactCyprusStage,
      ),
      attach: (stage) => this._ctx.host().contactCyprus.mount(stage),
      load: (stage) => stage.load(),
      configure: (stage) => {
        stage.resize(window.innerWidth, window.innerHeight)
        stage.setCamera(this._ctx.camera().instance)
        stage.setActive(this._ctx.currentPage() === 'contact' && this._ctx.isCyprusActive())
        stage.prewarm()
      },
      release: (stage) => {
        void this._ctx.host().contactCyprus.unmount(stage)
        // The stage's dispose() also self-detaches (a harmless no-op after
        // the Vue-host unmount flush).
        stage.dispose()
      },
      onDispose: () => {
        this._ctx.setCyprusActive(false)
      },
    }
  }

  public ensureContactCyprusStageInitialized(): Promise<void> {
    return ensureLazyStage(this._contactCyprusStageContract())
  }

  public disposeContactCyprusStage(): void {
    disposeLazyStage(this._contactCyprusStageContract())
  }

  /** Frame 03 replaces the shared cube with the Cyprus asset. */
  public setContactCyprusStageSection(index: number): void {
    this._ctx.setCyprusActive(this._ctx.currentPage() === 'contact' && index === 2)
    const stage = this.slots.contactCyprus.getStage()
    stage?.setActive(this._ctx.isCyprusActive())
    if (this._ctx.isCyprusActive() && !stage) {
      const initialization = this.ensureContactCyprusStageInitialized()
      const request = this.slots.contactCyprus.getRequest()
      void initialization.then(() => {
        if (request !== this.slots.contactCyprus.getRequest() || !this._ctx.isCyprusActive()) return
        this._ctx.syncRouteVisuals()
      })
    }
    this._ctx.syncRouteVisuals()
  }

  /** Lazily create the Lab experiment object on its first /lab visit. The
   *  object is a static scene object — it is never disposed per route leave,
   *  only on final destroy. Lifecycle flow: LazyStage.ts. */
  private _labGamepadContract(): LazyStageContract<LabExperimentObject> {
    return {
      label: 'LabGamepad',
      owner: this.slots.labGamepad.owner,
      create: () => {
        const experiment = getLabExperiment('lab')
        // No isCurrent guard on the resolved object: the manifest load may
        // have already constructed it, so a retired request must fall through
        // to the LazyStage stale check, which releases the late result
        // (dispose) instead of silently dropping it.
        return experiment ? experiment.load() : Promise.resolve(null)
      },
      attach: (stage) => this._ctx.host().labGamepad.mount(stage),
      configure: (stage) => {
        stage.visible = this._ctx.currentPage() === 'lab'
      },
      release: (stage) => {
        void this._ctx.host().labGamepad.unmount(stage)
        stage.dispose()
      },
    }
  }

  public ensureLabGamepad(): Promise<void> {
    return ensureLazyStage(this._labGamepadContract())
  }

  /** Invalidate any in-flight load and dispose the live object (final teardown). */
  public disposeLabGamepad(): void {
    disposeLazyStage(this._labGamepadContract())
  }

  /** Forward a live preference change to every mounted route stage. */
  public setReducedMotion(reduced: boolean): void {
    this.worksPlaneStage?.setReducedMotion(reduced)
    this.contactCyprusStage?.setReducedMotion(reduced)
    this.contactTypographyStage?.setReducedMotion(reduced)
    this.contactHaloStage?.setReducedMotion(reduced)
    this.manifestoInkStage?.setReducedMotion(reduced)
    // Lab object carries authored motion (optional contract) — settle it too.
    this.labGamepad?.setReducedMotion?.(reduced)
  }

  /** Final teardown: the six lazy-stage disposes in the legacy destroy order
   *  (works plane → typography → cyprus → halo → ink → lab). */
  public dispose(): void {
    this.disposeWorksPlaneStage()
    this.disposeContactTypographyStage()
    this.disposeContactCyprusStage()
    this.disposeContactHaloStage()
    this.disposeManifestoInkStage()
    this.disposeLabGamepad()
  }
}
