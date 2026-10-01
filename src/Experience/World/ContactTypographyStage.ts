// ContactTypographyStage — lazy owner for the decorative Contact greeting.
// The implementation import is intentionally kept behind Experience's route
// dynamic import so FontLoader/TextGeometry do not enter the shared scene graph.

import * as THREE from 'three'
import { WireframeTypography } from './WireframeTypography'
import { prefersReducedMotion } from '../../core/motionPolicy'

export type ContactTypographyPublisher = (
  typography: WireframeTypography | null,
) => void | Promise<void>

/** Route behavior controller for the Vue-owned Contact greeting root. */
export class ContactTypographyStage {
  private readonly typography = new WireframeTypography('HELLO', 0.34)
  private root: THREE.Group | null = null
  private publishTypography: ContactTypographyPublisher | null = null
  private active = false
  private disposed = false
  private reducedMotion = prefersReducedMotion()

  get visible(): boolean {
    return this.root?.visible ?? false
  }

  bindRoot(root: THREE.Group, publishTypography: ContactTypographyPublisher): void {
    if (this.disposed) return
    this.root = root
    this.publishTypography = publishTypography
    root.name = 'contact-typography-stage'
    root.visible = this.active
    void publishTypography(this.typography)
  }

  unbindRoot(root: THREE.Group): void {
    if (this.root !== root) return
    this.publishTypography?.(null)
    this.publishTypography = null
    this.root = null
  }

  get isAnimating(): boolean {
    // The authored glyphs keep bobbing after the reveal settles, so this
    // remains an ambient-motion signal rather than only a reveal signal.
    return !this.disposed && this.active && !this.reducedMotion
  }

  setActive(active: boolean): void {
    if (this.disposed) return
    this.active = active
    if (this.root) this.root.visible = active
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
    this.publishTypography?.(null)
    this.publishTypography = null
    if (this.root) this.root.visible = false
    this.typography.dispose()
    this.root = null
  }
}
