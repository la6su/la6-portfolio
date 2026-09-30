import { describe, expect, it, vi } from 'vitest'
import { makeRendererDisposeIdempotent } from '../core/unifiedRenderer'

describe('unified renderer lifecycle', () => {
  it('makes independent Tres and application disposal exactly-once', () => {
    const dispose = vi.fn()
    const renderer = makeRendererDisposeIdempotent({ dispose })

    renderer.dispose()
    renderer.dispose()

    expect(dispose).toHaveBeenCalledOnce()
  })
})
