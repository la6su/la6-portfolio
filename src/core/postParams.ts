// src/core/postParams.ts — the one canonical post-processing parameter shape.
//
// Every post layer shares these ten runtime values: PostProcessingManager
// crossfades them per section, RenderPipeline diffs them against its snapshot,
// WebGPUPostPipeline writes them into the TSL uniform nodes. Declaring the
// shape once (instead of four hand-maintained copies) makes adding a channel
// a one-file change, and both RenderPipeline handoffs (snapshot update and
// the PERF-11 TSL uniform handoff) go through copyPostParams.

/** Shadow/highlight tint multipliers (RGB, 1 = neutral). */
type PostGradeTuple = [number, number, number]

export interface PostParams {
  /** 0–1, bloom intensity multiplier. */
  bloom: number
  /** 0–1, vignette radius/darkness. */
  vignette: number
  /** 0–1, grain amplitude. */
  grain: number
  /** 0–1, chromatic aberration strength. */
  chromatic: number
  /** 0–1, bloom blur radius (per-section shape — not intensity-scaled). */
  bloomRadius: number
  /** 0–1, luminance gate for bloom (per-section shape — not intensity-scaled). */
  bloomThreshold: number
  /** 0–1, screen-space glass refraction strength (0=off, 0.1=subtle, 0.3=strong). */
  refract: number
  /** 0–1, screen border intensity (0=off, 0.3=subtle, 1.0=full black border). */
  border: number
  /** Shadow tint multipliers, crossfaded per section. */
  gradeShadows: PostGradeTuple
  /** Highlight tint multipliers, crossfaded per section. */
  gradeHighlights: PostGradeTuple
}

/** Neutral tint — the default when a caller authors no grade channels. */
export const NEUTRAL_GRADE: PostGradeTuple = [1, 1, 1]

/**
 * In-place handoff (PERF-11): copies every channel from `from` into `target`
 * without allocating. Tuple elements are copied individually — replacing the
 * tuple reference would break owners that hold a stable target object.
 */
export function copyPostParams(target: PostParams, from: Readonly<PostParams>): void {
  target.bloom = from.bloom
  target.vignette = from.vignette
  target.grain = from.grain
  target.chromatic = from.chromatic
  target.bloomRadius = from.bloomRadius
  target.bloomThreshold = from.bloomThreshold
  target.refract = from.refract
  target.border = from.border
  target.gradeShadows[0] = from.gradeShadows[0]
  target.gradeShadows[1] = from.gradeShadows[1]
  target.gradeShadows[2] = from.gradeShadows[2]
  target.gradeHighlights[0] = from.gradeHighlights[0]
  target.gradeHighlights[1] = from.gradeHighlights[1]
  target.gradeHighlights[2] = from.gradeHighlights[2]
}
