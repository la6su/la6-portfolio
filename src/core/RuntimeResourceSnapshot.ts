import * as THREE from 'three'

export interface RuntimeResourceSnapshot {
  /** The single renderer-owned canvas (`canvas.canvas`) required by SceneHost. */
  rendererCanvasCount: number
  /** All DOM canvases, including the intentionally separate 2D cursor canvas. */
  documentCanvasCount: number
  scene: {
    geometries: number
    materials: number
    textures: number
  }
  renderer: {
    geometries: number | null
    textures: number | null
    programs: number | null
  }
  post: {
    renderTargets: number
    passes: number
    webgpuPipeline: boolean
  }
}

export interface RendererResourceInfo {
  info?: {
    memory?: { geometries?: number; textures?: number }
    programs?: unknown[]
  }
}

interface PostResourceInfo {
  renderTargets: number
  passes: number
  webgpuPipeline: boolean
}

function collectMaterialTextures(material: THREE.Material, textures: Set<THREE.Texture>): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) textures.add(value)
  }

  const uniforms = (material as THREE.ShaderMaterial).uniforms
  if (!uniforms) return
  for (const uniform of Object.values(uniforms)) {
    if (uniform?.value instanceof THREE.Texture) textures.add(uniform.value)
  }
}

/**
 * Captures stable, owner-visible resource counts for a soak comparison.
 * This deliberately reports only resources the application can enumerate; it
 * never invents WebGPU driver counters that the browser does not expose.
 */
export function captureRuntimeResourceSnapshot(
  scene: THREE.Scene,
  renderer: RendererResourceInfo,
  post: PostResourceInfo,
  rendererCanvasCount = document.querySelectorAll('canvas.canvas').length,
  documentCanvasCount = document.querySelectorAll('canvas').length,
): RuntimeResourceSnapshot {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()

  scene.traverse((object) => {
    if ('geometry' in object && object.geometry instanceof THREE.BufferGeometry) {
      geometries.add(object.geometry)
    }
    if (!('material' in object)) return
    const ownedMaterials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of ownedMaterials) {
      if (!(material instanceof THREE.Material)) continue
      materials.add(material)
      collectMaterialTextures(material, textures)
    }
  })

  if (scene.background instanceof THREE.Texture) textures.add(scene.background)
  if (scene.environment instanceof THREE.Texture) textures.add(scene.environment)

  const info = renderer.info
  return {
    rendererCanvasCount,
    documentCanvasCount,
    scene: { geometries: geometries.size, materials: materials.size, textures: textures.size },
    renderer: {
      geometries: info?.memory?.geometries ?? null,
      textures: info?.memory?.textures ?? null,
      programs: Array.isArray(info?.programs) ? info.programs.length : null,
    },
    post,
  }
}
