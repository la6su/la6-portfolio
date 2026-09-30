import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  disposeAllCaseTextures,
  loadCaseTexture,
  releaseCaseTexture,
} from '../Experience/World/caseTexture'

describe('case texture cache lifecycle', () => {
  const loads: Array<(texture: THREE.Texture) => void> = []

  beforeEach(() => {
    loads.length = 0
    disposeAllCaseTextures()
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, onLoad) => {
      if (onLoad) loads.push(onLoad as (texture: THREE.Texture) => void)
      return undefined as never
    })
  })

  afterEach(() => {
    disposeAllCaseTextures()
    vi.restoreAllMocks()
  })

  it('does not reuse an in-flight entry doomed by global disposal', async () => {
    const firstPromise = loadCaseTexture('/assets/case.webp')
    disposeAllCaseTextures()
    const secondPromise = loadCaseTexture('/assets/case.webp')

    expect(loads).toHaveLength(2)
    const firstTexture = new THREE.Texture()
    const secondTexture = new THREE.Texture()
    const firstDispose = vi.spyOn(firstTexture, 'dispose')
    const secondDispose = vi.spyOn(secondTexture, 'dispose')
    loads[0]!(firstTexture)
    loads[1]!(secondTexture)

    await expect(firstPromise).resolves.toBe(firstTexture)
    await expect(secondPromise).resolves.toBe(secondTexture)
    expect(firstDispose).toHaveBeenCalledTimes(1)
    expect(secondDispose).not.toHaveBeenCalled()

    releaseCaseTexture('/assets/case.webp')
    expect(secondDispose).toHaveBeenCalledTimes(1)
  })

  it('does not let a retired generation release a replacement texture', async () => {
    const retiredPromise = loadCaseTexture('/assets/case.webp')
    disposeAllCaseTextures()
    const replacementPromise = loadCaseTexture('/assets/case.webp')

    const retiredTexture = new THREE.Texture()
    const replacementTexture = new THREE.Texture()
    const retiredDispose = vi.spyOn(retiredTexture, 'dispose')
    const replacementDispose = vi.spyOn(replacementTexture, 'dispose')
    loads[0]!(retiredTexture)
    loads[1]!(replacementTexture)

    await retiredPromise
    await replacementPromise
    releaseCaseTexture('/assets/case.webp', retiredTexture)
    expect(replacementDispose).not.toHaveBeenCalled()
    releaseCaseTexture('/assets/case.webp', replacementTexture)
    expect(retiredDispose).toHaveBeenCalledTimes(1)
    expect(replacementDispose).toHaveBeenCalledTimes(1)
  })
})
