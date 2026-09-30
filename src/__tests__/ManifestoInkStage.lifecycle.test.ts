// ManifestoInkStage voice contract. The lifecycle machinery (reveal damp,
// pointer chase, reduced motion, geometry refcount, disposed guard) is the
// PointerInkStage shell, pinned once in PointerInkStage.lifecycle.test.ts —
// the voice is configuration, and its testable contract is the ink tint.

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('../../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

import { describe, expect, it, vi } from 'vitest'
import { ManifestoInkStage } from '../Experience/World/ManifestoInkStage'

describe('ManifestoInkStage voice', () => {
  it('matches the manifesto ink on either theme', () => {
    const stage = new ManifestoInkStage()
    stage.setTheme(true)
    const tint = (stage as unknown as { _tintUni: { value: { getHexString(): string } } })._tintUni
      .value
    expect(tint.getHexString()).toBe('243540')

    stage.setTheme(false)
    expect(tint.getHexString()).toBe('cfe8ee')

    stage.dispose()
  })
})
