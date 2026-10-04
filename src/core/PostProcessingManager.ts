// src/core/PostProcessingManager.ts
// Section-aware post-processing controller with quality tiers + crossfade.

import * as THREE from 'three'
import { DeviceCapability } from './DeviceCapability'
import type { QualityTier } from './DeviceCapability'
import type { PostParams } from './postParams'
import { copyPostParams, NEUTRAL_GRADE, postParamsMatch } from './postParams'

/**
 * The section-authored subset of the canonical PostParams: the four intensity
 * channels are always authored; the look channels may be omitted (they then
 * default to neutral/off in applyPreset). Bloom's blur shape is NOT authored
 * here — it is renderer-specific (see PHASE_BLOOM_SHAPES).
 */
type SectionPostParams = Pick<PostParams, 'bloom' | 'vignette' | 'grain' | 'chromatic'> &
  Partial<Pick<PostParams, 'refract' | 'gradeShadows' | 'gradeHighlights'>>

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
    gradeShadows: [1, 1, 1],
    gradeHighlights: [1, 1, 1],
  }

  // Crossfade speed (seconds) — 0.5s between section changes
  private crossfadeSpeed = 2.0 // 1 / 0.5 = 2.0

  private phase = 'sec_intro'
  private sectionPost: SectionPostParams = DEFAULT_SECTION_POST
  private _crossfadeActive = false

  constructor() {
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
    // bloomThreshold, refract, grades) stay unscaled on purpose:
    // scaling would distort the authored look, not just the intensity.
    const scaler = QUALITY_SCALARS[this.capability.tier]
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
      gradeShadows: sectionPost.gradeShadows ? [...sectionPost.gradeShadows] : [...NEUTRAL_GRADE],
      gradeHighlights: sectionPost.gradeHighlights
        ? [...sectionPost.gradeHighlights]
        : [...NEUTRAL_GRADE],
    }
    this._crossfadeActive = !this.displayMatchesCurrent()
  }

  /** Snap a live post crossfade before the final reduced-motion draw. */
  setReducedMotion(reduced: boolean): void {
    if (!reduced) return
    copyPostParams(this.display, this.current)
    this._crossfadeActive = false
  }

  /** Recompute targets after renderer initialization selects its final backend. */
  refreshPreset(): void {
    this.applyPreset(this.phase)
  }

  /** Update display values (call each frame with dt) */
  update(dt: number): void {
    if (!this._crossfadeActive) return
    const factor = Math.min(dt * this.crossfadeSpeed, 1)

    this.display.bloom = THREE.MathUtils.lerp(this.display.bloom, this.current.bloom, factor)
    this.display.vignette = THREE.MathUtils.lerp(
      this.display.vignette,
      this.current.vignette,
      factor,
    )
    this.display.grain = THREE.MathUtils.lerp(this.display.grain, this.current.grain, factor)
    this.display.chromatic = THREE.MathUtils.lerp(
      this.display.chromatic,
      this.current.chromatic,
      factor,
    )
    this.display.bloomRadius = THREE.MathUtils.lerp(
      this.display.bloomRadius,
      this.current.bloomRadius,
      factor,
    )
    this.display.bloomThreshold = THREE.MathUtils.lerp(
      this.display.bloomThreshold,
      this.current.bloomThreshold,
      factor,
    )
    this.display.refract = THREE.MathUtils.lerp(this.display.refract, this.current.refract, factor)
    this.lerpTint(this.display.gradeShadows, this.current.gradeShadows, factor)
    this.lerpTint(this.display.gradeHighlights, this.current.gradeHighlights, factor)
    if (this.displayMatchesCurrent(0.001)) {
      copyPostParams(this.display, this.current)
      this._crossfadeActive = false
    }
  }

  /** In-place tuple lerp — no per-frame allocation. */
  private lerpTint(
    target: [number, number, number],
    to: [number, number, number],
    t: number,
  ): void {
    target[0] = THREE.MathUtils.lerp(target[0], to[0], t)
    target[1] = THREE.MathUtils.lerp(target[1], to[1], t)
    target[2] = THREE.MathUtils.lerp(target[2], to[2], t)
  }

  private displayMatchesCurrent(epsilon = 0): boolean {
    return postParamsMatch(this.display, this.current, epsilon)
  }

  /** Get display values for shader uniforms without exposing mutable ownership. */
  get postParams(): Readonly<PostParams> {
    return this.display
  }
}
