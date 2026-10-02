// TSL post-processing for the unified renderer. Three compiles the same graph
// for the selected WebGPU or WebGL2 backend.

import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { TSLPostPipeline } from './TSLPostPipeline'
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
  private readonly _params: PostParams

  private readonly _renderer: WebGPURenderer
  private _postPipeline: TSLPostPipeline | null = null
  private readonly _postProcessingEnabled: boolean
  private _paramsDirty = true

  constructor(renderer: WebGPURenderer, postProcessingEnabled = true) {
    this._renderer = renderer
    this._postProcessingEnabled = postProcessingEnabled
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

  // ─── Public API ────────────────────────────────────────────────

  /** Update post-processing parameters cross-faded by PostProcessingManager. */
  public updateParams(params: Readonly<PostParams>): void {
    if (postParamsMatch(this._params, params)) return
    // Copy through the canonical in-place helper — the diff above decides
    // WHEN; this decides HOW (element-wise, allocation-free, tuple references
    // preserved for any holder of the snapshot).
    copyPostParams(this._params, params)
    this._paramsDirty = true
  }

  /** Render through the shared TSL graph, unless the selected tier skips it. */
  public render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this._postProcessingEnabled) {
      let pipeline = this._postPipeline
      if (!pipeline) {
        pipeline = new TSLPostPipeline(this._renderer)
        this._postPipeline = pipeline
        this._paramsDirty = true
      }
      if (this._paramsDirty) {
        pipeline.updateParams(this._params)
        this._paramsDirty = false
      }
      // The graph handles output conversion; disable renderer tone mapping
      // for this draw and restore the renderer setting afterward.
      withNoToneMapping(this._renderer, () => pipeline.render(scene, camera))
      return
    }

    // Low-tier quality policy: skip the full-screen graph to save GPU work.
    this._renderer.render(scene, camera)
  }

  /** Destroy all GPU resources. Call once during teardown. */
  public dispose(): void {
    this._postPipeline?.dispose()
    this._postPipeline = null

    // Drop this renderer's native post-pipeline and uniform node references.
    // Three r186's RenderPipeline.dispose() releases its fullscreen material;
    // renderer teardown owns the underlying backend pipeline resources.
  }

  /** Whether the lazy TSL post graph has been allocated. */
  public get hasTSLPostPipeline(): boolean {
    return this._postPipeline !== null
  }
}
