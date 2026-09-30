// src/core/storyProgress.ts — Phase 3 pure story progress contract.
//
// The story is the six-section vertical track: a clamped 0..1 progress value
// maps to the active section index. The 3D world and the DOM navigation
// (CinematicNav) must arrive at the same section at the same neutral point —
// CinematicNav changes its active DOM chapter at the midpoint between two
// native scroll frames, and the 3D arrival uses the matching midpoint rule
// (a documented fix: using `fromIndex` made down-scroll arrivals land at the
// *end* of a frame while up-scroll arrivals landed immediately after leaving
// it, a visible direction-dependent second beat).
//
// This contract locks that rule as pure, framework-neutral functions so the
// Phase 5 Vue providers can expose the same story state without re-deriving
// the math, and so the midpoint semantics (including the `.5` boundary) are
// unit-locked instead of living only in a comment.
//
// Pure by design: no DOM, Three or globals — unit-testable without a browser.
// `SceneCoordinator.updateTransform` consumes it at the exact point where it
// inlined the clamp + round before; the read timing is unchanged.

/** Clamp a scroll progress value to [0, 1]; non-finite input settles to 0. */
export function clampStoryProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * The active section index for a clamped story progress: the **midpoint
 * rule** — `round(progress × (sectionCount − 1))`.
 *
 * A section i is active from the midpoint between i−1 and i to the midpoint
 * between i and i+1 (edges included: progress 0 → section 0, progress 1 →
 * the last section). At an exact `.5` boundary JS rounds up, so the arrival
 * lands in the next section — the same neutral point the DOM chapter change
 * uses.
 *
 * `sectionCount` must be ≥ 1; with a single section the index is always 0.
 */
export function sectionIndexAt(progress: number, sectionCount: number): number {
  const count = Math.max(1, sectionCount)
  const p = clampStoryProgress(progress)
  return Math.round(p * (count - 1))
}
