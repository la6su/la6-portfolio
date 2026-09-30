import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { installCanvasPointerShims, mountSceneCanvas } from './tresHarness'
import CursorTrailOwner from '../app/scene/CursorTrailOwner.vue'
import type { CursorTrailNodes } from '../Experience/World/DrawTrail'

describe('CursorTrailOwner declarative Tres component', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => document.body.replaceChildren())

  it('mounts the declarative trail structure and releases it with the component', async () => {
    const mounted = { trail: null as CursorTrailNodes | null }
    const { scene, unmount } = await mountSceneCanvas(CursorTrailOwner, {
      onReady: (value: CursorTrailNodes) => {
        mounted.trail = value
      },
    })

    const trail = mounted.trail as CursorTrailNodes
    const root = scene.getObjectByName('draw-trail')
    expect(root).toBe(trail.root)
    // Hidden until the Works route gates it on; the ribbon geometry + TSL
    // signal material are behavior-assigned by the controller after
    // Experience adopts the node.
    expect(trail.root.visible).toBe(false)
    expect(trail.root.children).toHaveLength(1)
    expect(trail.ribbon.name).toBe('trail-ribbon')
    expect(trail.ribbon.renderOrder).toBe(7)
    expect(trail.ribbon.frustumCulled).toBe(false)

    unmount()

    expect(scene.getObjectByName('draw-trail')).toBeUndefined()
  })
})
