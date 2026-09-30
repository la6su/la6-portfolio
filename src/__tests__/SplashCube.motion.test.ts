import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  SplashCube,
  buildBakuShellGeometry,
  createBakuShellMaterial,
  type BakuCubeNodes,
} from '../Experience/World/SplashCube'

function makeBakuNodes(): BakuCubeNodes {
  const shell = new THREE.Mesh(buildBakuShellGeometry(), createBakuShellMaterial())
  const root = new THREE.Group()
  root.add(shell)
  return { root, shell }
}

describe('SplashCube reduced-motion transitions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('snaps face rotation so reduced motion cannot retain render demand', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const cube = new SplashCube(makeBakuNodes())

    cube.rotateToFace(3)

    expect(cube.isRotating).toBe(false)
    cube.dispose()
  })

  it('keeps the authored face transition when reduced motion is disabled', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const cube = new SplashCube(makeBakuNodes())

    cube.rotateToFace(3)

    expect(cube.isRotating).toBe(true)
    cube.dispose()
  })

  it('uses the synchronized motion snapshot for later reactions', () => {
    const media = { matches: false }
    const matchMedia = vi.fn().mockReturnValue(media)
    vi.stubGlobal('matchMedia', matchMedia)
    const cube = new SplashCube(makeBakuNodes())

    cube.setReducedMotion(true)
    media.matches = false
    cube.rotateToFace(3)
    cube.triggerOpener()

    expect(cube.isRotating).toBe(false)
    expect(cube.isOpenerActive).toBe(false)
    expect(matchMedia).toHaveBeenCalledTimes(1)
    cube.dispose()
  })

  it('settles face and opener reactions on a live preference change', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const nodes = makeBakuNodes()
    const cube = new SplashCube(nodes)
    const mesh = nodes.shell

    cube.rotateToFace(3)
    cube.triggerOpener()
    cube.update(0.05)
    expect(cube.isRotating).toBe(true)
    expect(cube.isOpenerActive).toBe(true)

    cube.setReducedMotion(true)

    expect(cube.isRotating).toBe(false)
    expect(cube.isOpenerActive).toBe(false)
    expect(mesh.scale.toArray()).toEqual([1, 1, 1])
    cube.dispose()
  })

  it('applies the pending world blend when reduced motion settles the owner', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const nodes = makeBakuNodes()
    const cube = new SplashCube(nodes)
    const material = nodes.shell.material as THREE.MeshPhysicalMaterial
    const from = new THREE.Color(0x000000)
    const to = new THREE.Color(0xffffff)
    const tint = new THREE.Color(0xd0c5dc)

    cube.setTheme(false)
    cube.updateWorldBlend(from, to, from, to, 0.5)
    cube.setReducedMotion(true)

    const expected = from.clone().lerp(to, 0.5).lerp(tint, 0.3)
    expect(material.color.r).toBeCloseTo(expected.r, 6)
    expect(material.color.g).toBeCloseTo(expected.g, 6)
    expect(material.color.b).toBeCloseTo(expected.b, 6)
    cube.dispose()
  })

  it('skips identical blend material writes while applying changed blend state', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const nodes = makeBakuNodes()
    const cube = new SplashCube(nodes)
    const material = nodes.shell.material as THREE.MeshPhysicalMaterial
    const copy = vi.spyOn(material.color, 'copy')
    const from = new THREE.Color(0x000000)
    const to = new THREE.Color(0xffffff)

    cube.setTheme(false)
    cube.updateWorldBlend(from, to, from, to, 0.5)
    cube.update(0)
    copy.mockClear()
    cube.update(0)
    const writesAfterFirstBlend = copy.mock.calls.length
    cube.update(0)
    expect(copy).toHaveBeenCalledTimes(writesAfterFirstBlend)

    cube.updateWorldBlend(from, to, from, to, 0.75)
    cube.update(0)
    expect(copy.mock.calls.length).toBeGreaterThan(writesAfterFirstBlend)
    cube.dispose()
  })

  it('does not advance an unowned idle mesh rotation on demand frames', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const nodes = makeBakuNodes()
    const cube = new SplashCube(nodes)
    const mesh = nodes.shell

    cube.update(1)

    expect(mesh.rotation.x).toBe(0)
    expect(mesh.rotation.y).toBe(0)
    expect(mesh.rotation.z).toBe(0)
    cube.dispose()
  })

  it('skips settled update work when another owner raises demand', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const cube = new SplashCube(makeBakuNodes())
    const applyBlend = vi.spyOn(
      cube as unknown as { applyMaterialBlend: () => void },
      'applyMaterialBlend',
    )

    cube.snapToFace(0)
    cube.update(0)
    applyBlend.mockClear()
    const time = (cube as unknown as { time: number }).time
    cube.update(1)

    expect(applyBlend).not.toHaveBeenCalled()
    expect((cube as unknown as { time: number }).time).toBe(time)
    cube.dispose()
  })

  it('ignores late public calls after terminal teardown', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    const nodes = makeBakuNodes()
    const cube = new SplashCube(nodes)
    const mesh = nodes.shell
    const before = mesh.scale.toArray()

    cube.dispose()
    cube.dispose()
    cube.triggerOpener()
    cube.triggerWobblePulse()
    cube.bindEnvironment(new THREE.Texture())
    cube.setTheme(false)
    cube.updateMaterial({ roughness: 0.5 })
    cube.rotateToFace(4)
    cube.snapToFace(2)
    cube.setReducedMotion(true)
    cube.updateWorldBlend(
      new THREE.Color(0x111111),
      new THREE.Color(0x222222),
      new THREE.Color(0x333333),
      new THREE.Color(0x444444),
      1,
    )
    cube.update(1 / 60)

    expect(cube.isRotating).toBe(false)
    expect(cube.isOpenerActive).toBe(false)
    expect(mesh.scale.toArray()).toEqual(before)
  })
})
