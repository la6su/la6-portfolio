import { Group, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { ContactTypographyStage } from './ContactTypographyStage'
import type { WireframeTypography } from './WireframeTypography'

describe('ContactTypographyStage scene ownership', () => {
  it('adopts a Vue-owned root and publishes glyph content without owning attachment', () => {
    const stage = new ContactTypographyStage()
    const root = new Group()
    const scene = new Scene()
    const published: Array<WireframeTypography | null> = []
    scene.add(root)

    expect(stage).not.toBeInstanceOf(Group)
    stage.bindRoot(root, (typography) => {
      published.push(typography)
    })
    expect(root.name).toBe('contact-typography-stage')
    expect(published[0]?.renderGlyphs).toHaveLength(5)

    stage.setActive(true)
    expect(root.visible).toBe(true)

    stage.dispose()
    expect(root.visible).toBe(false)
    expect(root.parent).toBe(scene)
    expect(published.at(-1)).toBeNull()
  })
})
