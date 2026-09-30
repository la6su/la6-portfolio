import { describe, expect, it, vi } from 'vitest'
import { FullscreenOverlay, type OverlayOptions } from '../UI/FullscreenOverlay'
import { BlurFade } from '../Experience/BlurFade'
import { eventBus } from '../core/EventBus'

type OverlayInternals = {
  container: HTMLDivElement
  titleEl: HTMLElement
  _applyOptions: (options: OverlayOptions) => void
  dispose: () => void
}

describe('FullscreenOverlay close ownership', () => {
  it('fires only the callback owned by the current open cycle', () => {
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals
    const first = vi.fn()
    const second = vi.fn()

    overlay._applyOptions({ onClose: first })
    overlay.container.dispatchEvent(new Event('hide'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()

    overlay._applyOptions({ onClose: second })
    overlay.container.dispatchEvent(new Event('hide'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect('onClose' in overlay).toBe(false)
  })

  it('owns Escape so navigation behind fullscreen never receives it', () => {
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals
    const behind = vi.fn()
    overlay.container.dispatchEvent(new Event('show'))
    document.addEventListener('keydown', behind)

    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
      document.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
      expect(behind).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', behind)
      overlay.dispose()
    }
  })

  it('closes the cinematic menu and publishes exclusive fullscreen state', () => {
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals
    const closeNav = vi.fn()
    const states: boolean[] = []
    const unsubscribeClose = eventBus.on('jlz:close-nav', closeNav)
    const unsubscribeState = eventBus.on('jlz:fullscreen-change', ({ open }) => states.push(open))

    try {
      overlay.container.dispatchEvent(new Event('show'))
      expect(document.body.classList.contains('jlz-media-layer-open')).toBe(true)
      overlay.container.dispatchEvent(new Event('hide'))
      expect(closeNav).toHaveBeenCalledOnce()
      expect(states).toEqual([true, false])
      expect(document.body.classList.contains('jlz-media-layer-open')).toBe(false)
    } finally {
      unsubscribeClose()
      unsubscribeState()
      overlay.dispose()
    }
  })

  it('closes when the shared media exit is requested', () => {
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals
    const close = vi.spyOn(overlay as unknown as { close: () => void }, 'close')

    try {
      overlay.container.classList.add('uk-open')
      eventBus.emit('jlz:close-media-layer')
      expect(close).toHaveBeenCalledOnce()
    } finally {
      overlay.dispose()
    }
  })

  it('renders project tags as text nodes in the shared fullscreen shell', () => {
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals & { tagsEl: HTMLElement }
    try {
      overlay._applyOptions({ tags: ['CG', '<img src=x onerror=alert(1)>'] })
      expect(overlay.tagsEl.querySelector('img')).toBeNull()
      expect(overlay.tagsEl.textContent).toContain('<img src=x onerror=alert(1)>')
    } finally {
      overlay.dispose()
    }
  })

  it('settles the title synchronously without BlurFade when reduced motion is enabled', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true } as MediaQueryList),
    })
    const show = vi.fn()
    const blurFadeFor = vi.spyOn(BlurFade, 'for').mockReturnValue({ show } as never)
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals

    try {
      overlay._applyOptions({ title: 'Reduced title' })
      expect(blurFadeFor).not.toHaveBeenCalled()
      expect(overlay.titleEl.textContent).toBe('Reduced title')
    } finally {
      blurFadeFor.mockRestore()
    }
  })

  it('keeps BlurFade for the normal-motion title reveal', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false } as MediaQueryList),
    })
    const show = vi.fn()
    const blurFadeFor = vi.spyOn(BlurFade, 'for').mockReturnValue({ show } as never)
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals

    try {
      overlay._applyOptions({ title: 'Animated title' })
      expect(blurFadeFor).toHaveBeenCalledOnce()
      expect(show).toHaveBeenCalledWith(0.8, 'Animated title')
    } finally {
      blurFadeFor.mockRestore()
    }
  })

  it('cancels a pending shown reveal when the overlay is disposed', () => {
    let frame: FrameRequestCallback | undefined
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 7
    })
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals

    try {
      overlay.container.dispatchEvent(new Event('shown'))
      overlay.dispose()
      frame?.(0)
      expect(overlay.container.classList.contains('is-entered')).toBe(false)
    } finally {
      raf.mockRestore()
    }
  })

  it('applies the shown reveal when the overlay remains current', () => {
    let frame: FrameRequestCallback | undefined
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 8
    })
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals

    try {
      overlay.container.dispatchEvent(new Event('shown'))
      frame?.(0)
      expect(overlay.container.classList.contains('is-entered')).toBe(true)
    } finally {
      raf.mockRestore()
      overlay.dispose()
    }
  })

  it('settles an open modal before disposal', () => {
    const onClose = vi.fn()
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals

    try {
      overlay._applyOptions({ onClose })
      overlay.container.dispatchEvent(new Event('show'))
      overlay.container.classList.add('uk-open')

      overlay.dispose()

      expect(onClose).toHaveBeenCalledOnce()
      expect(document.body.contains(overlay.container)).toBe(false)
      expect(document.body.classList.contains('uk-modal-page')).toBe(false)
    } finally {
      overlay.dispose()
    }
  })

  it('cancels a hidden title reveal during disposal', () => {
    const show = vi.fn()
    const hide = vi.fn()
    const blurFadeFor = vi.spyOn(BlurFade, 'for').mockReturnValue({ show, hide } as never)
    const overlay = new FullscreenOverlay() as unknown as OverlayInternals

    try {
      overlay._applyOptions({ title: 'Preloaded title' })
      overlay.dispose()
      expect(hide).toHaveBeenCalledOnce()
    } finally {
      blurFadeFor.mockRestore()
      overlay.dispose()
    }
  })
})
