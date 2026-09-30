import { describe, expect, it, vi } from 'vitest'
import { Experience } from '../Experience/Experience'

describe('Experience carousel lifecycle', () => {
  it('clears a failed init promise so the carousel can retry', async () => {
    const init = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce(undefined)
    const experience = Object.create(Experience.prototype) as Experience
    Object.assign(experience as unknown as { carousel: unknown }, { carousel: { init } })

    await experience.ensureCarouselInitialized()
    await experience.ensureCarouselInitialized()

    expect(init).toHaveBeenCalledTimes(2)
  })
})
