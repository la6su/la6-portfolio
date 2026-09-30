import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import { themeManager } from '../core/ThemeManager'
import { eventBus } from '../core/EventBus'

// ThemeManager is a singleton created at module import time. It reads
// localStorage('jlz:theme') once on construction. We cannot re-import to
// test _loadMode() in isolation, but we CAN test:
//   - setMode() changes mode + isInverse
//   - setMode() persists to localStorage
//   - setMode() publishes jlz:theme-change with { mode } on the eventBus
//   - toggle() flips auto ↔ inverse and returns the new mode
//
// Reset state between tests: localStorage.clear() + setMode('auto').
// eventBus.emit is spied on to capture event detail without side effects
// (the raw window bridge was removed in Phase 10).

describe('ThemeManager', () => {
  let emitSpy: MockInstance
  const themeChangeCalls = () => emitSpy.mock.calls.filter((call) => call[0] === 'jlz:theme-change')

  beforeEach(() => {
    localStorage.clear()
    themeManager.setMode('auto')
    // Spy AFTER the reset so it captures only test-triggered events.
    emitSpy = vi.spyOn(eventBus, 'emit')
  })

  afterEach(() => {
    emitSpy.mockRestore()
  })

  describe('setMode', () => {
    it('does not persist or emit when the mode is unchanged', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

      themeManager.setMode('auto')

      expect(themeChangeCalls()).toHaveLength(0)
      expect(setItemSpy).not.toHaveBeenCalled()
      setItemSpy.mockRestore()
    })

    it('sets mode to inverse and updates isInverse', () => {
      themeManager.setMode('inverse')
      expect(themeManager.mode).toBe('inverse')
      expect(themeManager.isInverse).toBe(true)
    })

    it('sets mode to auto and updates isInverse', () => {
      themeManager.setMode('inverse')
      themeManager.setMode('auto')
      expect(themeManager.mode).toBe('auto')
      expect(themeManager.isInverse).toBe(false)
    })

    it('persists mode to localStorage', () => {
      themeManager.setMode('inverse')
      expect(localStorage.getItem('jlz:theme')).toBe('inverse')
      themeManager.setMode('auto')
      expect(localStorage.getItem('jlz:theme')).toBe('auto')
    })

    it('publishes jlz:theme-change on the eventBus with mode detail', () => {
      themeManager.setMode('inverse')
      const call = themeChangeCalls()[0]
      expect(call).toBeDefined()
      expect(call?.[1]).toEqual({ mode: 'inverse' })
    })
  })

  describe('toggle', () => {
    it('flips auto → inverse', () => {
      expect(themeManager.mode).toBe('auto')
      const newMode = themeManager.toggle()
      expect(newMode).toBe('inverse')
      expect(themeManager.mode).toBe('inverse')
      expect(themeManager.isInverse).toBe(true)
    })

    it('flips inverse → auto', () => {
      themeManager.setMode('inverse')
      const newMode = themeManager.toggle()
      expect(newMode).toBe('auto')
      expect(themeManager.mode).toBe('auto')
      expect(themeManager.isInverse).toBe(false)
    })

    it('persists after toggle', () => {
      themeManager.toggle() // auto → inverse
      expect(localStorage.getItem('jlz:theme')).toBe('inverse')
      themeManager.toggle() // inverse → auto
      expect(localStorage.getItem('jlz:theme')).toBe('auto')
    })

    it('publishes jlz:theme-change on each toggle', () => {
      emitSpy.mockClear()
      themeManager.toggle()
      themeManager.toggle()
      const calls = themeChangeCalls()
      expect(calls).toHaveLength(2)
      expect(calls[0]?.[1]).toEqual({ mode: 'inverse' })
      expect(calls[1]?.[1]).toEqual({ mode: 'auto' })
    })
  })

  describe('default state', () => {
    it('starts in auto mode when localStorage is empty', () => {
      // After beforeEach reset, mode should be 'auto'
      expect(themeManager.mode).toBe('auto')
      expect(themeManager.isInverse).toBe(false)
    })
  })
})
