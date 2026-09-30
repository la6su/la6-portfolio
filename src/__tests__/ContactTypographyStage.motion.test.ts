import { describe, expect, it, vi } from 'vitest'
import { ContactTypographyStage } from '../Experience/World/ContactTypographyStage'

describe('ContactTypographyStage motion policy', () => {
  function mockMotionPreference(matches: boolean): void {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches } as MediaQueryList),
    })
  }

  it('settles glyph transforms and keeps them stable with reduced motion', () => {
    mockMotionPreference(true)
    const stage = new ContactTypographyStage()
    try {
      stage.setActive(true)
      const glyphs = stage.children[0]?.children ?? []
      expect(stage.isAnimating).toBe(false)
      expect(glyphs.every((glyph) => glyph.scale.x === 1 && glyph.scale.y === 1)).toBe(true)
      const settled = glyphs.map((glyph) => glyph.matrix.elements.slice())

      stage.update(1)

      expect(glyphs.map((glyph) => glyph.matrix.elements.slice())).toEqual(settled)
      expect(glyphs.every((glyph) => glyph.scale.x === 1 && glyph.scale.y === 1)).toBe(true)
    } finally {
      stage.dispose()
      vi.restoreAllMocks()
    }
  })

  it('preserves authored reveal motion when reduced motion is off', () => {
    mockMotionPreference(false)
    const stage = new ContactTypographyStage()
    try {
      stage.setActive(true)
      stage.update(1)
      expect(stage.isAnimating).toBe(true)
      expect(stage.children[0]?.children.some((glyph) => glyph.scale.x > 0)).toBe(true)
    } finally {
      stage.dispose()
      vi.restoreAllMocks()
    }
  })

  it('updates an already-active stage when the preference changes', () => {
    mockMotionPreference(false)
    const stage = new ContactTypographyStage()
    try {
      stage.setActive(true)
      stage.update(1)
      stage.setReducedMotion(true)
      expect(stage.isAnimating).toBe(false)
      const settled = stage.children[0]?.children.map((glyph) => glyph.matrix.elements.slice())
      stage.update(1)
      expect(stage.children[0]?.children.map((glyph) => glyph.matrix.elements.slice())).toEqual(
        settled,
      )

      stage.setReducedMotion(false)
      stage.update(0.25)
      expect(stage.children[0]?.children.some((glyph) => glyph.position.y !== 0)).toBe(true)
    } finally {
      stage.dispose()
      vi.restoreAllMocks()
    }
  })

  it('uses the synchronized motion snapshot on later activation', () => {
    const media = { matches: false }
    const matchMedia = vi.fn().mockReturnValue(media)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMedia,
    })
    const stage = new ContactTypographyStage()
    try {
      stage.setReducedMotion(true)
      media.matches = false
      stage.setActive(true)
      stage.update(1)

      expect((stage.children[0] as unknown as { isAnimating: boolean }).isAnimating).toBe(false)
      expect(matchMedia).toHaveBeenCalledTimes(1)
    } finally {
      stage.dispose()
      vi.restoreAllMocks()
    }
  })

  it('ignores activity after disposal', () => {
    mockMotionPreference(false)
    const stage = new ContactTypographyStage()

    stage.dispose()

    expect(() => {
      stage.setActive(true)
      stage.setTheme(true)
      stage.update(1)
      stage.dispose()
    }).not.toThrow()
    expect(stage.isAnimating).toBe(false)
    expect(stage.visible).toBe(false)
    vi.restoreAllMocks()
  })
})
