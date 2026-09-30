import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShowreelConsole } from '../UI/ShowreelConsole'
import { eventBus } from '../core/EventBus'
import type { ShowreelState } from '../Experience/World/ShowreelTheater'

const openState: ShowreelState = {
  phase: 'enter',
  playing: false,
  time: 0,
  duration: 0,
}

describe('ShowreelConsole media-layer ownership', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('publishes fullscreen ownership and accepts the shared close request', () => {
    const console = new ShowreelConsole()
    const closeNav = vi.fn()
    const closeShowreel = vi.fn()
    const states: boolean[] = []
    const unsubs = [
      eventBus.on('jlz:close-nav', closeNav),
      eventBus.on('jlz:showreel-close', closeShowreel),
      eventBus.on('jlz:fullscreen-change', ({ open }) => states.push(open)),
    ]

    try {
      eventBus.emit('jlz:showreel-state', openState)
      expect(closeNav).toHaveBeenCalledOnce()
      expect(states).toEqual([true])
      expect(document.body.classList.contains('jlz-media-layer-open')).toBe(true)

      eventBus.emit('jlz:close-media-layer')
      expect(closeShowreel).toHaveBeenCalledOnce()

      eventBus.emit('jlz:showreel-state', { ...openState, phase: 'closed' })
      expect(states).toEqual([true, false])
      expect(document.body.classList.contains('jlz-media-layer-open')).toBe(false)
    } finally {
      for (const unsub of unsubs) unsub()
      console.dispose()
    }
  })

  it('releases the media layer when disposed during an open showreel', () => {
    const console = new ShowreelConsole()
    const states: boolean[] = []
    const unsubscribe = eventBus.on('jlz:fullscreen-change', ({ open }) => states.push(open))

    try {
      eventBus.emit('jlz:showreel-state', openState)
      console.dispose()
      expect(states).toEqual([true, false])
      expect(document.body.classList.contains('jlz-media-layer-open')).toBe(false)
    } finally {
      unsubscribe()
    }
  })
})
