import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import UIkit from 'uikit'
import { ContentReveal } from '../Experience/ContentReveal'
import { eventBus } from '../core/EventBus'
import type { PageId } from '../core/routeManifest'

describe('ContentReveal typed page port', () => {
  let reveal: ContentReveal
  let page: PageId

  const setSections = (markup: string): void => {
    document.body.innerHTML = `<main id="spa-content">${markup}</main>`
  }

  beforeEach(() => {
    page = 'home'
    setSections('<section data-section="intro" class="section-active"></section>')
    document.body.dataset.page = 'works'
    reveal = new ContentReveal(() => page)
  })

  afterEach(() => {
    reveal.destroy()
    document.body.replaceChildren()
    document.documentElement.classList.remove('uk-light')
    document.body.classList.remove('uk-light')
    delete document.body.dataset.page
  })

  it('uses the injected page getter instead of the legacy DOM dataset', () => {
    const configs = (
      reveal as unknown as { getConfigs: () => readonly { id: string }[] }
    ).getConfigs()

    expect(configs[0]?.id).toBe('sec_lab')
  })

  it('invalidates the cached config when the route changes', () => {
    const getConfigs = () =>
      (reveal as unknown as { getConfigs: () => readonly { id: string }[] }).getConfigs()
    expect(getConfigs()[0]?.id).toBe('sec_lab')

    page = 'works'
    eventBus.emit('jlz:route-change', { page: 'works' })

    expect(getConfigs()[0]?.id).toBe('content_works_0')
  })

  it('refreshes only the active section subtree after a section change', async () => {
    setSections(`
      <section data-section="intro" class="section-active"></section>
      <section data-section="about"></section>
    `)
    document.body.insertAdjacentHTML(
      'beforeend',
      '<section data-section="about" class="section-active" data-outside-root></section>',
    )
    const active = document.querySelector<HTMLElement>('[data-section="about"]')!
    const update = vi.spyOn(UIkit as unknown as { update: (element: Element) => void }, 'update')

    eventBus.emit('jlz:section-change', { sectionId: 'about', index: 1 })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(active)
    expect(active.classList.contains('section-active')).toBe(true)
    expect(
      document.querySelector('[data-section="intro"]')?.classList.contains('section-active'),
    ).toBe(false)
    expect(
      document.querySelector('[data-outside-root]')?.classList.contains('section-active'),
    ).toBe(true)
    update.mockRestore()
  })

  it('cancels a pending scoped UIkit update when destroyed', () => {
    setSections('<section data-section="intro" class="section-active"></section>')
    const callbacks: FrameRequestCallback[] = []
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const update = vi.spyOn(UIkit as unknown as { update: (element: Element) => void }, 'update')

    eventBus.emit('jlz:section-change', { sectionId: 'intro', index: 1 })
    reveal.destroy()
    callbacks[0]?.(0)

    expect(cancel).toHaveBeenCalledWith(1)
    expect(update).not.toHaveBeenCalled()
    update.mockRestore()
    raf.mockRestore()
    cancel.mockRestore()
  })

  it('restores the global theme classes owned before construction', () => {
    reveal.destroy()
    document.documentElement.classList.add('uk-light')
    document.body.classList.remove('uk-light')
    const owned = new ContentReveal(() => page)
    owned.destroy()

    expect(document.documentElement.classList.contains('uk-light')).toBe(true)
    expect(document.body.classList.contains('uk-light')).toBe(false)

    document.documentElement.classList.remove('uk-light')
    owned.destroy()

    expect(document.documentElement.classList.contains('uk-light')).toBe(false)
  })

  it('coalesces rapid section changes to the latest connected root', () => {
    setSections(`
      <section data-section="intro" class="section-active"></section>
      <section data-section="about"></section>
      <section data-section="works"></section>
    `)
    const callbacks: FrameRequestCallback[] = []
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.push(callback)
      return callbacks.length
    })
    const update = vi.spyOn(UIkit as unknown as { update: (element: Element) => void }, 'update')

    eventBus.emit('jlz:section-change', { sectionId: 'about', index: 2 })
    eventBus.emit('jlz:section-change', { sectionId: 'works', index: 3 })
    callbacks[1]?.(0)

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith(document.querySelector('[data-section="works"]'))
    update.mockRestore()
    raf.mockRestore()
  })
})
