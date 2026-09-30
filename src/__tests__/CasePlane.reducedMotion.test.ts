import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

import { CasePlane } from '../Experience/World/CasePlane'

describe('CasePlane reduced-motion policy', () => {
  beforeEach(() => {
    motion.reduced = false
  })

  it('settles wobble in one update', () => {
    const card = new CasePlane(new THREE.Texture())
    card.pulse(0.5)
    motion.reduced = true
    card.setReducedMotion(true)

    card.update(1 / 60, true)

    const state = card as unknown as {
      _wobbleValue: number
      _wobbleTarget: number
    }
    expect(state._wobbleValue).toBe(0)
    expect(state._wobbleTarget).toBe(0)
    expect(card.isAnimating).toBe(false)

    card.dispose()
  })

  it('does not start a new pulse while reduced motion is active', () => {
    const card = new CasePlane(new THREE.Texture())
    motion.reduced = true
    card.setReducedMotion(true)

    card.pulse(0.5)

    const state = card as unknown as { _wobbleTarget: number }
    expect(state._wobbleTarget).toBe(0)
    expect(card.isAnimating).toBe(false)
    card.dispose()
  })
})
