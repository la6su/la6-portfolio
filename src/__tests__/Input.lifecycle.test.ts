import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { input } from '../Experience/Input'

describe('Input singleton lifecycle', () => {
  beforeEach(() => {
    input.start()
    input.mouse.set(0, 0)
  })

  afterEach(() => {
    input.destroy()
  })

  it('updates the shared mouse vector while started', () => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 50 }))

    expect(input.mouse.x).not.toBe(0)
    expect(input.mouse.y).not.toBe(0)
  })

  it('can restore its listener after explicit teardown', () => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 50 }))
    input.destroy()
    input.mouse.set(0, 0)

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 }))
    expect(input.mouse.x).toBe(0)
    expect(input.mouse.y).toBe(0)

    input.start()
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 }))

    expect(input.mouse.x).not.toBe(0)
    expect(input.mouse.y).not.toBe(0)
  })
})
