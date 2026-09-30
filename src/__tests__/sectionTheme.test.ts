import { describe, it, expect } from 'vitest'
import { resolveEffectiveTheme, type ThemeAppliedPort } from '../core/sectionTheme'

describe('resolveEffectiveTheme (the auto/inverse rule)', () => {
  it('auto honors the section base polarity', () => {
    expect(resolveEffectiveTheme(true, 'auto')).toBe(true)
    expect(resolveEffectiveTheme(false, 'auto')).toBe(false)
  })

  it('inverse flips the section base polarity', () => {
    expect(resolveEffectiveTheme(true, 'inverse')).toBe(false)
    expect(resolveEffectiveTheme(false, 'inverse')).toBe(true)
  })

  it('is a pure decision: no state, no DOM, stable for equal inputs', () => {
    for (let i = 0; i < 4; i++) {
      expect(resolveEffectiveTheme(true, 'inverse')).toBe(false)
      expect(resolveEffectiveTheme(false, 'auto')).toBe(false)
    }
  })

  it('matches the legacy inline ternary for every input pair', () => {
    // Regression baseline: the rule used to be inlined in
    // ContentReveal.applyTheme as `isInverse ? !sectionIsLight :
    // sectionIsLight`. The contract must be identical for all inputs.
    const cases: Array<[boolean, boolean, 'auto' | 'inverse']> = [
      [true, false, 'auto'],
      [true, true, 'inverse'],
      [false, false, 'auto'],
      [false, true, 'inverse'],
    ]
    for (const [sectionIsLight, isInverse, mode] of cases) {
      const legacy = isInverse ? !sectionIsLight : sectionIsLight
      expect(resolveEffectiveTheme(sectionIsLight, mode), `${sectionIsLight}/${mode}`).toBe(legacy)
    }
  })
})

describe('ThemeAppliedPort (the typed scene input port shape)', () => {
  it('locks the field set the scene reads from jlz:theme-applied', () => {
    const port: ThemeAppliedPort = {
      isLight: true,
      sectionIndex: 2,
      sectionId: 'about',
      themeChanged: true,
      mode: 'auto',
      snap: false,
    }
    expect(port.isLight).toBe(true)
    expect(port.sectionIndex).toBe(2)
    expect(port.sectionId).toBe('about')
    expect(port.themeChanged).toBe(true)
    expect(port.mode).toBe('auto')
    expect(port.snap).toBe(false)
  })
})
