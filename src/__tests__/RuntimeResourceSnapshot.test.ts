import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { captureRuntimeResourceSnapshot } from '../core/RuntimeResourceSnapshot'

describe('captureRuntimeResourceSnapshot', () => {
  it('deduplicates scene-owned geometry, material and texture resources', () => {
    const scene = new THREE.Scene()
    const texture = new THREE.Texture()
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshBasicMaterial({ map: texture })
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
    scene.environment = texture

    expect(
      captureRuntimeResourceSnapshot(
        scene,
        { info: { memory: { geometries: 1, textures: 1 }, programs: [{}] } },
        { renderTargets: 2, passes: 3, webgpuPipeline: true },
        1,
        2,
      ),
    ).toEqual({
      rendererCanvasCount: 1,
      documentCanvasCount: 2,
      scene: { geometries: 1, materials: 1, textures: 1 },
      renderer: { geometries: 1, textures: 1, programs: 1 },
      post: { renderTargets: 2, passes: 3, webgpuPipeline: true },
    })
  })

  it('separates the renderer canvas from the intentional cursor canvas', () => {
    const scene = new THREE.Scene()
    const rendererCanvas = document.createElement('canvas')
    rendererCanvas.className = 'canvas jlz-scene-canvas'
    document.body.append(rendererCanvas, document.createElement('canvas'))

    const snapshot = captureRuntimeResourceSnapshot(
      scene,
      { info: { memory: {}, programs: [] } },
      { renderTargets: 0, passes: 0, webgpuPipeline: false },
    )

    expect(snapshot.rendererCanvasCount).toBe(1)
    expect(snapshot.documentCanvasCount).toBe(2)
    document.body.replaceChildren()
  })
})
