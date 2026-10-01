// src/Experience/StageRegistry.ts — the route-owned lazy-stage registry.
//
// Six route-owned stages (works plane, contact typography/halo/cyprus,
// manifesto ink, lab object) share LazyStage's lifecycle. The registry holds
// their slots and route-specific contracts. Experience and ExperienceUI use
// this owner directly through the UI host's typed getter.
//
// Every stage mounts through the declarative host ports (SceneStagePorts) —
// no runtime `scene.add`. Contact polarity comes from Experience's theme
// listener; the Cyprus target state belongs to this route-stage owner.

import type { Camera } from 'three'
import type { PageId } from '../core/routeManifest'
import type { SceneStagePorts } from '../app/sceneHost'
import {
  createLazyStageOwner,
  createImportedLazyStage,
  disposeLazyStage,
  ensureLazyStage,
  type LazyStageContract,
} from './LazyStage'
import type { WorksPlaneStage } from './World/WorksPlaneStage'
import type { ContactTypographyStage } from './World/ContactTypographyStage'
import type { ContactHaloStage } from './World/ContactHaloStage'
import type { ManifestoInkStage } from './World/ManifestoInkStage'
import type { ContactCyprusStage } from './World/ContactCyprusStage'
import { getLabExperiment, type LabExperimentObject } from './Lab/manifest'

/** Live policy is read at create/configure time; stable Tres ports and camera
 *  are passed directly because their identity does not change across routes. */
interface StageRegistryContext {
  currentPage: () => PageId
  camera: Camera
  host: SceneStagePorts
  /** The effective text polarity resolved by ContentReveal. */
  isContactLight: () => boolean
  reducedMotion: () => boolean
  /** Route-visual reconciliation after a late Cyprus activation. */
  syncRouteVisuals: () => void
}

export class StageRegistry {
  /** Whether the Agros frame currently replaces the shared contact cube. */
  private _cyprusActive = false

  /** Stable lifecycle state for each independently lazy route stage. */
  readonly owners = {
    worksPlane: createLazyStageOwner<WorksPlaneStage>(),
    contactTypography: createLazyStageOwner<ContactTypographyStage>(),
    contactCyprus: createLazyStageOwner<ContactCyprusStage>(),
    contactHalo: createLazyStageOwner<ContactHaloStage>(),
    manifestoInk: createLazyStageOwner<ManifestoInkStage>(),
    labGamepad: createLazyStageOwner<LabExperimentObject>(),
  }

  constructor(private readonly _ctx: StageRegistryContext) {}

  /** Current stage references, or null until creation / after disposal. */
  public get worksPlaneStage(): WorksPlaneStage | null {
    return this.owners.worksPlane.stage
  }
  public get contactTypographyStage(): ContactTypographyStage | null {
    return this.owners.contactTypography.stage
  }
  public get contactCyprusStage(): ContactCyprusStage | null {
    return this.owners.contactCyprus.stage
  }
  public get contactHaloStage(): ContactHaloStage | null {
    return this.owners.contactHalo.stage
  }
  public get manifestoInkStage(): ManifestoInkStage | null {
    return this.owners.manifestoInk.stage
  }
  public get labGamepad(): LabExperimentObject | null {
    return this.owners.labGamepad.stage
  }

  /** Lazily create rich `/works` media only on that route, never on first
   *  paint. The lifecycle flow (request guard, memoization, stale release)
   *  lives in LazyStage.ts; only the stage-specific wiring stays here. */
  private _worksPlaneStageContract(): LazyStageContract<WorksPlaneStage> {
    return {
      label: 'WorksPlaneStage',
      owner: this.owners.worksPlane,
      create: createImportedLazyStage(
        () => import('./World/WorksPlaneStage'),
        ({ WorksPlaneStage }) => WorksPlaneStage,
      ),
      attach: (stage) => this._ctx.host.works.mountStage(stage),
      load: async (stage, isCurrent) => {
        await stage.init()
        if (!isCurrent()) return
        await stage.waitForCards()
        if (!isCurrent()) return
        const installation = stage.installationOwner
        if (installation) await this._ctx.host.works.mountInstallation(stage, installation)
      },
      configure: (stage) => {
        stage.setActive(this._ctx.currentPage() === 'works', 0)
        stage.resize(window.innerWidth, window.innerHeight)
        stage.setCamera(this._ctx.camera)
      },
      release: async (stage) => {
        const installation = stage.installationOwner
        if (installation) {
          await this._ctx.host.works.unmountInstallation(stage, installation)
        }
        await this._ctx.host.works.unmountStage(stage)
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
  public disposeWorksPlaneStage(): Promise<void> {
    return disposeLazyStage(this._worksPlaneStageContract())
  }

  /** Lazily create the Contact greeting so FontLoader/TextGeometry stay out
   * of the shared initial scene graph. Lifecycle flow: LazyStage.ts. */
  private _contactTypographyStageContract(): LazyStageContract<ContactTypographyStage> {
    return {
      label: 'ContactTypographyStage',
      owner: this.owners.contactTypography,
      create: createImportedLazyStage(
        () => import('./World/ContactTypographyStage'),
        ({ ContactTypographyStage }) => ContactTypographyStage,
      ),
      attach: (stage) => this._ctx.host.contactTypography.mount(stage),
      configure: (stage) => {
        stage.setActive(this._ctx.currentPage() === 'contact')
        stage.setTheme(this._ctx.isContactLight())
      },
      release: async (stage) => {
        await this._ctx.host.contactTypography.unmount(stage)
        // The Vue owner removes its declared root; the controller disposes
        // only the dynamically generated glyph geometry and shared material.
        stage.dispose()
      },
    }
  }

  public ensureContactTypographyStageInitialized(): Promise<void> {
    return ensureLazyStage(this._contactTypographyStageContract())
  }

  public disposeContactTypographyStage(): Promise<void> {
    return disposeLazyStage(this._contactTypographyStageContract())
  }

  /** Lazily load the Contact ink halo so the TSL graph stays out of the
   * shared initial scene graph. Lifecycle flow: LazyStage.ts. */
  private _contactHaloStageContract(): LazyStageContract<ContactHaloStage> {
    return {
      label: 'ContactHaloStage',
      owner: this.owners.contactHalo,
      create: createImportedLazyStage(
        () => import('./World/ContactHaloStage'),
        ({ ContactHaloStage }) => ContactHaloStage,
      ),
      attach: (stage) => this._ctx.host.contactHalo.mount(stage),
      configure: (stage) => {
        stage.setTheme(this._ctx.isContactLight())
        stage.setReducedMotion(this._ctx.reducedMotion())
        stage.setActive(this._ctx.currentPage() === 'contact')
      },
      release: async (stage) => {
        await this._ctx.host.contactHalo.unmount(stage)
        // Vue removes the declared root/mesh; dispose retires the TSL
        // material and this owner's shared geometry lease.
        stage.dispose()
      },
    }
  }

  public ensureContactHaloStageInitialized(): Promise<void> {
    return ensureLazyStage(this._contactHaloStageContract())
  }

  public disposeContactHaloStage(): Promise<void> {
    return disposeLazyStage(this._contactHaloStageContract())
  }

  /** Lazily load the /manifesto ink wash so the TSL graph stays out of the
   *  shared initial scene graph (same contract as the contact halo).
   *  Lifecycle flow: LazyStage.ts. */
  private _manifestoInkStageContract(): LazyStageContract<ManifestoInkStage> {
    return {
      label: 'ManifestoInkStage',
      owner: this.owners.manifestoInk,
      create: createImportedLazyStage(
        () => import('./World/ManifestoInkStage'),
        ({ ManifestoInkStage }) => ManifestoInkStage,
      ),
      attach: (stage) => this._ctx.host.manifestoInk.mount(stage),
      configure: (stage) => {
        // The effective-polarity cache is refreshed on every theme event
        // regardless of route, so a lazy stage cannot miss the current ink.
        stage.setTheme(this._ctx.isContactLight())
        stage.setReducedMotion(this._ctx.reducedMotion())
        stage.setActive(this._ctx.currentPage() === 'manifesto')
      },
      release: async (stage) => {
        await this._ctx.host.manifestoInk.unmount(stage)
        // Vue removes the declared root/mesh; dispose retires the TSL
        // material and this owner's shared geometry lease.
        stage.dispose()
      },
    }
  }

  public ensureManifestoInkStageInitialized(): Promise<void> {
    return ensureLazyStage(this._manifestoInkStageContract())
  }

  public disposeManifestoInkStage(): Promise<void> {
    return disposeLazyStage(this._manifestoInkStageContract())
  }

  /** Lazily load the Contact location asset instead of keeping it in the home
   *  scene. Lifecycle flow: LazyStage.ts. */
  private _contactCyprusStageContract(): LazyStageContract<ContactCyprusStage> {
    return {
      label: 'ContactCyprusStage',
      owner: this.owners.contactCyprus,
      create: createImportedLazyStage(
        () => import('./World/ContactCyprusStage'),
        ({ ContactCyprusStage }) => ContactCyprusStage,
      ),
      attach: (stage) => this._ctx.host.contactCyprus.mount(stage),
      load: (stage) => stage.load(),
      configure: (stage) => {
        stage.resize(window.innerWidth, window.innerHeight)
        stage.setCamera(this._ctx.camera)
        stage.setActive(this._ctx.currentPage() === 'contact' && this._cyprusActive)
        stage.prewarm()
      },
      release: async (stage) => {
        await this._ctx.host.contactCyprus.unmount(stage)
        stage.dispose()
      },
      onDispose: () => {
        this._cyprusActive = false
      },
    }
  }

  public ensureContactCyprusStageInitialized(): Promise<void> {
    return ensureLazyStage(this._contactCyprusStageContract())
  }

  public disposeContactCyprusStage(): Promise<void> {
    return disposeLazyStage(this._contactCyprusStageContract())
  }

  /** Frame 03 replaces the shared cube with the Cyprus asset. */
  public setContactCyprusStageSection(index: number): void {
    this._cyprusActive = this._ctx.currentPage() === 'contact' && index === 2
    const stage = this.owners.contactCyprus.stage
    stage?.setActive(this._cyprusActive)
    if (this._cyprusActive && !stage) {
      const initialization = this.ensureContactCyprusStageInitialized()
      const request = this.owners.contactCyprus.request
      void initialization.then(() => {
        if (request !== this.owners.contactCyprus.request || !this._cyprusActive) return
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
      owner: this.owners.labGamepad,
      create: () => {
        const experiment = getLabExperiment('lab')
        // No isCurrent guard on the resolved object: the manifest load may
        // have already constructed it, so a retired request must fall through
        // to the LazyStage stale check, which releases the late result
        // (dispose) instead of silently dropping it.
        return experiment ? experiment.load() : Promise.resolve(null)
      },
      attach: (stage) => this._ctx.host.labGamepad.mount(stage),
      configure: (stage) => {
        stage.visible = this._ctx.currentPage() === 'lab'
      },
      release: async (stage) => {
        await this._ctx.host.labGamepad.unmount(stage)
        stage.dispose()
      },
    }
  }

  public ensureLabGamepad(): Promise<void> {
    return ensureLazyStage(this._labGamepadContract())
  }

  /** Invalidate any in-flight load and dispose the live object (final teardown). */
  public disposeLabGamepad(): Promise<void> {
    return disposeLazyStage(this._labGamepadContract())
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

  /** Final teardown waits for every route-stage owner to detach and release. */
  public dispose(): Promise<void> {
    return Promise.all([
      this.disposeWorksPlaneStage(),
      this.disposeContactTypographyStage(),
      this.disposeContactCyprusStage(),
      this.disposeContactHaloStage(),
      this.disposeManifestoInkStage(),
      this.disposeLabGamepad(),
    ]).then(() => undefined)
  }
}
