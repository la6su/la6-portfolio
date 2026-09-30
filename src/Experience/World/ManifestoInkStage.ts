// ManifestoInkStage — lazy owner for the pointer-reactive TSL ink wash that
// backs the manifesto principles. The implementation import stays behind
// Experience's route dynamic import so the TSL graph and its NodeMaterial
// never enter the shared scene graph.
//
// The stage follows the ContactHaloStage conventions exactly, so the shared
// shell lives in PointerInkStage. Its voice differs: /manifesto is a reading
// page, so the wash is calmer — a horizontally stretched pool (reading
// cadence) with low-frequency settling strata and a slower breathing gain,
// damped heavier than the halo. Peak alpha stays deliberately low (≈ 0.14)
// so the ink reads as paper tone, not a light show.

import { uv, vec2, sin, smoothstep, length } from 'three/tsl'
import { PointerInkStage } from './PointerInkStage'

export class ManifestoInkStage extends PointerInkStage {
  constructor() {
    super({
      stageName: 'manifesto-ink-stage',
      meshName: 'manifesto-ink',
      meshPosition: [-0.1, 0.05, -2.7],
      planeSize: [1.9, 1.05],
      peakOpacity: 0.14,
      // Keep the wash legible on either UI theme (matches the manifesto ink).
      tints: [0xcfe8ee, 0x243540],
      focusScale: [0.5, 0.22],
      damping: { rise: 8, decay: 1.2, chase: 2.2 },
      inkField: ({ time, pointer, energy }) => {
        // An anisotropic pool stretched along the reading axis around the
        // damped pointer focus, low-frequency horizontal strata for settling
        // ink, and a slow breathing gain.
        const p = uv().mul(2.0).sub(1.0)
        // Map pointer NDC into the plane's local extent (narrower than the
        // halo — the reading page keeps the wash closer to rest).
        const focus = pointer.mul(vec2(0.5, 0.22))
        const stretched = p.sub(focus).mul(vec2(0.72, 1.25))
        const pool = (smoothstep as any)(0.95, 0.12, length(stretched))
        const strata = sin(p.x.mul(3.2).add(time.mul(0.22))).mul(
          sin(p.y.mul(2.2).sub(time.mul(0.18))).mul(0.6),
        )
        const breath = sin(time.mul(0.42)).mul(0.5).add(0.5)
        return pool
          .mul(0.78)
          .add(strata.mul(0.08).add(0.08))
          .mul(breath.mul(0.22).add(0.78))
          .mul(energy.mul(0.55).add(0.45))
          .max(0.0)
      },
    })
  }
}
