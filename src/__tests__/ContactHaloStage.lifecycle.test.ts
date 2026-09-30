// ContactHaloStage voice contract. The lifecycle machinery (reveal damp,
// pointer chase, reduced motion, geometry refcount, disposed guard) is the
// PointerInkStage shell, pinned once in PointerInkStage.lifecycle.test.ts —
// the voice is configuration, and its testable contract is the ink tint.

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('../../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

import { describe, expect, it, vi } from 'vitest'
import { ContactHaloStage } from '../Experience/World/ContactHaloStage'

describe('ContactHaloStage voice', () => {
  it('matches the greeting ink on either theme', () => {
    const stage = new ContactHaloStage()
    stage.setTheme(true)
    const tint = (stage as unknown as { _tintUni: { value: { getHexString(): string } } })._tintUni
      .value
    expect(tint.getHexString()).toBe('233329')

    stage.setTheme(false)
    expect(tint.getHexString()).toBe('dfffe9')

    stage.dispose()
  })
})
