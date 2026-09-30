// caseTexture.ts — centralised case-texture loader with refcount cache.
//
// BakuCarousel (home) and WorksPlaneStage (/works) both decode project case
// textures. Sharing one loader + cache guarantees identical colour-space,
// filter and anisotropy settings AND prevents duplicate GPU textures when
// both consumers request the same URL.
//
// Anisotropy is set to 16 — the GPU clamps to its actual maximum, so this is
// safe on both WebGPU and WebGL2.

import * as THREE from 'three'

/** High anisotropy — clamped by the GPU to its real maximum (typically 8 or 16). */
const CASE_ANISOTROPY = 16

/**
 * Refcounted texture cache. Maps URL → entry. An entry stays in the map while
 * an upload is in flight after its last release so the eventual texture can
 * still be disposed instead of becoming an orphaned GPU resource.
 *
 * When `loadCaseTexture(url)` is called, the cache returns the existing
 * texture and increments refCount. When `releaseCaseTexture(url)` is called
 * (by a consumer's dispose()), refCount decrements; at 0 the texture is
 * disposed and removed from the cache.
 *
 * This prevents the ~12 MB GPU waste that happened when BakuCarousel and
 * WorksPlaneStage each loaded their own copy of the same 4 project textures.
 */
const textureCache = new Map<
  string,
  {
    texture: THREE.Texture | null
    refCount: number
    loading: Promise<THREE.Texture>
    settled: boolean
    pendingDrop: boolean
  }
>()

/** Load a case texture with the shared colour-space + filter + anisotropy profile.
 *  Returns a cached texture if one already exists for the URL (refcounted). */
export function loadCaseTexture(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url)
  if (cached?.pendingDrop) {
    // A global teardown has already claimed this in-flight entry. Do not
    // attach a new owner to a texture that the old load will dispose on settle;
    // its promise callback retains the entry and cleans it up independently.
    textureCache.delete(url)
  }
  if (cached && !cached.pendingDrop) {
    cached.refCount++
    return cached.loading
  }

  const loading = new Promise<THREE.Texture>((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = CASE_ANISOTROPY
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      reject,
    )
  })

  const entry = {
    texture: null as THREE.Texture | null,
    refCount: 1,
    loading,
    settled: false,
    pendingDrop: false,
  }
  textureCache.set(url, entry)

  loading.then(
    (tex) => {
      entry.settled = true
      if (entry.pendingDrop || entry.refCount <= 0) {
        tex.dispose()
        if (textureCache.get(url) === entry) textureCache.delete(url)
      } else {
        entry.texture = tex
      }
    },
    () => {
      entry.settled = true
      // On load failure, remove the cache entry so a retry can attempt again.
      if (textureCache.get(url) === entry) textureCache.delete(url)
    },
  )

  return loading
}

/** Release a refcount on a cached texture. Disposes the GPU texture when
 *  the last consumer releases it. Late async owners should pass the texture
 *  they acquired so a newer cache generation for the same URL is untouched. */
export function releaseCaseTexture(url: string, expectedTexture?: THREE.Texture): void {
  const cached = textureCache.get(url)
  if (!cached) return
  if (expectedTexture && cached.texture !== expectedTexture) return
  cached.refCount--
  if (cached.refCount <= 0) {
    cached.pendingDrop = true
    if (cached.settled) {
      cached.texture?.dispose()
      textureCache.delete(url)
    }
  }
}

/** Dispose ALL cached textures. Call from the root owner or HMR teardown. */
export function disposeAllCaseTextures(): void {
  for (const [url, entry] of textureCache) {
    entry.refCount = 0
    entry.pendingDrop = true
    if (entry.settled) {
      entry.texture?.dispose()
      textureCache.delete(url)
    }
  }
}
