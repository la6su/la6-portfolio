import { afterEach, describe, expect, it, vi } from 'vitest'

const { update } = vi.hoisted(() => ({ update: vi.fn() }))

vi.mock('uikit', () => ({
  default: { update },
}))

import { UIMenu } from '../UI/UIMenu'
import { eventBus } from '../core/EventBus'

type MenuInternals = {
  navEl: HTMLElement
  dispose: () => void
}

describe('UIMenu UIkit ownership', () => {
  afterEach(() => {
    update.mockClear()
    document.body.innerHTML = ''
  })

  it('hydrates only its persistent shell at construction', () => {
    const menu = new UIMenu() as unknown as MenuInternals

    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith(menu.navEl)
    expect(menu.navEl.isConnected).toBe(true)

    menu.dispose()
    expect(menu.navEl.isConnected).toBe(false)
  })

  it('rehydrates the sound icon after an external toggle', () => {
    const menu = new UIMenu() as unknown as MenuInternals
    const soundIcon = menu.navEl.querySelector<HTMLElement>('#jlz-sound-toggle [uk-icon]')!
    const initialUpdates = update.mock.calls.length

    eventBus.emit('jlz:sound-toggle', { muted: false })

    expect(soundIcon.getAttribute('uk-icon')).toBe('icon: sound')
    expect(update).toHaveBeenCalledTimes(initialUpdates + 1)
    expect(update).toHaveBeenLastCalledWith(soundIcon)
    menu.dispose()
  })

  it('keeps one close action while fullscreen owns interaction', () => {
    const menu = new UIMenu() as unknown as MenuInternals
    const launcher = menu.navEl.querySelector<HTMLButtonElement>('#jlz-menu-launcher')!
    const brand = menu.navEl.querySelector<HTMLElement>('.jlz-topbar__brand')!
    const consoleBar = menu.navEl.querySelector<HTMLElement>('.jlz-console-bar')!
    const closeLayer = vi.fn()
    const unsubscribe = eventBus.on('jlz:close-media-layer', closeLayer)

    eventBus.emit('jlz:fullscreen-change', { open: true })
    expect(menu.navEl.classList.contains('is-fullscreen-open')).toBe(true)
    expect(launcher.textContent).toContain('Close')
    expect(launcher.getAttribute('aria-label')).toBe('Close')
    expect(brand.getAttribute('aria-hidden')).toBe('true')
    expect(brand.inert).toBe(true)
    expect(consoleBar.getAttribute('aria-hidden')).toBe('true')
    expect(consoleBar.inert).toBe(true)
    launcher.click()
    expect(closeLayer).toHaveBeenCalledOnce()

    eventBus.emit('jlz:fullscreen-change', { open: false })
    expect(menu.navEl.classList.contains('is-fullscreen-open')).toBe(false)
    expect(launcher.textContent).toContain('Menu')
    expect(brand.getAttribute('aria-hidden')).toBe('false')
    expect(brand.inert).toBe(false)
    unsubscribe()
    menu.dispose()
  })
})
