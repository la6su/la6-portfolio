// src/Experience/World/Lights.ts — Cinematic lights, junni changeSection() pattern.
//
// Junni architecture: each section defines its own light data (position,
// color, intensity). On section change, lights animate toward new targets.
// No warmth/scroll coupling — lights are section-driven, not scroll-driven.
//
// Per-section presets match WorldConfig fog/bg palette so the scene feels
// coherent: light color echoes the section's bg tint.

import * as THREE from 'three'
import type { PhaseConfig } from '../../core/WorldConfig'
import { prefersReducedMotion } from '../../core/motionPolicy'

export interface CinematicLightsNodes {
  group: THREE.Group
  key: THREE.DirectionalLight
  fill: THREE.DirectionalLight
  rim: THREE.DirectionalLight
  volumetric: THREE.PointLight
  hemisphere: THREE.HemisphereLight
}

// ── Per-section light preset ─────────────────────────────────────────────────
interface SectionLightPreset {
  keyColor: number
  keyIntensity: number
  keyPos: [number, number, number]
  fillColor: number
  fillIntensity: number
  rimColor: number
  rimIntensity: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  volumetricColor: number
  volumetricIntensity: number
}

// Presets keyed by PhaseConfig.id — must match WorldConfig RAW[i].id.
// Design intent: key light echoes section accent, fill/hemi give depth.
const SECTION_PRESETS: Record<string, SectionLightPreset> = {
  sec_intro: {
    keyColor: 0xffffff,
    // Moderate key light — gives glass cube a directional specular highlight
    // (the "light reacting" the cube was missing when all lights were 0.0).
    // 0.8 is bright enough for a visible highlight but not so bright it
    // creates a blown-out white dot. Combined with env map soft spot, the
    // cube now shows clear specular response to light direction.
    keyIntensity: 0.8,
    keyPos: [4, 6, 4],
    fillColor: 0xd0d8e8,
    fillIntensity: 0.3, // soft fill from opposite side — prevents flat look
    rimColor: 0xb0c0d8,
    rimIntensity: 0.6, // rim light defines cube edges (Fresnel-like edge brightness)
    hemiSky: 0xffffff,
    hemiGround: 0xe8e8e8,
    hemiIntensity: 0.2, // subtle ambient — lifts shadows without washing out
    volumetricColor: 0xffffff,
    volumetricIntensity: 0.0,
  },
  sec_about: {
    keyColor: 0x8899cc, // cool blue-grey — dark section
    keyIntensity: 1.6,
    keyPos: [-2, 4, 2],
    fillColor: 0x334466,
    fillIntensity: 0.4,
    rimColor: 0xaa88cc, // purple rim — adds depth on dark bg
    rimIntensity: 1.4,
    hemiSky: 0x080812,
    hemiGround: 0x000000,
    hemiIntensity: 0.3,
    volumetricColor: 0x6677bb,
    volumetricIntensity: 0.8,
  },
  sec_works: {
    keyColor: 0x4466aa, // blue gallery light — stage feel
    keyIntensity: 1.8,
    keyPos: [0, 5, 5],
    fillColor: 0x223355,
    fillIntensity: 0.3,
    rimColor: 0x5577cc,
    rimIntensity: 1.6, // strong rim for card edges
    hemiSky: 0x060810,
    hemiGround: 0x000000,
    hemiIntensity: 0.2,
    volumetricColor: 0x3355aa,
    volumetricIntensity: 1.0,
  },
  sec_contact: {
    keyColor: 0x556688, // muted blue — closing feel
    keyIntensity: 1.2,
    keyPos: [-3, 4, 2],
    fillColor: 0x223344,
    fillIntensity: 0.3,
    rimColor: 0x667799,
    rimIntensity: 1.0,
    hemiSky: 0x050507,
    hemiGround: 0x000000,
    hemiIntensity: 0.2,
    volumetricColor: 0x334455,
    volumetricIntensity: 0.4,
  },
}

// Fallback to sec_about for unknown sections
const DEFAULT_PRESET = SECTION_PRESETS['sec_about']!

/** The intro preset the declarative `CinematicLights.vue` binds as its
 *  initial attribute values — one source of truth for the authored numbers
 *  (the controller snaps the same preset on construction). */
export const CINEMATIC_INTRO_PRESET: Readonly<SectionLightPreset> = SECTION_PRESETS['sec_intro']!

export class CinematicLights {
  private _disposed = false
  private keyLight: THREE.DirectionalLight
  private fillLight: THREE.DirectionalLight
  private rimLight: THREE.DirectionalLight
  private volumetricLight: THREE.PointLight
  private hemiLight: THREE.HemisphereLight

  // Lerp targets — set by changeSection(), consumed by update()
  private _targetKeyColor = new THREE.Color()
  private _targetFillColor = new THREE.Color()
  private _targetRimColor = new THREE.Color()
  private _targetKeyPos = new THREE.Vector3()
  private _targetKeyIntensity = 1.8
  private _targetFillIntensity = 0.5
  private _targetRimIntensity = 1.2
  private _targetVolumetricIntensity = 0.6
  private _targetHemiIntensity = 0.3
  private _reducedMotionSettled = false
  private _reducedMotion = prefersReducedMotion()
  private _transitionActive = false
  // Speed multiplier for lerp — higher = faster transition (junni: ~0.5s)
  private static readonly LERP_SPEED = 3.0

  constructor(nodes: CinematicLightsNodes) {
    this.keyLight = nodes.key
    this.fillLight = nodes.fill
    this.rimLight = nodes.rim
    this.volumetricLight = nodes.volumetric
    this.hemiLight = nodes.hemisphere

    // Initialise targets from intro preset
    this._applyPresetToTargets(SECTION_PRESETS['sec_intro']!)
    // Snap immediately (no lerp on first frame)
    this._snapToTargets()
  }

  /**
   * Junni changeSection() pattern — set targets from PhaseConfig.
   * Lights will lerp smoothly toward the new values in update().
   * Called from Experience on init and on the frame path's section arrival.
   */
  public changeSection(config: PhaseConfig): void {
    if (this._disposed) return
    const preset = SECTION_PRESETS[config.id] ?? DEFAULT_PRESET
    this._applyPresetToTargets(preset)
    if (this._reducedMotion) {
      this._snapToTargets()
      this._reducedMotionSettled = true
      this._transitionActive = false
    } else {
      this._transitionActive = true
    }
  }

  /** Reconcile a live preference change without waiting for another frame. */
  public setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    this._reducedMotionSettled = reduced
    if (reduced) {
      this._snapToTargets()
      this._transitionActive = false
    }
  }

  /**
   * Per-frame smooth update — lerp all light properties toward targets.
   * Uses framerate-independent exponential decay (~0.5s transition).
   */
  public update(dt: number): void {
    if (this._disposed) return
    if (this._reducedMotion) {
      if (!this._reducedMotionSettled) {
        this._snapToTargets()
        this._reducedMotionSettled = true
      }
      return
    }
    this._reducedMotionSettled = false
    if (this._transitionActive) {
      const t = Math.min(dt * CinematicLights.LERP_SPEED, 1)

      // Colors
      this.keyLight.color.lerp(this._targetKeyColor, t)
      this.fillLight.color.lerp(this._targetFillColor, t)
      this.rimLight.color.lerp(this._targetRimColor, t)

      // Intensities
      this.keyLight.intensity += (this._targetKeyIntensity - this.keyLight.intensity) * t
      this.fillLight.intensity += (this._targetFillIntensity - this.fillLight.intensity) * t
      this.rimLight.intensity += (this._targetRimIntensity - this.rimLight.intensity) * t
      this.volumetricLight.intensity +=
        (this._targetVolumetricIntensity - this.volumetricLight.intensity) * t
      this.hemiLight.intensity += (this._targetHemiIntensity - this.hemiLight.intensity) * t

      // Key light position (lerp toward target — no alloc, uses lerp in-place)
      this.keyLight.position.lerp(this._targetKeyPos, t)

      if (this.isAtTargets()) {
        this._snapToTargets()
        this._transitionActive = false
      }
    }

    // Volumetric light: slow orbit for organic atmosphere
    // (frozen when prefers-reduced-motion — continuous orbit is a vestibular hazard)
    if (!this._reducedMotion) {
      const time = performance.now() * 0.0004
      this.volumetricLight.position.x = Math.sin(time) * 2.5
      this.volumetricLight.position.z = Math.cos(time) * 2.5
    }
  }

  public dispose(): void {
    if (this._disposed) return
    this._disposed = true
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _applyPresetToTargets(p: SectionLightPreset): void {
    this._targetKeyColor.setHex(p.keyColor)
    this._targetFillColor.setHex(p.fillColor)
    this._targetRimColor.setHex(p.rimColor)
    this._targetKeyPos.set(...p.keyPos)
    this._targetKeyIntensity = p.keyIntensity
    this._targetFillIntensity = p.fillIntensity
    this._targetRimIntensity = p.rimIntensity
    this._targetVolumetricIntensity = p.volumetricIntensity
    this._targetHemiIntensity = p.hemiIntensity
    // Hemisphere colors: update immediately (no lerp on hemi colors — minor visual)
    this.hemiLight.color.setHex(p.hemiSky)
    this.hemiLight.groundColor.setHex(p.hemiGround)
    // Volumetric color: update immediately
    this.volumetricLight.color.setHex(p.volumetricColor)
  }

  /** Snap all lights to current targets without lerp (used on init). */
  private _snapToTargets(): void {
    this.keyLight.color.copy(this._targetKeyColor)
    this.fillLight.color.copy(this._targetFillColor)
    this.rimLight.color.copy(this._targetRimColor)
    this.keyLight.position.copy(this._targetKeyPos)
    this.keyLight.intensity = this._targetKeyIntensity
    this.fillLight.intensity = this._targetFillIntensity
    this.rimLight.intensity = this._targetRimIntensity
    this.volumetricLight.intensity = this._targetVolumetricIntensity
    this.hemiLight.intensity = this._targetHemiIntensity
  }

  private isAtTargets(): boolean {
    return (
      Math.abs(this.keyLight.color.r - this._targetKeyColor.r) < 0.001 &&
      Math.abs(this.keyLight.color.g - this._targetKeyColor.g) < 0.001 &&
      Math.abs(this.keyLight.color.b - this._targetKeyColor.b) < 0.001 &&
      Math.abs(this.fillLight.color.r - this._targetFillColor.r) < 0.001 &&
      Math.abs(this.fillLight.color.g - this._targetFillColor.g) < 0.001 &&
      Math.abs(this.fillLight.color.b - this._targetFillColor.b) < 0.001 &&
      Math.abs(this.rimLight.color.r - this._targetRimColor.r) < 0.001 &&
      Math.abs(this.rimLight.color.g - this._targetRimColor.g) < 0.001 &&
      Math.abs(this.rimLight.color.b - this._targetRimColor.b) < 0.001 &&
      Math.abs(this.keyLight.intensity - this._targetKeyIntensity) < 0.001 &&
      Math.abs(this.fillLight.intensity - this._targetFillIntensity) < 0.001 &&
      Math.abs(this.rimLight.intensity - this._targetRimIntensity) < 0.001 &&
      Math.abs(this.volumetricLight.intensity - this._targetVolumetricIntensity) < 0.001 &&
      Math.abs(this.hemiLight.intensity - this._targetHemiIntensity) < 0.001 &&
      this.keyLight.position.distanceToSquared(this._targetKeyPos) < 0.000001
    )
  }
}
