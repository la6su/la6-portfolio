import { afterEach, expect, it, vi } from 'vitest'
import { Cursor } from '../../../src/Experience/Cursor'

let cursor: Cursor | null = null

afterEach(() => {
  cursor?.destroy()
  cursor = null
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
