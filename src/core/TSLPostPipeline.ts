// TSL post-processing shared by WebGPU and WebGL2 backends.
//
// Uses three's native RenderPipeline + PassNode + BloomNode.
// Vignette + grain via simple TSL Fn. No ShaderMaterial.

import { WebGPURenderer, RenderPipeline as TSLRenderPipeline } from 'three/webgpu'
import type { PassNode } from 'three/webgpu'
import {
  tslBloom,
  tslFloat,
  tslPass,
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
  sin,
  cos,
  float,
  fract,
  floor,
  max,
  hash,
} from 'three/tsl'
import * as THREE from 'three'
import type { Scene, Camera } from 'three'
import { withNoToneMapping } from './toneMappingGuard'
import type { PostParams } from './postParams'

/**
 * Bloom, grading, refraction, grain, and vignette in one backend-compiled graph.
 */
export class TSLPostPipeline {
  private _pipeline: TSLRenderPipeline | null = null
  private readonly _renderer: WebGPURenderer
  private _scenePass: PassNode | null = null
  private _bloomNode: BloomNode | null = null

  private _bloomStrength = uniform(0)
  private _bloomRadius = uniform(0)
  private _bloomThreshold = uniform(0.5)
  private _vignetteStrength = uniform(0)
  private _grainStrength = uniform(0)
  private _chromaticStrength = uniform(0)
  private _refractStrength = uniform(0)
  private _gradeShadows = uniform(new THREE.Vector3(1, 1, 1))
  private _gradeHighlights = uniform(new THREE.Vector3(1, 1, 1))

  constructor(renderer: WebGPURenderer) {
    this._renderer = renderer
  }

  updateParams(params: Readonly<PostParams>): void {
    this._bloomStrength.value = params.bloom
    this._bloomRadius.value = params.bloomRadius
    this._bloomThreshold.value = params.bloomThreshold
    this._vignetteStrength.value = params.vignette
    this._grainStrength.value = params.grain
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

  render(scene: Scene, camera: Camera): void {
    if (!this._pipeline) {
      this._buildPipeline(scene, camera)
    }
    // The Showreel temporarily supplies its own scene and orthographic
    // camera through this shared renderer. PassNode reads these references on
    // every render, so update them without rebuilding the TSL graph.
    if (this._scenePass) {
      this._scenePass.scene = scene
      this._scenePass.camera = camera
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

  private _buildPipeline(scene: Scene, camera: Camera): void {
    // Scene pass: render scene to texture. PassNode clears with
    // scene.background automatically (Background.js handles this).
    const scenePass = tslPass(scene, camera)
    this._scenePass = scenePass
    try {
      const sceneColor = scenePass.getTextureNode()

      // Compose the scene grade in one TSL graph: refraction, color separation,
      // bloom, grade, grain, and vignette. The CSS bezel is shared by both
      // renderer backends and does not belong in this graph.

      // ── 1. Screen-space refraction ──
      // The zero-strength uniform naturally reduces this offset to zero.
      const rCenter = uv().sub(0.5)
      const rDist = rCenter.length()
      const rStrength = this._refractStrength.mul(float(0.5).add(rDist.mul(1.5)))
      const rWobble = vec2(
        sin(uv().y.mul(20.0).add(this._refractStrength.mul(8.0))),
        cos(uv().x.mul(20.0).add(this._refractStrength.mul(8.0))),
      ).mul(rStrength.mul(0.003))
      const refractUv = uv().add(rCenter.mul(rStrength).mul(0.04)).add(rWobble).clamp(0.0, 1.0)

      // ── 2. Sample scene at refracted UV ──
      const sampled = sceneColor.sample(refractUv)

      // ── 3. Chromatic aberration ──
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
      const bloomNode = tslBloom(
        scene,
        this._bloomStrength,
        this._bloomRadius,
        this._bloomThreshold,
      )
      this._bloomNode = bloomNode
      let color = scene.add(bloomNode)

      // ── 5. Color grading ──
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
      // Three's integer TSL hash avoids a project-specific shader hash.
      // Static film texture: route uniforms animate its strength, not wall time.
      // Unrelated demand frames must not restart visible grain or glass wobble.
      const noiseCoord = uv().mul(1024.0)
      const nFloor = floor(noiseCoord)
      const nFract = fract(noiseCoord)
      const nSmooth = nFract.mul(nFract).mul(float(3.0).sub(nFract.mul(2.0)))
      // Flatten each integer pixel cell to a unique scalar seed in this
      // 1024×1024 domain; Three's TSL hash accepts a scalar seed.
      const cellSeed = tslFloat(nFloor, 'x').add(tslFloat(nFloor, 'y').mul(1024.0))
      const nA = hash(cellSeed)
      const nB = hash(cellSeed.add(1.0))
      const nC = hash(cellSeed.add(1024.0))
      const nD = hash(cellSeed.add(1025.0))
      const grainNoise = mix(
        mix(nA, nB, tslFloat(nSmooth, 'x')),
        mix(nC, nD, tslFloat(nSmooth, 'x')),
        tslFloat(nSmooth, 'y'),
      )
      // grain = (noise - 0.5) * 2.0 * strength → adds ±strength per pixel
      const grain = grainNoise.sub(0.5).mul(2.0).mul(this._grainStrength)
      color = color.add(vec3(grain))

      // ── 8. Vignette (radial falloff) ──
      // Radial falloff from the screen center; zero strength leaves the image
      // unchanged because smoothstep(0, 1, 1) is 1.
      const vCenter = uv().sub(0.5)
      const vDist = vCenter.length()
      const vigRaw = float(1.0).sub(vDist.mul(this._vignetteStrength))
      const vig = smoothstep(0.0, 1.0, vigRaw)
      color = color.mul(vig)

      // ── sRGB encode ──
      // Let TSLRenderPipeline apply sRGB automatically via outputColorTransform=true
      // (default). Three applies its exact sRGB transfer function rather than
      // a power approximation, especially important in the shadows.
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

}
