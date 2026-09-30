import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { JunniParticles } from '../Experience/World/JunniParticles'

describe('JunniParticles lifecycle', () => {
  it('ignores late GPU mutations after terminal teardown', () => {
    const scene = new THREE.Scene()
    const particles = new JunniParticles({ count: 8 })
    scene.add(particles)
    const state = particles as unknown as { _time: number }

    particles.update(0.25)
    const time = state._time
    particles.dispose()
    particles.dispose()
    particles.update(1)
    particles.setBlending(true)
    particles.setCount(2)

    expect(state._time).toBe(time)
    expect(particles.count).toBe(8)
    expect(particles.parent).toBeNull()
  })
})
