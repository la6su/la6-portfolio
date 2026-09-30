import { describe, expect, it, vi } from 'vitest'
import { Sizes } from '../Experience/Sizes'

describe('Sizes lifecycle', () => {
  it('ignores late resize registration and viewport updates after destroy', () => {
    const sizes = new Sizes()
    const callback = vi.fn()
    sizes.onResize(callback)
    sizes.destroy()
    sizes.destroy()

    const width = sizes.width
    const height = sizes.height
    sizes.onResize(callback)
    sizes.resize()
    window.dispatchEvent(new Event('resize'))

    expect(sizes.width).toBe(width)
    expect(sizes.height).toBe(height)
    expect(callback).not.toHaveBeenCalled()
  })
})

// Ported from the former core/viewportPolicy module: the DPR clamp lives in
// Sizes, so its edge-case evidence lives with the consumer.
describe('Sizes DPR clamp', () => {
  const withDpr = (value: unknown): number => {
    Object.defineProperty(window, 'devicePixelRatio', { value, configurable: true })
    return new Sizes().dpr
  }

  it('keeps normal DPR values within the renderer cap', () => {
    expect(withDpr(1)).toBe(1)
    expect(withDpr(1.75)).toBe(1.75)
    expect(withDpr(4)).toBe(2)
  })

  it('normalizes invalid or transient DPR values', () => {
    expect(withDpr(0)).toBe(1)
    expect(withDpr(Number.NaN)).toBe(1)
    expect(withDpr(Number.POSITIVE_INFINITY)).toBe(1)
    expect(withDpr('2')).toBe(1)
  })
})
