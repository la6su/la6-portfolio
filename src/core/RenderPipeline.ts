// Post-processing for the unified WebGPURenderer. TSL effects are available
// on WebGPU; Three's WebGL fallback renders the scene directly.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { WebGPUPostPipeline } from './WebGPUPostPipeline'
import { withNoToneMapping } from './toneMappingGuard'
import { copyPostParams, postParamsMatch, type PostParams } from './postParams'

// ─── RenderPipeline Class ──────────────────────────────────────

/**
 * RenderPipeline — the post-processing owner for the single WebGPURenderer.
 *
 * Memory management: explicit dispose(). The TSL graph's GPU resources are
 * reclaimed when the pipeline (or the renderer) is disposed.
 */
export class RenderPipeline {
  private _params!: PostParams

  private _renderer!: WebGPURenderer
  private _webgpuPipeline: WebGPUPostPipeline | null = null
  private _postProcessingEnabled = true
  /** Terminal for this pipeline instance: avoid retrying a broken TSL graph every frame. */
  private _webgpuPostFailed = false
  private _webgpuParamsDirty = true

  private constructor() {
    this._params = {
      bloom: 0.4,
      vignette: 0.5,
      grain: 0.25,
      chromatic: 0,
      bloomRadius: 0.6,
      bloomThreshold: 0.5,
      refract: 0,
      gradeShadows: [1, 1, 1],
      gradeHighlights: [1, 1, 1],
    }
  }

  /** Factory: create pipeline for the unified WebGPURenderer.
   *  `postProcessingEnabled` is the capability decision (real WebGPU backend
   *  AND tier above low — see supportsPostProcessing); when false the pipeline
   *  renders directly and never builds the TSL graph. */
  public static create(renderer: WebGPURenderer, postProcessingEnabled = true): RenderPipeline {
    const pipeline = new RenderPipeline()

    pipeline._renderer = renderer
    pipeline._postProcessingEnabled = postProcessingEnabled

    // WebGPU TSL pipeline is built lazily on first render() — it needs the
    // live scene + camera references to bind into the PassNode.

    return pipeline
  }

  // ─── Public API ────────────────────────────────────────────────

  /** Update post-processing parameters cross-faded by PostProcessingManager. */
  public updateParams(params: Readonly<PostParams>): void {
    if (postParamsMatch(this._params, params)) return
    // Copy through the canonical in-place helper — the diff above decides
    // WHEN; this decides HOW (element-wise, allocation-free, tuple references
    // preserved for any holder of the snapshot).
    copyPostParams(this._params, params)
    this._webgpuParamsDirty = true
  }

  /** Render: scene → post passes → screen */
  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Three exposes this marker on its backend implementations. Constructor
    // names are not reliable after production minification.
    const backend = this._renderer.backend as typeof this._renderer.backend & {
      isWebGPUBackend?: boolean
    }
    const isRealWebGPU = backend.isWebGPUBackend === true

    if (isRealWebGPU && this._postProcessingEnabled) {
      // WebGPU native: TSL RenderPipeline + PassNode + BloomNode + vignette/grain Fn.
      if (!this._webgpuPostFailed) {
        try {
          if (!this._webgpuPipeline) {
            this._webgpuPipeline = WebGPUPostPipeline.create(this._renderer, scene, camera)
            this._webgpuParamsDirty = true
          }
          const sceneChanged = this._webgpuPipeline.setScene(scene, camera)
          if (sceneChanged) this._webgpuParamsDirty = true
          if (this._webgpuParamsDirty) {
            // `_params` is already the stable change-detection snapshot;
            // WebGPUPostPipeline copies its channels directly into uniforms.
            this._webgpuPipeline.updateParams(this._params)
            this._webgpuParamsDirty = false
          }
          // Disable renderer tone mapping during TSL pipeline render — the TSL
          // graph applies no tone mapping. outputColorTransform=true
          // (default) on the pipeline applies renderOutput() which uses
          // renderer.toneMapping — we set it to NoToneMapping so renderOutput
          // only applies sRGB encode (exact sRGBTransferOETF), no tone mapping.
          withNoToneMapping(this._renderer, () => this._webgpuPipeline!.render())
          return
        } catch {
          // A graph build failure is terminal for this pipeline owner. Retry on
          // every demand frame would keep the scheduler alive forever; direct
          // WebGPU rendering is the bounded visual fallback for this owner.
          this._webgpuPostFailed = true
          this._webgpuPipeline?.dispose()
          this._webgpuPipeline = null
        }
      }
      this._renderer.render(scene, camera)
      return
    }

    // Native WebGPU low-tier policy: skip the full-screen TSL graph entirely.
    // The direct renderer path preserves the scene while avoiding PassNode and
    // post graph work when DeviceCapability has disabled post processing.
    if (isRealWebGPU) {
      this._renderer.render(scene, camera)
      return
    }

    // WebGLBackend fallback: WebGPURenderer with WebGLBackend cannot compile
    // ShaderMaterial (THREE.NodeBuilder incompatibility) AND NodeMaterials crash
    // with refreshFogUniforms if scene.fog is set. Use direct render only.
    // Safety: clear fog only for this direct fallback draw. Scene ownership is
    // shared with the Vue/Tres root, so permanently mutating `scene.fog` here
    // would make a later backend recovery lose the authored fog state.
    const fog = scene.fog
    scene.fog = null
    try {
      this._renderer.render(scene, camera)
    } finally {
      scene.fog = fog
    }
  }

  /** Destroy all GPU resources. Call once during teardown. */
  public dispose(): void {
    // WebGPU TSL pipeline cleanup.
    this._webgpuPipeline?.dispose()
    this._webgpuPipeline = null
    this._webgpuPostFailed = true

    // Drop this renderer's native post-pipeline and uniform node references.
    // Three r186's RenderPipeline.dispose() releases its fullscreen material;
    // renderer teardown owns the underlying backend pipeline resources.
  }

  /** Whether the lazy native WebGPU graph has been allocated. */
  public get hasWebGPUPostPipeline(): boolean {
    return this._webgpuPipeline !== null
  }
}
