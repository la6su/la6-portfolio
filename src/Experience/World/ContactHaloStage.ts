// ContactHaloStage — lazy owner for the pointer-reactive TSL ink halo that
// backs the Contact greeting. The implementation import stays behind
// Experience's route dynamic import so the TSL graph and its NodeMaterial
// never enter the shared scene graph.
//
// The halo is the /contact counterpart of the /works DrawTrail: a restrained
// pointer response in the shared brand language. It renders one world-fixed
// plane behind the HELLO flock; a soft radial ink pool drifts toward the
// pointer and breathes on a low-frequency clock. Amplitude stays deliberately
// low (peak alpha ≈ 0.16) so the pool reads as paper ink, not a light show.
// Lifecycle, pointer chase, reveal and reduced-motion snap live in
// PointerInkStage; this file is the authored voice.

import { uv, vec2, sin, smoothstep, length } from 'three/tsl'
import { PointerInkStage } from './PointerInkStage'

export class ContactHaloStage extends PointerInkStage {
  constructor() {
    super({
      stageName: 'contact-halo-stage',
      meshName: 'contact-halo',
      meshPosition: [-0.15, 0.3, -2.62],
      planeSize: [1.7, 0.95],
      peakOpacity: 0.16,
      // Keep the halo legible on either UI theme (matches the greeting ink).
      tints: [0xdfffe9, 0x233329],
      focusScale: [0.62, 0.34],
      damping: { rise: 9, decay: 1.4, chase: 3.5 },
      inkField: ({ time, pointer, energy }) => {
        // A soft radial pool around the damped pointer focus, wide
        // low-frequency drift wobble for an organic edge, and a slow
        // breathing gain.
        const p = uv().mul(2.0).sub(1.0)
        // Map pointer NDC into the plane's local extent (slightly narrower
        // than the plane so the pool center stays inside the frame on wide
        // screens).
        const focus = pointer.mul(vec2(0.62, 0.34))
        const pool = (smoothstep as any)(0.95, 0.12, length(p.sub(focus)))
        const drift = sin(p.x.mul(2.6).add(time.mul(0.5))).mul(
          sin(p.y.mul(1.9).sub(time.mul(0.35))),
        )
        const breath = sin(time.mul(0.55)).mul(0.5).add(0.5)
        return pool
          .mul(0.8)
          .add(drift.mul(0.1).add(0.1))
          .mul(breath.mul(0.25).add(0.75))
          .mul(energy.mul(0.6).add(0.4))
          .max(0.0)
      },
    })
  }
}
