// DrawTrail — restrained GPU cursor signal for the standalone Works route.
//
// A real triangle-strip ribbon stays attached to the cursor's world-space
// history. The material uses the Studio Console's lime/teal signals, and the
// whole trace decays after the pointer stops so it never leaves a frozen line.
//
// Declarative boundary: the owner structure (root group + ribbon mesh) is
// declared by `app/scene/CursorTrailOwner.vue` and reaches this controller
// through the `CursorTrailNodes` bag. The pointer history, the hand-built
// ribbon geometry and the TSL signal material are behavior — they stay here
// and are assigned onto the adopted mesh.
//
// HERMES §1: TSL NodeMaterial only.
// HERMES §35: works section (idx=3) ONLY.

import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Fn, vec3, float, uniform, uv, sin, mix, smoothstep } from 'three/tsl'
import { input } from '../Input'
import { prefersReducedMotion } from '../../core/motionPolicy'
import { smoothstep01 } from '../../Utils/easing'

const TRAIL_LENGTH = 36
const RIBBON_WIDTH = 0.115

const createTrailUniforms = () => ({
  uTime: uniform(0),
  uVelocity: uniform(0),
  uEnergy: uniform(0),
})
type TrailUniforms = ReturnType<typeof createTrailUniforms>

// ── Fragment: a low-noise Studio Console signal ──
// UV.x = along ribbon (0=head/bright, 1=tail/transparent)
// UV.y = across ribbon (0..1, center=0.5)
const createTrailColorNode = (trailUniforms: TrailUniforms) =>
  Fn(() => {
    const vUv = uv()
    const along = vUv.x
    const across = vUv.y
    const signal = sin(along.mul(9.0).sub(trailUniforms.uTime.mul(5.0)))
      .mul(0.5)
      .add(0.5)
    const head = smoothstep(float(0.22), float(0.0), along)
    let color = mix(vec3(0.271, 0.843, 0.737), vec3(0.722, 0.929, 0.412), signal)
    color = mix(color, vec3(1.0), head.mul(0.32))

    const acrossSoft = smoothstep(float(0.0), float(0.5), across).mul(
      smoothstep(float(1.0), float(0.5), across),
    )
    color = color.mul(acrossSoft.mul(0.38).add(0.62))

    return color
  })()

const createTrailOpacityNode = (trailUniforms: TrailUniforms) =>
  Fn(() => {
    const vUv = uv()
    const along = vUv.x
    const across = vUv.y
    const fade = float(1.0).sub(along)
    const fadeInt = fade.mul(fade).mul(fade)
    const headBoost = smoothstep(float(0.18), float(0.0), along).mul(0.18)
    const acrossSoft = smoothstep(float(0.0), float(0.5), across).mul(
      smoothstep(float(1.0), float(0.5), across),
    )
    const velocity = trailUniforms.uVelocity.mul(0.32).add(0.68)

    return fadeInt.add(headBoost).mul(acrossSoft).mul(velocity).mul(trailUniforms.uEnergy)
  })()

/** The declarative nodes `CursorTrailOwner.vue` hands to this controller. */
export interface CursorTrailNodes {
  /** The owner root — hidden until the Works route gates it on. */
  root: THREE.Group
  /** The ribbon leaf (geometry + TSL signal material assigned by the
   *  controller below). */
  ribbon: THREE.Mesh
}

export class DrawTrail {
  private readonly _root: THREE.Group
  private readonly _ribbon: THREE.Mesh
  private readonly _uniforms = createTrailUniforms()
  private geometry: THREE.BufferGeometry
  private positions: Float32Array // ribbon vertex positions (TRAIL_LENGTH * 2 * 3)
  private uvs: Float32Array // UVs (TRAIL_LENGTH * 2 * 2)
  private indices: Uint16Array // triangle strip indices
  private trailPositions: THREE.Vector3[] = []
  private initialized = false
  private _ndc = new THREE.Vector3()
  private _prevNdc = new THREE.Vector2()
  // Reused camera-basis scratch vectors; this owner runs in the render loop and
  // must not allocate three Vector3 instances on every ribbon rebuild.
  private _cameraRight = new THREE.Vector3()
  private _cameraUp = new THREE.Vector3()
  private _cameraForward = new THREE.Vector3()
  private _lastCameraRight = new THREE.Vector3()
  private _lastCameraUp = new THREE.Vector3()
  private _lastCameraForward = new THREE.Vector3()
  private _lastCameraWorld = new THREE.Matrix4()
  private _hasCameraBasis = false
  private _hasCameraWorld = false
  private _velocity = 0
  private _energy = 0
  private _geometryDirty = true
  private _reducedMotion = prefersReducedMotion()

  public get isAnimating(): boolean {
    return !this._reducedMotion && this._energy > 0.008
  }

  /** Settle the cursor trail at the owner boundary when motion is reduced. */
  setReducedMotion(reduced: boolean): void {
    this._reducedMotion = reduced
    if (!reduced) return
    this._energy = 0
    this._velocity = 0
    this._uniforms.uEnergy.value = 0
    this._uniforms.uVelocity.value = 0
    this.initialized = false
    this._geometryDirty = false
    this._hasCameraBasis = false
    this._hasCameraWorld = false
  }

  constructor(nodes: CursorTrailNodes) {
    this._root = nodes.root
    this._ribbon = nodes.ribbon

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this.trailPositions.push(new THREE.Vector3())
    }

    // Ribbon geometry: 2 vertices per trail point (left + right edge)
    // Triangle strip via indexed geometry
    this.positions = new Float32Array(TRAIL_LENGTH * 2 * 3)
    this.uvs = new Float32Array(TRAIL_LENGTH * 2 * 2)
    this.indices = new Uint16Array((TRAIL_LENGTH - 1) * 6) // 2 triangles per segment

    // Build UVs (static): along = i/(N-1), across = 0 or 1
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const along = i / (TRAIL_LENGTH - 1)
      this.uvs[i * 4] = along // left vertex U
      this.uvs[i * 4 + 1] = 0 // left vertex V
      this.uvs[i * 4 + 2] = along // right vertex U
      this.uvs[i * 4 + 3] = 1 // right vertex V
    }

    // Build indices (static): 2 triangles per segment
    for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
      const idx = i * 6
      const vi = i * 2 // vertex index
      this.indices[idx] = vi // triangle 1: left-current
      this.indices[idx + 1] = vi + 1 // right-current
      this.indices[idx + 2] = vi + 2 // left-next
      this.indices[idx + 3] = vi + 1 // triangle 2: right-current
      this.indices[idx + 4] = vi + 3 // right-next
      this.indices[idx + 5] = vi + 2 // left-next
    }

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      // R-11 fix: toneMapped=false keeps additive glow energy predictable.
      toneMapped: false,
    })
    material.colorNode = createTrailColorNode(this._uniforms)
    ;(material as unknown as { opacityNode: unknown }).opacityNode = createTrailOpacityNode(
      this._uniforms,
    )

    // The Tres-mounted leaf carries placeholder default resources until the
    // behavior owns the ribbon graph; neither placeholder ever rendered, so
    // they hold no GPU resources and are reclaimed by the GC.
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2))
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1))
    this._ribbon.geometry = this.geometry
    this._ribbon.material = material
  }

  get object(): THREE.Group {
    return this._root
  }

  update(_dt: number, camera: THREE.Camera): void {
    if (this._reducedMotion) {
      this.setReducedMotion(true)
      return
    }
    const mouse = input.getMouse()
    const pointerChanged = mouse.x !== this._prevNdc.x || mouse.y !== this._prevNdc.y
    const cameraMatrixChanged =
      !this._hasCameraWorld || !camera.matrixWorld.equals(this._lastCameraWorld)

    // Once the trail is fully settled, identical pointer and camera state do
    // not require basis extraction, unprojection, ray construction or uniform
    // writes. Keep the first frame and all actual wake-up signals live.
    if (!this.initialized || pointerChanged || cameraMatrixChanged || this.isAnimating) {
      // Continue through the active path below.
    } else {
      if (this._energy > 0) {
        this._energy = 0
        this._uniforms.uEnergy.value = 0
      }
      return
    }

    // Ribbon vertices are camera-facing. A static pointer still needs a
    // rebuild when a moving camera changes that basis, but not on a fixed
    // cadence while only the energy uniform decays.
    camera.matrixWorld.extractBasis(this._cameraRight, this._cameraUp, this._cameraForward)
    const cameraBasisChanged =
      !this._hasCameraBasis ||
      !this._cameraRight.equals(this._lastCameraRight) ||
      !this._cameraUp.equals(this._lastCameraUp) ||
      !this._cameraForward.equals(this._lastCameraForward)
    if (cameraBasisChanged) {
      this._lastCameraRight.copy(this._cameraRight)
      this._lastCameraUp.copy(this._cameraUp)
      this._lastCameraForward.copy(this._cameraForward)
      this._hasCameraBasis = true
      this._geometryDirty = true
    }
    this._lastCameraWorld.copy(camera.matrixWorld)
    this._hasCameraWorld = true

    // Track velocity (NDC units per frame).
    const velNdc = Math.hypot(mouse.x - this._prevNdc.x, mouse.y - this._prevNdc.y)
    this._velocity = this._velocity * 0.78 + velNdc * 0.22
    this._prevNdc.set(mouse.x, mouse.y)
    this._uniforms.uVelocity.value = Math.min(1, this._velocity * 20)

    // Unproject cursor NDC to world ray, intersect z=0 plane
    this._ndc.set(mouse.x, mouse.y, 0.5)
    this._ndc.unproject(camera)
    const dirX = this._ndc.x - camera.position.x
    const dirY = this._ndc.y - camera.position.y
    const dirZ = this._ndc.z - camera.position.z
    const t = dirZ !== 0 ? -camera.position.z / dirZ : 5
    const dist = Math.max(0.1, Math.min(Math.abs(t), 20))
    this._ndc.set(
      camera.position.x + dirX * (dist * Math.sign(t)),
      camera.position.y + dirY * (dist * Math.sign(t)),
      0,
    )

    if (!this.initialized) {
      for (const p of this.trailPositions) {
        p.copy(this._ndc)
      }
      this.initialized = true
      this._geometryDirty = true
    }

    // Shift only for a meaningful pointer change; retain the trace while it
    // fades when idle.
    if (velNdc > 0.0001) {
      for (let i = this.trailPositions.length - 1; i > 0; i--) {
        this.trailPositions[i]!.copy(this.trailPositions[i - 1]!)
      }
      this.trailPositions[0]!.copy(this._ndc)
      this._energy = 1
      this._geometryDirty = true
    } else {
      this._energy *= Math.exp(-_dt * 5.5)
    }
    this._uniforms.uEnergy.value = this._energy

    // Rebuild immediately after input, then at a restrained cadence while the
    // trace settles.
    if (this._geometryDirty) {
      this._rebuildRibbon(camera)
      this._geometryDirty = false
    }

    this._uniforms.uTime.value += _dt
  }

  /** Rebuild a camera-facing ribbon perpendicular to each segment.
   *
   * Offsetting every point only by the camera-right vector made horizontal
   * cursor travel collapse into zero-area triangles. A local perpendicular is
   * stable for horizontal, vertical and diagonal gestures. */
  private _rebuildRibbon(camera: THREE.Camera): void {
    const headWidth = RIBBON_WIDTH * (0.75 + this._uniforms.uVelocity.value * 0.85)
    const tailWidth = headWidth * 0.045
    camera.matrixWorld.extractBasis(this._cameraRight, this._cameraUp, this._cameraForward)
    const camRight = this._cameraRight

    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const p = this.trailPositions[i]!
      const i6 = i * 6
      const taperT = i / (TRAIL_LENGTH - 1)
      const taper = smoothstep01(taperT)
      const width = headWidth * (1 - taper) + tailWidth * taper
      const before = this.trailPositions[Math.max(0, i - 1)]!
      const after = this.trailPositions[Math.min(TRAIL_LENGTH - 1, i + 1)]!
      const tangentX = before.x - after.x
      const tangentY = before.y - after.y
      const tangentLength = Math.hypot(tangentX, tangentY)
      const offsetX = tangentLength > 0.00001 ? -tangentY / tangentLength : camRight.x
      const offsetY = tangentLength > 0.00001 ? tangentX / tangentLength : camRight.y
      const halfWidth = width * 0.5

      this.positions[i6] = p.x - offsetX * halfWidth
      this.positions[i6 + 1] = p.y - offsetY * halfWidth
      this.positions[i6 + 2] = p.z
      this.positions[i6 + 3] = p.x + offsetX * halfWidth
      this.positions[i6 + 4] = p.y + offsetY * halfWidth
      this.positions[i6 + 5] = p.z
    }

    this.geometry.attributes.position!.needsUpdate = true
  }

  setVisible(visible: boolean): void {
    this._root.visible = visible
    if (!visible) {
      this._energy = 0
      this._uniforms.uEnergy.value = 0
      this.initialized = false
      this._hasCameraBasis = false
      this._hasCameraWorld = false
      this._geometryDirty = true
    }
  }

  dispose(): void {
    this._reducedMotion = true
    this._energy = 0
    this.initialized = false
    this._geometryDirty = false
    this._hasCameraBasis = false
    this._hasCameraWorld = false
    // The ribbon geometry + TSL signal material are controller-created —
    // they die here. The declarative root/ribbon nodes stay with the Vue
    // host (they leave the scene with CursorTrailOwner's unmount).
    this.geometry.dispose()
    ;(this._ribbon.material as THREE.Material).dispose()
  }
}
