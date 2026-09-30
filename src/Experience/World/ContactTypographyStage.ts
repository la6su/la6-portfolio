// ContactTypographyStage — lazy owner for the decorative Contact greeting.
// The implementation import is intentionally kept behind Experience's route
// dynamic import so FontLoader/TextGeometry do not enter the shared scene graph.

import * as THREE from 'three'
import { WireframeTypography } from './WireframeTypography'
import { prefersReducedMotion } from '../../core/motionPolicy'
import { keepSceneObjectVisible } from '../sceneRuntimeState'

export class ContactTypographyStage extends THREE.Group {
  private readonly typography = new WireframeTypography('HELLO', 0.34)
  private active = false
  private disposed = false
  private reducedMotion = prefersReducedMotion()

  constructor() {
    super()
    this.name = 'contact-typography-stage'
    keepSceneObjectVisible(this.typography)
    this.typography.position.set(-0.15, 0.35, -2.4)
    this.add(this.typography)
    this.visible = false
  }

  get isAnimating(): boolean {
    // The authored glyphs keep bobbing after the reveal settles, so this
    // remains an ambient-motion signal rather than only a reveal signal.
    return !this.disposed && this.active && !this.reducedMotion
  }

  setActive(active: boolean): void {
    if (this.disposed) return
    this.active = active
    this.visible = active
    this.typography.setReducedMotion(this.reducedMotion)
    this.typography.setActive(active)
  }

  /** Forward a live preference change to the already-mounted glyph owner. */
  setReducedMotion(reduced: boolean): void {
    if (this.disposed) return
    this.reducedMotion = reduced
    this.typography.setReducedMotion(reduced)
  }

  setTheme(isLight: boolean): void {
    if (this.disposed) return
    this.typography.setTheme(isLight)
  }

  update(dt: number): void {
    if (!this.disposed && this.active) this.typography.update(dt)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.active = false
    this.typography.dispose()
    this.removeFromParent()
  }
}
