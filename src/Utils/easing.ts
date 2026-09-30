// src/Utils/easing.ts — the shared transition curves + interpolation.
//
// One definition per formula: the scroll transform pass (WorldConfig's two
// authored easings), the stage fades, cube-face and trail-taper S-curves and
// the DOM text reveals used to hand-roll these inline. Pure number helpers —
// no module dependencies, safe to import from any chunk (DOM UI included).

/** Clamp to [0, 1]. */
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** ease-in-out: smoothstep t² · (3 − 2t) — S-curve with plateaus at both ends. */
export function smoothstep01(t: number): number {
  const c = clamp01(t)
  return c * c * (3 - 2 * c)
}

/** ease-out cubic: 1 − (1−t)³ — fast start, slow settle. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3)
}

/** Linear interpolation a → b by t. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
