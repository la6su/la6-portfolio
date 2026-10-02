// src/Utils/easing.ts — project-specific easing curves missing from Three.

/** ease-out cubic: 1 − (1−t)³ — fast start, slow settle. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - Math.pow(1 - clamped, 3)
}

/** Symmetric cubic ease-in-out for authored transition progress. */
export function easeInOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}
