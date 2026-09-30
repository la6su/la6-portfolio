// src/Experience/SceneEnvironment.ts — the procedural studio environment map.
//
// One owner for the scene's IBL environment: a procedural equirect canvas
// (bright sky gradient + soft sun spots) pre-filtered once through the
// renderer-native TSL PMREMGenerator. Sets scene.environment so all PBR
// materials (MeshPhysicalNodeMaterial, MeshStandardMaterial) get image-based
// lighting reflections. Zero per-frame cost.
//
// GENERATOR — one owner, no secondary contexts: the renderer-native TSL
// `PMREMGenerator` from `three/webgpu` on the unified `WebGPURenderer` (the
// only renderer class the app constructs). It sets `isPMREMTexture` on the
// result natively, so the common `PMREMNode` passes the texture through
// instead of double-PMREMing it (double processing used to render the glass
// cube darker on WebGPU with a concentrated bright-spot artifact). The
// former classic-generator branch (dev-forced `?renderer=webgl` QA path) was
// removed together with that path in Phase 10. The former secondary offscreen
// WebGL context (created solely for PMREM generation on the WebGPU path) was
// removed in the Phase 6 unified-renderer slice.
//
// The renderer and glass-cube owners are injected as getters: the environment
// is (re)applied after `renderer.init()` and after a device-loss recovery,
// so both owners must be read lazily at apply time.

import * as THREE from 'three'
import { PMREMGenerator as WebGPUPMREMGenerator } from 'three/webgpu'

interface SceneEnvironmentOwners {
  scene: THREE.Scene
  renderer: () => { instance: object }
  /** The glass cube binds the PMREM texture directly (see apply()). */
  baku: () => { bindEnvironment(texture: THREE.Texture): void } | null | undefined
}

export class SceneEnvironment {
  private readonly _owners: SceneEnvironmentOwners

  constructor(owners: SceneEnvironmentOwners) {
    this._owners = owners
  }

  /** Create (or regenerate after a renderer recovery) the environment map.
   *  Called once after world init (and after `renderer.init()`, which the
   *  TSL generator requires). A failure preserves the previous environment
   *  rather than leaving the scene without reflections. */
  public apply(): void {
    const { scene } = this._owners
    // Procedural environment map (day34 pattern) — bright sky gradient + 3 sun
    // spots for visible glass reflections. RoomEnvironment was too dim (soft
    // architectural studio light) → glass looked dark. This procedural env
    // gives strong directional highlights like day34 reference.
    let envTex: THREE.CanvasTexture | null = null
    let pmrem: WebGPUPMREMGenerator | null = null
    let nextEnvironment: THREE.Texture | null = null
    const previousEnvironment = scene.environment
    try {
      // Procedural grayscale texture (sky-to-ground tonal contrast + soft spots).
      // 512×256 is sufficient for the deliberately soft PMREM reflections and
      // quarters the synchronous startup work of the previous 1024×512 source.
      const envWidth = 512
      const envHeight = 256
      const envCanvas = document.createElement('canvas')
      envCanvas.width = envWidth
      envCanvas.height = envHeight
      const ctx = envCanvas.getContext('2d')!
      // Vertical gradient: neutral horizon → bright sky → graphite ground,
      // plus one soft bright area for a gentle
      // reflection point on the glass + darker ground area for contrast.
      // The contrast between bright sky and dark ground gives the glass rich,
      // dynamic reflections (you can see the "horizon line" refract through
      // the cube as it rotates). The palette stays neutral so it does not
      // introduce a third colour system behind lime and teal UI signals.
      const grad = ctx.createLinearGradient(0, 0, 0, envHeight)
      grad.addColorStop(0.0, 'rgb(170,170,170)')
      grad.addColorStop(0.4, 'rgb(225,225,225)')
      grad.addColorStop(0.7, 'rgb(205,205,205)')
      grad.addColorStop(0.71, 'rgb(58,58,58)')
      grad.addColorStop(1.0, 'rgb(24,24,24)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, envWidth, envHeight)
      // Soft bright area (upper-left sky region) — broad, diffused light source
      // for glass reflections. Broad radius + moderate brightness
      // = soft highlight, NOT a sharp sun spot.
      const softSpot = ctx.createRadialGradient(140, 70, 0, 140, 70, 150)
      softSpot.addColorStop(0.0, 'rgba(255,255,255,0.6)')
      softSpot.addColorStop(0.5, 'rgba(235,235,235,0.25)')
      softSpot.addColorStop(1.0, 'rgba(220,220,220,0)')
      ctx.fillStyle = softSpot
      ctx.fillRect(0, 0, envWidth, envHeight)
      // Second soft highlight (lower-right, dimmer) — gives the cube a second
      // reflection point that appears as it rotates, adding visual interest.
      const softSpot2 = ctx.createRadialGradient(380, 180, 0, 380, 180, 100)
      softSpot2.addColorStop(0.0, 'rgba(205,205,205,0.35)')
      softSpot2.addColorStop(1.0, 'rgba(185,185,185,0)')
      ctx.fillStyle = softSpot2
      ctx.fillRect(0, 0, envWidth, envHeight)
      envTex = new THREE.CanvasTexture(envCanvas)
      envTex.mapping = THREE.EquirectangularReflectionMapping
      envTex.colorSpace = THREE.SRGBColorSpace

      // Renderer-native TSL PMREM — runs on the live renderer after init and
      // sets isPMREMTexture on the result natively (PMREMNode pass-through,
      // no double processing). The unified WebGPURenderer is the only
      // instance class (Phase 6 production default; the classic
      // WebGLRenderer path was removed in Phase 10), so this is the single
      // generator.
      pmrem = new WebGPUPMREMGenerator(this._owners.renderer().instance as never)
      const envRT = pmrem.fromEquirectangular(envTex)
      nextEnvironment = envRT.texture
      // Set environmentIntensity explicitly (day34 pattern). Without this,
      // WebGPU MeshPhysicalNodeMaterial and WebGL2 MeshPhysicalMaterial can
      // apply scene.environment at different strengths → parity drift
      // (WebGPU appeared darker than WebGL2). Explicit 1.0 on both ensures
      // identical IBL strength; material envMapIntensity controls the rest.
      ;(scene as unknown as { environmentIntensity?: number }).environmentIntensity = 1.0
      // Bind the PMREM texture directly to the glass cube material's envMap.
      // On WebGPU, scene.environment may not reach MeshPhysicalNodeMaterial
      // reliably through the TSL post-pipeline (PassNode RT caching drift).
      // Explicit mat.envMap guarantees the glass sees the environment on BOTH
      // paths → parity. Shared texture, no extra VRAM.
      // Generate completely before replacing the live binding. A recovery
      // failure must preserve the previous environment rather than leaving
      // the scene without reflections.
      scene.environment = nextEnvironment
      try {
        this._owners.baku()?.bindEnvironment(nextEnvironment)
      } catch (error) {
        scene.environment = previousEnvironment ?? null
        nextEnvironment.dispose()
        nextEnvironment = null
        throw error
      }
      if (previousEnvironment && previousEnvironment !== nextEnvironment) {
        previousEnvironment.dispose()
      }
      if (import.meta.env.DEV) {
        console.info(
          '[Experience] Procedural env map (gradient + sun spots) set — glass reflections active (PMREM via renderer-native TSL generator)',
        )
      }
    } catch (e) {
      if (nextEnvironment) {
        scene.environment = previousEnvironment ?? null
        nextEnvironment.dispose()
      }
      if (import.meta.env.DEV) {
        console.warn('[Experience] Procedural env map generation failed:', e)
      }
    } finally {
      pmrem?.dispose()
      envTex?.dispose()
    }
  }

  /** Release the live PMREM texture and clear the reference (HMR teardown /
   *  final destroy — the texture was not previously disposed → leak). */
  public disposeCurrent(): void {
    const { scene } = this._owners
    if (scene.environment) {
      scene.environment.dispose()
      scene.environment = null
    }
  }
}
