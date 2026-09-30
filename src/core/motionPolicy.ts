// src/core/motionPolicy.ts — typed motion preference port (Phase 3).
//
// The single policy port for the user's reduced-motion preference. Consumers
// can pull the current value at the moment they need it, while long-lived
// owners can subscribe to the same media query and dispose that subscription
// with their lifecycle. The Phase 5 swap to typed Vue state only changes this
// module's source — consumers stay unchanged.
//
// All scene/UI consumers (Experience, Camera, Lights, SplashCube,
// ContactCyprusStage, CinematicNav, RouteTransition, entry-app) go through
// `prefersReducedMotion()`; none infer the preference from DOM datasets.
// The `documentElement.dataset.reducedMotion` hook written by
// `entry-shell.ts` is a legacy E2E probe (read by tests/e2e.spec.ts); it has
// no CSS consumer and no typed-state reader.

/** The user's reduced-motion preference (`true` when `prefers-reduced-motion: reduce`). */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Observe changes to the same preference used by `prefersReducedMotion()`.
 * The disposer is intentionally owned by the caller so long-lived scene
 * runtimes cannot retain a MediaQueryList listener after teardown.
 */
export function observeReducedMotion(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}

  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  const handleChange = (event: MediaQueryListEvent): void => onChange(event.matches)
  query.addEventListener('change', handleChange)

  return () => query.removeEventListener('change', handleChange)
}
