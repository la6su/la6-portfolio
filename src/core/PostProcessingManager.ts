// src/core/PostProcessingManager.ts
// Section-aware post-processing controller with quality tiers + crossfade.

import { DeviceCapability } from './DeviceCapability'
import type { QualityTier } from './DeviceCapability'
import type { PostParams } from './postParams'
import { NEUTRAL_GRADE } from './postParams'
import { lerp } from '../Utils/easing'

/**
 * The section-authored subset of the canonical PostParams: the four intensity
 * channels are always authored; the look channels may be omitted (they then
 * default to neutral/off in applyPreset). Bloom's blur shape is NOT authored
 * here — it is renderer-specific (see PHASE_BLOOM_SHAPES).
 */
export type SectionPostParams = Pick<PostParams, 'bloom' | 'vignette' | 'grain' | 'chromatic'> &
  Partial<Pick<PostParams, 'refract' | 'border' | 'gradeShadows' | 'gradeHighlights'>>

interface BloomShape {
  bloomRadius: number
  bloomThreshold: number
}

// Bloom's blur shape is renderer-specific implementation detail. All visible
// section intensities come from WorldConfig via applyPreset(..., cfg.post).
const PHASE_BLOOM_SHAPES: Record<string, BloomShape> = {
  sec_lab: {
    bloomRadius: 0.5,
    bloomThreshold: 0.55,
  },
  sec_intro: {
    bloomRadius: 0.5,
    bloomThreshold: 0.55,
  },
  sec_about: {
    bloomRadius: 0.65,
    bloomThreshold: 0.4,
  },
  sec_works: {
    bloomRadius: 0.55,
    bloomThreshold: 0.45,
  },
  sec_contact: {
    bloomRadius: 0.5,
    bloomThreshold: 0.5,
  },
  sec_menu: {
    bloomRadius: 0.5,
    bloomThreshold: 0.55,
  },
}

const DEFAULT_SECTION_POST: SectionPostParams = {
  bloom: 0,
  vignette: 0.65,
  grain: 0.012,
  chromatic: 0,
}

/** Per-channel feature gates by quality tier — composed WITH the capability
 *  intensity budget in applyPreset (single application site). */
const QUALITY_SCALARS: Record<QualityTier, Partial<PostParams>> = {
  high: {}, // No scaling — full pipeline
  medium: { chromatic: 0, grain: 0.5 }, // Drop chromatic, halve grain
  low: { bloom: 0, grain: 0, chromatic: 0 }, // Bloom off, just vignette
}

export class PostProcessingManager {
  private capability = DeviceCapability.getInstance()

  // Current values (crossfade target)
  private current: PostParams = {
    bloom: 0,
    vignette: 0,
    grain: 0,
    chromatic: 0,
    bloomRadius: 0.6,
    bloomThreshold: 0.5,
    refract: 0,
    border: 0,
    gradeShadows: [1, 1, 1],
    gradeHighlights: [1, 1, 1],
  }

  // Display values (lerped toward current each frame)
  private display: PostParams = {
    bloom: 0,
    vignette: 0,
    grain: 0,
    chromatic: 0,
    bloomRadius: 0.6,
    bloomThreshold: 0.5,
    refract: 0,
    border: 0,
    gradeShadows: [1, 1, 1],
    gradeHighlights: [1, 1, 1],
  }

  // Crossfade speed (seconds) — 0.5s between section changes
  private crossfadeSpeed = 2.0 // 1 / 0.5 = 2.0

  private tier: QualityTier = 'high'
  private phase = 'sec_intro'
  private sectionPost: SectionPostParams = DEFAULT_SECTION_POST
  private _crossfadeActive = false

  constructor() {
    this.tier = this.capability.tier
    this.applyPreset('sec_intro')
  }

  /**
   * Apply the scene's authored values. `phase` only selects bloom blur shape;
   * WorldConfig remains the single source of visible post-processing values.
   */
  applyPreset(phase: string, sectionPost: SectionPostParams = this.sectionPost): void {
    this.phase = phase
    this.sectionPost = sectionPost
    const bloomShape = PHASE_BLOOM_SHAPES[phase] ?? PHASE_BLOOM_SHAPES['sec_intro']!
    // Quality scaling happens HERE and only here: the capability intensity
    // budget (postMultiplier — fill-rate tier) composed with the per-channel
    // feature gates below. Linear scaling commutes with the crossfade lerp,
    // so applying it to the crossfade TARGET is identical to scaling the
    // display values per frame. Shape/look channels (bloomRadius,
    // bloomThreshold, refract, border, grades) stay unscaled on purpose:
    // scaling would distort the authored look, not just the intensity.
    const scaler = QUALITY_SCALARS[this.tier]
    const intensity = (value: number, gate: number | undefined): number =>
      this.capability.scaleIntensity(value) * (gate ?? 1)
    this.current = {
      bloom: intensity(sectionPost.bloom, scaler.bloom),
      vignette: intensity(sectionPost.vignette, scaler.vignette),
      grain: intensity(sectionPost.grain, scaler.grain),
      chromatic: intensity(sectionPost.chromatic, scaler.chromatic),
      ...bloomShape,
      // Grade channels: authored per section, neutral when a caller omits them.
      refract: sectionPost.refract ?? 0,
      border: sectionPost.border ?? 0,
      gradeShadows: sectionPost.gradeShadows ? [...sectionPost.gradeShadows] : [...NEUTRAL_GRADE],
      gradeHighlights: sectionPost.gradeHighlights
        ? [...sectionPost.gradeHighlights]
        : [...NEUTRAL_GRADE],
    }
    this._crossfadeActive = !this.displayMatchesCurrent()
  }

  /** Settle a live post crossfade before reduced-motion stops the scheduler. */
  setReducedMotion(reduced: boolean): void {
    if (!reduced) return
    this.display.bloom = this.current.bloom
    this.display.vignette = this.current.vignette
    this.display.grain = this.current.grain
    this.display.chromatic = this.current.chromatic
    this.display.bloomRadius = this.current.bloomRadius
    this.display.bloomThreshold = this.current.bloomThreshold
    this.display.refract = this.current.refract
    this.display.border = this.current.border
    this.display.gradeShadows = [...this.current.gradeShadows]
    this.display.gradeHighlights = [...this.current.gradeHighlights]
    this._crossfadeActive = false
  }

  /** Refresh quality scalars after WebGPU initialization selected WebGL. */
  refreshQualityTier(): void {
    this.tier = this.capability.tier
    this.applyPreset(this.phase)
  }

  /** Update display values (call each frame with dt) */
  update(dt: number): void {
    if (!this._crossfadeActive) return
    const factor = Math.min(dt * this.crossfadeSpeed, 1)

    this.display.bloom = lerp(this.display.bloom, this.current.bloom, factor)
    this.display.vignette = lerp(this.display.vignette, this.current.vignette, factor)
    this.display.grain = lerp(this.display.grain, this.current.grain, factor)
    this.display.chromatic = lerp(this.display.chromatic, this.current.chromatic, factor)
    this.display.bloomRadius = lerp(this.display.bloomRadius, this.current.bloomRadius, factor)
    this.display.bloomThreshold = lerp(
      this.display.bloomThreshold,
      this.current.bloomThreshold,
      factor,
    )
    this.display.refract = lerp(this.display.refract, this.current.refract, factor)
    this.display.border = lerp(this.display.border, this.current.border, factor)
    this.lerpTint(this.display.gradeShadows, this.current.gradeShadows, factor)
    this.lerpTint(this.display.gradeHighlights, this.current.gradeHighlights, factor)
    if (this.displayMatchesCurrent(0.001)) {
      this.display.bloom = this.current.bloom
      this.display.vignette = this.current.vignette
      this.display.grain = this.current.grain
      this.display.chromatic = this.current.chromatic
      this.display.bloomRadius = this.current.bloomRadius
      this.display.bloomThreshold = this.current.bloomThreshold
      this.display.refract = this.current.refract
      this.display.border = this.current.border
      this.display.gradeShadows = [...this.current.gradeShadows]
      this.display.gradeHighlights = [...this.current.gradeHighlights]
      this._crossfadeActive = false
    }
  }

  /** In-place tuple lerp — no per-frame allocation. */
  private lerpTint(
    target: [number, number, number],
    to: [number, number, number],
    t: number,
  ): void {
    target[0] = lerp(target[0], to[0], t)
    target[1] = lerp(target[1], to[1], t)
    target[2] = lerp(target[2], to[2], t)
  }

  private displayMatchesCurrent(epsilon = 0): boolean {
    return (
      Math.abs(this.display.bloom - this.current.bloom) <= epsilon &&
      Math.abs(this.display.vignette - this.current.vignette) <= epsilon &&
      Math.abs(this.display.grain - this.current.grain) <= epsilon &&
      Math.abs(this.display.chromatic - this.current.chromatic) <= epsilon &&
      Math.abs(this.display.bloomRadius - this.current.bloomRadius) <= epsilon &&
      Math.abs(this.display.bloomThreshold - this.current.bloomThreshold) <= epsilon &&
      Math.abs(this.display.refract - this.current.refract) <= epsilon &&
      Math.abs(this.display.border - this.current.border) <= epsilon &&
      tupleMatches(this.display.gradeShadows, this.current.gradeShadows, epsilon) &&
      tupleMatches(this.display.gradeHighlights, this.current.gradeHighlights, epsilon)
    )
  }

  /** Get display values for shader uniforms without exposing mutable ownership. */
  get postParams(): Readonly<PostParams> {
    return this.display
  }
}

function tupleMatches(
  a: [number, number, number],
  b: [number, number, number],
  epsilon: number,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon
  )
}
