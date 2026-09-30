import { describe, expect, it, vi } from 'vitest'
import { DeviceCapability } from '../core/DeviceCapability'
import { PostProcessingManager, type SectionPostParams } from '../core/PostProcessingManager'

describe('PostProcessingManager reduced-motion settlement', () => {
  it('snaps display values to the current preset before scheduler settlement', () => {
    const manager = new PostProcessingManager()
    const preset: SectionPostParams = {
      bloom: 0.9,
      vignette: 0.2,
      grain: 0.4,
      chromatic: 0.15,
    }
    manager.applyPreset('sec_contact', preset)
    manager.update(0.01)

    const state = manager as unknown as {
      current: Record<string, number>
      display: Record<string, number>
    }
    expect(state.display.vignette).not.toBe(state.current.vignette)

    manager.setReducedMotion(true)

    expect(state.display).toEqual(state.current)
  })

  it('does not alter the settled display when normal motion resumes', () => {
    const manager = new PostProcessingManager()
    manager.applyPreset('sec_about', {
      bloom: 0.7,
      vignette: 0.3,
      grain: 0.08,
      chromatic: 0,
    })
    manager.setReducedMotion(true)
    const before = { ...manager.postParams }

    manager.setReducedMotion(false)

    expect(manager.postParams).toEqual(before)
  })

  it('settles a preset exactly and stops crossfade work', () => {
    const manager = new PostProcessingManager()
    manager.applyPreset('sec_contact', {
      bloom: 0.9,
      vignette: 0.2,
      grain: 0.4,
      chromatic: 0.15,
    })
    manager.update(1)

    const state = manager as unknown as {
      current: Record<string, number>
      _crossfadeActive: boolean
    }
    expect(manager.postParams).toEqual(state.current)
    expect(state._crossfadeActive).toBe(false)

    const settled = { ...manager.postParams }
    manager.update(1)
    expect(manager.postParams).toEqual(settled)
  })

  it('retargets an active crossfade without losing the final preset', () => {
    const manager = new PostProcessingManager()
    manager.applyPreset('sec_about', {
      bloom: 0.7,
      vignette: 0.3,
      grain: 0.08,
      chromatic: 0,
    })
    manager.update(0.01)
    manager.applyPreset('sec_works', {
      bloom: 0.2,
      vignette: 0.55,
      grain: 0.02,
      chromatic: 0.04,
    })
    manager.update(1)

    const state = manager as unknown as {
      current: Record<string, number>
      _crossfadeActive: boolean
    }
    expect(manager.postParams).toEqual(state.current)
    expect(state._crossfadeActive).toBe(false)
  })

  it('crossfades the section grade channels instead of snapping them', () => {
    const manager = new PostProcessingManager()
    manager.applyPreset('sec_intro', {
      bloom: 0.3,
      vignette: 0.5,
      grain: 0.02,
      chromatic: 0,
      refract: 0,
      border: 0,
      gradeShadows: [1, 1, 1],
      gradeHighlights: [1, 1, 1],
    })
    manager.update(1)

    manager.applyPreset('sec_contact', {
      bloom: 0.3,
      vignette: 0.5,
      grain: 0.02,
      chromatic: 0,
      refract: 0.2,
      border: 0.6,
      gradeShadows: [0.8, 0.9, 1.1],
      gradeHighlights: [1.05, 1, 0.95],
    })
    // A tiny step must move the grade display part-way toward the target…
    manager.update(0.01)

    const state = manager as unknown as {
      display: {
        refract: number
        border: number
        gradeShadows: [number, number, number]
        gradeHighlights: [number, number, number]
      }
      current: {
        refract: number
        border: number
        gradeShadows: [number, number, number]
        gradeHighlights: [number, number, number]
      }
      _crossfadeActive: boolean
    }
    expect(state.display.refract).toBeGreaterThan(0)
    expect(state.display.refract).toBeLessThan(state.current.refract)
    expect(state.display.border).toBeGreaterThan(0)
    // Each tint channel sits between its neutral start and the authored target.
    expect(state.display.gradeShadows[0]).toBeLessThan(1)
    expect(state.display.gradeShadows[0]).toBeGreaterThan(state.current.gradeShadows[0])
    expect(state.display.gradeHighlights[2]).toBeLessThan(1)
    expect(state.display.gradeHighlights[2]).toBeGreaterThan(state.current.gradeHighlights[2])
    expect(state._crossfadeActive).toBe(true)

    // …and the settled frame must land exactly on the authored grade.
    manager.update(1)
    expect(manager.postParams).toEqual(state.current)
    expect(state._crossfadeActive).toBe(false)
  })

  it('defaults omitted grade channels to neutral and still applies them', () => {
    const manager = new PostProcessingManager()
    manager.applyPreset('sec_lab', {
      bloom: 0.5,
      vignette: 0.4,
      grain: 0.03,
      chromatic: 0.1,
      refract: 0.3,
      border: 0.4,
    })
    manager.update(1)

    expect(manager.postParams.refract).toBe(0.3)
    expect(manager.postParams.border).toBe(0.4)
    expect(manager.postParams.gradeShadows).toEqual([1, 1, 1])
    expect(manager.postParams.gradeHighlights).toEqual([1, 1, 1])
  })

  // The Renderer no longer applies capability scaling per frame — applyPreset
  // is the single quality-scaling owner (capability budget × feature gates).
  it('applies the capability intensity budget in applyPreset, unscaled for look channels', () => {
    const capability = DeviceCapability.getInstance()
    const previousTier = capability.tier
    capability.tier = 'high' // no per-channel feature gates — isolates the budget
    const scale = vi.spyOn(capability, 'scaleIntensity').mockImplementation((v) => v * 0.5)
    try {
      const manager = new PostProcessingManager()
      manager.applyPreset('sec_works', {
        bloom: 0.4,
        vignette: 0.2,
        grain: 0.2,
        chromatic: 0.3,
      } satisfies SectionPostParams)

      const state = manager as unknown as {
        current: { bloom: number; chromatic: number; refract: number; border: number }
      }
      expect(state.current.bloom).toBeCloseTo(0.2) // 0.4 × budget 0.5
      expect(state.current.chromatic).toBeCloseTo(0.15) // 0.3 × budget 0.5
      // Look channels omitted by the section stay at their neutral defaults.
      expect(state.current.refract).toBe(0)
      expect(state.current.border).toBe(0)
      expect(scale).toHaveBeenCalled()
    } finally {
      scale.mockRestore()
      capability.tier = previousTier
    }
  })
})
