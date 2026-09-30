import { describe, expect, it } from 'vitest'
import { Group } from 'three'
import {
  carouselOf,
  particlesOf,
  setSectionGroupAttachments,
} from '../Experience/sceneOwners'

describe('scene owner attachment reads', () => {
  it('returns only the typed owners attached to a group', () => {
    const group = new Group()
    const carousel = { id: 'carousel' }
    const particles = { id: 'particles' }
    setSectionGroupAttachments(group, {
      carousel: carousel as never,
      particles: particles as never,
    })

    expect(carouselOf(group)).toBe(carousel)
    expect(carouselOf(undefined)).toBeUndefined()
    expect(particlesOf(group)).toBe(particles)
  })
})
