import type * as THREE from 'three'

/**
 * Dispose all GPU textures attached to a material and then the material itself.
 *
 * Three.js `material.dispose()` does NOT dispose its textures — they must be
 * disposed explicitly or they leak VRAM. This helper prevents that leak for
 * any material that carries texture maps.
 */
export function disposeMaterialDeep(mat: THREE.Material | undefined | null): void {
  if (!mat) return
  const m = mat as THREE.Material & Record<string, THREE.Texture | undefined>
  const textureSlots = [
    'map',
    'normalMap',
    'roughnessMap',
    'metalnessMap',
    'emissiveMap',
    'alphaMap',
    'bumpMap',
    'displacementMap',
    'envMap',
    'lightMap',
    'aoMap',
    'sheenColorMap',
    'sheenRoughnessMap',
    'specularColorMap',
    'specularIntensityMap',
    'transmissionMap',
    'thicknessMap',
    'iridescenceMap',
    'iridescenceThicknessMap',
  ] as const
  for (const slot of textureSlots) {
    m[slot]?.dispose()
  }
  m.dispose()
}
