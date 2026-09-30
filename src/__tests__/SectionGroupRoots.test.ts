import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import type { Group } from 'three'
import SectionGroupRoots from '../app/scene/SectionGroupRoots.vue'

describe('SectionGroupRoots declarative Tres spike', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })
  afterEach(() => document.body.replaceChildren())

  it('emits six stable roots and releases them with the subtree', async () => {
    let groups: Group[] = []
    const { scene, unmount } = await mountSceneCanvas(SectionGroupRoots, {
      onReady: (value: Group[]) => (groups = value),
    })

    expect(groups.map((group) => group.name)).toEqual([
      'section-lab',
      'section-intro',
      'section-about',
      'section-works',
      'section-contact',
      'section-menu',
    ])
    expect(groups.every((group) => group.parent === scene)).toBe(true)
    unmount()
    expect(groups.every((group) => group.parent === null)).toBe(true)
  })
})
