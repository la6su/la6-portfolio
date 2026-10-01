import { afterEach, expect, it } from 'vitest'
import { input } from './Input'

afterEach(() => input.destroy())

it('attaches pointer input only while the Experience owns it', () => {
  input.mouse.set(0, 0)
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 768, clientY: 192 }))
  expect(input.mouse.toArray()).toEqual([0, 0])

  input.start()
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 768, clientY: 192 }))
  expect(input.mouse.x).toBe(0.5)
  expect(input.mouse.y).toBe(0.5)

  input.destroy()
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0, clientY: 768 }))
  expect(input.mouse.x).toBe(0.5)
  expect(input.mouse.y).toBe(0.5)

  input.start()
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 256, clientY: 576 }))
  expect(input.mouse.x).toBe(-0.5)
  expect(input.mouse.y).toBe(-0.5)
})
