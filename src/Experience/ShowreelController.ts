// src/Experience/ShowreelController.ts — the showreel render-mode owner.
//
// The showreel is a private render mode of the ONE renderer pipeline: while
// the theater is open, its private scene (one orthographic camera + one
// fullscreen quad) renders through the same renderer + post graph and the
// world simply skips a beat (see renderFrame). This controller owns the
// lazy theater creation (neither the video element nor its texture exist
// before the visitor asks for the showreel), the typed bus commands emitted
// by the DOM chrome (ShowreelConsole), the reduced-motion forwarding and
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
}

export class ShowreelController {
  private _theater: ShowreelTheater | null = null
  private _openUnsub: (() => void) | null = null
  private _closeUnsub: (() => void) | null = null
  private _togglePlayUnsub: (() => void) | null = null

  constructor(private readonly _ctx: ShowreelControllerContext) {}

  /** Install the showreel command subscriptions (idempotent timing: called
   *  once from Experience.init). */
  public bind(): void {
    this._openUnsub = eventBus.on('jlz:showreel-open', () => {
      if (this._ctx.isDestroyed()) return
      this.ensure()
      this._theater?.open()
    })
    this._closeUnsub = eventBus.on('jlz:showreel-close', () => {
      this._theater?.close()
    })
    this._togglePlayUnsub = eventBus.on('jlz:showreel-toggle-play', () => {
      this._theater?.togglePlay()
    })
  }

  /** Lazily create the theater on the first open request. */
  private ensure(): void {
    if (this._theater || this._ctx.isDestroyed()) return
    this._theater = new ShowreelTheater(
      '/assets/video/coming-soon.mp4',
      '/assets/video/coming-soon-cover.jpg',
    )
    this._theater.setReducedMotion(this._ctx.reducedMotion())
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
  public dispose(): void {
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
    this._theater?.dispose()
    this._theater = null
  }
}
