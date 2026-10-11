import { afterEach, expect, it, vi } from 'vitest'
import { Cursor } from '../../../src/Experience/Cursor'

let cursor: Cursor | null = null

afterEach(() => {
  cursor?.destroy()
  cursor = null
  localStorage.removeItem('jlz:force-cursor')
  document.documentElement.classList.remove('jlz-force-cursor')
  vi.restoreAllMocks()
})

it('wakes the shared render loop on pointer movement', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  cursor = new Cursor()
  const onActivity = vi.fn()
  cursor.onActivity = onActivity

  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))

  expect(onActivity).toHaveBeenCalledTimes(1)
})

it('stops the animated cursor layer under reduced motion', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  cursor = new Cursor()
  cursor.setReducedMotion(true)
  const onActivity = vi.fn()
  cursor.onActivity = onActivity

  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 90 }))
  cursor.update()

  // The scheduler's settle gate must see a settled cursor, otherwise a
  // reduced-motion visitor keeps paying frames for a hidden layer.
  expect(onActivity).not.toHaveBeenCalled()
  expect(cursor.isSettled).toBe(true)
})

it('keeps the animated cursor for the explicit force-cursor escape hatch', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  localStorage.setItem('jlz:force-cursor', '1')
  cursor = new Cursor()
  cursor.setReducedMotion(true)
  const onActivity = vi.fn()
  cursor.onActivity = onActivity

  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 90 }))

  expect(document.documentElement.classList.contains('jlz-force-cursor')).toBe(true)
  expect(onActivity).toHaveBeenCalledTimes(1)
  expect(cursor.isSettled).toBe(false)
})
