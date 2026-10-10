import { beforeEach, describe, expect, it } from 'vitest'

import { eventBus } from '../../../src/core/EventBus'
import { FullscreenOverlay } from '../../../src/UI/FullscreenOverlay'

function mountOverlayHost(): HTMLDivElement {
  document.body.innerHTML = ''
  const container = document.createElement('div')
  container.id = 'jlz-fs-overlay'
  container.className = 'uk-modal'
  const dialog = document.createElement('div')
  dialog.className = 'uk-modal-dialog'
  const close = document.createElement('button')
  close.className = 'jlz-fs-close'
  dialog.append(close)
  container.append(dialog)
  document.body.append(container)
  return container
}

describe('FullscreenOverlay modal lifecycle listeners', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('answers each UIKit modal event exactly once per controller', () => {
    const container = mountOverlayHost()
    const emissions: unknown[] = []
    eventBus.on('jlz:fullscreen-change', (detail) => {
      emissions.push(detail)
    })

    const overlay = new FullscreenOverlay(container)
    container.dispatchEvent(new CustomEvent('show'))
    expect(emissions).toEqual([{ open: true }])

    overlay.dispose()

    // The AppShell-owned element outlives the controller. A replaced Experience
    // attaches a fresh controller to the same element; the disposed one must
    // not keep answering the same modal events.
    const replacement = new FullscreenOverlay(container)
    container.dispatchEvent(new CustomEvent('show'))
    expect(emissions).toEqual([{ open: true }, { open: true }])

    container.dispatchEvent(new CustomEvent('hide'))
    expect(emissions).toEqual([{ open: true }, { open: true }, { open: false }])
    expect(document.body.classList.contains('jlz-media-layer-open')).toBe(false)

    replacement.dispose()
  })
})
