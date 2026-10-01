// src/Utils/easing.ts — project-specific easing curves missing from Three.

import * as THREE from 'three'

/** ease-out cubic: 1 − (1−t)³ — fast start, slow settle. */
export function easeOutCubic(t: number): number {
  const clamped = THREE.MathUtils.clamp(t, 0, 1)
  return 1 - Math.pow(1 - clamped, 3)
}
