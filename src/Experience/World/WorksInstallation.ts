import * as THREE from 'three'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import { WORKS_ROOMS } from '../../core/worksExperience'

const PROJECT_SIGNALS = [
  0xffd60a, 0x58e6a9, 0xb18cff, 0x79c0ff, 0x6fc7ff, 0xff9f68, 0x9d8cff, 0x6dd5bc,
]

export interface WorksInstallationNodes {
  assembly: THREE.Group
  arcs: readonly THREE.Mesh[]
  trace: THREE.Mesh
  ticks: THREE.InstancedMesh
}

/**
 * Camera-local motion and material controller for the Works instrument.
 * Vue/Tres declares its mesh and geometry subtree; this owner deliberately
 * retains the two shared NodeMaterials until their own lifecycle slice.
 */
export class WorksInstallation {
  private readonly metal = new MeshStandardNodeMaterial({
    color: 0x81949c,
    metalness: 0.85,
    roughness: 0.29,
    emissive: 0x122632,
    emissiveIntensity: 0.3,
    fog: false,
  })
  private readonly signal = new MeshBasicNodeMaterial({ color: 0x79c0ff, fog: false })
  private readonly target = new THREE.Quaternion()
  private readonly targetColor = new THREE.Color()
  private readonly euler = new THREE.Euler()
  private nodes: WorksInstallationNodes | null = null
  private disposed = false
  private room = -1
  private inverse = false
  private project = -1

  constructor() {}

  get metalMaterial(): MeshStandardNodeMaterial {
    return this.metal
  }

  get signalMaterial(): MeshBasicNodeMaterial {
    return this.signal
  }

  /** Vue emits the declared nodes once their real Tres instances are mounted. */
  adopt(nodes: WorksInstallationNodes): void {
    if (this.disposed) return
    this.nodes = nodes
    this.applyProject(this.project < 0 ? 0 : this.project)
    if (this.room >= 0) this.setRoom(this.room, false)
  }

  /** Release Vue-owned nodes without retiring the shared material controller. */
  release(nodes: WorksInstallationNodes): void {
    if (this.nodes === nodes) this.nodes = null
  }

  setRoom(index: number, snap: boolean): void {
    if (this.disposed) return
    if (this.room !== index) {
      this.room = index
      const room = WORKS_ROOMS[index] ?? WORKS_ROOMS[0]
      this.target.setFromEuler(this.euler.set(0.28 + index * 0.12, -0.45, room.rotation))
      this.targetColor.setHex(room.signal)
    }
    if (this.project < 0) this.setProject(WORKS_ROOMS[index]?.projectIndex ?? 0)
    if (snap && this.nodes) {
      this.nodes.assembly.quaternion.copy(this.target)
      this.signal.color.copy(this.targetColor)
    }
  }

  /** Shape the installation around the actual case, not the route label. */
  setProject(index: number): void {
    if (this.disposed || this.project === index) return
    this.project = index
    this.applyProject(index)
  }

  private applyProject(index: number): void {
    const signal = PROJECT_SIGNALS[index] ?? PROJECT_SIGNALS[0]!
    this.targetColor.setHex(signal)
    this.signal.color.setHex(signal)
    const nodes = this.nodes
    if (!nodes) return
    const mode = index % 4
    nodes.arcs.forEach((arc, arcIndex) => {
      arc.scale.setScalar(mode === 1 ? 0.72 + arcIndex * 0.08 : mode === 2 ? 1.05 : 1)
      arc.rotation.x =
        mode === 0 ? arcIndex * 0.42 : mode === 1 ? 0.12 : mode === 2 ? -0.35 + arcIndex * 0.2 : 0.6
      arc.rotation.y = mode === 3 ? arcIndex * 0.48 : -0.3
    })
    nodes.trace.position.set(mode === 1 ? 0 : mode === 2 ? 0.12 : 0, mode === 3 ? 0.14 : 0, 0.055)
    nodes.trace.scale.setScalar(mode === 2 ? 1.16 : 1)
    nodes.ticks.visible = mode !== 1
    nodes.assembly.rotation.z = mode === 3 ? -0.7 : mode === 2 ? 0.35 : 0
  }

  setInverse(inverse: boolean): void {
    if (this.disposed || this.inverse === inverse) return
    this.inverse = inverse
    this.metal.color.setHex(inverse ? 0x38444b : 0x81949c)
  }

  /** Apply the parent stage's camera-local layout to the declared assembly. */
  setCameraLocalLayout(x: number, y: number, z: number, scale: number): void {
    if (this.disposed || !this.nodes) return
    this.nodes.assembly.position.set(x, y, z)
    this.nodes.assembly.scale.setScalar(scale)
  }

  get isAnimating(): boolean {
    return (
      !this.disposed && !!this.nodes && this.nodes.assembly.quaternion.angleTo(this.target) > 0.001
    )
  }

  update(dt: number): void {
    if (this.disposed || !this.isAnimating || !this.nodes) return
    this.nodes.assembly.quaternion.slerp(this.target, 1 - Math.exp(-dt * 5))
    this.signal.color.lerp(this.targetColor, 1 - Math.exp(-dt * 5))
    if (!this.isAnimating) {
      this.nodes.assembly.quaternion.copy(this.target)
      this.signal.color.copy(this.targetColor)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.nodes = null
    this.metal.dispose()
    this.signal.dispose()
  }
}
