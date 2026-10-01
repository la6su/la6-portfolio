import { describe, expect, it } from 'vitest'
import type { PostParams } from './postParams'
import { postParamsMatch } from './postParams'

function params(): PostParams {
  return {
    bloom: 0.2,
    vignette: 0.4,
    grain: 0.01,
    chromatic: 0,
    bloomRadius: 0.5,
    bloomThreshold: 0.45,
    refract: 0.1,
    gradeShadows: [0.9, 1, 1.1],
    gradeHighlights: [1.1, 1, 0.9],
  }
}

describe('post parameter comparison', () => {
  it('compares all channels exactly by default', () => {
    const current = params()
    const next = params()
    expect(postParamsMatch(current, next)).toBe(true)

    next.gradeShadows[1] += Number.EPSILON
    expect(postParamsMatch(current, next)).toBe(false)
  })

  it('applies the supplied tolerance to scalar and tint channels', () => {
    const current = params()
    const next = params()
    next.bloom += 0.0005
    next.gradeHighlights[2] += 0.0005
    expect(postParamsMatch(current, next, 0.001)).toBe(true)

    next.gradeHighlights[2] += 0.001
    expect(postParamsMatch(current, next, 0.001)).toBe(false)
  })
})
