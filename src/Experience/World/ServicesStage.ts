import * as THREE from 'three'
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu'

/** Event driven Services sculpture. Its settled pose never changes by itself. */
export class ServicesStage {
  private disposed = false
  private _visible = false
  private root: THREE.Group | null = null
  private readonly metal = new MeshStandardNodeMaterial({
    color: 0x536571,
    metalness: 0.34,
    roughness: 0.42,
    fog: false,
  })
  private readonly signal = new MeshBasicNodeMaterial({ color: 0x58e6a9, fog: false })
  private readonly rail = new MeshBasicNodeMaterial({
    color: 0x385b80,
    transparent: true,
    opacity: 0.42,
    fog: false,
  })
  private readonly targets = Array.from({ length: 5 }, () => new THREE.Vector3())
  private readonly worldPosition = new THREE.Vector3()
  private readonly offset = new THREE.Vector3()
  private state = -1
  private settled = true
  private parts: THREE.Mesh[] = []
  private rings: THREE.Mesh[] = []

  get visible(): boolean {
    return this._visible
  }
  set visible(value: boolean) {
    this._visible = value
    if (this.root) this.root.visible = value
  }
  get metalMaterial(): MeshStandardNodeMaterial {
    return this.metal
  }
  get signalMaterial(): MeshBasicNodeMaterial {
    return this.signal
  }
  get railMaterial(): MeshBasicNodeMaterial {
    return this.rail
  }

  adopt(nodes: { root: THREE.Group; parts: THREE.Mesh[]; rings: THREE.Mesh[] }): void {
    this.root = nodes.root
    this.root.visible = this._visible
    this.parts = nodes.parts
    this.rings = nodes.rings
  }

  get isAnimating(): boolean {
    return this.visible && !this.settled
  }

  updateState(
    camera: THREE.PerspectiveCamera,
    chapter: number,
    dt: number,
    reduced: boolean,
  ): void {
    if (this.disposed || !this.root || this.parts.length !== 5 || this.rings.length !== 2) return
    camera.getWorldPosition(this.worldPosition)
    this.root.position.copy(this.worldPosition)
    this.root.quaternion.copy(camera.quaternion)

    const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 5
    const mobile = camera.aspect < 1.2
    const scale = Math.min(height * (mobile ? 0.19 : 0.255), height * camera.aspect * 0.24)

    if (chapter !== this.state) {
      this.state = chapter
      const layouts: readonly (readonly [number, number, number][])[] = [
        [
          [0, 0, 0],
          [-0.82, 0.08, -0.2],
          [0.03, 0.82, 0.16],
          [0.82, -0.02, -0.08],
          [-0.06, -0.82, 0.2],
        ],
        [
          [0, 0, 0],
          [-1.12, 0.42, -0.22],
          [-0.38, 0.14, 0.18],
          [0.38, -0.14, -0.18],
          [1.12, -0.42, 0.22],
        ],
        [
          [0, 0, 0],
          [-0.92, 0.58, -0.2],
          [-0.52, -0.62, 0.22],
          [0.56, 0.62, -0.18],
          [0.94, -0.5, 0.2],
        ],
        [
          [0, 0, 0],
          [-0.88, 0.52, -0.2],
          [0.88, 0.52, 0.2],
          [-0.88, -0.52, 0.18],
          [0.88, -0.52, -0.18],
        ],
      ]
      const layout = layouts[THREE.MathUtils.clamp(chapter, 0, layouts.length - 1)]!
      layout.forEach((position, index) =>
        this.targets[index]!.set(position[0], position[1], position[2]),
      )
      // The nested rails only change pose with a chapter; neither rotates at idle.
      this.rings[0]!.rotation.set(0.22 + chapter * 0.11, 0, -0.3 + chapter * 0.18)
      this.rings[1]!.rotation.set(1.15 - chapter * 0.09, 0.24, 0.42 - chapter * 0.12)
    }

    this.settled = true
    this.parts.forEach((part, index) => {
      const target = this.targets[index]!
      if (reduced) part.position.copy(target)
      else part.position.lerp(target, 1 - Math.exp(-Math.max(dt, 0) * 7))
      if (part.position.distanceToSquared(target) > 0.000001) this.settled = false
      else part.position.copy(target)
      part.rotation.set(index === 0 ? 0.42 : 0.36, index === 0 ? 0.52 : -0.46, index * 0.12)
    })

    this.rings[0]!.scale.setScalar(chapter === 2 ? 1.75 : chapter === 1 ? 1.48 : 1.58)
    this.rings[1]!.scale.setScalar(chapter === 2 ? 1.35 : 1.2)
    this.root.scale.setScalar(scale)
    this.offset.set(mobile ? 0 : height * camera.aspect * 0.22, mobile ? height * 0.13 : 0, -5)
    this.offset.applyQuaternion(camera.quaternion)
    this.root.position.add(this.offset)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.metal.dispose()
    this.signal.dispose()
    this.rail.dispose()
    this.parts.length = 0
    this.rings.length = 0
    this.root = null
  }
}
