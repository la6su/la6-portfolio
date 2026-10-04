// JunniParticles.ts — GPU-side animated particle field (TSL NodeMaterial).
//
// Port of next.junni.co.jp Section3 Sec3Particle to our TSL/WebGPU stack.
//
// Section3 behavior (textured sprites + rotation + HSV hue shift):
//   - Sprite sheet texture (6 frames in a 768×128 atlas → 6×128 tiles)
//   - Per-instance: offsetPos (base position) + num (frame index, scale variant)
//   - Y-drift (particles rise upward, faster near center)
//   - XZ rotation around center (particles orbit)
//   - Per-particle XY rotation (spinning sprites)
//   - Pulse scale (exp curve — particles periodically grow)
//   - Stable atlas frame per particle (no temporal frame or hue cycling)
//   - Additive blending — luminous accumulation
//
// WebGPU parity: InstancedMesh + SpriteNodeMaterial (billboarded quads).
// WebGPU doesn't support resizable THREE.Points (pixel size 1 only), so
// instanced sprites are the portable path.
//
// Use TSL NodeMaterial only; raw ShaderMaterial is not allowed.
// On-demand rendering: update() advances uTime only when the caller has
// requested rendering (World.update runs only while needsRender is true).

import * as THREE from 'three'
import { shallowRef } from 'vue'
import { SpriteNodeMaterial } from 'three/webgpu'
import {
  Fn,
  vec2,
  vec3,
  float,
  uniform,
  uv,
  abs,
  smoothstep,
  sin,
  cos,
  mod,
  floor,
  length,
  attribute,
  texture,
} from 'three/tsl'

interface JunniParticlesOptions {
  /** Particle count (will be halved by auto-reduce if FPS drops). */
  count?: number
  /** Field spread [x, y, z]. Particles wrap around this volume. */
  range?: [number, number, number]
  /** Base particle size in world units. */
  size?: number
  /** Drift speed multiplier (affects Y-rise + rotation frequency). */
  speed?: number
  /** Particle color tint (default white). */
  color?: number
  /** Sprite sheet texture sampled at one stable frame per instance. */
  texture: THREE.Texture
  /** Sprite sheet tile count [x, y] (e.g. [6, 1] for a 6-frame horizontal strip). */
  textureTiles?: [number, number]
}

// TSL node types in three 0.184 .d.ts are deeply nested (UniformNode vs
// VarNode vs AttributeNode) and don't compose cleanly. We use `unknown`
// storage + minimal casts at the access boundary — matches how three.js TSL
// examples handle the incomplete .d.ts.
type UniformVal = { value: unknown }
// Inside Fn closures, cast to a minimal shape that supports TSL operator
// methods (.mul, .add, .sub, .div, .y, etc.). Runtime objects DO have these
// (TSL adds them via prototype), but TS .d.ts doesn't express cross-type
// operator overloads cleanly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLNode = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLVec2 = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TSLVec3 = any

export class JunniParticles {
  private _disposed = false
  private _time = 0
  private readonly _baseCount: number
  private readonly _range: THREE.Vector3
  private _reduced = false
  private _mesh: THREE.InstancedMesh | null = null
  private readonly _visible = shallowRef(true)
  private _count: number
  geometry: THREE.BufferGeometry
  readonly material: SpriteNodeMaterial

  // Per-instance uniforms. Stored as unknown — TSL node types in three 0.184
  // .d.ts are incomplete; we access .value through UniformVal cast.
  private readonly _uTime: unknown

  constructor(opts: JunniParticlesOptions) {
    const count = opts.count ?? 300
    const range = new THREE.Vector3(...(opts.range ?? [14, 8, 8]))
    const size = opts.size ?? 0.1
    const speed = opts.speed ?? 1
    const color = opts.color ?? 0xffffff
    const colorObj = new THREE.Color(color)
    const tiles = opts.textureTiles ?? [6, 1]

    // Base geometry — unit plane. SpriteNodeMaterial billboards it.
    const geo = new THREE.PlaneGeometry(1, 1)

    // Per-instance attributes:
    // - offsetPos: base position in range volume (random spread)
    // - num: vec2 — x = stable frame seed, y = scale variant (0.45-0.8)
    //   Matches Section3: numArray.push(i, Math.random() * 0.95 + 0.05)
    const offsetPos = new Float32Array(count * 3)
    const numAttr = new Float32Array(count * 2)
    for (let i = 0; i < count; i++) {
      offsetPos[i * 3] = Math.random() * range.x
      offsetPos[i * 3 + 1] = Math.random() * range.y
      offsetPos[i * 3 + 2] = Math.random() * range.z
      numAttr[i * 2] = i // reference keeps the instance index as its stable seed
      numAttr[i * 2 + 1] = Math.random() * 0.35 + 0.45 // keep glyphs above subpixel scale
    }
    geo.setAttribute('offsetPos', new THREE.InstancedBufferAttribute(offsetPos, 3))
    geo.setAttribute('num', new THREE.InstancedBufferAttribute(numAttr, 2))

    // Per-instance uniforms (created BEFORE the TSL Fn closures that capture them)
    const uTime = uniform(0)
    const uVisibility = uniform(1)
    const uRange = uniform(range)
    const uSize = uniform(size)
    const uSpeed = uniform(speed)
    // Tint color keeps the glyphs in the Works palette on either background.
    const uColor = uniform(colorObj)
    // TSL texture() expects a raw THREE.Texture — NOT wrapped in uniform().
    // TSL creates the TextureNode internally. Wrapping in uniform() causes
    // "texture(value) function expects a valid instance of THREE.Texture".
    const uTex = opts.texture
    const uTiles = uniform(new THREE.Vector2(tiles[0], tiles[1]))

    // ── positionNode: Section3 vertex logic ──
    //   oPos = offsetPos
    //   center = linearstep(5, 1, length(oPos.xz - range.xz/2))  (1 at center, 0 at edges)
    //   oPos.y += time * center           (rise faster near center)
    //   oPos = mod(oPos, range) - range/2 (wrap)
    //   oPos.xz *= rotate(time * center)  (orbit around center)
    //   oPos.xz *= 1 + (1 - uVisibility)  (expand when fading out)
    //   pos = position * smoothstep(...) * num.y * rotate(time * num.y)
    //   pos += oPos
    const positionNode = Fn(() => {
      const offset = attribute('offsetPos') as unknown as TSLVec3
      const t = (uTime as unknown as TSLNode).mul((uSpeed as unknown as TSLNode).mul(0.08))
      const rangeVec = uRange as unknown as TSLVec3
      const rangeHalf = rangeVec.div(2.0)

      // center: 1 at center of xz, 0 at edges (linearstep(5, 1, dist))
      const xzCenter = rangeVec.xz.div(2.0)
      const distFromCenter = length(offset.xz.sub(xzCenter))
      // linearstep(5, 1, dist) = clamp((5 - dist) / (5 - 1), 0, 1)
      const center = float(5.0).sub(distFromCenter).div(4.0).clamp(0.0, 1.0)

      // Y-drift (rise faster near center) + mod wrap
      let oPos = offset.add(vec3(float(0.0), t.mul(center), float(0.0)))
      oPos = mod(oPos, rangeVec).sub(rangeHalf)

      // XZ rotation around center (orbit)
      const rotAngle = t.mul(center)
      const cosR = cos(rotAngle)
      const sinR = sin(rotAngle)
      // 2D rotation matrix on xz: mat2(cos, sin, -sin, cos)
      const rx = oPos.x.mul(cosR).sub(oPos.z.mul(sinR))
      const rz = oPos.x.mul(sinR).add(oPos.z.mul(cosR))
      oPos = vec3(rx, oPos.y, rz)

      // Expand when fading out (visibility → 0 makes particles spread)
      const expand = float(1.0).add(float(1.0).sub(uVisibility as unknown as TSLNode))
      oPos = vec3(oPos.x.mul(expand), oPos.y, oPos.z.mul(expand))

      return oPos
    })

    // ── scaleNode: per-instance size with edge fade + pulse (Section3) ──
    //   Smoothly fade particles at the vertical wrap boundary to avoid a pop.
    // SpriteNodeMaterial uses scaleNode for the sprite quad size.
    const scaleNode = Fn(() => {
      const num = attribute('num') as unknown as TSLVec2
      const offset = attribute('offsetPos') as unknown as TSLVec3
      const rangeVec = uRange as unknown as TSLVec3
      const t = (uTime as unknown as TSLNode).mul((uSpeed as unknown as TSLNode).mul(0.08))
      const xzCenter = rangeVec.xz.div(2.0)
      const distFromCenter = length(offset.xz.sub(xzCenter))
      const center = float(5.0).sub(distFromCenter).div(4.0).clamp(0.0, 1.0)
      const wrappedY = mod(offset.y.add(t.mul(center)), rangeVec.y).sub(rangeVec.y.div(2.0))
      const edge = abs(wrappedY)
      const edgeFade = float(1.0).sub(
        smoothstep(rangeVec.y.div(2.0).sub(0.5), rangeVec.y.div(2.0), edge),
      )
      return num.y.mul(edgeFade).mul(uSize as unknown as TSLNode)
    })

    // ── colorNode + opacityNode: textured sprite sheet ──
    // Cast helpers for TSL node typing (three 0.184 .d.ts is incomplete here)
    // texSampler is the raw Texture — texture() TSL node accepts it directly.
    const texSampler = uTex
    const buildSheetUv = () => {
      const num = attribute('num') as unknown as TSLVec2
      const vUv = uv()
      const tilesVec = uTiles as unknown as TSLVec2
      // Frame assignment is immutable per instance. Inset the sample region
      // so linear filtering cannot pull bright strokes from a neighboring
      // tile at the atlas boundary.
      // Match Sec3Particle's fixed per-instance atlas selection. num.x is the
      // instance index; this is not driven by time, despite the reference
      // helper's `time` parameter name.
      const frame = floor(tilesVec.x.mul(tilesVec.y).mul(mod(num.x.div(4.0), float(1.0))))
      const localUv = vUv.mul(0.992).add(0.004)
      const sx = localUv.x.add(mod(frame, tilesVec.x))
      const sy = localUv.y.sub(floor(frame.div(tilesVec.x)))
      return vec2(sx, sy).div(tilesVec)
    }

    // Fixed atlas frame with a stable project tint.
    const colorNode = Fn(() => {
      const num = attribute('num') as unknown as TSLVec2
      const sheetUv = buildSheetUv() as unknown as TSLVec2
      const texColor = texture(texSampler, sheetUv) as unknown as TSLVec3
      const stableTint = float(0.96).add(num.y.mul(0.04))
      return texColor.rgb.mul(uColor as unknown as TSLVec3).mul(stableTint)
    })

    const opacityNode = Fn(() => {
      const sheetUv = buildSheetUv() as unknown as TSLVec2
      const texColor = texture(texSampler, sheetUv) as unknown as TSLVec3
      // The JPEG sprite sheet has no alpha channel; mask its black background.
      const lum = texColor.r.mul(0.299).add(texColor.g.mul(0.587)).add(texColor.b.mul(0.114))
      // Keep the cyan glow instead of thresholding to the thin white core;
      // the wider transition avoids subpixel alpha flicker while particles drift.
      const masked = smoothstep(float(0.025), float(0.12), lum)
      return masked.mul(uVisibility as unknown as TSLNode)
    })
    // SpriteNodeMaterial — purpose-built for billboarded particles.
    const mat = new SpriteNodeMaterial({
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending, // default; setBlending() updates per theme
      side: THREE.DoubleSide,
      fog: false,
    })
    mat.positionNode = positionNode()
    mat.scaleNode = scaleNode()
    // Sec3Particle rotates each glyph around its own center. Keep that motion,
    // but use the much lower Works speed to prevent the fast spin reading as
    // tile flicker.
    mat.rotationNode = Fn(() => {
      const num = attribute('num') as unknown as TSLVec2
      return (uTime as unknown as TSLNode).mul((uSpeed as unknown as TSLNode).mul(num.y))
    })()
    mat.colorNode = colorNode()
    ;(mat as unknown as { opacityNode: unknown }).opacityNode = opacityNode()

    this.geometry = geo
    this.material = mat
    this._count = count
    this._baseCount = count
    this._range = range
    this._uTime = uTime
  }

  get count(): number {
    return this._count
  }
  get visible(): boolean {
    return this._visible.value
  }
  set visible(value: boolean) {
    this._visible.value = value
  }

  /** Adopt the Vue/Tres-declared instance node; this controller owns its resources. */
  bindMesh(mesh: THREE.InstancedMesh): void {
    if (mesh.geometry !== this.geometry || mesh.material !== this.material)
      throw new Error('JunniParticles owner mounted with unexpected geometry or material.')
    if (this._mesh && this._mesh !== mesh)
      throw new Error('JunniParticles can only own one mounted instance node.')
    this._mesh = mesh
    mesh.count = this._count
    this.writeIdentityMatrices(mesh)
  }

  unbindMesh(mesh: THREE.InstancedMesh): void {
    if (this._mesh === mesh) this._mesh = null
  }

  private writeIdentityMatrices(mesh: THREE.InstancedMesh): void {
    const dummy = new THREE.Object3D()
    for (let i = 0; i < this._count; i++) {
      dummy.position.set(0, 0, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  /** Advance the particle animation. Call each frame while rendering. */
  update(dt: number): void {
    if (this._disposed) return
    this._time += dt
    ;(this._uTime as UniformVal).value = this._time
  }

  /** Switch blending mode for theme parity.
   *  Additive: dark theme (glow accumulation — particles add light to dark bg).
   *  Normal: light theme (alpha-over — particles visible on white bg).
   *  Called by Experience on jlz:theme-applied. */
  setBlending(additive: boolean): void {
    if (this._disposed) return
    const mat = this.material as THREE.Material & { blending: number }
    mat.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending
  }

  /**
   * Rebuild the particle field with a new count. Used by auto-reduce:
   * when FPS drops, Experience calls setCount(baseCount / 2) to halve the
   * GPU load. Disposes the old geometry + attribute, creates new ones.
   *
   * One-way by default (reduced=true stays) — restoring causes a GPU spike
   * that can re-trigger low FPS. Call setCount(baseCount, false) to force-restore.
   */
  setCount(newCount: number, markReduced = true): void {
    if (this._disposed) return
    if (newCount === this._count) return
    if (newCount < 1) newCount = 1

    this.geometry.dispose()

    const geo = new THREE.PlaneGeometry(1, 1)
    const offsetPos = new Float32Array(newCount * 3)
    const numAttr = new Float32Array(newCount * 2)
    for (let i = 0; i < newCount; i++) {
      offsetPos[i * 3] = Math.random() * this._range.x
      offsetPos[i * 3 + 1] = Math.random() * this._range.y
      offsetPos[i * 3 + 2] = Math.random() * this._range.z
      numAttr[i * 2] = i
      numAttr[i * 2 + 1] = Math.random() * 0.35 + 0.45
    }
    geo.setAttribute('offsetPos', new THREE.InstancedBufferAttribute(offsetPos, 3))
    geo.setAttribute('num', new THREE.InstancedBufferAttribute(numAttr, 2))
    this.geometry = geo
    this._count = newCount
    if (this._mesh) {
      this._mesh.geometry = geo
      this._mesh.count = newCount
      this.writeIdentityMatrices(this._mesh)
    }
    if (markReduced) this._reduced = newCount < this._baseCount
  }

  get isReduced(): boolean {
    return this._reduced
  }

  get baseCount(): number {
    return this._baseCount
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this.visible = false
    this.geometry.dispose()
    this.material.dispose()
    this._mesh = null
  }
}
