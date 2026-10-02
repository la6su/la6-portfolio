import type * as THREE from 'three'

const TEXTURE_SLOTS = [
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

/** Dispose a material collection once, including textures shared by materials. */
export function disposeMaterialsDeep(materials: Iterable<THREE.Material>): void {
  const uniqueMaterials = new Set(materials)
  const uniqueTextures = new Set<THREE.Texture>()

  for (const material of uniqueMaterials) {
    const withTextures = material as THREE.Material & Record<string, THREE.Texture | undefined>
    for (const slot of TEXTURE_SLOTS) {
      const texture = withTextures[slot]
      if (texture) uniqueTextures.add(texture)
    }
  }

  uniqueTextures.forEach((texture) => texture.dispose())
  uniqueMaterials.forEach((material) => material.dispose())
}

/** Dispose unique geometry, material, and material texture resources below a node. */
export function disposeObject3DResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry)
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    meshMaterials.forEach((material) => materials.add(material))
  })

  geometries.forEach((geometry) => geometry.dispose())
  disposeMaterialsDeep(materials)
}
