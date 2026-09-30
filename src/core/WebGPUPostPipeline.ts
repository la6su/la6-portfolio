// src/core/WebGPUPostPipeline.ts — TSL-based post-processing for WebGPU path.
//
// Uses three's native RenderPipeline + PassNode + BloomNode.
// Vignette + grain via simple TSL Fn. No ShaderMaterial.

import { WebGPURenderer, RenderPipeline as TSLRenderPipeline } from 'three/webgpu'
import type { PassNode } from 'three/webgpu'
import {
  tslBloom,
  tslFloat,
  tslPass,
  tslSmoothstepPerComponent,
  tslVec3,
} from '../types/tsl-helpers'
import type BloomNode from 'three/addons/tsl/display/BloomNode.js'
import {
  uniform,
  uv,
  dot,
  vec2,
  vec3,
  mix,
  smoothstep,
  oneMinus,
  sin,
  cos,
  float,
  fract,
  floor,
  max,
} from 'three/tsl'
import * as THREE from 'three'
import type { Scene, Camera } from 'three'
import type { Node } from 'three/webgpu'
import { withNoToneMapping } from './toneMappingGuard'
import type { PostParams } from './postParams'

interface RenderTargetOwner {
  dispose?: () => void
}

interface BloomResourceOwner extends RenderTargetOwner {
  _renderTargetBright?: RenderTargetOwner | null
  _renderTargetsHorizontal?: Array<RenderTargetOwner | null>
  _renderTargetsVertical?: Array<RenderTargetOwner | null>
}

/**
 * TSL post-processing pipeline for WebGPU. Replaces direct renderer.render()
 * on the WebGPU path with a bloom + vignette + grain graph.
 */
export class WebGPUPostPipeline {
  private _pipeline: TSLRenderPipeline | null = null
  private _renderer: WebGPURenderer
  private _scene: Scene
  private _camera: Camera
  private _needsBuild = true
  private _scenePass: PassNode | null = null
  private _bloomNode: BloomNode | null = null

  private _bloomStrength = uniform(0)
  private _bloomRadius = uniform(0)
  private _bloomThreshold = uniform(0.5)
  private _vignetteStrength = uniform(0)
  private _grainStrength = uniform(0)
  private _borderStrength = uniform(0)
  private _chromaticStrength = uniform(0)
  private _refractStrength = uniform(0)
  private _gradeShadows = uniform(new THREE.Vector3(1, 1, 1))
  private _gradeHighlights = uniform(new THREE.Vector3(1, 1, 1))

  private constructor(renderer: WebGPURenderer, scene: Scene, camera: Camera) {
    this._renderer = renderer
    this._scene = scene
    this._camera = camera
  }

  static create(renderer: WebGPURenderer, scene: Scene, camera: Camera): WebGPUPostPipeline {
    return new WebGPUPostPipeline(renderer, scene, camera)
  }

  setScene(scene: Scene, camera: Camera): boolean {
    if (scene !== this._scene || camera !== this._camera) {
      this._scene = scene
      this._camera = camera
      this._needsBuild = true
      return true
    }
    // Background is handled by PassNode's clear color (scene.background)
    // via Background.js — no need to composite it manually in the TSL graph.
    return false
  }

  updateParams(params: Readonly<PostParams>): void {
    this._bloomStrength.value = params.bloom
    this._bloomRadius.value = params.bloomRadius
    this._bloomThreshold.value = params.bloomThreshold
    this._vignetteStrength.value = params.vignette
    this._grainStrength.value = params.grain
    this._borderStrength.value = params.border
    this._chromaticStrength.value = params.chromatic
    this._refractStrength.value = params.refract
    this._gradeShadows.value.set(
      params.gradeShadows[0],
      params.gradeShadows[1],
      params.gradeShadows[2],
    )
    this._gradeHighlights.value.set(
      params.gradeHighlights[0],
      params.gradeHighlights[1],
      params.gradeHighlights[2],
    )
  }

  render(): void {
    if (this._needsBuild) {
      this._buildPipeline()
      this._needsBuild = false
    }
    // IMPORTANT: TSL RenderPipeline has its own render() — it renders the
    // scene+post graph via its outputNode. Do NOT call renderer.render()
    // (that would double-render and bypass post-processing).
    // The pipeline.render() method overrides toneMapping/outputColorSpace
    // internally and applies them via the outputNode chain.
    if (this._pipeline) {
      this._pipeline.render()
    }
  }

  private _buildPipeline(): void {
    if (this._pipeline) {
      try {
        this._pipeline.dispose()
      } catch {
        /* ignore */
      } finally {
        // Do not retain a disposed graph while a replacement is being built.
        this._pipeline = null
      }
    }

    this._disposeBloomNode()
    this._disposeScenePass()

    // Scene pass: render scene to texture. PassNode clears with
    // scene.background automatically (Background.js handles this).
    const scenePass = tslPass(this._scene, this._camera)
    this._scenePass = scenePass
    try {
      const sceneColor = scenePass.getTextureNode()

      // ════════════════════════════════════════════════════════════════════
      // MIRROR WebGL2 COMPOSITE_FSG EXACTLY (same order, same formulas)
      // ════════════════════════════════════════════════════════════════════

      // ── 1. Screen-space refraction ──
      // WebGL2: uv = vUv + center * strength * 0.04 + wobble (only if uRefract > 0)
      // WebGPU: same formula, but always computed (when refract=0, offset=0)
      const rCenter = uv().sub(0.5)
      const rDist = rCenter.length()
      const rStrength = this._refractStrength.mul(float(0.5).add(rDist.mul(1.5)))
      const rWobble = vec2(
        sin(uv().y.mul(20.0).add(this._refractStrength.mul(8.0))),
        cos(uv().x.mul(20.0).add(this._refractStrength.mul(8.0))),
      ).mul(rStrength.mul(0.003))
      const refractUv = uv().add(rCenter.mul(rStrength).mul(0.04)).add(rWobble).clamp(0.0, 1.0)

      // ── 2. Sample scene at refracted UV ──
      // WebGL2: vec3 scene = texture2D(uScene, uv).xyz;
      const sampled = sceneColor.sample(refractUv)

      // ── 3. Chromatic aberration ──
      // WebGL2: samples uScene at uv+dir and uv-dir (using SAME refracted uv)
      // WebGPU: must sample sceneColor at refractUv+dir, not uv+dir
      // Guard: normalize(0,0) is undefined → NaN at exact screen center.
      // Use max(length, 0.001) to avoid NaN (zero chromatic at center is fine).
      const cCenter = uv().sub(0.5)
      const cLen = max(cCenter.length(), float(0.001))
      // Keep the focal center clean; spectral separation belongs to the glass edge.
      const cDir = cCenter
        .div(cLen)
        .mul(this._chromaticStrength)
        .mul(smoothstep(0.1, 0.65, cLen))
      const rChan = tslFloat(sceneColor.sample(refractUv.add(cDir).clamp(0.0, 1.0)), 'x')
      const bChan = tslFloat(sceneColor.sample(refractUv.sub(cDir).clamp(0.0, 1.0)), 'z')
      const scene = vec3(rChan, tslFloat(sampled, 'y'), bChan)

      // ── 4. Bloom composite ──
      // WebGL2: color = scene + bloom * uBloomIntensity
      const bloomNode = tslBloom(
        scene,
        this._bloomStrength,
        this._bloomRadius,
        this._bloomThreshold,
      )
      this._bloomNode = bloomNode
      let color = scene.add(bloomNode)

      // ── 5. Color grading ──
      // WebGL2: lum = dot(color, vec3(0.299,0.587,0.114));
      //         graded = mix(color*uGradeShadows, color+(uGradeHighlights-1)*max(color-0.5,0), smoothstep(0,1,lum));
      //         color = mix(color, graded, 0.4);
      const lum = dot(color, vec3(0.299, 0.587, 0.114))
      const graded = mix(
        color.mul(this._gradeShadows),
        color.add(this._gradeHighlights.sub(1.0).mul(color.sub(0.5).max(0.0))),
        smoothstep(0.0, 1.0, lum),
      )
      color = mix(color, graded, 0.4)

      // ── 6. ACES tone mapping removed ──
      // ACES compressed dynamic range and desaturated case textures. Materials
      // that need tone mapping use toneMapped:true (applied per-material during
      // scene→RT). CasePlane sets toneMapped:false for faithful texture colors.

      // ── 7. Film grain ──
      // Portable integer-based hash (NOT sin-based — sin() gives different
      // precision in GLSL vs WGSL, causing grain mismatch between WebGL2 and WebGPU).
      // hash(p) = fract((p3.x + p3.y) * p3.z) where p3 = fract(vec3(p.xyx)*0.1031) + dot(...)
      // This graph is admitted only on WebGPU; WebGL currently renders directly.
      // Static film texture: route uniforms animate its strength, not wall time.
      // Unrelated demand frames must not restart visible grain or glass wobble.
      const noiseCoord = uv().mul(1024.0)
      const nFloor = floor(noiseCoord)
      const nFract = fract(noiseCoord)
      const nSmooth = nFract.mul(nFract).mul(float(3.0).sub(nFract.mul(2.0)))
      // Portable hash: vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x+p3.y)*p3.z)
      const hash = (p: Node<'vec2'>): Node<'float'> => {
        const p3 = fract(vec3(tslFloat(p, 'x'), tslFloat(p, 'y'), tslFloat(p, 'x')).mul(0.1031))
        const dotVal = dot(p3, tslVec3(p3, 'yzx').add(33.33))
        const p3d = p3.add(dotVal)
        return fract(tslFloat(p3d, 'x').add(tslFloat(p3d, 'y')).mul(tslFloat(p3d, 'z')))
      }
      const nA = hash(nFloor)
      const nB = hash(nFloor.add(vec2(1.0, 0.0)))
      const nC = hash(nFloor.add(vec2(0.0, 1.0)))
      const nD = hash(nFloor.add(vec2(1.0, 1.0)))
      const grainNoise = mix(
        mix(nA, nB, tslFloat(nSmooth, 'x')),
        mix(nC, nD, tslFloat(nSmooth, 'x')),
        tslFloat(nSmooth, 'y'),
      )
      // grain = (noise - 0.5) * 2.0 * strength → adds ±strength per pixel
      const grain = grainNoise.sub(0.5).mul(2.0).mul(this._grainStrength)
      color = color.add(vec3(grain))

      // ── 8. Vignette (radial falloff) ──
      // MIRROR WebGL2 COMPOSITE_FSG vignette EXACTLY (was missing → WebGPU frame
      // stayed full-brightness while WebGL2 darkened edges; on intro postVignette=1.5
      // this made the cube+background appear uniformly bright on WebGPU vs edge-
      // darkened on WebGL2 → perceived "lighter/more transparent" discrepancy).
      // WebGL2 formula (RenderPipeline.ts COMPOSITE_FSG):
      //   center = vUv - 0.5; dist = length(center);
      //   vig = 1.0 - dist * uVignette; vig = smoothstep(0,1,vig); color *= vig;
      // When vignette=0: vig = smoothstep(0,1, 1-0) = smoothstep(0,1,1) = 1 → no
      // change (matches WebGL2 `if (uVignette > 0.0)` skip — visually identical).
      const vCenter = uv().sub(0.5)
      const vDist = vCenter.length()
      const vigRaw = float(1.0).sub(vDist.mul(this._vignetteStrength))
      const vig = smoothstep(0.0, 1.0, vigRaw)
      color = color.mul(vig)

      // ── 9. Screen border ──
      // MIRROR WebGL2 COMPOSITE_FSG barrel distortion + edge masking exactly
      // WebGL2: curveUV = vUv * 2 - 1; offset = curveUV.yx * 0.25;
      //         curveUV += curveUV * offset * offset; curveUV = curveUV * 0.5 + 0.5;
      //         edge = smoothstep(0, 0.02, curveUV) * (1 - smoothstep(0.98, 1, curveUV));
      //         color *= (edge.x * edge.y)  if uBorder > 0
      //
      // edge is vec2, but edge.x * edge.y = scalar. All RGB channels multiply by same
      // scalar → uniform blackening at edges (disabled by project presets).
      // Gate: step(0.0, _borderStrength) → 0 when off, 1 when any border > 0.
      // mix(1.0, edgeScalar, gate) = edgeScalar when border enabled, 1.0 when off.
      // TSL note: smoothstep() declarations only carry matching-shape overloads,
      // while WGSL compiles the scalar low/high form per-component — the widened
      // call lives behind tslSmoothstepPerComponent() in tsl-helpers.ts.
      // TSL note: swizzle getters like edge.x are runtime Proxy sugar for
      // split(node, 'x') — the typed call form lives in tsl-helpers.ts too.
      const barrelUV = uv().mul(2.0).sub(1.0)
      const barrelOffset = barrelUV.yx.mul(0.25)
      const barrelDistorted = barrelUV
        .add(barrelUV.mul(barrelOffset).mul(barrelOffset))
        .mul(0.5)
        .add(0.5)
      const innerEdge = tslSmoothstepPerComponent(0.0, 0.02, barrelDistorted)
      const outerEdge = oneMinus(tslSmoothstepPerComponent(0.98, 1.0, barrelDistorted))
      const edge = innerEdge.mul(outerEdge) // Node<"vec2">
      const edgeScalar = tslFloat(edge, 'x').mul(tslFloat(edge, 'y')) // Node<"float">
      // MIRROR WebGL2: color *= edge.x * edge.y (full, no mix attenuate)
      // Interpolate authored strength continuously; a binary gate caused a
      // full black edge to pop in at the beginning of a section crossfade.
      // The persistent CRT bezel is owned by _crt.less on both backends.
      const borderGate = this._borderStrength.clamp(0.0, 1.0)
      const borderFactor = mix(float(1.0), edgeScalar, borderGate)
      color = color.mul(borderFactor)

      // ── sRGB encode ──
      // Let TSLRenderPipeline apply sRGB automatically via outputColorTransform=true
      // (default). This uses three.js's EXACT sRGBTransferOETF function (not pow
      // approximation), matching WebGL2 which also uses the exact OETF via
      // renderer.outputColorSpace = SRGBColorSpace.
      //
      // We do NOT apply pow(0.4545) manually — that's an approximation that
      // differs from the exact sRGB curve (especially in shadows).
      //
      // IMPORTANT: Set renderer.toneMapping = NoToneMapping before building the
      // pipeline so renderOutput() does NOT apply ACES. ACES was intentionally
      // removed from the post-processing graph to preserve faithful texture colors.
      // The pipeline captures toneMapping at build time, so we restore after.
      this._pipeline = withNoToneMapping(
        this._renderer,
        () => new TSLRenderPipeline(this._renderer, color),
      )
      // outputColorTransform = true (default) → TSLRenderPipeline applies
      // renderOutput(color, NoToneMapping, SRGBColorSpace) which does:
      //   1. toneMapping (NoToneMapping → no-op)
      //   2. workingToColorSpace(SRGB) → exact sRGBTransferOETF
    } catch (error) {
      // PassNode owns a render target independently of the TSL pipeline. It
      // must be released even when graph construction throws before the
      // RenderPipeline instance is assigned.
      this._disposeBloomNode()
      this._disposeScenePass()
      throw error
    }
  }

  private _disposeBloomNode(): void {
    const bloom = this._bloomNode
    this._bloomNode = null
    if (!bloom) return
    try {
      bloom.dispose()
    } catch {
      // Bloom teardown is failure-isolating: the graph and scene pass still
      // need their own deterministic cleanup boundary.
    }
  }

  private _disposeScenePass(): void {
    const pass = this._scenePass
    this._scenePass = null
    if (!pass) return
    try {
      pass.dispose()
    } catch {
      // GPU teardown is failure-isolating: a backend-specific pass error must
      // not retain the pass reference or prevent the rest of the owner from
      // releasing its graph and renderer resources.
    }
  }

  dispose(): void {
    if (this._pipeline) {
      try {
        this._pipeline.dispose()
      } catch {
        /* ignore */
      }
    }
    this._pipeline = null
    this._disposeBloomNode()
    this._disposeScenePass()
  }

  /** Counts only live render targets owned by this post graph. */
  getResourceInfo(): { renderTargets: number; passes: number } {
    const renderTargets = new Set<RenderTargetOwner>()
    if (this._scenePass) renderTargets.add(this._scenePass.renderTarget)

    // The bloom internals below are three-private (undeclared on BloomNode),
    // so the resource census reads them through one narrow owner view.
    const bloom = this._bloomNode as (BloomNode & BloomResourceOwner) | null
    if (bloom?._renderTargetBright) renderTargets.add(bloom._renderTargetBright)
    for (const target of bloom?._renderTargetsHorizontal ?? []) {
      if (target) renderTargets.add(target)
    }
    for (const target of bloom?._renderTargetsVertical ?? []) {
      if (target) renderTargets.add(target)
    }

    return {
      renderTargets: renderTargets.size,
      passes: this._scenePass ? 1 : 0,
    }
  }
}
