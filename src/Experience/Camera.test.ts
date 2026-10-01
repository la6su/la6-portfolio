import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Camera } from './Camera'

describe('CameraControls ownership', () => {
  it('yields while the live SceneHost policy says controls own the pose', () => {
    let controlsOwnPose = true
    const instance = new THREE.PerspectiveCamera()
    const camera = new Camera(instance, true, () => false, () => controlsOwnPose)
    instance.position.set(2, 1, 4)
    const orbitPose = instance.position.clone()

    camera.update(1 / 60)
    expect(instance.position.equals(orbitPose)).toBe(true)

    controlsOwnPose = false
    camera.update(1 / 60)
    expect(instance.position.distanceTo(orbitPose)).toBeLessThan(0.001)
    camera.destroy()
  })
})
