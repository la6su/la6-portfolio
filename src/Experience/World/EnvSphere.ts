// EnvSphere.ts — shared rounded pavilion background.
//
// The public name is retained because it is the runtime's ambient owner. Its
// geometry is no longer a horizonless sphere: four soft structural planes make
// a room around the scene while the contact ground remains a separate owner.
// This keeps the six-state and WebGPU/WebGL contracts unchanged.

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { prefersReducedMotion } from '../../core/motionPolicy'

interface SectionPattern {
  dark: number
  light: number
}

// Six material tones within one cool console world. The route has a local
// temperature, but never becomes a rainbow of unrelated scenes.
const SECTION_PATTERNS: readonly SectionPattern[] = [
  { dark: 0x0b1017, light: 0xe9eef5 }, // lab
  { dark: 0x0b0e14, light: 0xe9eef5 }, // intro
  { dark: 0x0c1119, light: 0xe4ebf3 }, // about
  { dark: 0x0b1018, light: 0xe9eef5 }, // works
  { dark: 0x0a1118, light: 0xe3ecf3 }, // contact
  { dark: 0x0b0e14, light: 0xe9eef5 }, // menu
]

const PAVILION_WIDTH = 66
const PAVILION_HEIGHT = 42
const PAVILION_DEPTH = 42
const PAVILION_EDGE = 3.2
const PAVILION_SEGMENTS = 6
const PAVILION_THICKNESS = 6

/**
 * Shared ambient room. The retained EnvSphere name keeps the theme/event
 * boundary stable while the implementation supplies a rounded pavilion.
 */
export class EnvSphere extends THREE.Group {
  private _disposed = false
  private _sectionWeights: number[] = [0, 1, 0, 0, 0, 0]
  private _targetWeights: number[] = [0, 1, 0, 0, 0, 0]
  private _isLight = false
  private _reducedMotion = prefersReducedMotion()
  private readonly _backMaterial: THREE.MeshBasicMaterial
  private readonly _leftMaterial: THREE.MeshBasicMaterial
  private readonly _rightMaterial: THREE.MeshBasicMaterial
  private readonly _ceilingMaterial: THREE.MeshBasicMaterial
  private readonly _floorMaterial: THREE.MeshBasicMaterial
  private readonly _skyMaterial: THREE.MeshBasicMaterial
  private readonly _backColor = new THREE.Color()
  private readonly _leftColor = new THREE.Color()
  private readonly _rightColor = new THREE.Color()
  private readonly _ceilingColor = new THREE.Color()
  private readonly _floorColor = new THREE.Color()
  private readonly _skyColor = new THREE.Color()
  private readonly _targetColor = new THREE.Color()
  private readonly _sampleColor = new THREE.Color()
  private readonly _leftTargetColor = new THREE.Color()
  private readonly _rightTargetColor = new THREE.Color()
  private readonly _ceilingTargetColor = new THREE.Color()
  private readonly _floorTargetColor = new THREE.Color()
  private readonly _skyTargetColor = new THREE.Color()
  private readonly _geometries: THREE.BufferGeometry[] = []
  private _dirty = true

  constructor() {
    super()
    this.name = 'env-pavilion'
    this.frustumCulled = false
    this.renderOrder = -1000

    this._backMaterial = this._material()
    this._leftMaterial = this._material()
    this._rightMaterial = this._material()
    this._ceilingMaterial = this._material()
    this._floorMaterial = this._material()
    this._skyMaterial = this._material()

    this._addPlane(
      'pavilion-back',
      PAVILION_WIDTH,
      PAVILION_HEIGHT,
      PAVILION_THICKNESS,
      0,
      0,
      -PAVILION_DEPTH - PAVILION_THICKNESS / 2,
      this._backMaterial,
    )
    this._addPlane(
      'pavilion-left',
      PAVILION_THICKNESS,
      PAVILION_HEIGHT,
      PAVILION_DEPTH,
      -PAVILION_WIDTH / 2 - PAVILION_THICKNESS / 2,
      0,
      -PAVILION_DEPTH / 2,
      this._leftMaterial,
    )
    this._addPlane(
      'pavilion-right',
      PAVILION_THICKNESS,
      PAVILION_HEIGHT,
      PAVILION_DEPTH,
      PAVILION_WIDTH / 2 + PAVILION_THICKNESS / 2,
      0,
      -PAVILION_DEPTH / 2,
      this._rightMaterial,
    )
    this._addPlane(
      'pavilion-ceiling',
      PAVILION_WIDTH,
      PAVILION_THICKNESS,
      PAVILION_DEPTH,
      0,
      PAVILION_HEIGHT / 2 + PAVILION_THICKNESS / 2,
      -PAVILION_DEPTH / 2,
      this._ceilingMaterial,
    )
    this._addPlane(
      'pavilion-floor',
      PAVILION_WIDTH,
      PAVILION_THICKNESS,
      PAVILION_DEPTH,
      0,
      -PAVILION_HEIGHT / 2 - PAVILION_THICKNESS / 2,
      -PAVILION_DEPTH / 2,
      this._floorMaterial,
    )

    this._applyColor(true)
  }

  /** Borrowed by EnvSky when the persistent Tres host owns its geometry. */
  get skyMaterial(): THREE.MeshBasicMaterial {
    return this._skyMaterial
  }

  changeSection(idx: number, isLight: boolean): void {
    if (this._disposed) return
    if (idx < 0 || idx >= SECTION_PATTERNS.length) return
    if (this._reducedMotion) {
      this.snapToSection(idx, isLight)
      return
    }
    this._targetWeights.fill(0)
    this._targetWeights[idx] = 1
    this._isLight = isLight
    this._dirty = true
  }

  snapToSection(idx: number, isLight: boolean): void {
    if (this._disposed) return
    if (idx < 0 || idx >= SECTION_PATTERNS.length) return
    this._sectionWeights.fill(0)
    this._sectionWeights[idx] = 1
    for (let i = 0; i < this._sectionWeights.length; i++) {
      this._targetWeights[i] = this._sectionWeights[i]!
    }
    this._isLight = isLight
    this._applyColor(true)
  }

  /** Settle an active palette crossfade synchronously on a live policy change. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    if (!reduced) return
    for (let i = 0; i < this._targetWeights.length; i++) {
      this._sectionWeights[i] = this._targetWeights[i]!
    }
    this._applyColor(true)
  }

  /** True while a normal-motion palette crossfade still needs frames. */
  get isAnimating(): boolean {
    if (this._disposed || this._reducedMotion) return false
    for (let i = 0; i < this._targetWeights.length; i++) {
      if (this._sectionWeights[i] !== this._targetWeights[i]) return true
    }
    return false
  }

  update(dt: number): void {
    if (this._disposed) return
    for (let i = 0; i < SECTION_PATTERNS.length; i++) {
      const diff = this._targetWeights[i]! - this._sectionWeights[i]!
      if (Math.abs(diff) > 0.001) {
        this._sectionWeights[i]! += diff * Math.min(1, dt * 3)
        this._dirty = true
      } else if (this._sectionWeights[i] !== this._targetWeights[i]) {
        this._sectionWeights[i] = this._targetWeights[i]!
        this._dirty = true
      }
    }

    if (this._dirty) this._applyColor(false)
  }

  private _material(): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color: 0x0c0b0a, fog: false, side: THREE.FrontSide })
  }

  private _addPlane(
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.MeshBasicMaterial,
  ): void {
    const geometry = new RoundedBoxGeometry(width, height, depth, PAVILION_SEGMENTS, PAVILION_EDGE)
    this._geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.position.set(x, y, z)
    mesh.renderOrder = -1000
    mesh.frustumCulled = false
    this.add(mesh)
  }

  private _applyColor(snap: boolean): void {
    this._targetColor.setRGB(0, 0, 0)
    for (let i = 0; i < SECTION_PATTERNS.length; i++) {
      const weight = this._sectionWeights[i]!
      if (weight <= 0) continue
      const hex = this._isLight ? SECTION_PATTERNS[i]!.light : SECTION_PATTERNS[i]!.dark
      this._sampleColor.setHex(hex)
      this._targetColor.r += this._sampleColor.r * weight
      this._targetColor.g += this._sampleColor.g * weight
      this._targetColor.b += this._sampleColor.b * weight
    }

    const blend = snap ? 1 : 0.22
    this._backColor.lerp(this._targetColor, blend)
    this._leftTargetColor.copy(this._targetColor).multiplyScalar(0.88)
    this._rightTargetColor.copy(this._targetColor).multiplyScalar(0.94)
    this._ceilingTargetColor.copy(this._targetColor).multiplyScalar(0.82)
    this._floorTargetColor.copy(this._targetColor).multiplyScalar(0.78)
    this._skyTargetColor.copy(this._targetColor).multiplyScalar(0.96)
    this._leftColor.lerp(this._leftTargetColor, blend)
    this._rightColor.lerp(this._rightTargetColor, blend)
    this._ceilingColor.lerp(this._ceilingTargetColor, blend)
    this._floorColor.lerp(this._floorTargetColor, blend)
    this._skyColor.lerp(this._skyTargetColor, blend)
    this._backMaterial.color.copy(this._backColor)
    this._leftMaterial.color.copy(this._leftColor)
    this._rightMaterial.color.copy(this._rightColor)
    this._ceilingMaterial.color.copy(this._ceilingColor)
    this._floorMaterial.color.copy(this._floorColor)
    this._skyMaterial.color.copy(this._skyColor)
    this._dirty = false
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this.removeFromParent()
    this._geometries.forEach((geometry) => geometry.dispose())
    this._backMaterial.dispose()
    this._leftMaterial.dispose()
    this._rightMaterial.dispose()
    this._ceilingMaterial.dispose()
    this._floorMaterial.dispose()
    this._skyMaterial.dispose()
    this.clear()
  }
}
