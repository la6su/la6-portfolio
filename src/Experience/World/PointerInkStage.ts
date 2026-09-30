// PointerInkStage — shared shell for the pointer-reactive TSL ink stages
// (ContactHaloStage, ManifestoInkStage). Both voices are structurally the
// same owner: one world-fixed plane whose MeshBasicNodeMaterial blends a
// single authored `ink` subgraph into color and opacity, a damped pointer
// chase with exponential energy decay, a reveal damp that the mesh scale
// rides, and reduced-motion snap. Only the ink art and its tuning differ —
// they arrive through PointerInkStageConfig.
//
// Conventions (inherited from the ContactHaloStage originals): lazy dynamic
// import behind the route handler, per-instance uniform nodes advanced only
// on rendered frames, amplitude-capped single-sourced ink subgraph, and one
// shared plane geometry refcounted across concurrent stage instances.

import * as THREE from 'three'
import { MeshBasicNodeMaterial, type UniformNode } from 'three/webgpu'
import { Fn, float, uniform } from 'three/tsl'
import { input } from '../Input'
import { prefersReducedMotion } from '../../core/motionPolicy'

/** The uniform nodes an ink field may compose. */
interface PointerInkUniforms {
  time: UniformNode<'float', number>
  pointer: UniformNode<'vec2', THREE.Vector2>
  energy: UniformNode<'float', number>
}

/** Authored voice of a pointer-reactive ink stage. */
interface PointerInkStageConfig {
  /** Group name (`<name>-stage` convention is the subclass's choice). */
  stageName: string
  meshName: string
  meshPosition: readonly [number, number, number]
  /** Shared plane geometry extent. */
  planeSize: readonly [number, number]
  /** Peak alpha — kept low so the ink reads as paper, not glow. */
  peakOpacity: number
  /** [dark-UI tint, light-UI tint]. */
  tints: readonly [number, number]
  /** Pointer NDC → plane-local focus scale. */
  focusScale: readonly [number, number]
  /** Damping voice: energy rise, exponential decay, pointer chase. */
  damping: { readonly rise: number; readonly decay: number; readonly chase: number }
  /** The authored ink field — one subgraph feeding color and opacity. */
  inkField: (u: PointerInkUniforms) => ReturnType<typeof float>
}

// One buffer per plane size can serve concurrent stage instances, but its
// lifetime must end with the final route owner rather than survive root
// teardown indefinitely. Keyed by size: the halo and the wash use different
// extents, instances of one voice share one buffer.
const sharedGeometries = new Map<string, { geometry: THREE.PlaneGeometry; users: number }>()

function acquireGeometry(width: number, height: number): THREE.PlaneGeometry {
  const key = `${width}x${height}`
  let entry = sharedGeometries.get(key)
  entry ??= { geometry: new THREE.PlaneGeometry(width, height), users: 0 }
  entry.users += 1
  sharedGeometries.set(key, entry)
  return entry.geometry
}

function releaseGeometry(width: number, height: number): void {
  const key = `${width}x${height}`
  const entry = sharedGeometries.get(key)
  if (!entry) return
  entry.users -= 1
  if (entry.users !== 0) return
  entry.geometry.dispose()
  sharedGeometries.delete(key)
}

export class PointerInkStage extends THREE.Group {
  private active = false
  private disposed = false
  private reducedMotion = prefersReducedMotion()

  // Reveal damp (0 hidden → 1 shown) — exponential, no timeline to rewind.
  private reveal = 0

  // Damped pointer state. `pointerTarget` mirrors input in NDC; the uniform
  // chases it so the ink glides instead of snapping. Energy rises while the
  // pointer is moving and decays exponentially when it rests.
  private readonly pointerTarget = new THREE.Vector2(0, 0)
  private readonly pointerDelta = new THREE.Vector2()
  private energy = 0

  protected readonly config: PointerInkStageConfig
  private readonly material: MeshBasicNodeMaterial
  private readonly inkMesh: THREE.Mesh

  // Per-instance uniform nodes — JS-advanced only on rendered frames so the
  // breathing clock respects the demand-driven loop (never global `time`).
  protected readonly _timeUni: UniformNode<'float', number>
  protected readonly _pointerUni: UniformNode<'vec2', THREE.Vector2>
  protected readonly _energyUni: UniformNode<'float', number>
  protected readonly _revealUni: UniformNode<'float', number>
  protected readonly _tintUni: UniformNode<'color', THREE.Color>

  constructor(config: PointerInkStageConfig) {
    super()
    this.config = config
    this.name = config.stageName

    const time = uniform(0)
    const pointer = uniform(new THREE.Vector2(0, 0))
    const energy = uniform(0)
    const reveal = uniform(0)
    const tint = uniform(new THREE.Color(config.tints[0]))

    const mat = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    })

    // One shared subgraph feeding color and opacity keeps the graph
    // single-sourced; the authored field supplies all the art.
    const ink = Fn(() => config.inkField({ time, pointer, energy }))()

    mat.colorNode = Fn(() => {
      return tint.mul(ink)
    })()
    ;(mat as unknown as { opacityNode: unknown }).opacityNode = Fn(() => {
      return ink.mul(reveal).mul(float(config.peakOpacity))
    })()

    this.material = mat
    this.inkMesh = new THREE.Mesh(acquireGeometry(config.planeSize[0], config.planeSize[1]), mat)
    this.inkMesh.name = config.meshName
    this.inkMesh.frustumCulled = false
    this.inkMesh.renderOrder = 1
    this.inkMesh.position.set(...config.meshPosition)
    this.inkMesh.scale.setScalar(0.001)
    this.add(this.inkMesh)
    this.visible = false

    this._timeUni = time
    this._pointerUni = pointer
    this._energyUni = energy
    this._revealUni = reveal
    this._tintUni = tint
  }

  get isAnimating(): boolean {
    // The authored ink keeps breathing while active, so this remains an
    // ambient-motion signal.
    if (this.disposed || this.reducedMotion) return false
    return this.active
  }

  setActive(active: boolean): void {
    if (this.disposed) return
    this.active = active
    this.visible = active
    if (this.reducedMotion) {
      this.settleReducedMotion()
      return
    }
    if (!active) {
      // Every return to the route starts from a clean transparent state —
      // without this reset a partly faded reveal would persist across visits
      // and the next entrance would look like an instantaneous toggle.
      this.reveal = 0
      this._revealUni.value = 0
      this.inkMesh.scale.setScalar(0.001)
      this.energy = 0
      this._energyUni.value = 0
    }
  }

  /** Keep the ink legible on either UI theme (matches the page's ink). */
  setTheme(isLight: boolean): void {
    if (this.disposed) return
    this._tintUni.value.setHex(isLight ? this.config.tints[1] : this.config.tints[0])
  }

  /** Forward a live preference change and settle any live motion. */
  setReducedMotion(reduced: boolean): void {
    if (this.disposed) return
    this.reducedMotion = reduced
    if (reduced) this.settleReducedMotion()
  }

  update(dt: number): void {
    if (this.disposed || !this.active) return

    if (this.reducedMotion) {
      this.settleReducedMotion()
      return
    }

    // Pointer intake: NDC from the shared input singleton, damped chase and
    // exponential energy decay. All math mutates preallocated vectors.
    const mouse = input.getMouse()
    this.pointerDelta.set(mouse.x - this.pointerTarget.x, mouse.y - this.pointerTarget.y)
    this.pointerTarget.set(mouse.x, mouse.y)
    const moved = this.pointerDelta.length()
    const energyTarget = Math.min(1, moved * 24)
    this.energy += (energyTarget - this.energy) * Math.min(1, dt * this.config.damping.rise)
    this.energy *= Math.exp(-dt * this.config.damping.decay)

    this._timeUni.value += dt
    const chase = Math.min(1, dt * this.config.damping.chase)
    this._pointerUni.value.x += (this.pointerTarget.x - this._pointerUni.value.x) * chase
    this._pointerUni.value.y += (this.pointerTarget.y - this._pointerUni.value.y) * chase
    this._energyUni.value = this.energy

    // Reveal damp toward the active target; scale rides it so the first
    // appearance grows in instead of popping.
    const revealTarget = this.active ? 1 : 0
    this.reveal += (revealTarget - this.reveal) * Math.min(1, dt * 3.2)
    this._revealUni.value = this.reveal
    this.inkMesh.scale.setScalar(Math.max(0.001, this.reveal))
  }

  /** Snap the authored motion to its settled state (preference or idle). */
  private settleReducedMotion(): void {
    this.energy = 0
    this.reveal = this.active ? 1 : 0
    this._timeUni.value = 0
    this._pointerUni.value.set(0, 0)
    this._energyUni.value = 0
    this._revealUni.value = this.reveal
    this.inkMesh.scale.setScalar(Math.max(0.001, this.reveal))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.active = false
    this.material.dispose()
    releaseGeometry(this.config.planeSize[0], this.config.planeSize[1])
    this.removeFromParent()
  }
}
