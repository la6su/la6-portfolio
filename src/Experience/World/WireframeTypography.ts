// WireframeTypography.ts — floating 3D signal lettering with backend parity.
//
// Every glyph is its own mesh, so the word can breathe as a small flock rather
// than as one rigid slab. Motion is CPU-side transforms only: this avoids a
// second renderer-specific shader path while keeping WebGPU and WebGL2 aligned.

import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import fontJson from '../../assets/fonts/comfortaa_bold_subset.typeface.json'
import { easeOutCubic } from '../../Utils/easing'

const bubbleFont = new FontLoader().parse(fontJson as never)

export interface TypographyGlyph {
  geometry: THREE.BufferGeometry
  x: number
  phase: number
}

export class WireframeTypography {
  private time = 0
  private revealElapsed = 0
  private revealProgress = 0
  private active = false
  private reducedMotion = false
  private disposed = false
  private glyphs: TypographyGlyph[] = []
  private meshes: THREE.Mesh[] = []
  readonly material = new THREE.MeshPhysicalMaterial({
    color: 0xf4efff,
    emissive: 0x08050c,
    emissiveIntensity: 0.05,
    roughness: 0.28,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.1,
    fog: false,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  })

  constructor(text: string = 'ABOUT', size: number = 0.6) {
    const geometries = [...text].map((letter) => this.createGlyph(letter, size))
    const spacing = size * 0.075
    const widths = geometries.map((geometry) => {
      geometry.computeBoundingBox()
      const box = geometry.boundingBox
      return box ? box.max.x - box.min.x : 0
    })
    const totalWidth = widths.reduce((sum, width) => sum + width, 0) + spacing * (text.length - 1)
    let cursor = -totalWidth / 2

    geometries.forEach((geometry, index) => {
      const width = widths[index] ?? 0
      geometry.center()
      const x = cursor + width / 2
      this.glyphs.push({ geometry, x, phase: index * 1.71 })
      cursor += width + spacing
    })
  }

  get renderGlyphs(): readonly TypographyGlyph[] {
    return this.glyphs
  }

  bindMeshes(meshes: readonly THREE.Mesh[]): void {
    if (this.disposed) return
    if (meshes.length !== this.glyphs.length) {
      throw new Error('Wireframe typography must bind one Vue mesh per glyph.')
    }
    this.meshes = [...meshes]
    this.meshes.forEach((mesh, index) => {
      mesh.frustumCulled = false
      mesh.position.set(this.glyphs[index]!.x, 0, 0)
      mesh.scale.setScalar(0)
    })
    if (this.active && this.reducedMotion) this.settleReducedMotion()
  }

  unbindMeshes(meshes: readonly THREE.Mesh[]): void {
    if (this.meshes.length !== meshes.length || this.meshes.some((mesh, index) => mesh !== meshes[index])) {
      return
    }
    this.meshes = []
  }

  private createGlyph(letter: string, size: number): THREE.BufferGeometry {
    const geometry = new TextGeometry(letter, {
      font: bubbleFont,
      size,
      depth: 0.16,
      curveSegments: 8,
      bevelEnabled: true,
      bevelThickness: 0.028,
      bevelSize: 0.024,
      bevelSegments: 3,
    })
    return geometry
  }

  /** Keep the opaque bubble letters legible on either UI theme. */
  setTheme(isLight: boolean): void {
    if (this.disposed) return
    this.material.color.setHex(isLight ? 0x233329 : 0xdfffe9)
    this.material.emissive.setHex(isLight ? 0x020403 : 0x06100b)
    this.material.emissiveIntensity = isLight ? 0.015 : 0.035
  }

  /** Reveal only after the lower contact frame has settled into view. */
  setActive(active: boolean): void {
    if (this.disposed) return
    if (this.active === active) return
    this.active = active
    this.revealElapsed = 0
    this.revealProgress = 0
    if (!active) {
      for (const mesh of this.meshes) mesh.scale.setScalar(0)
    } else if (this.reducedMotion) {
      this.settleReducedMotion()
    }
  }

  /** Apply a live preference change without requiring a route reactivation. */
  setReducedMotion(reduced: boolean): void {
    if (this.disposed) return
    this.reducedMotion = reduced
    if (reduced && this.active) this.settleReducedMotion()
  }

  get isAnimating(): boolean {
    return !this.disposed && this.active && this.revealProgress < 1
  }

  update(dt: number): void {
    if (this.disposed) return
    this.time += dt
    if (!this.active) return

    if (this.reducedMotion) {
      this.settleReducedMotion()
      return
    }

    this.revealElapsed += dt
    const revealDelay = 0.72
    const revealDuration = 0.72
    this.revealProgress = easeOutCubic((this.revealElapsed - revealDelay) / revealDuration)
    for (const [index, { x, phase }] of this.glyphs.entries()) {
      const mesh = this.meshes[index]
      if (!mesh) continue
      const bob = Math.sin(this.time * 1.05 + phase)
      const sway = Math.sin(this.time * 0.62 + phase * 1.3)
      const breathe = (1 + Math.sin(this.time * 1.3 + phase) * 0.06) * this.revealProgress
      mesh.position.set(x + sway * 0.04, bob * 0.08, sway * 0.08)
      mesh.rotation.set(
        bob * 0.06 + (1 - this.revealProgress) * 0.28,
        sway * 0.09,
        bob * 0.1 + (1 - this.revealProgress) * (phase % 2 ? -0.2 : 0.2),
      )
      mesh.scale.set(breathe, breathe * (1 - bob * 0.025), breathe)
    }
  }

  private settleReducedMotion(): void {
    this.revealProgress = 1
    for (const [index, { x }] of this.glyphs.entries()) {
      const mesh = this.meshes[index]
      if (!mesh) continue
      mesh.position.set(x, 0, 0)
      mesh.rotation.set(0, 0, 0)
      mesh.scale.setScalar(1)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.active = false
    for (const { geometry } of this.glyphs) geometry.dispose()
    this.material.dispose()
    this.glyphs = []
    this.meshes = []
  }
}
