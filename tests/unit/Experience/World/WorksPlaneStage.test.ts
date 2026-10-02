import { Group, Scene, Texture } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECTS } from '../../../../src/Data/Projects'
import { WorksPlaneStage } from '../../../../src/Experience/World/WorksPlaneStage'

const { loadTexture, releaseTexture } = vi.hoisted(() => ({
  loadTexture: vi.fn(),
  releaseTexture: vi.fn(),
}))

vi.mock('./caseTexture', () => ({
  loadCaseTexture: loadTexture,
  releaseCaseTexture: releaseTexture,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  loadTexture.mockReset()
  releaseTexture.mockReset()
})

describe('WorksPlaneStage scene ownership', () => {
  it('exposes route visibility without mutating the Vue-owned root', () => {
    const stage = new WorksPlaneStage()
    const root = new Group()
    const scene = new Scene()
    scene.add(root)

    expect(stage).not.toBeInstanceOf(Group)
    stage.mount(root)
    expect(stage.visible).toBe(false)
    expect(root.visible).toBe(true)

    stage.setActive(true, 0)
    expect(stage.visible).toBe(true)
    expect(root.visible).toBe(true)

    stage.dispose()
    expect(stage.visible).toBe(false)
    expect(root.visible).toBe(true)
    expect(root.parent).toBe(scene)
  })

  it('publishes its card list to the scene owner and clears subscribers on disposal', () => {
    const stage = new WorksPlaneStage()
    const snapshots: number[] = []
    const unsubscribe = stage.subscribeSceneCards((cards) => snapshots.push(cards.length))

    stage.dispose()
    unsubscribe()

    expect(snapshots).toEqual([0, 0])
  })

  it('releases every texture when route disposal wins the asset load race', async () => {
    const stage = new WorksPlaneStage()
    const root = new Group()
    const loads = PROJECTS.map(() => deferred<Texture>())
    const textures = loads.map(() => new Texture())
    const snapshots: number[] = []
    stage.mount(root)
    stage.subscribeSceneCards((cards) => snapshots.push(cards.length))
    loadTexture.mockImplementation((url: string) => {
      const index = PROJECTS.findIndex((project) => project.textureUrl === url)
      return loads[index]!.promise
    })

    const initialization = stage.init()
    expect(loadTexture).toHaveBeenCalledTimes(PROJECTS.length)

    stage.dispose()
    loads.forEach((load, index) => load.resolve(textures[index]!))
    await initialization

    expect(releaseTexture).toHaveBeenCalledTimes(PROJECTS.length)
    PROJECTS.forEach((project, index) => {
      expect(releaseTexture).toHaveBeenCalledWith(project.textureUrl, textures[index])
    })
    expect(snapshots).toEqual([0, 0])
    expect(stage.installationOwner).toBeNull()
  })

  it('releases early and late successes when one project texture fails', async () => {
    const stage = new WorksPlaneStage()
    const root = new Group()
    const loads = PROJECTS.map(() => deferred<Texture>())
    const textures = loads.map(() => new Texture())
    stage.mount(root)
    loadTexture.mockImplementation((url: string) => {
      const index = PROJECTS.findIndex((project) => project.textureUrl === url)
      return loads[index]!.promise
    })

    const initialization = stage.init()
    loads[0]!.resolve(textures[0]!)
    await Promise.resolve()
    const failure = new Error('project texture failed')
    loads[1]!.reject(failure)
    await expect(initialization).rejects.toBe(failure)

    loads.slice(2).forEach((load, index) => load.resolve(textures[index + 2]!))
    await Promise.allSettled(loads.map((load) => load.promise))
    await Promise.resolve()

    expect(releaseTexture).toHaveBeenCalledTimes(PROJECTS.length - 1)
    expect(releaseTexture).toHaveBeenCalledWith(PROJECTS[0]!.textureUrl, textures[0])
    PROJECTS.slice(2).forEach((project, index) => {
      expect(releaseTexture).toHaveBeenCalledWith(project.textureUrl, textures[index + 2])
    })
    expect(releaseTexture).not.toHaveBeenCalledWith(PROJECTS[1]!.textureUrl, expect.anything())
    expect(stage.installationOwner).toBeNull()
  })
})
