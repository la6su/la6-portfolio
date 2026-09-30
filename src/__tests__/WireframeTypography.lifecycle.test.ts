import { describe, expect, it } from 'vitest'
import { WireframeTypography } from '../Experience/World/WireframeTypography'

describe('WireframeTypography lifecycle', () => {
  it('remains inert after disposal', () => {
    const typography = new WireframeTypography('HELLO', 0.2)
    typography.setActive(true)

    typography.dispose()

    expect(() => {
      typography.setActive(true)
      typography.setTheme(true)
      typography.update(1)
      typography.dispose()
    }).not.toThrow()
    expect(typography.isAnimating).toBe(false)
    expect(typography.children).toHaveLength(0)
  })
})
