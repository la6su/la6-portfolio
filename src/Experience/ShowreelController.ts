// src/Experience/ShowreelController.ts — the showreel render-mode owner.
//
// The showreel is a private render mode of the ONE renderer pipeline: while
// the theater is open, its private scene (one orthographic camera + one
// fullscreen quad) renders through the same renderer + post graph and the
// world simply skips a beat (see renderFrame). This controller owns the
// lazy theater creation (neither the video element nor its texture exist
// before the visitor asks for the showreel), the typed bus commands emitted
// by the Vue chrome (ShowreelConsole.vue), the reduced-motion forwarding and
// the terminal disposal. The frame path (Experience) asks it to render and
// falls back to the world scene when the theater does not own the frame.

import * as THREE from 'three'
import { eventBus } from '../core/EventBus'
import { ShowreelTheater } from './World/ShowreelTheater'

/** The frame-path render handoff (the Renderer wrapper's draw entry). */
interface ShowreelRenderer {
  update(scene: THREE.Scene, camera: THREE.Camera, dt: number): void
}

interface ShowreelControllerContext {
  /** Open requests after root teardown are ignored. */
  isDestroyed: () => boolean
  /** A theater created after a reduced-motion flip must match the state. */
  reducedMotion: () => boolean
  mountTheater: (theater: ShowreelTheater) => Promise<void>
  unmountTheater: (theater: ShowreelTheater) => Promise<void>
}

export class ShowreelController {
  private _theater: ShowreelTheater | null = null
  private _openUnsub: (() => void) | null = null
  private _closeUnsub: (() => void) | null = null
  private _togglePlayUnsub: (() => void) | null = null
  private _opening: Promise<ShowreelTheater | null> | null = null
  private _requestedOpen = false

  constructor(private readonly _ctx: ShowreelControllerContext) {}

  /** Install the showreel command subscriptions (idempotent timing: called
   *  once from Experience.init). */
  public bind(): void {
    this._openUnsub = eventBus.on('jlz:showreel-open', () => {
      if (this._ctx.isDestroyed()) return
      this._requestedOpen = true
      void this.ensure().then((theater) => {
        if (theater && this._requestedOpen && !this._ctx.isDestroyed()) theater.open()
      })
    })
    this._closeUnsub = eventBus.on('jlz:showreel-close', () => {
      this._requestedOpen = false
      this._theater?.close()
    })
    this._togglePlayUnsub = eventBus.on('jlz:showreel-toggle-play', () => {
      this._theater?.togglePlay()
    })
  }

  /** Lazily create the theater on the first open request. */
  private ensure(): Promise<ShowreelTheater | null> {
    if (this._opening) return this._opening
    if (this._theater) return Promise.resolve(this._theater)
    if (this._ctx.isDestroyed()) return Promise.resolve(null)
    const theater = new ShowreelTheater(
      '/assets/video/coming-soon.mp4',
      '/assets/video/coming-soon-cover.jpg',
    )
    theater.setReducedMotion(this._ctx.reducedMotion())
    this._theater = theater
    const opening = this._ctx
      .mountTheater(theater)
      .then(() => {
        if (this._ctx.isDestroyed() || this._theater !== theater) {
          return this._ctx.unmountTheater(theater).then(() => {
            theater.dispose()
            return null
          })
        }
        return theater
      })
      .catch(() => {
        if (this._theater === theater) this._theater = null
        theater.dispose()
        return null
      })
    this._opening = opening
    void opening.then(() => {
      if (this._opening === opening) this._opening = null
    })
    return opening
  }

  /** Per-frame activity flag for the demand snapshot. */
  public get isAnimating(): boolean {
    return this._theater?.isAnimating ?? false
  }

  /** Forward a live preference change to the mounted theater. */
  public setReducedMotion(reduced: boolean): void {
    this._theater?.setReducedMotion(reduced)
  }

  /** While the theater is open it OWNS the frame: its private scene renders
   *  through the same renderer + post pipeline and the world skips a beat,
   *  resuming unchanged on close. Returns false when the world should draw. */
  public renderFrame(renderer: ShowreelRenderer, dt: number, aspect: number): boolean {
    const theater = this._theater
    if (!theater || theater.currentPhase === 'closed') return false
    theater.update(dt, aspect)
    renderer.update(theater.scene, theater.camera, dt)
    return true
  }

  /** Unsubscribe the commands and dispose the theater (video element, its
   *  texture and the quad die here). */
  public dispose(): Promise<void> {
    this._requestedOpen = false
    if (this._openUnsub) {
      this._openUnsub()
      this._openUnsub = null
    }
    if (this._closeUnsub) {
      this._closeUnsub()
      this._closeUnsub = null
    }
    if (this._togglePlayUnsub) {
      this._togglePlayUnsub()
      this._togglePlayUnsub = null
    }
    const theater = this._theater
    this._theater = null
    const opening = this._opening
    this._opening = null
    if (!theater) return Promise.resolve()

    // Retire media textures before Experience's deferred renderer disposal.
    // The scene loop is already stopped; Tres still owns and will unmount the
    // portal quad through its declarative stage slot.
    theater.dispose()
    let unmount: Promise<void>
    try {
      unmount = this._ctx.unmountTheater(theater)
    } catch (error) {
      return Promise.reject(error)
    }

    // If mount was still settling, ensure() also observes the retired owner
    // and completes its stale-stage release. Await both paths before the host
    // unmounts and disposes the backend.
    return Promise.all([unmount, opening?.catch(() => null)]).then(() => undefined)
  }
}
