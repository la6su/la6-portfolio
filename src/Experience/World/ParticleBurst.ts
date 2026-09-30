// ParticleBurst — geometric splash handoff for the intro opener.
//
// This is not a particle simulation. Three deterministic broken-square light
// frames
// contract toward the cube and dissolve into the first scene. All twelve
// strokes share one instanced draw call and one TSL material.
//
// Declarative boundary: the instanced-mesh leaf (plane geometry + instance
// count) is declared by `app/scene/IntroLightFramesOwner.vue` and reaches this
// controller through the `IntroLightFramesNodes` bag. The TSL trace material
// is behavior — it stays here and is assigned onto the adopted mesh.

import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Fn, float, smoothstep, uniform, vec3 } from 'three/tsl'
import { prefersReducedMotion } from '../../core/motionPolicy'

const FRAME_COUNT = 3
const SEGMENTS_PER_FRAME = 4
/** Instance count of the declarative `<TresInstancedMesh>` leaf. */
export const INTRO_TRACE_COUNT = FRAME_COUNT * SEGMENTS_PER_FRAME
const TRACE_DURATION = 1.05
const FRAME_RADII = [1.65, 1.15, 0.72] as const

/** The declarative node `IntroLightFramesOwner.vue` hands to this controller. */
export interface IntroLightFramesNodes {
  /** The instanced leaf (Tres-built plane geometry; trace material assigned
   *  by the controller below). */
  mesh: THREE.InstancedMesh
}

const createTraceUniforms = () => ({
  uTime: uniform(0),
  uDuration: uniform(TRACE_DURATION),
})
type TraceUniforms = ReturnType<typeof createTraceUniforms>

const createTraceColorNode = (traceUniforms: TraceUniforms) =>
  Fn(() => {
    const entrance = smoothstep(float(0), float(0.14), traceUniforms.uTime)
    const exit = float(1).sub(
      smoothstep(traceUniforms.uDuration.mul(0.42), traceUniforms.uDuration, traceUniforms.uTime),
    )
    const intensity = entrance.mul(exit)
    return vec3(0.72, 0.93, 0.41).mul(intensity.mul(0.7).add(0.3))
  })()

const createTraceOpacityNode = (traceUniforms: TraceUniforms) =>
  Fn(() => {
    const entrance = smoothstep(float(0), float(0.1), traceUniforms.uTime)
    const exit = float(1).sub(
      smoothstep(traceUniforms.uDuration.mul(0.38), traceUniforms.uDuration, traceUniforms.uTime),
    )
    return entrance.mul(exit).mul(0.78)
  })()

interface TraceSegment {
  frame: number
  side: number
}

export class ParticleBurst {
  private readonly _mesh: THREE.InstancedMesh
  private readonly _uniforms: TraceUniforms
  private readonly _dummy = new THREE.Object3D()
  private readonly _segments: TraceSegment[] = []
  private _active = false
  private _disposed = false
  private _reducedMotion = prefersReducedMotion()
  private _elapsed = 0
  private _origin = new THREE.Vector3()

  constructor(nodes: IntroLightFramesNodes) {
    this._mesh = nodes.mesh
    const uniforms = createTraceUniforms()
    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    })
    material.colorNode = createTraceColorNode(uniforms)
    ;(material as unknown as { opacityNode: unknown }).opacityNode =
      createTraceOpacityNode(uniforms)
    // The Tres-mounted leaf carries a placeholder default material until the
    // behavior owns the trace graph; the placeholder never rendered, so it
    // holds no GPU resources and is reclaimed by the GC.
    this._mesh.material = material
    this._uniforms = uniforms
    this._mesh.visible = false

    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      for (let side = 0; side < SEGMENTS_PER_FRAME; side++) {
        this._segments.push({ frame, side })
      }
    }
  }

  /** Owner scene visibility (mirrors the burst's active state). */
  get visible(): boolean {
    return this._mesh.visible
  }

  set visible(value: boolean) {
    this._mesh.visible = value
  }

  get isActive(): boolean {
    return this._active
  }

  trigger(originX = 0, originY = 0, originZ = 0): void {
    if (this._disposed || this._reducedMotion) return
    this._active = true
    this._elapsed = 0
    this._origin.set(originX, originY, originZ)
    this._mesh.visible = true
    this._uniforms.uTime.value = 0
    this.updateMatrices(0)
  }

  /** Reconcile live motion policy at the GPU owner boundary. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    if (!reduced) return
    this._active = false
    this._elapsed = TRACE_DURATION
    this._mesh.visible = false
  }

  update(dt: number): boolean {
    if (this._disposed || !this._active) return false

    this._elapsed += dt
    this._uniforms.uTime.value = this._elapsed
    if (this._elapsed >= TRACE_DURATION) {
      this._active = false
      this._mesh.visible = false
      return false
    }

    this.updateMatrices(this._elapsed / TRACE_DURATION)
    return true
  }

  private updateMatrices(progress: number): void {
    const eased = 1 - (1 - progress) ** 3
    const depth = -eased * 0.72
    const rotation = eased * 0.1

    this._segments.forEach(({ frame, side }, index) => {
      const radius = FRAME_RADII[frame]! * (1 - eased * 0.58)
      const long = radius * 1.62
      const short = 0.024 + frame * 0.006
      const horizontal = side === 0 || side === 2

      this._dummy.position.copy(this._origin)
      this._dummy.position.z += depth - frame * 0.035
      if (side === 0) this._dummy.position.y += radius
      if (side === 1) this._dummy.position.x += radius
      if (side === 2) this._dummy.position.y -= radius
      if (side === 3) this._dummy.position.x -= radius

      this._dummy.rotation.set(0, 0, rotation + (horizontal ? 0 : Math.PI / 2))
      this._dummy.scale.set(long, short, 1)
      this._dummy.updateMatrix()
      this._mesh.setMatrixAt(index, this._dummy.matrix)
    })
    this._mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._active = false
    this._mesh.visible = false
    // The TSL trace material is controller-created — it dies here. The mesh
    // and its Tres-built geometry stay with the Vue host (they leave the
    // scene with IntroLightFramesOwner's unmount).
    ;(this._mesh.material as THREE.Material).dispose()
    this._segments.length = 0
  }
}
