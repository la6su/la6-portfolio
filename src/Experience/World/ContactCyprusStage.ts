// ContactCyprusStage — camera-local 3D location marker for Contact / Agros.

import * as THREE from 'three'
import { shallowRef } from 'vue'
import {
  DRACOLoader,
  DRACO_GLTF_CONFIG,
} from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  disposeMaterialsDeep,
  disposeObject3DResources,
} from '../../Utils/dispose'
import { prefersReducedMotion } from '../../core/motionPolicy'

const FADE_DURATION_SECONDS = 0.52
const SCALE_IN_FROM = 0.96
const SCALE_OUT_TO = 1.025

/**
 * The Cyprus asset is a route-owned visual, loaded only when Contact opens.
 * Keeping it camera-local gives Agros a stable hero composition independent
 * of the shared six-slot world's camera interpolation.
 */
export type ContactCyprusModelPublisher = (
  model: THREE.Group | null,
) => void | Promise<void>

/** Behavior controller for the Vue-declared Contact root and GLTF child. */
export class ContactCyprusStage {
  private _root: THREE.Group | null = null
  private _publishModel: ContactCyprusModelPublisher | null = null
  private _camera: THREE.Camera | null = null
  private _model: THREE.Group | null = null
  private _materials: THREE.MeshPhysicalMaterial[] = []
  private _modelBaseScale = 1
  private _opacity = 0
  private _targetOpacity = 0
  private _fadeFrom = 0
  private _scale = 1
  private _targetScale = 1
  private _scaleFrom = 1
  private _appliedOpacity = Number.NaN
  private _appliedScale = Number.NaN
  private _fadeElapsed = FADE_DURATION_SECONDS
  private _prewarmFramePending = false
  private _active = false
  private _disposed = false
  private readonly _visible = shallowRef(false)
  private _reducedMotion = prefersReducedMotion()
  private _cameraPosition = new THREE.Vector3()
  private _lastCameraPosition = new THREE.Vector3(
    Number.NaN,
    Number.NaN,
    Number.NaN,
  )
  private _lastCameraQuaternion = new THREE.Quaternion(
    Number.NaN,
    Number.NaN,
    Number.NaN,
    Number.NaN,
  )

  get visible(): boolean {
    return this._visible.value
  }

  bindRoot(root: THREE.Group, publishModel: ContactCyprusModelPublisher): void {
    if (this._disposed) return
    this._root = root
    this._publishModel = publishModel
    root.name = 'contact-cyprus-stage'
    this._visible.value = false
    if (this._model) void publishModel(this._model)
  }

  unbindRoot(root: THREE.Group): void {
    if (this._root !== root) return
    this._publishModel?.(null)
    this._publishModel = null
    this._root = null
  }

  async load(): Promise<void> {
    if (this._disposed) return
    // The model is Draco-compressed. Use Three's glTF-specific WASM pair;
    // Vite emits these assets from the loader module and no public decoder
    // copy is needed on the route or startup path.
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(DRACO_GLTF_CONFIG)
    const loader = new GLTFLoader().setDRACOLoader(dracoLoader)
    let gltf: Awaited<ReturnType<GLTFLoader['loadAsync']>>
    try {
      gltf = await loader.loadAsync('/assets/gltf/cyprus_3d.glb')
    } finally {
      dracoLoader.dispose()
    }
    if (this._disposed) {
      this.disposeModel(gltf.scene)
      return
    }
    const model = gltf.scene
    try {
      const bounds = new THREE.Box3().setFromObject(model)
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      const largestAxis = Math.max(size.x, size.y, size.z, 0.001)

      // Normalize arbitrary authoring units, then compose it as a broad backdrop.
      this._modelBaseScale = 7.6 / largestAxis
      model.scale.setScalar(this._modelBaseScale)
      model.position.copy(center).multiplyScalar(-this._modelBaseScale)
      model.position.add(new THREE.Vector3(0, 0.42, -10))
      // The source terrain is authored flat on the X/Z plane. Turn its relief
      // toward the viewer before adding the small authored perspective tilt.
      model.rotation.set(1.05, -0.3, 0.04)

      // glTF nodes can share source materials and textures. Release the source
      // material graph as one collection before assigning route-owned glass
      // materials, so shared resources are disposed only once.
      const sourceMaterials = new Set<THREE.Material>()
      model.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        const meshMaterials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        meshMaterials.forEach((material) => sourceMaterials.add(material))
      })
      disposeMaterialsDeep(sourceMaterials)

      model.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = false
        mesh.receiveShadow = false
        mesh.frustumCulled = false
        // MeshPhysicalMaterial uses Three's PhysicalLightingModel on WebGPU.
        // Transmission, thickness and IOR refract the already-rendered scene;
        // roughness turns that into restrained frosted distortion rather than
        // a perfectly clear lens. WebGL2 receives the equivalent physical path.
        const material = new THREE.MeshPhysicalMaterial({
          color: 0xc4e9c8,
          transmission: 0.82,
          thickness: 13.5,
          ior: 1.32,
          roughness: 0.2,
          metalness: 0.04,
          envMapIntensity: 1.9,
          clearcoat: 0.82,
          clearcoatRoughness: 0.12,
          iridescence: 0.18,
          iridescenceIOR: 1.3,
          iridescenceThicknessRange: [120, 300],
          dispersion: 0.08,
          attenuationColor: new THREE.Color(0xb9f1c0),
          attenuationDistance: 1.4,
          side: THREE.DoubleSide,
          depthWrite: false,
          transparent: true,
          opacity: 0,
        })
        mesh.material = material
        this._materials.push(material)
      })

      this._model = model
      await this._publishModel?.(model)
      if (this._disposed) return
      this.setPresentation(this._opacity, this._scale)
    } catch (error) {
      if (this._model === model) {
        this._model = null
        this.disposeModel(model)
      } else if (!this._disposed) this.disposeModel(model)
      this._materials = []
      throw error
    }
  }

  setCamera(camera: THREE.Camera): void {
    if (this._disposed) return
    if (this._camera === camera) return
    this._camera = camera
    this._lastCameraPosition.set(Number.NaN, Number.NaN, Number.NaN)
    this._lastCameraQuaternion.set(
      Number.NaN,
      Number.NaN,
      Number.NaN,
      Number.NaN,
    )
  }

  setActive(active: boolean): void {
    if (this._disposed) return
    this._active = active
    const target = active ? 1 : 0
    if (target === this._targetOpacity && !this.isAnimating) return

    this._targetOpacity = target
    // Every return to Agros starts from a clean transparent state. Without
    // this reset, a quick back-and-forth reverses a partly completed fade and
    // makes the next entrance look like an instantaneous toggle.
    this._fadeFrom = active ? 0 : this._opacity
    this._scaleFrom = active ? SCALE_IN_FROM : this._scale
    this._targetScale = active ? 1 : SCALE_OUT_TO
    this._fadeElapsed = 0
    if (active) this._prewarmFramePending = false
    this.setPresentation(this._fadeFrom, this._scaleFrom)
    if (active && this._model && this._root) this._visible.value = true
    if (this._reducedMotion) {
      this._fadeElapsed = FADE_DURATION_SECONDS
      this.setPresentation(this._targetOpacity, this._targetScale)
    }
  }

  /** Settle an active fade/scale transition on a live motion-policy change. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    if (!reduced) return
    this._fadeElapsed = FADE_DURATION_SECONDS
    this._prewarmFramePending = false
    this.setPresentation(this._targetOpacity, this._targetScale)
    this._visible.value = this._targetOpacity > 0 && this._model !== null
  }

  /** True while the map is fading between Contact frames. */
  get isAnimating(): boolean {
    return (
      !this._disposed &&
      this._model !== null &&
      (this._fadeElapsed < FADE_DURATION_SECONDS || this._prewarmFramePending)
    )
  }

  /**
   * The target (not fade-progress) active state — set immediately by
   * `setActive`; the route visibility gate reads this stage state directly.
   */
  get isActive(): boolean {
    return !this._disposed && this._active
  }

  /** Render one fully transparent frame after loading to compile the physical material before Agros. */
  prewarm(): void {
    if (this._disposed) return
    if (!this._model || this._targetOpacity > 0) return
    this._prewarmFramePending = true
    this._visible.value = true
  }

  resize(width: number, height: number): void {
    if (this._disposed) return
    const scale = THREE.MathUtils.clamp(width / height / 1.78, 0.78, 1.2)
    this._root?.scale.setScalar(scale)
  }

  update(dt: number): void {
    if (this._disposed || !this._model) return

    if (this._reducedMotion) {
      this._fadeElapsed = FADE_DURATION_SECONDS
      this.setPresentation(this._targetOpacity, this._targetScale)
    } else if (this.isAnimating) {
      this._fadeElapsed = Math.min(
        FADE_DURATION_SECONDS,
        this._fadeElapsed + dt,
      )
      const progress = this._fadeElapsed / FADE_DURATION_SECONDS
      const eased = THREE.MathUtils.smoothstep(progress, 0, 1)
      this.setPresentation(
        THREE.MathUtils.lerp(this._fadeFrom, this._targetOpacity, eased),
        THREE.MathUtils.lerp(this._scaleFrom, this._targetScale, eased),
      )
    }

    const root = this._root
    if (!root || !this._visible.value || !this._camera) {
      // Hidden: the pending prewarm frame can never render, so it is
      // unreachable — clear the flag. Without this, `isAnimating()` stays
      // true forever after a lazy init that lands on a non-Agros section
      // (prewarm() makes the stage visible for one frame; the first
      // `setPresentation` hides it again before this block runs), holding a
      // persistent render reason that keeps the single loop driver alive on
      // /contact. The Agros entry does not depend on the prewarm frame:
      // `setActive(true)` clears the flag and runs its own fade-in, whose
      // first draw compiles the material.
      this._prewarmFramePending = false
      return
    }
    this._camera.getWorldPosition(this._cameraPosition)
    const cameraChanged =
      !this._lastCameraPosition.equals(this._cameraPosition) ||
      !this._lastCameraQuaternion.equals(this._camera.quaternion)
    if (!this.isAnimating && !cameraChanged) return
    root.position.copy(this._cameraPosition)
    root.quaternion.copy(this._camera.quaternion)
    this._lastCameraPosition.copy(this._cameraPosition)
    this._lastCameraQuaternion.copy(this._camera.quaternion)

    if (this._prewarmFramePending) {
      this._prewarmFramePending = false
      this._visible.value = false
    }
  }

  private setPresentation(opacity: number, scale: number): void {
    const nextOpacity = THREE.MathUtils.clamp(opacity, 0, 1)
    const opacityChanged = this._appliedOpacity !== nextOpacity
    const scaleChanged = this._appliedScale !== scale
    this._opacity = nextOpacity
    this._scale = scale
    if (opacityChanged) {
      for (const material of this._materials) material.opacity = this._opacity
      this._appliedOpacity = this._opacity
    }
    if (scaleChanged) {
      this._model?.scale.setScalar(this._modelBaseScale * this._scale)
      this._appliedScale = this._scale
    }
    this._visible.value = this._opacity > 0.001 || this._targetOpacity > 0.001
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._active = false
    this._visible.value = false
    this._prewarmFramePending = false
    this._camera = null
    this._publishModel?.(null)
    this._publishModel = null
    this._lastCameraPosition.set(Number.NaN, Number.NaN, Number.NaN)
    this._lastCameraQuaternion.set(
      Number.NaN,
      Number.NaN,
      Number.NaN,
      Number.NaN,
    )
    if (this._model) this.disposeModel(this._model)
    this._model = null
    this._materials = []
    this._root = null
  }

  private disposeModel(model: THREE.Object3D): void {
    disposeObject3DResources(model)
  }
}
