import * as THREE from 'three'
import { shallowRef } from 'vue'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { input } from '../Input'
import { prefersReducedMotion } from '../../core/motionPolicy'

/** Authored display pose — every motion state settles back to this. */
export const LAB_GAMEPAD_POSE = {
  scale: 0.009,
  rotation: [-0.12, -0.24, 0.04] as const,
  position: [0, 0, 0] as const,
  crankPosition: [65, 0, 0] as const,
} as const

const AUTHORED_ROTATION = new THREE.Euler(...LAB_GAMEPAD_POSE.rotation)
const TILT_YAW = 0.2
const TILT_PITCH = 0.12
const TILT_ROLL = 0.05
const FLOAT_AMPLITUDE = 0.016
const FLOAT_SPEED = 0.55
const CRANK_SPEED = 0.42
const POINTER_DAMP = 3.0

export interface LabGamepadResources {
  geometry: {
    body: THREE.BufferGeometry
    screenFrame: THREE.BufferGeometry
    screen: THREE.BufferGeometry
    dpad: THREE.BufferGeometry
    button: THREE.BufferGeometry
    screw: THREE.BufferGeometry
    crankArm: THREE.BufferGeometry
    crankKnob: THREE.BufferGeometry
  }
  material: {
    shell: THREE.Material
    accent: THREE.Material
    dark: THREE.Material
    metal: THREE.Material
  }
  dispose(): void
}

/** Build the controller's owned resources without creating scene nodes. */
function createResources(): LabGamepadResources {
  const geometry = {
    body: new RoundedBoxGeometry(120, 90, 12, 8, 5),
    screenFrame: new RoundedBoxGeometry(94, 58, 2.4, 6, 3),
    screen: new RoundedBoxGeometry(87, 51, 1.8, 6, 3),
    dpad: createDPadGeometry(),
    button: new THREE.CylinderGeometry(6, 6, 3, 32),
    screw: new THREE.CylinderGeometry(2.5, 2.5, 1.2, 20),
    crankArm: new RoundedBoxGeometry(5.5, 28, 5.5, 6, 3),
    crankKnob: new THREE.SphereGeometry(5.5, 24, 16),
  }
  geometry.button.rotateX(Math.PI / 2)
  geometry.screw.rotateX(Math.PI / 2)

  const material = {
    shell: new THREE.MeshPhysicalMaterial({
      color: 0xe9e6df,
      roughness: 0.23,
      metalness: 0.12,
      clearcoat: 0.75,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.2,
    }),
    accent: new THREE.MeshPhysicalMaterial({
      color: 0xb8f45a,
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x101313, roughness: 0.42, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9ca5a4, roughness: 0.26, metalness: 0.9 }),
  }
  const geometries = Object.values(geometry)
  const materials = Object.values(material)
  let disposed = false

  return {
    geometry,
    material,
    dispose() {
      if (disposed) return
      disposed = true
      geometries.forEach((item) => item.dispose())
      materials.forEach((item) => item.dispose())
    },
  }
}

function createDPadGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  const points: Array<[number, number]> = [
    [-8, -3],
    [-3, -3],
    [-3, -8],
    [3, -8],
    [3, -3],
    [8, -3],
    [8, 3],
    [3, 3],
    [3, 8],
    [-3, 8],
    [-3, 3],
    [-8, 3],
  ]
  points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 3,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.65,
    bevelThickness: 0.65,
    curveSegments: 4,
  })
  geometry.center()
  return geometry
}

/** Behavior controller for the declarative Lab gamepad scene. */
export class LabGamepad {
  readonly resources = createResources()
  private reducedMotion = prefersReducedMotion()
  private disposed = false
  private readonly _visible = shallowRef(false)
  private _root: THREE.Group | null = null
  private _crankPivot: THREE.Group | null = null
  private _clock = 0
  private readonly _pointerTarget = new THREE.Vector2(0, 0)
  private readonly _pointerSmooth = new THREE.Vector2(0, 0)

  get visible(): boolean {
    return this._visible.value
  }

  set visible(value: boolean) {
    this._visible.value = value
  }

  bindNodes(root: THREE.Group, crankPivot: THREE.Group): void {
    if (this.disposed) return
    this._root = root
    this._crankPivot = crankPivot
  }

  unbindNodes(root: THREE.Group): void {
    if (this._root !== root) return
    this._root = null
    this._crankPivot = null
  }

  /** Ambient-motion signal: the hover clock keeps breathing while on /lab. */
  get isAnimating(): boolean {
    return !this.disposed && !this.reducedMotion && this.visible
  }

  /** Advance authored motion only on rendered frames. */
  update(dt: number): void {
    const root = this._root
    if (this.disposed || !root || !this.visible || this.reducedMotion) return

    const mouse = input.getMouse()
    this._pointerTarget.set(mouse.x, mouse.y)
    this._pointerSmooth.x +=
      (this._pointerTarget.x - this._pointerSmooth.x) * Math.min(1, dt * POINTER_DAMP)
    this._pointerSmooth.y +=
      (this._pointerTarget.y - this._pointerSmooth.y) * Math.min(1, dt * POINTER_DAMP)

    this._clock += dt
    root.rotation.set(
      AUTHORED_ROTATION.x - this._pointerSmooth.y * TILT_PITCH,
      AUTHORED_ROTATION.y + this._pointerSmooth.x * TILT_YAW,
      AUTHORED_ROTATION.z + this._pointerSmooth.x * TILT_ROLL,
    )
    root.position.y = FLOAT_AMPLITUDE * Math.sin(this._clock * FLOAT_SPEED)
    if (this._crankPivot) this._crankPivot.rotation.x -= dt * CRANK_SPEED
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
    if (reduced) this.settleReducedMotion()
  }

  resetMotion(): void {
    this._clock = 0
    this._pointerTarget.set(0, 0)
    this.settleReducedMotion()
  }

  private settleReducedMotion(): void {
    this._pointerSmooth.set(0, 0)
    this._root?.rotation.copy(AUTHORED_ROTATION)
    if (this._root) this._root.position.y = LAB_GAMEPAD_POSE.position[1]
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.visible = false
    this._root = null
    this._crankPivot = null
    this.resources.dispose()
  }
}
