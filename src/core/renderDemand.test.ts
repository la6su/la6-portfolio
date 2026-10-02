import { describe, expect, it } from 'vitest'
import {
  anyActivity,
  idleForAmbientBreath,
  NO_ACTIVITY,
  type RenderActivity,
} from './renderDemand'

describe('render demand policy', () => {
  it('treats an empty activity snapshot as settled', () => {
    expect(anyActivity(NO_ACTIVITY)).toBe(false)
  })

  it.each(Object.keys(NO_ACTIVITY) as (keyof RenderActivity)[])('keeps rendering while %s is active', (key) => {
    const activity = { ...NO_ACTIVITY, [key]: true }
    expect(anyActivity(activity)).toBe(true)
  })

  it('allows ambient breathing only when breath-relevant activity is idle', () => {
    expect(idleForAmbientBreath(NO_ACTIVITY, false)).toBe(true)
    expect(idleForAmbientBreath(NO_ACTIVITY, true)).toBe(false)
    expect(idleForAmbientBreath({ ...NO_ACTIVITY, particles: true }, false)).toBe(false)
  })

  it('does not count independent render sources as ambient-breath blockers', () => {
    const activity = {
      ...NO_ACTIVITY,
      drawTrail: true,
      cubeRotating: true,
      camPulsing: true,
      showreel: true,
    }
    expect(anyActivity(activity)).toBe(true)
    expect(idleForAmbientBreath(activity, false)).toBe(true)
  })
})
