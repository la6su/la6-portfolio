// src/core/renderDemand.ts — Phase 3 pure render-demand decision contract.
//
// The renderer is demand-driven (docs/ARCHITECTURE.md): the loop draws a
// frame only while the scene is changing and stops entirely after the
// settled frame (zero settled draws — ADR 0005). That per-frame decision
// lives in `Experience.update()`; this contract owns the decision as pure,
// side-effect-free functions so the scheduler is unit-tested without a
// renderer, and the loop consumes it without changing any timing.
//
// Two DELIBERATELY DIFFERENT flag sets are preserved — this is real behavior,
// not a simplification, and must not be "fixed" when the consumer migrates:
//
//   - `anyActivity` is the 14-flag OR. It is used BOTH to raise render demand
//     (any active flag re-arms the frame) and to decide whether demand may
//     settle after a rendered frame.
//   - `idleForAmbientBreath` is a narrower 10-flag AND-NOT plus the
//     reduced-motion gate. It decides when the ~2.5 s ambient-breath timer
//     may run. It intentionally EXCLUDES `drawTrail`, `cubeRotating`,
//     `camPulsing` and `showreel`: those keep the loop alive on their own
//     and must not also trigger the breath. Phase 7 moves the timer itself to
//     a wall-clock `setTimeout` owned by the Experience bootstrap; this file
//     only answers "is the scene idle enough to breathe now".
//
// Pure by design: no DOM, timers, renderer or globals. `Experience.update()`
// now consumes these functions at the exact points where the OR, the breath
// idle check and the settle AND-NOT used to be inlined — a 1:1
// source-of-fact swap with unchanged timing (the same flags are read at the
// same moment; the loop only renders when `shouldRender` says so). Unit-
// testable without a browser.

/**
 * The per-frame activity flags. Each mirrors a "something is moving" source in
 * the scene. The 14 flags form the `anyActivity` set; the ambient-breath idle
 * check reads a narrower subset (see `idleForAmbientBreath`).
 */
export interface RenderActivity {
  /** Scroll/story navigation is in progress. */
  nav: boolean
  /** The home Works carousel is morphing. */
  carousel: boolean
  /** The /works plane stage is animating. */
  worksPlane: boolean
  /** The /contact Cyprus stage is animating. */
  contactCyprus: boolean
  /** The /contact ink halo is breathing or settling pointer energy. */
  contactHalo: boolean
  /** The pointer draw-trail is animating. */
  drawTrail: boolean
  /** The home opener animation is active. */
  opener: boolean
  /** A particle burst is active. */
  burst: boolean
  /** The camera shake decay is running. */
  camShaking: boolean
  /** The SplashCube is rotating to its target face. */
  cubeRotating: boolean
  /** The camera zoom pulse is active. */
  camPulsing: boolean
  /** A visible particle field needs continuous frames (respects reduced motion). */
  particles: boolean
  /** A visible ambient-motion scene needs continuous frames (respects reduced motion). */
  ambientScene: boolean
  /** The showreel theater is transitioning or its video is playing. */
  showreel: boolean
}

/** Every flag clear — the identity activity. */
export const NO_ACTIVITY: RenderActivity = {
  nav: false,
  carousel: false,
  worksPlane: false,
  contactCyprus: false,
  contactHalo: false,
  drawTrail: false,
  opener: false,
  burst: false,
  camShaking: false,
  cubeRotating: false,
  camPulsing: false,
  particles: false,
  ambientScene: false,
  showreel: false,
}

/**
 * The 14-flag OR. Used to RAISE render demand and to decide whether demand may
 * SETTLE after a frame. If any flag is set, the scene is still changing.
 */
export function anyActivity(a: RenderActivity): boolean {
  return (
    a.nav ||
    a.carousel ||
    a.worksPlane ||
    a.contactCyprus ||
    a.contactHalo ||
    a.drawTrail ||
    a.opener ||
    a.burst ||
    a.camShaking ||
    a.cubeRotating ||
    a.camPulsing ||
    a.particles ||
    a.ambientScene ||
    a.showreel
  )
}

/**
 * The narrower idle check for the ambient-breath timer: reduced motion is off
 * AND the 10 "breath-relevant" flags are all clear. `drawTrail`,
 * `cubeRotating`, `camPulsing` and `showreel` are intentionally excluded —
 * setting only one of them must still count as idle for the breath (they keep
 * the loop alive on their own).
 */
export function idleForAmbientBreath(a: RenderActivity, reducedMotion: boolean): boolean {
  if (reducedMotion) return false
  return (
    !a.nav &&
    !a.carousel &&
    !a.worksPlane &&
    !a.contactCyprus &&
    !a.contactHalo &&
    !a.opener &&
    !a.burst &&
    !a.camShaking &&
    !a.particles &&
    !a.ambientScene
  )
}

/** True when a frame should be drawn: demand is already set, or something is active. */
export function shouldRender(needsRender: boolean, a: RenderActivity): boolean {
  return needsRender || anyActivity(a)
}

/**
 * After a rendered frame, demand may settle (the flag may be cleared) only when
 * nothing is still active. This is the same 14-flag set as `anyActivity`.
 */
export function demandSettles(a: RenderActivity): boolean {
  return !anyActivity(a)
}
