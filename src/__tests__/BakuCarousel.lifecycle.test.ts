import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadCaseTexture: vi.fn(),
  releaseCaseTexture: vi.fn(),
}))

vi.mock('../Experience/World/caseTexture', () => mocks)

import { BakuCarousel } from '../Experience/World/BakuCarousel'
import type { StorySide } from '../core/storyState'

async function createActiveCarousel(storySide?: () => StorySide): Promise<BakuCarousel> {
  mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
  const carousel = new BakuCarousel(() => 'home', storySide)
  await carousel.init()
  carousel.setActive(true)
  for (let frame = 0; frame < 20 && carousel.isAnimating; frame++) {
    carousel.update(0.1)
  }
  return carousel
}

describe('BakuCarousel texture lifecycle', () => {
  beforeEach(() => {
    mocks.loadCaseTexture.mockReset()
    mocks.releaseCaseTexture.mockReset()
  })

  it('releases cached textures with their acquired identities', async () => {
    const textures = new Map<string, THREE.Texture>()
    mocks.loadCaseTexture.mockImplementation(async (url: string) => {
      const texture = new THREE.Texture()
      textures.set(url, texture)
      return texture
    })

    const carousel = new BakuCarousel()
    await carousel.init()
    carousel.dispose()

    expect(mocks.releaseCaseTexture).toHaveBeenCalled()
    for (const call of mocks.releaseCaseTexture.mock.calls) {
      expect(call[1]).toBeInstanceOf(THREE.Texture)
    }
  })

  it('releases textures and skips cards/listeners when disposed during init', async () => {
    const resolvers: Array<(texture: THREE.Texture) => void> = []
    mocks.loadCaseTexture.mockImplementation(
      () => new Promise<THREE.Texture>((resolve) => resolvers.push(resolve)),
    )

    const carousel = new BakuCarousel()
    const initPromise = carousel.init()
    expect(resolvers.length).toBeGreaterThan(0)

    carousel.dispose()
    resolvers.forEach((resolve) => resolve(new THREE.Texture()))
    await initPromise

    expect(carousel.children).toHaveLength(0)
    expect(mocks.releaseCaseTexture).toHaveBeenCalledTimes(resolvers.length)
    carousel.dispose()
    expect(mocks.releaseCaseTexture).toHaveBeenCalledTimes(resolvers.length)
  })

  it('releases only successfully acquired textures when one load fails', async () => {
    const failure = new Error('texture failed')
    let callIndex = 0
    mocks.loadCaseTexture.mockImplementation(() => {
      const index = callIndex++
      return index === 1
        ? Promise.reject<THREE.Texture>(failure)
        : Promise.resolve(new THREE.Texture())
    })

    const carousel = new BakuCarousel()
    await expect(carousel.init()).rejects.toBe(failure)

    expect(mocks.releaseCaseTexture).toHaveBeenCalledTimes(3)
    expect(mocks.releaseCaseTexture).not.toHaveBeenCalledWith(
      '/assets/projects/mono-sunday/cover-studio-v2.jpg',
    )
  })

  it('keeps hidden idle cards on the CasePlane idle guard', () => {
    const update = vi.fn()
    const card = {
      visible: false,
      isAnimating: false,
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1),
      setReveal: vi.fn(),
      update,
    }
    const carousel = new BakuCarousel()
    Object.assign(carousel as unknown as { cards: unknown[] }, { cards: [card] })
    carousel.setActive(true)
    carousel.update(1 / 60)
    expect(update).toHaveBeenCalledWith(1 / 60, false)
  })

  it('reconciles a settled visible layout once and skips repeated card writes', () => {
    const card = {
      visible: true,
      isAnimating: false,
      position: new THREE.Vector3(),
      rotation: new THREE.Euler(),
      scale: new THREE.Vector3(1, 1, 1),
      setReveal: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    }
    const carousel = new BakuCarousel()
    Object.assign(carousel as unknown as Record<string, unknown>, {
      cards: [card],
      _active: true,
      _morphT: 1,
      _morphTarget: 1,
      scroll: { current: 0, target: 0 },
    })

    carousel.update(1 / 60)
    const firstPass = {
      reveal: card.setReveal.mock.calls.length,
      update: card.update.mock.calls.length,
    }
    carousel.update(1 / 60)

    expect(card.setReveal).toHaveBeenCalledTimes(firstPass.reveal)
    expect(card.update).toHaveBeenCalledTimes(firstPass.update)
    expect(carousel.isAnimating).toBe(false)
    card.isAnimating = true
    carousel.update(1 / 60)
    expect(card.update).toHaveBeenCalledTimes(firstPass.update + 1)
    carousel.dispose()
  })

  it('uses the typed story side for the menu input guard', async () => {
    let side: StorySide = 'menu'
    const carousel = await createActiveCarousel(() => side)
    const wake = vi.fn()
    carousel.onActivity = wake

    // The UI projection can disagree; scene input must follow the typed owner port.
    document.body.dataset.cinematicSheet = 'center'
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 1000, clientY: 0 }),
    )
    document.body.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }),
    )
    expect(wake).not.toHaveBeenCalled()
    expect(carousel.getTargetCardIndex()).toBe(carousel.getFrontCardIndex())

    side = 'center'
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 1000, clientY: 0 }),
    )
    document.body.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0 }),
    )
    expect(wake).toHaveBeenCalled()
    expect(carousel.getTargetCardIndex()).not.toBe(carousel.getFrontCardIndex())

    carousel.dispose()
    delete document.body.dataset.cinematicSheet
  })

  it('keeps momentum damping stable across refresh rates', () => {
    const at60Hz = new BakuCarousel()
    Object.assign(at60Hz as unknown as Record<string, unknown>, { velocity: 0.4 })
    at60Hz.update(1 / 60)
    const velocityAt60Hz = (at60Hz as unknown as { velocity: number }).velocity
    const at120Hz = new BakuCarousel()
    Object.assign(at120Hz as unknown as Record<string, unknown>, { velocity: 0.4 })
    at120Hz.update(1 / 120)
    at120Hz.update(1 / 120)
    const velocityAt120Hz = (at120Hz as unknown as { velocity: number }).velocity
    expect(velocityAt120Hz).toBeCloseTo(velocityAt60Hz, 12)
  })

  it('settles the visible morph and scroll position when reduced motion is enabled', () => {
    const carousel = new BakuCarousel()
    carousel.setActive(true)
    carousel.next()
    const targetIndex = carousel.getTargetCardIndex()
    expect(carousel.isAnimating).toBe(true)

    carousel.setReducedMotion(true)

    expect(carousel.getFrontCardIndex()).toBe(targetIndex)
    expect(carousel.isAnimating).toBe(false)
    carousel.dispose()
  })

  it('unregisters the window input handlers it installed on dispose', async () => {
    const eventTypes = new Set([
      'pointerdown',
      'pointermove',
      'pointerup',
      'pointercancel',
      'click',
    ])
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const carousel = await createActiveCarousel()
    try {
      const registrations = add.mock.calls.filter(([type]) => eventTypes.has(type))

      expect(registrations.map(([type]) => type)).toEqual(expect.arrayContaining([...eventTypes]))

      carousel.dispose()

      for (const [type, listener] of registrations) {
        expect(remove).toHaveBeenCalledWith(type, listener)
      }
      expect(carousel.isActive).toBe(false)
      expect(carousel.isAnimating).toBe(false)
    } finally {
      carousel.dispose()
      add.mockRestore()
      remove.mockRestore()
    }
  })

  it('keeps a newer click callback when a retired UI owner releases its handler', async () => {
    mocks.loadCaseTexture.mockImplementation(async () => new THREE.Texture())
    const carousel = new BakuCarousel()
    const first = vi.fn()
    const second = vi.fn()
    const releaseFirst = carousel.onCardClick(first)
    carousel.onCardClick(second)

    releaseFirst()
    await carousel.init()
    carousel.setActive(true)
    for (let frame = 0; frame < 20 && carousel.isAnimating; frame++) {
      carousel.update(0.1)
    }

    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }),
    )
    document.body.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 }),
    )

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
    carousel.dispose()
  })

  it('ignores late public calls after terminal teardown', () => {
    const carousel = new BakuCarousel()

    carousel.dispose()
    carousel.dispose()
    carousel.setActive(true)
    carousel.setCamera(new THREE.PerspectiveCamera())
    carousel.onCardClick(vi.fn())
    carousel.next()
    carousel.prev()
    carousel.update(1 / 60)

    expect(carousel.getTargetCardIndex()).toBe(carousel.getFrontCardIndex())
    expect(carousel.isActive).toBe(false)
    expect(carousel.isAnimating).toBe(false)
  })

  it('wakes the shared loop when pointer drag changes carousel state', async () => {
    const carousel = await createActiveCarousel()
    const wake = vi.fn()
    carousel.onActivity = wake

    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, clientX: 1000, clientY: 100 }),
    )
    document.body.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 0, clientY: 100 }),
    )

    expect(wake).toHaveBeenCalled()
    expect(carousel.getTargetCardIndex()).not.toBe(carousel.getFrontCardIndex())
    carousel.dispose()
  })

  it('wakes the shared loop for carousel controls', () => {
    const carousel = new BakuCarousel()
    const wake = vi.fn()
    carousel.onActivity = wake
    carousel.next()

    expect(wake).toHaveBeenCalledOnce()
    carousel.dispose()
  })
})
