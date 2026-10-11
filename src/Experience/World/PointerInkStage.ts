// PointerInkStage — shared shell for the pointer-reactive TSL ink stages
// (ContactHaloStage, ManifestoInkStage). Both voices are structurally the
// same owner: one world-fixed plane whose MeshBasicNodeMaterial blends a
// single authored `ink` subgraph into color and opacity, a damped pointer
// chase with exponential energy decay, a reveal damp that the mesh scale
// rides, and reduced-motion snap. Only the ink art and its tuning differ —
// they arrive through PointerInkStageConfig.
//
// Conventions: lazy dynamic import behind the route handler, per-instance
// uniform nodes advanced only on rendered frames, an amplitude-capped
// single-sourced ink subgraph, and no GPU resources of its own — the plane
// geometry and the node material are declared by PointerInkStageOwner.vue and
// disposed by Tres when the route owner unmounts. This stage only borrows the
// mounted mesh to feed its node graph and to ride the reveal scale.

import { shallowRef } from 'vue'
import { Color, Vector2 } from 'three'
import type { Mesh } from 'three'
import { MeshBasicNodeMaterial, type Node, type UniformNode } from 'three/webgpu'
import { Fn, float, uniform } from 'three/tsl'
import { input } from '../Input'
import { prefersReducedMotion } from '../../core/motionPolicy'

/** The uniform nodes an ink field may compose. */
interface PointerInkUniforms {
  time: UniformNode<'float', number>
  pointer: UniformNode<'vec2', Vector2>
  energy: UniformNode<'float', number>
}

/** Authored voice of a pointer-reactive ink stage. */
interface PointerInkStageConfig {
  /** Scene root name (`<name>-stage` convention is the subclass's choice). */
  stageName: string
  meshName: string
  meshPosition: readonly [number, number, number]
  /** Plane extent. Mutable tuple: the declarative owner hands this exact
   *  array to `<TresPlaneGeometry :args>`, so its identity must not change
   *  between renders. */
  planeSize: [number, number]
  /** Peak alpha — kept low so the ink reads as paper, not glow. */
  peakOpacity: number
  /** [dark-UI tint, light-UI tint]. */
  tints: readonly [number, number]
  /** Damping voice: energy rise, exponential decay, pointer chase. The
   *  pointer NDC → plane-local focus scale is part of the authored field. */
  damping: {
    readonly rise: number
    readonly decay: number
    readonly chase: number
  }
  /** The authored ink field — one subgraph feeding color and opacity. */
  inkField: (u: PointerInkUniforms) => Node<'float'>
}

export class PointerInkStage {
  private active = false
  private disposed = false
  private reducedMotion = prefersReducedMotion()
  private readonly _visible = shallowRef(false)
  private inkMesh: Mesh | null = null

  // Reveal damp (0 hidden → 1 shown) — exponential, no timeline to rewind.
  private reveal = 0

  // Damped pointer state. `pointerTarget` mirrors input in NDC; the uniform
  // chases it so the ink glides instead of snapping. Energy rises while the
  // pointer is moving and decays exponentially when it rests.
  private readonly pointerTarget = new Vector2(0, 0)
  private readonly pointerDelta = new Vector2()
  private energy = 0

  protected readonly config: PointerInkStageConfig

  // Per-instance uniform nodes — JS-advanced only on rendered frames so the
  // breathing clock respects the demand-driven loop (never global `time`).
  protected readonly _timeUni: UniformNode<'float', number>
  protected readonly _pointerUni: UniformNode<'vec2', Vector2>
  protected readonly _energyUni: UniformNode<'float', number>
  protected readonly _revealUni: UniformNode<'float', number>
  protected readonly _tintUni: UniformNode<'color', Color>

  constructor(config: PointerInkStageConfig) {
    this.config = config
    this._timeUni = uniform(0)
    this._pointerUni = uniform(new Vector2(0, 0))
    this._energyUni = uniform(0)
    this._revealUni = uniform(0)
    this._tintUni = uniform(new Color(config.tints[0]))
  }

  get stageName(): string {
    return this.config.stageName
  }

  get meshName(): string {
    return this.config.meshName
  }

  get meshPosition(): readonly [number, number, number] {
    return this.config.meshPosition
  }

  /** Plane extent the declarative owner builds the geometry with. */
  get planeSize(): [number, number] {
    return this.config.planeSize
  }

  get visible(): boolean {
    return this._visible.value
  }

  /** Adopt the declaratively mounted mesh. The plane geometry and the
   *  `MeshBasicNodeMaterial` belong to the Vue owner; this stage supplies the
   *  one ink subgraph that feeds their color and opacity. */
  bindMesh(inkMesh: Mesh): void {
    if (this.disposed) return
    const material = inkMesh.material
    if (!(material instanceof MeshBasicNodeMaterial)) {
      throw new Error(
        `Pointer ink stage '${this.config.stageName}' needs a MeshBasicNodeMaterial on its declarative mesh.`,
      )
    }

    // One shared subgraph feeding color and opacity keeps the graph
    // single-sourced; the authored field supplies all the art.
    const ink = Fn(() =>
      this.config.inkField({
        time: this._timeUni,
        pointer: this._pointerUni,
        energy: this._energyUni,
      }),
    )()
    material.colorNode = Fn(() => this._tintUni.mul(ink))()
    material.opacityNode = Fn(() => ink.mul(this._revealUni).mul(float(this.config.peakOpacity)))()

    this.inkMesh = inkMesh
  }

  /** Release the borrowed mesh when the Vue owner unmounts; Tres disposes it. */
  unbindMesh(inkMesh: Mesh): void {
    if (this.inkMesh !== inkMesh) return
    this.inkMesh = null
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
    this._visible.value = active
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
      this.inkMesh?.scale.setScalar(0.001)
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
    this.inkMesh?.scale.setScalar(Math.max(0.001, this.reveal))
  }

  /** Snap the authored motion to its settled state (preference or idle). */
  private settleReducedMotion(): void {
    this.energy = 0
    this.reveal = this.active ? 1 : 0
    this._timeUni.value = 0
    this._pointerUni.value.set(0, 0)
    this._energyUni.value = 0
    this._revealUni.value = this.reveal
    this.inkMesh?.scale.setScalar(Math.max(0.001, this.reveal))
  }

  /** Retire the stage's own state. The mesh, its geometry and its material
   *  belong to the Vue owner and are disposed by Tres on unmount. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.active = false
    this._visible.value = false
    this.inkMesh = null
  }
}
