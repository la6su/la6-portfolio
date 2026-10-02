import { describe, expect, it } from 'vitest'
import { ContactTypographyStage } from './ContactTypographyStage'
import type { WireframeTypography } from './WireframeTypography'

describe('ContactTypographyStage scene ownership', () => {
  it('publishes glyph content and exposes declarative visibility state', () => {
    const stage = new ContactTypographyStage()
    const published: Array<WireframeTypography | null> = []

    stage.bind((typography) => {
      published.push(typography)
    })
    expect(published[0]?.renderGlyphs).toHaveLength(5)
    expect(stage.visible).toBe(false)

    stage.setActive(true)
    expect(stage.visible).toBe(true)
    stage.setActive(false)
    expect(stage.visible).toBe(false)

    stage.dispose()
    expect(stage.visible).toBe(false)
    expect(published.at(-1)).toBeNull()
  })
})
