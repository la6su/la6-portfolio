// CasePlane — shared 3D project surface for Works.
//
// A real 3D plane (not a CSS card). The TSL vertex field turns an explicit
// pulse (card tap/open) into a brief wobble across the surface.
//
// PER-INSTANCE MATERIALS: Each card gets its own MeshBasicNodeMaterial,
// uniform buffers and texture binding. BakuCarousel renders multiple cards at
// once, so sharing a material would make them all show the last texture.
//
// Shared geometry is leased across cards; per-card owners release their lease.
//
// CLOTH WOBBLE SHADER:
//   Low-frequency harmonic cloth simulation in the vertex shader.
//   Two primary sine waves create a natural, physical cloth ripple.
//   Center is stable (where the eye focuses); edges and corners
//   deform naturally like a physical card held at center.
//   The wobble decays exponentially via the JS damping in update().

import * as THREE from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  Fn,
  positionLocal,
  sin,
  cos,
  smoothstep,
  uniform,
  vec3,
  abs,
  max,
  mix,
  float,
} from 'three/tsl'
import { prefersReducedMotion } from '../../core/motionPolicy'

// Shared geometry — reused by all CasePlane instances (GPU buffer, not uniforms).
// 20×12 segments for smooth cloth deformation without excessive vertex count.
let sharedGeometry: THREE.PlaneGeometry | null = null
let sharedGeometryUsers = 0

interface CasePlaneGeometryLease {
  readonly geometry: THREE.PlaneGeometry
  release(): void
}

export function acquireCasePlaneGeometry(): CasePlaneGeometryLease {
  sharedGeometry ??= new THREE.PlaneGeometry(1, 9 / 16, 20, 12)
  sharedGeometryUsers += 1
  let released = false
  return {
    geometry: sharedGeometry,
    release() {
      if (released) return
      released = true
      sharedGeometryUsers -= 1
      if (sharedGeometryUsers !== 0) return
      sharedGeometry?.dispose()
      sharedGeometry = null
    },
  }
}

/**
 * Unified cloth wobble animation parameters.
 * Used by both BakuCarousel (home) and WorksPlaneStage (/works)
 * to ensure identical animation behaviour across all entry points.
 */
export const CLOTH_PARAMS = {
  /** Wobble amplitude multiplier on card open/tap. */
  pulseAmount: 0.5,
  /** Exponential decay rate for wobble (higher = faster fade). */
  wobbleDecay: 4.5,
  /** Smoothing speed for wobble value (higher = snappier). */
  wobbleSmoothing: 8.0,
} as const

/** Shared space curve for the home Works ribbon. Covers remain flat tiles. */
export const WORKS_RIBBON_PATH = {
  spacing: 3.34,
  cardWidth: 3.05,
  bandWidth: 0.085,
  tileSpan: 0.91,
  elevationA: { frequency: 0.55, amplitude: 0.45 },
  elevationB: { frequency: 0.23, amplitude: 0.22 },
  depthA: { frequency: 0.42, amplitude: 1.1 },
  depthB: { frequency: 0.78, amplitude: 0.16 },
} as const

/** One shader-driven substrate gives the separate case images a shared path. */
export function createWorksRibbonMaterialResources() {
  const reveal = uniform(0)
  const material = new MeshBasicNodeMaterial({
    color: 0x0b2026,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  })
  material.positionNode = Fn(() => {
    const along = positionLocal.x.div(WORKS_RIBBON_PATH.spacing)
    const elevation = sin(along.mul(WORKS_RIBBON_PATH.elevationA.frequency))
      .mul(WORKS_RIBBON_PATH.elevationA.amplitude)
      .add(
        sin(along.mul(WORKS_RIBBON_PATH.elevationB.frequency)).mul(
          WORKS_RIBBON_PATH.elevationB.amplitude,
        ),
      )
    const depth = sin(along.mul(WORKS_RIBBON_PATH.depthA.frequency))
      .mul(WORKS_RIBBON_PATH.depthA.amplitude)
      .add(
        sin(along.mul(WORKS_RIBBON_PATH.depthB.frequency)).mul(WORKS_RIBBON_PATH.depthB.amplitude),
      )
    return vec3(positionLocal.x, positionLocal.y.add(elevation), depth.sub(0.07))
  })()
  material.colorNode = Fn(() => {
    const edge = abs(positionLocal.y)
    const core = float(1).sub(smoothstep(0.008, 0.034, edge))
    return mix(vec3(0.008, 0.022, 0.028), vec3(0.025, 0.19, 0.2), core)
  })()
  material.opacityNode = Fn(() => reveal.mul(0.58))()
  return { material, reveal }
}

export function createCasePlaneMaterialResources(mapTexture: THREE.Texture, ribbonEnabled = false) {
  const time = uniform(0)
  const state = uniform(new THREE.Vector2(0, 0))
  // x is the tile coordinate along the one continuous path; y blends it in.
  const ribbon = uniform(new THREE.Vector2(0, 0))
  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
    map: mapTexture,
  })
  material.positionNode = Fn(() => {
    const local = positionLocal
    const wobble = state.y
    const edgeDist = max(abs(local.x), abs(local.y.mul(1.78))).clamp(0.0, 1.0)
    const edgeFade = smoothstep(0.0, 0.5, edgeDist)
    const cornerBoost = abs(local.x).mul(abs(local.y)).mul(3.5).max(0.0).min(1.0)
    const clothMask = edgeFade.add(cornerBoost.mul(0.4)).max(0.0).min(1.2)
    const h1 = sin(local.x.mul(2.5).add(time.mul(1.8)))
    const h2 = sin(local.x.mul(1.8).sub(local.y.mul(1.2)).add(time.mul(1.2)))
    const ripple = h1.add(h2.mul(0.45)).mul(wobble).mul(0.022).mul(clothMask)
    const rippleZ = ripple.mul(0.25)
    if (!ribbonEnabled) return vec3(local.x, local.y.add(ripple), local.z.add(rippleZ))

    // Evaluate one shared space curve across every tile. Remove the centerline
    // and tangent already represented by each mesh transform; the remaining
    // vertex displacement is the local segment of that continuous ribbon.
    const tileOffset = local.x.mul(WORKS_RIBBON_PATH.tileSpan)
    const coordinate = ribbon.x.add(tileOffset)
    const elevationAt = (position: typeof coordinate) =>
      sin(position.mul(WORKS_RIBBON_PATH.elevationA.frequency))
        .mul(WORKS_RIBBON_PATH.elevationA.amplitude)
        .add(
          sin(position.mul(WORKS_RIBBON_PATH.elevationB.frequency)).mul(
            WORKS_RIBBON_PATH.elevationB.amplitude,
          ),
        )
    const depthAt = (position: typeof coordinate) =>
      sin(position.mul(WORKS_RIBBON_PATH.depthA.frequency))
        .mul(WORKS_RIBBON_PATH.depthA.amplitude)
        .add(
          sin(position.mul(WORKS_RIBBON_PATH.depthB.frequency)).mul(
            WORKS_RIBBON_PATH.depthB.amplitude,
          ),
        )
    const elevationSlope = cos(ribbon.x.mul(WORKS_RIBBON_PATH.elevationA.frequency))
      .mul(WORKS_RIBBON_PATH.elevationA.frequency * WORKS_RIBBON_PATH.elevationA.amplitude)
      .add(
        cos(ribbon.x.mul(WORKS_RIBBON_PATH.elevationB.frequency)).mul(
          WORKS_RIBBON_PATH.elevationB.frequency * WORKS_RIBBON_PATH.elevationB.amplitude,
        ),
      )
    const depthSlope = cos(ribbon.x.mul(WORKS_RIBBON_PATH.depthA.frequency))
      .mul(WORKS_RIBBON_PATH.depthA.frequency * WORKS_RIBBON_PATH.depthA.amplitude)
      .add(
        cos(ribbon.x.mul(WORKS_RIBBON_PATH.depthB.frequency)).mul(
          WORKS_RIBBON_PATH.depthB.frequency * WORKS_RIBBON_PATH.depthB.amplitude,
        ),
      )
    const elevationResidual = elevationAt(coordinate)
      .sub(elevationAt(ribbon.x))
      .sub(elevationSlope.mul(tileOffset))
      .mul(ribbon.y)
    const depthResidual = depthAt(coordinate)
      .sub(depthAt(ribbon.x))
      .sub(depthSlope.mul(tileOffset))
      .mul(ribbon.y)
    return vec3(
      local.x,
      local.y.add(ripple).add(elevationResidual),
      local.z.add(rippleZ).add(depthResidual),
    )
  })()
  material.opacityNode = Fn(() => state.x)()
  return { material, time, state, ribbon }
}

type CasePlaneMaterialResources = ReturnType<typeof createCasePlaneMaterialResources>

export class CasePlane {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, MeshBasicNodeMaterial>
  private readonly _resources: CasePlaneMaterialResources
  private readonly _geometryLease: CasePlaneGeometryLease
  private _disposed = false
  private _wobbleValue = 0
  private _wobbleTarget = 0
  private _myReveal = 0
  private _texture: THREE.Texture | null
  private _reducedMotion = prefersReducedMotion()

  // Per-instance uniform nodes — each material has its own GPU uniform buffer.
  private readonly _timeUni: CasePlaneMaterialResources['time']
  private readonly _stateUni: CasePlaneMaterialResources['state']
  private readonly _ribbonUni: CasePlaneMaterialResources['ribbon']

  constructor(
    mesh: THREE.Mesh<THREE.PlaneGeometry, MeshBasicNodeMaterial>,
    mapTexture: THREE.Texture,
    resources: CasePlaneMaterialResources,
    geometryLease: CasePlaneGeometryLease,
  ) {
    if (mesh.geometry !== geometryLease.geometry || mesh.material !== resources.material) {
      throw new Error('CasePlane must adopt geometry and material from its resource owner.')
    }
    this.mesh = mesh
    this._resources = resources
    this._geometryLease = geometryLease
    this._texture = mapTexture
    this._timeUni = resources.time
    this._stateUni = resources.state
    this._ribbonUni = resources.ribbon
  }

  get position(): THREE.Vector3 {
    return this.mesh.position
  }
  get rotation(): THREE.Euler {
    return this.mesh.rotation
  }
  get scale(): THREE.Vector3 {
    return this.mesh.scale
  }
  get visible(): boolean {
    return this.mesh.visible
  }
  set visible(value: boolean) {
    this.mesh.visible = value
  }

  get isAnimating(): boolean {
    if (this._disposed) return false
    return this._wobbleValue > 0.002 || this._wobbleTarget > 0.002
  }

  setReveal(value: number): void {
    if (this._disposed) return
    const nextReveal = THREE.MathUtils.clamp(value, 0, 1)
    if (Math.abs(nextReveal - this._myReveal) < 0.0001) {
      this.visible = nextReveal > 0.001
      return
    }
    this._myReveal = nextReveal
    this._stateUni.value.x = this._myReveal
    this.visible = nextReveal > 0.001
  }

  setRibbonPath(position: number, strength: number): void {
    if (this._disposed) return
    this._ribbonUni.value.set(position, THREE.MathUtils.clamp(strength, 0, 1))
  }

  pulse(amount = CLOTH_PARAMS.pulseAmount): void {
    if (this._disposed) return
    if (this._reducedMotion) return
    this._wobbleTarget = Math.max(this._wobbleTarget, amount)
  }

  /** Reconcile the shared motion policy without querying media state per frame. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    if (!reduced) return
    this._wobbleValue = 0
    this._wobbleTarget = 0
    this._stateUni.value.y = 0
  }

  update(dt: number, active: boolean): void {
    if (this._disposed) return
    if (!active && this._wobbleValue < 0.002 && this._wobbleTarget < 0.002) {
      return
    }

    if (this._reducedMotion) {
      this.setReducedMotion(true)
      return
    }

    this._timeUni.value += dt
    this._wobbleTarget *= Math.exp(-dt * CLOTH_PARAMS.wobbleDecay)
    this._wobbleValue +=
      (this._wobbleTarget - this._wobbleValue) * Math.min(1, dt * CLOTH_PARAMS.wobbleSmoothing)

    this._stateUni.value.y = this._wobbleValue
  }

  get texture(): THREE.Texture | null {
    return this._texture
  }

  removeFromParent(): this {
    this.mesh.removeFromParent()
    return this
  }

  dispose(detach = true): void {
    if (this._disposed) return
    this._disposed = true
    this._resources.material.dispose()
    this._geometryLease.release()
    this._texture = null
    if (detach) this.removeFromParent()
  }
}
