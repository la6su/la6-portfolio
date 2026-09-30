import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { input } from '../Input'
import { prefersReducedMotion } from '../../core/motionPolicy'

/**
 * A self-contained Lab object. It deliberately uses ordinary PBR materials:
 * scene.environment supplies the shared reflection map, so the experiment
 * does not allocate its own PMREM renderer or texture set.
 *
 * Motion follows the shared brand language: a damped pointer tilt around the
 * authored pose, one low-frequency hover clock and a slow crank spin — all
 * uniform-free CPU transforms advanced only inside update(dt) on rendered
 * frames (demand-driven contract; never a global `time`). Amplitudes are
 * capped so the object reads as a resting prop, not a light show, and under
 * reduced motion everything snaps to the authored static pose.
 */

/** Authored display pose — every motion state settles back to this. */
const AUTHORED_ROTATION = new THREE.Euler(-0.12, -0.24, 0.04)
const AUTHORED_POSITION_Y = 0

/** Pointer tilt caps (rad) — bounded so the prop never leaves its framing. */
const TILT_YAW = 0.2
const TILT_PITCH = 0.12
const TILT_ROLL = 0.05
/** Low-frequency hover clock (world units under the authored framing). */
const FLOAT_AMPLITUDE = 0.016
const FLOAT_SPEED = 0.55
/** Slow authored crank spin (rad/s). */
const CRANK_SPEED = 0.42
/** Damp rates — pointer chase and clock-advance parity with the halo stage. */
const POINTER_DAMP = 3.0

export class LabGamepad extends THREE.Group {
  private readonly _geometries: THREE.BufferGeometry[] = []
  private readonly _materials: THREE.Material[] = []

  private reducedMotion = prefersReducedMotion()
  // Idle clock — advanced only on rendered frames inside update(dt).
  private _clock = 0
  // Damped pointer state (preallocated, mirrors ContactHaloStage).
  private readonly _pointerTarget = new THREE.Vector2(0, 0)
  private readonly _pointerSmooth = new THREE.Vector2(0, 0)

  private readonly _crankPivot: THREE.Group

  constructor() {
    super()
    this.name = 'lab-gamepad'
    this.scale.setScalar(0.009)
    this.position.set(0, 0, 0)
    this.rotation.set(-0.12, -0.24, 0.04)

    const shell = this._material(
      new THREE.MeshPhysicalMaterial({
        color: 0xe9e6df,
        roughness: 0.23,
        metalness: 0.12,
        clearcoat: 0.75,
        clearcoatRoughness: 0.14,
        envMapIntensity: 1.2,
      }),
    )
    const accent = this._material(
      new THREE.MeshPhysicalMaterial({
        color: 0xb8f45a,
        roughness: 0.28,
        metalness: 0.08,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      }),
    )
    const dark = this._material(
      new THREE.MeshStandardMaterial({ color: 0x101313, roughness: 0.42, metalness: 0.2 }),
    )
    const metal = this._material(
      new THREE.MeshStandardMaterial({ color: 0x9ca5a4, roughness: 0.26, metalness: 0.9 }),
    )

    const body = new THREE.Mesh(this._geometry(new RoundedBoxGeometry(120, 90, 12, 8, 5)), shell)
    body.name = 'gamepad-body'
    body.castShadow = true
    body.receiveShadow = true
    this.add(body)

    this._addBox('screen-frame', 94, 58, 2.4, 0, 11, 7.2, dark)
    this._addBox('screen', 87, 51, 1.8, 0, 11, 9.15, metal)

    const dpad = new THREE.Mesh(this._geometry(this._createDPadGeometry()), accent)
    dpad.name = 'gamepad-dpad'
    dpad.position.set(-35, -25, 8.5)
    dpad.castShadow = true
    this.add(dpad)

    const buttonGeometry = this._geometry(new THREE.CylinderGeometry(6, 6, 3, 32))
    buttonGeometry.rotateX(Math.PI / 2)
    this._addMesh('button-a', buttonGeometry, accent, 25, -25, 8.5)
    this._addMesh('button-b', buttonGeometry, accent, 45, -25, 8.5)

    const screwGeometry = this._geometry(new THREE.CylinderGeometry(2.5, 2.5, 1.2, 20))
    screwGeometry.rotateX(Math.PI / 2)
    const screwPositions: ReadonlyArray<readonly [number, number]> = [
      [-54, -35],
      [54, -35],
      [-54, 35],
      [54, 35],
    ]
    for (const [x, y] of screwPositions) {
      this._addMesh('gamepad-screw', screwGeometry, metal, x, y, 7.4)
    }

    // Crank: arm + knob live in a pivot at the crank axle so a slow authored
    // spin orbits the knob without per-frame vector churn.
    const crankPivot = new THREE.Group()
    crankPivot.name = 'gamepad-crank'
    crankPivot.position.set(65, 0, 0)
    this.add(crankPivot)
    this._crankPivot = crankPivot

    const arm = new THREE.Mesh(this._geometry(new RoundedBoxGeometry(5.5, 28, 5.5, 6, 3)), metal)
    arm.name = 'crank-arm'
    arm.castShadow = true
    crankPivot.add(arm)

    const knob = new THREE.Mesh(this._geometry(new THREE.SphereGeometry(5.5, 24, 16)), accent)
    knob.name = 'gamepad-crank-knob'
    knob.position.set(0, 17, 0)
    knob.castShadow = true
    crankPivot.add(knob)
  }

  private _geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this._geometries.push(geometry)
    return geometry
  }

  private _material<T extends THREE.Material>(material: T): T {
    this._materials.push(material)
    return material
  }

  private _addBox(
    name: string,
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): void {
    this._addMesh(
      name,
      this._geometry(new RoundedBoxGeometry(width, height, depth, 6, 3)),
      material,
      x,
      y,
      z,
    )
  }

  private _addMesh(
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): void {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    this.add(mesh)
  }

  private _createDPadGeometry(): THREE.BufferGeometry {
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

  /** Ambient-motion signal: the hover clock keeps breathing while on /lab
   *  (mirrors ContactTypographyStage.isAnimating — an intentional primary
   *  object, not decoration). Reduced motion never advertises animation. */
  get isAnimating(): boolean {
    return !this.reducedMotion && this.visible
  }

  /** Advance the authored motion. Called from SceneCoordinator.update on
   *  rendered frames only; a hidden object never advances its clock. */
  update(dt: number): void {
    if (!this.visible || this.reducedMotion) return

    const mouse = input.getMouse()
    this._pointerTarget.set(mouse.x, mouse.y)
    this._pointerSmooth.x +=
      (this._pointerTarget.x - this._pointerSmooth.x) * Math.min(1, dt * POINTER_DAMP)
    this._pointerSmooth.y +=
      (this._pointerTarget.y - this._pointerSmooth.y) * Math.min(1, dt * POINTER_DAMP)

    this._clock += dt

    // Tilt around the authored pose — damped, amplitude-capped.
    this.rotation.set(
      AUTHORED_ROTATION.x - this._pointerSmooth.y * TILT_PITCH,
      AUTHORED_ROTATION.y + this._pointerSmooth.x * TILT_YAW,
      AUTHORED_ROTATION.z + this._pointerSmooth.x * TILT_ROLL,
    )
    this.position.y = AUTHORED_POSITION_Y + FLOAT_AMPLITUDE * Math.sin(this._clock * FLOAT_SPEED)

    this._crankPivot.rotation.x -= dt * CRANK_SPEED
  }

  /** Forward a live preference change and settle any live motion. */
  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
    if (reduced) this.settleReducedMotion()
  }

  /** Clean re-entry: every route visit starts from the authored pose. */
  resetMotion(): void {
    this._clock = 0
    this._pointerTarget.set(0, 0)
    this.settleReducedMotion()
  }

  /** Snap the authored motion to its settled static state. */
  private settleReducedMotion(): void {
    this._pointerSmooth.set(0, 0)
    this.rotation.copy(AUTHORED_ROTATION)
    this.position.y = AUTHORED_POSITION_Y
    // The crank freezes at its current angle — a reset would jump visibly.
  }

  public dispose(): void {
    this.removeFromParent()
    this._geometries.forEach((geometry) => geometry.dispose())
    this._materials.forEach((material) => material.dispose())
    this.clear()
    this._geometries.length = 0
    this._materials.length = 0
  }
}
