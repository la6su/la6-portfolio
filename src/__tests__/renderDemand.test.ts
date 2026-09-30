import { describe, it, expect } from 'vitest'
import {
  NO_ACTIVITY,
  anyActivity,
  idleForAmbientBreath,
  shouldRender,
  demandSettles,
  type RenderActivity,
} from '../core/renderDemand'

// Helper: an activity with exactly the named flags set.
function withOnly(flags: (keyof RenderActivity)[]): RenderActivity {
  return { ...NO_ACTIVITY, ...Object.fromEntries(flags.map((f) => [f, true])) }
}

const ALL_FLAGS: (keyof RenderActivity)[] = [
  'nav',
  'carousel',
  'worksPlane',
  'contactCyprus',
  'contactHalo',
  'drawTrail',
  'opener',
  'burst',
  'camShaking',
  'cubeRotating',
  'camPulsing',
  'particles',
  'ambientScene',
  'showreel',
]

// The 10 flags the ambient-breath idle check actually reads. The other four
// (drawTrail, cubeRotating, camPulsing and showreel) are deliberately
// excluded.
const BREATH_RELEVANT: (keyof RenderActivity)[] = [
  'nav',
  'carousel',
  'worksPlane',
  'contactCyprus',
  'contactHalo',
  'opener',
  'burst',
  'camShaking',
  'particles',
  'ambientScene',
]

const BREATH_EXCLUDED: (keyof RenderActivity)[] = [
  'drawTrail',
  'cubeRotating',
  'camPulsing',
  'showreel',
]

describe('anyActivity (the 14-flag OR)', () => {
  it('is false for no activity', () => {
    expect(anyActivity(NO_ACTIVITY)).toBe(false)
  })

  it('every one of the 14 flags independently raises activity', () => {
    for (const f of ALL_FLAGS) {
      expect(anyActivity(withOnly([f])), `flag ${f}`).toBe(true)
    }
  })

  it('is true when any combination of flags is set', () => {
    expect(anyActivity(withOnly(['nav', 'burst', 'camPulsing']))).toBe(true)
  })
})

describe('idleForAmbientBreath (the narrower 10-flag idle check)', () => {
  it('is true when reduced motion is off and the 10 breath flags are clear', () => {
    expect(idleForAmbientBreath(NO_ACTIVITY, false)).toBe(true)
  })

  it('is false when reduced motion is on, even with everything clear', () => {
    expect(idleForAmbientBreath(NO_ACTIVITY, true)).toBe(false)
  })

  it('every one of the 10 breath-relevant flags blocks the breath', () => {
    for (const f of BREATH_RELEVANT) {
      expect(idleForAmbientBreath(withOnly([f]), false), `flag ${f}`).toBe(false)
    }
  })

  it('the 4 excluded flags do NOT block the breath (real behavior, not a simplification)', () => {
    for (const f of BREATH_EXCLUDED) {
      expect(idleForAmbientBreath(withOnly([f]), false), `flag ${f}`).toBe(true)
    }
  })

  it('a breath-relevant flag still blocks the breath even when an excluded flag is also set', () => {
    expect(idleForAmbientBreath(withOnly(['nav', 'drawTrail']), false)).toBe(false)
  })
})

describe('shouldRender / demandSettles', () => {
  it('shouldRender is true when demand is already set, even with no activity', () => {
    expect(shouldRender(true, NO_ACTIVITY)).toBe(true)
  })

  it('shouldRender is true when any activity is present, even if demand was clear', () => {
    expect(shouldRender(false, withOnly(['camShaking']))).toBe(true)
  })

  it('shouldRender is false only when demand is clear and nothing is active', () => {
    expect(shouldRender(false, NO_ACTIVITY)).toBe(false)
  })

  it('demandSettles is the negation of anyActivity', () => {
    expect(demandSettles(NO_ACTIVITY)).toBe(true)
    expect(demandSettles(withOnly(['cubeRotating']))).toBe(false)
    for (const f of ALL_FLAGS) {
      expect(demandSettles(withOnly([f])), `flag ${f}`).toBe(false)
    }
  })
})
