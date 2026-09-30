// src/Experience/World/SplashCube.ts
// Apple Fifth Avenue-style glass cube — IS our Baku.
//
// The cube IS the baku: it stays on all sections, rotating, changing materials
// per section role. During splash: rotates + edges brighten with progress.
// At 100%: "opener" — cube scales up + back (breathing).
//
// Architecture (JLZ-branded glass cube):
//   1. Rounded cube mesh with one shared transparent reflective material
//   2. PMREM environment bound once after scene setup
//   3. Opener — scale pulse (1.0 → 1.3 → 1.0)
//
// Glass shader: a physical transmission volume on WebGPU and WebGL2. The
// Contact typography mesh is rendered behind it, so the cube can refract and
// softly magnify that real scene content instead of merely fading over it.
//
// Declarative boundary: the scene-graph object (root group + rounded jelly
// shell, built from the two builders below) is declared by
// `app/scene/BakuCubeOwner.vue` and reaches this controller through the
// `BakuCubeNodes` bag. This class stays the imperative behavior owner
// (jelly/opener, face rotation, theme blend) and never touches the scene
// graph — Vue owns attachment and disposal.

import * as THREE from 'three'
import { BakuRole, type BakuMaterialState } from '../../core/types'
import { prefersReducedMotion } from '../../core/motionPolicy'
import { WORLD_SLOTS } from '../../core/worldSlots'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { smoothstep01 } from '../../Utils/easing'

interface BakuMaterialParams {
  color: THREE.Color
  emissive: THREE.Color
  roughness: number
  metalness: number
  role: BakuRole
}

/** The declarative nodes `BakuCubeOwner.vue` hands to this controller. */
export interface BakuCubeNodes {
  /** The owner root: the motion below rotates it per section and the frame
   *  pass gates its visibility. */
  root: THREE.Group
  /** The rounded jelly shell — the only rendered leaf. */
  shell: THREE.Mesh
}

/**
 * The day34 rounding recipe: BoxGeometry + manual vertex rounding +
 * mergeVertices. 24 segments (perf-optimized from 32): 576 verts/face × 6 =
 * 3456 verts total (was 6144 with 32 segs — 44% reduction), still smooth
 * enough for 2 noise periods/face. RoundedBoxGeometry was causing normals to
 * bleed from edges into face interiors, producing flat-plane shift instead of
 * jelly bulge; mergeVertices + computeVertexNormals ensures perpendicular
 * normals → correct displacement.
 */
export function buildBakuShellGeometry(): THREE.BufferGeometry {
  const size = 0.8
  let geo: THREE.BufferGeometry = new THREE.BoxGeometry(size, size, size, 24, 24, 24)
  const pos = geo.getAttribute('position')
  const r = 0.175 // 3.5 * 0.05 (day34 rounding radius scaled for cube 0.8)
  const h = size / 2 // 0.4
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i)
    const ix = Math.min(Math.abs(x), h - r) * Math.sign(x)
    const iy = Math.min(Math.abs(y), h - r) * Math.sign(y)
    const iz = Math.min(Math.abs(z), h - r) * Math.sign(z)
    const dx = x - ix,
      dy = y - iy,
      dz = z - iz
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dl > 0.001) {
      x = ix + dx * (r / dl)
      y = iy + dy * (r / dl)
      z = iz + dz * (r / dl)
    }
    pos.setXYZ(i, x, y, z)
  }
  pos.needsUpdate = true
  // MeshPhysicalMaterial uses the procedural environment only: this cube
  // has no texture map, so UVs are dead data. Keeping BoxGeometry's six
  // independent UV islands prevents mergeVertices() from welding the
  // rounded face edges, which exposes hairline normal seams while it moves.
  geo.deleteAttribute('uv')
  geo.deleteAttribute('normal')
  geo = mergeVertices(geo, 0.01) as THREE.BufferGeometry
  geo.computeVertexNormals()
  return geo
}

/** The authored glass shell params (single source — the SFC binds this). */
export function createBakuShellMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.94, 0.91, 1.0),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 0.02,
    // Transmission is the essential distinction from alpha transparency:
    // it samples geometry rendered behind the cube. A higher IOR and real
    // volume thickness make the rounded silhouette read as a soft lens;
    // restrained roughness turns the result into frosted glass, not a mirror.
    transmission: 0.9,
    thickness: 2.6,
    ior: 1.34,
    roughness: 0.14,
    dispersion: 0.035,
    attenuationColor: new THREE.Color(0xd9cfe8),
    attenuationDistance: 1.8,
    side: THREE.FrontSide,
    depthWrite: false,
    metalness: 0,
    envMapIntensity: 2.05,
    clearcoat: 0.85,
    clearcoatRoughness: 0.07,
    iridescence: 0.48,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 360],
  })
}

// (setTransmissionEnabled removed — dead export, zero callers.)

/**
 * The glass shell is CPU-deformed. Updating it every display frame makes the
 * first visible scene compete with renderer and post-pipeline warm-up. The
 * eye reads this soft material motion at a lower cadence, so reserve full-rate
 * rendering for transforms and upload vertex changes only during reactions.
 */
const JELLY_UPDATE_INTERVAL = 1 / 30

// (GRADIENT_COLORS removed — was Apple Fifth Avenue port. Now using JLZ palette.)

export class SplashCube {
  private _disposed = false
  private readonly _root: THREE.Group
  private readonly _shell: THREE.Mesh
  private readonly _material: THREE.MeshPhysicalMaterial
  private readonly _positions: THREE.BufferAttribute
  private readonly _basePositions: Float32Array
  private readonly _normals: Float32Array
  private time = 0
  private jellyEnergy = 0
  private jellyTarget = 0
  private nextJellyUpdateAt = 0
  private jellyWasActive = false
  private openerProgress = 0
  private openerTarget = 0
  private openerPhase: 'idle' | 'opening' | 'closing' | 'done' = 'idle'
  /** (CubeCamera throttle REMOVED — no more cubemap refresh. Glass uses
   *   scene.environment PMREM which is static, zero per-frame cost.) */

  private targetParams: BakuMaterialParams = {
    color: new THREE.Color(0x333333),
    emissive: new THREE.Color(0x111111),
    roughness: 0.1,
    metalness: 0.9,
    role: BakuRole.NORMAL,
  }
  private _currentRole: BakuRole | null = null
  private _blendFromColor: THREE.Color = new THREE.Color(0x3a3a5e)
  private _blendToColor: THREE.Color = new THREE.Color(0x3a3a5e)
  private _blendFromEmissive: THREE.Color = new THREE.Color(0x5a5a8a)
  private _blendToEmissive: THREE.Color = new THREE.Color(0x5a5a8a)
  private _blendT: number = 0
  private _isLightTheme = true
  private _reducedMotion = prefersReducedMotion()
  // Neutral violet-grey, rather than the previous blue diagnostic colour.
  // It gives the transparent volume enough contrast on a white UI without
  // reading as an added wireframe or a flat blue block.
  private _themeTint = new THREE.Color(0x5e5667)
  private readonly _blendColor = new THREE.Color()
  private _blendDirty = true
  private _materialDirty = true

  private _idleRotY = 0

  // ── Cube face rotation ──
  // 6 sections = 6 cube faces. Each section maps to a target Y rotation
  // so the corresponding face points toward the camera (+Z direction).
  // Lab/Contact finale=0→front, Intro=1→right, About=2→back,
  // Works=3→left, Contact=4→tilt, Menu=5→tilt.
  // NOTE: sections 4+5 use ±π/4 tilt (NOT actual top/bottom face rotation).
  // The cube shows two side faces at an angle for these sections.
  // This is a known simplification — true top/bottom face would need X rotation.
  // The per-slot rotations are owned by the canonical world-slot contract
  // (src/core/worldSlots.ts); this array only re-exposes them by index.
  private static readonly FACE_ROTATIONS: readonly number[] = WORLD_SLOTS.map(
    (slot) => slot.faceRotation,
  )
  private _targetFaceRotY = 0
  private _faceLerp = 0 // 0→1, animated on section change
  // D-16 fix: store start rotation + delta at rotateToFace time for
  // absolute positioning (was incremental with wrong formula → undershoot+snap).
  private _startFaceRotY = 0
  private _startFaceDelta = 0

  /** Owner scene visibility (the frame pass gates it per route/carousel). */
  get visible(): boolean {
    return this._root.visible
  }

  set visible(value: boolean) {
    this._root.visible = value
  }

  /** True only while an authored cube reaction still needs animation frames. */
  get isAmbientlyAnimated(): boolean {
    return (
      !this._disposed &&
      this._root.visible &&
      (this.jellyEnergy > 0.001 || this.jellyTarget > 0.001)
    )
  }

  /** True while the opener scale-pulse is animating (opening or closing). */
  get isOpenerActive(): boolean {
    return !this._disposed && this.openerPhase !== 'done' && this.openerPhase !== 'idle'
  }

  /** True while the cube is rotating to a new face (section change). */
  get isRotating(): boolean {
    return !this._disposed && this._faceLerp < 1
  }

  constructor(nodes: BakuCubeNodes) {
    this._root = nodes.root
    this._shell = nodes.shell
    const material = nodes.shell.material
    if (!(material instanceof THREE.MeshPhysicalMaterial)) {
      throw new Error('The declarative baku shell must carry the authored physical glass material.')
    }
    this._material = material
    const positions = this._shell.geometry.getAttribute('position')
    if (!(positions instanceof THREE.BufferAttribute)) {
      throw new Error(
        'The declarative baku shell geometry must expose a position attribute for the jelly deformation.',
      )
    }
    this._positions = positions
    this._basePositions = new Float32Array(this._positions.array)
    this._normals = new Float32Array(this._shell.geometry.getAttribute('normal').array)
  }

  // ════════════════════════════════════════════════════════════════════
  // Runtime controls
  // ════════════════════════════════════════════════════════════════════

  triggerOpener(): void {
    if (this._disposed) return
    // Under reduced-motion the opener never animates (baku.update() is skipped
    // by World), so snap immediately to 'done' — otherwise openerPhase stays
    // 'opening' forever and forces continuous rendering (B-1).
    if (this._reducedMotion) {
      this.openerPhase = 'done'
      this.openerProgress = 0
      this.openerTarget = 0
      return
    }
    this.openerPhase = 'opening'
    this.openerTarget = 1
    this.requestJellyPulse()
  }

  /** Trigger a scale pulse alongside the continuous jelly motion. */
  triggerWobblePulse(): void {
    if (this._disposed) return
    this.triggerOpener()
  }

  /** Bind an environment texture directly to the shared cube material's envMap.
   *  Explicit binding keeps the reflection source stable while the scene is
   *  rendered through either backend's post-processing target.
   *  Called by Experience.setupEnvironment() after PMREM is generated. */
  bindEnvironment(envTexture: THREE.Texture): void {
    if (this._disposed) return
    this._material.envMap = envTexture
    this._material.needsUpdate = true
  }

  /** Keep the transparent shell legible when UI theme flips light ↔ dark. */
  setTheme(isLight: boolean): void {
    if (this._disposed) return
    this._isLightTheme = isLight
    this._themeTint.setHex(isLight ? 0x5f536b : 0xd0c5dc)
    this._blendDirty = true
  }

  updateMaterial(params: BakuMaterialState): void {
    if (this._disposed) return
    this.targetParams = {
      color: params.color ? new THREE.Color(params.color) : this.targetParams.color,
      emissive: params.emissive ? new THREE.Color(params.emissive) : this.targetParams.emissive,
      roughness: params.roughness ?? this.targetParams.roughness,
      metalness: params.metalness ?? this.targetParams.metalness,
      role: (params.role ?? this.targetParams.role) as BakuRole,
    }
    this._materialDirty = true
  }

  /** Rotate cube to show the face for the given section index.
   *  6 sections = 6 faces. Animates _idleRotY toward the target rotation
   *  over the next ~0.8s (lerped in update()). Called by Experience.ts
   *  on jlz:section-change. */
  rotateToFace(sectionIndex: number): void {
    if (this._disposed) return
    if (this._reducedMotion) {
      this.snapToFace(sectionIndex)
      return
    }
    const idx = Math.max(0, Math.min(SplashCube.FACE_ROTATIONS.length - 1, sectionIndex))
    this._targetFaceRotY = SplashCube.FACE_ROTATIONS[idx] ?? 0
    // D-16 fix: capture start rotation + shortest-path delta for absolute lerp.
    this._startFaceRotY = this._idleRotY
    let delta = this._targetFaceRotY - this._startFaceRotY
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    this._startFaceDelta = delta
    this._faceLerp = 0 // start animation
    this.requestJellyPulse(0.45)
  }

  /** Apply the boot section without replaying a visible entrance animation. */
  snapToFace(sectionIndex: number): void {
    if (this._disposed) return
    const idx = Math.max(0, Math.min(SplashCube.FACE_ROTATIONS.length - 1, sectionIndex))
    const rotation = SplashCube.FACE_ROTATIONS[idx] ?? 0
    this._targetFaceRotY = rotation
    this._startFaceRotY = rotation
    this._startFaceDelta = 0
    this._idleRotY = rotation
    this._faceLerp = 1
    this._root.rotation.set(0, rotation, 0)
  }

  /** Settle all decorative cube reactions when motion policy changes live. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    if (!reduced) return

    this._idleRotY = this._targetFaceRotY
    this._startFaceRotY = this._targetFaceRotY
    this._startFaceDelta = 0
    this._faceLerp = 1
    this._root.rotation.set(0, this._idleRotY, 0)

    this.jellyTarget = 0
    this.jellyEnergy = 0
    this.nextJellyUpdateAt = 0
    if (this.jellyWasActive) this.resetJellyGeometry()
    this.jellyWasActive = false

    this.openerPhase = 'done'
    this.openerTarget = 0
    this.openerProgress = 0
    this._shell.scale.setScalar(1)
    this.applyMaterialBlend()
  }

  // (setEnvAndCamera removed — dead no-op, body was '// No-op'.
  //  Experience.ts call site removed too.)

  updateWorldBlend(
    fromColor: THREE.Color,
    toColor: THREE.Color,
    fromEmissive: THREE.Color,
    toEmissive: THREE.Color,
    t: number,
  ): void {
    if (this._disposed) return
    this._blendFromColor.copy(fromColor)
    this._blendToColor.copy(toColor)
    this._blendFromEmissive.copy(fromEmissive)
    this._blendToEmissive.copy(toEmissive)
    this._blendT = t
    this._blendDirty = true
  }

  // ════════════════════════════════════════════════════════════════════
  // UPDATE — called every frame when rendering
  // ════════════════════════════════════════════════════════════════════
  update(dt: number): void {
    if (this._disposed) return
    const reactionActive =
      this.jellyEnergy > 0.0005 ||
      this.jellyTarget > 0.0005 ||
      this._faceLerp < 1 ||
      (this.openerPhase !== 'done' && this.openerPhase !== 'idle') ||
      this.openerProgress > 0.01
    if (!reactionActive && !this._blendDirty && !this._materialDirty) return
    this.time += dt

    // A driven envelope gives the silicone wobble a quick response and a long,
    // natural tail. There is no fixed cut-off and therefore no final snap.
    this.jellyTarget *= Math.exp(-dt * 3.4)
    this.jellyEnergy = THREE.MathUtils.damp(this.jellyEnergy, this.jellyTarget, 9, dt)
    if (this.jellyTarget < 0.0005) this.jellyTarget = 0
    if (this.jellyEnergy < 0.0005) this.jellyEnergy = 0
    const jellyActive = this.jellyEnergy > 0 || this.jellyTarget > 0
    if (jellyActive && this.time >= this.nextJellyUpdateAt) {
      this.updateJellyGeometry(this.jellyEnergy)
      this.nextJellyUpdateAt = this.time + JELLY_UPDATE_INTERVAL
    } else if (!jellyActive && this.jellyWasActive) {
      // A reaction returns to the exact rounded base shape; leaving the last
      // sampled ripple in place would make a one-shot pulse look accidental.
      this.resetJellyGeometry()
    }
    this.jellyWasActive = jellyActive

    // ── Face rotation animation (absolute lerp from start to target) ──
    if (this._faceLerp < 1) {
      this._faceLerp = Math.min(1, this._faceLerp + dt * 1.8) // ~0.55s at 60fps
      const ease = smoothstep01(this._faceLerp)
      this._idleRotY = this._startFaceRotY + this._startFaceDelta * ease
      if (this._faceLerp >= 1) {
        this._idleRotY = this._targetFaceRotY
      }
    }
    this._root.rotation.y = this._idleRotY

    // ── Opener (scale pulse, not face separation) ──
    if (this.openerPhase !== 'done' || this.openerProgress > 0.01) {
      this.openerProgress += (this.openerTarget - this.openerProgress) * Math.min(1, dt * 4)
      if (this.openerPhase === 'opening' && this.openerProgress > 0.9) {
        this.openerPhase = 'closing'
        this.openerTarget = 0
      } else if (this.openerPhase === 'closing' && this.openerProgress < 0.05) {
        this.openerPhase = 'done'
        this.openerProgress = 0
      }
    }

    // Apply opener scale to cube mesh — scale pulse from 1.0 → 1.4 → 1.0
    // Boosted scale pulse for clearer click feedback.
    const openerScale = 1 + this.openerProgress * 0.4
    this._shell.scale.setScalar(openerScale)

    // (PlayButton3D update removed — dead render path deleted)
    // ── Material color blend ──
    this.applyMaterialBlend()

    // Edge colors are STATIC — set once in buildCube, NOT animated per frame.
    // Per-frame edge animation was allocating new Color objects + updating
    // GPU buffer every frame — major Safari/iOS perf killer.

    // ── Apply role when changed ──
    if (this._materialDirty || this.targetParams.role !== this._currentRole) {
      this._currentRole = this.targetParams.role
      this.applyRoleAndParams()
    }
    this._materialDirty = false
    this._blendDirty = false
  }

  private applyRoleAndParams(): void {
    const { color, emissive, roughness } = this.targetParams
    this._material.color.copy(color)
    this._material.emissive.copy(emissive)
    // Preserve an authored material response without losing the frosted lens
    // effect. Glass is a dielectric: it stays non-metallic in every phase.
    this._material.roughness = Math.max(roughness, 0.14)
    this._material.metalness = 0
  }

  /** Apply the latest world blend without requiring a scheduler frame. */
  private applyMaterialBlend(): void {
    this._blendColor.copy(this._blendFromColor).lerp(this._blendToColor, this._blendT)
    // A controlled neutral tint keeps glass visible on white without a
    // debug-looking outline. The visible shape is a real PBR surface: PMREM,
    // transmission, clearcoat and iridescence create the moving highlights.
    this._blendColor.lerp(this._themeTint, this._isLightTheme ? 0.9 : 0.3)
    if (!this._material.color.equals(this._blendColor)) {
      this._material.color.copy(this._blendColor)
    }
  }

  /** Add energy to the damped material reaction without a timer cut-off. */
  private requestJellyPulse(amount: number = 1): void {
    this.jellyTarget = Math.max(this.jellyTarget, amount)
    // Do not wait for the cadence after an interaction.
    this.nextJellyUpdateAt = 0
  }

  /**
   * A tiny vertex displacement recreates the silicon-glass wobble without
   * depending on a WebGPU-only transmission/node graph. The geometry has only
   * ~3.5K vertices and uses no allocations in the frame loop.
   */
  private updateJellyGeometry(amplitude: number): void {
    const out = this._positions.array as Float32Array
    const t = this.time
    for (let i = 0; i < out.length; i += 3) {
      const x = this._basePositions[i] ?? 0
      const y = this._basePositions[i + 1] ?? 0
      const z = this._basePositions[i + 2] ?? 0
      const nx = this._normals[i] ?? 0
      const ny = this._normals[i + 1] ?? 0
      const nz = this._normals[i + 2] ?? 0
      // Long, low-frequency waves read as one soft silicone body. The old
      // high-frequency pair created several competing rims in the silhouette.
      const ripple =
        Math.sin(x * 6 + y * 5 + z * 4 + t * 0.85) * 0.012 +
        Math.sin(x * 9 - z * 6 - t * 0.54) * 0.005
      out[i] = x + nx * ripple * amplitude
      out[i + 1] = y + ny * ripple * amplitude
      out[i + 2] = z + nz * ripple * amplitude
    }
    this._positions.needsUpdate = true
  }

  private resetJellyGeometry(): void {
    ;(this._positions.array as Float32Array).set(this._basePositions)
    this._positions.needsUpdate = true
  }

  // (_createJLZTexture REMOVED — was only used by buildContentScene which is
  //  deleted. JLZ branding no longer rendered inside the glass cube.)

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    // Node + resource disposal stays with the Vue host: the declarative root
    // and its shell leave the scene with BakuCubeOwner's unmount (Tres owns
    // the geometry/material it mounted). The controller only retires its
    // motion state — the _disposed guard blocks every late public call.
  }
}
