// src/core/storyState.ts — Phase 3 pure story-state contract.
//
// The story has one continuous input — the native vertical track scroll —
// and two observers, deliberately on different clocks:
//
//   - the DOM navigation (`CinematicNav`) reacts to scroll *events* and owns
//     the discrete main-section chapter state (the four main sections,
//     slots 1..4) plus the side sheets (Contact footer = slot 0, Menu =
//     slot 5);
//   - the scene (`SceneCoordinator.updateTransform`) reads progress *per
//     frame* and
//     applies the midpoint arrival rule (`storyProgress.sectionIndexAt`)
//     over the six slots.
//
// The observers must not be merged: the DOM chapter flip is event-driven
// and the scene arrival is frame-driven, and the midpoint rule is exactly
// what keeps their discrete arrivals at the same neutral point. What must
// not be duplicated is the *mapping* between the scales:
//
//   - the main→slot progress rescale: main position p ∈ [0, 3] lives on the
//     six-slot scale at progress (1 + p) / 5 (the first main section starts
//     at slot 1, i.e. progress 1/5);
//   - the main-section rounding rule: the active main section is
//     `firstMain + round(p)` (the same `.5` boundary convention as the
//     scene's midpoint rule);
//   - the side-state edges: the Contact footer pins progress to 0 (slot 0)
//     and the Menu sheet pins it to 1 (slot 5).
//
// This contract extracts that mapping as pure, framework-neutral functions
// and types the readonly story state both observers converge on.
// `CinematicNav` consumes the functions at the exact points where it
// inlined them before — a 1:1 source-of-fact swap with unchanged timing
// (the scroll event still drives the DOM, the frame still drives the
// scene). The desync invariant the contract locks: at every main-section
// stop point the DOM main index and the scene slot index are the *same
// number* (mains 1..4 are slots 1..4), which is what prevents a
// route/story/scene desynchronise.
//
// Pure by design: no DOM, Three or globals — unit-testable without a
// browser.

/** The three side positions of the story track. */
export type StorySide = 'center' | 'footer' | 'menu'

/**
 * The continuous story progress (slot scale, 0..1) for a scroll offset.
 * 1:1 with the former inline rescale in `CinematicNav.getOverallProgress`:
 * the main position is clamped to [0, mainCount − 1], then re-based so the
 * first main section starts at `firstMain / (sectionCount − 1)` — slot 1
 * at progress 1/5 for the canonical six-slot model.
 */
export function storyProgressFromScroll(
  scrollTop: number,
  trackHeight: number,
  mainCount: number,
  firstMain: number,
  sectionCount: number,
): number {
  const height = Math.max(1, trackHeight)
  const storyPosition = Math.max(0, Math.min(mainCount - 1, scrollTop / height))
  return (firstMain + storyPosition) / (sectionCount - 1)
}

/**
 * The clamped main-scale position: the continuous input the rounding rule
 * (and the DOM per-section CSS variables) work from. 1:1 with the former
 * inline `Math.max(0, Math.min(mainCount − 1, …))` clamp.
 */
export function clampStoryPosition(position: number, mainCount: number): number {
  return Math.max(0, Math.min(mainCount - 1, position))
}

/**
 * The active main-section index for a raw main-scale position. 1:1 with the
 * former inline rounding in `CinematicNav._syncFromScroll`: clamp to
 * [0, mainCount − 1], then `firstMain + round(p)`. JS rounds `.5` up, so a
 * position exactly halfway between two mains belongs to the *next* main —
 * the same boundary convention as the scene's midpoint rule.
 */
export function mainSectionFromPosition(
  position: number,
  firstMain: number,
  mainCount: number,
): number {
  return firstMain + Math.round(clampStoryPosition(position, mainCount))
}
