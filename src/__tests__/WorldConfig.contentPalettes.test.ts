import { describe, expect, it } from 'vitest'
import { getWorldConfigForPage } from '../core/WorldConfig'

// The content palettes carry each route's authored post voice (commit
// "author per-route post palettes"): restrained bloom + ink-tinted grade
// channels crossfaded by the shared PostProcessingManager. These invariants
// keep the voices inside the brand language bounds — the post graph only
// runs on native WebGPU, but the values must stay polish, never the content
// carrier, and home's authored scenes must remain untouched.

const HOME_PEAK_BLOOM = 0.4 // sec_about — the authored brand peak
const CONTENT_PAGES = ['services', 'works', 'manifesto', 'lab', 'contact'] as const

describe('WorldConfig content post palettes', () => {
  it('authors a bounded, non-zero bloom voice for every content page', () => {
    for (const page of CONTENT_PAGES) {
      const scenes = getWorldConfigForPage(page)
      expect(scenes).toHaveLength(6)
      expect(scenes.every((scene) => scene.theme === 'dark')).toBe(true)
      for (const scene of scenes) {
        expect(scene.post.bloom).toBeGreaterThan(0)
        expect(scene.post.bloom).toBeLessThanOrEqual(HOME_PEAK_BLOOM)
      }
    }
  })

  it('tints the grade channels per page and keeps them in the authored band', () => {
    const tints = new Set<string>()
    for (const page of CONTENT_PAGES) {
      const scenes = getWorldConfigForPage(page)
      for (const scene of scenes) {
        for (const channel of [...scene.post.gradeShadows, ...scene.post.gradeHighlights]) {
          // Conservative multipliers — a grade must tint, never blow out.
          expect(channel).toBeGreaterThanOrEqual(0.5)
          expect(channel).toBeLessThanOrEqual(1.5)
        }
        // Every content page voices a non-neutral shadow tint.
        expect(scene.post.gradeShadows).not.toEqual([1, 1, 1])
      }
      tints.add(scenes[0]!.post.gradeShadows.join(','))
    }
    // Each page has its own voice — no shared preset.
    expect(tints.size).toBe(CONTENT_PAGES.length)
  })

  it('keeps the page voice coherent across its six story slots', () => {
    for (const page of CONTENT_PAGES) {
      const scenes = getWorldConfigForPage(page)
      const bloom = scenes[0]!.post.bloom
      for (const scene of scenes) expect(scene.post.bloom).toBe(bloom)
    }
  })

  it('leaves the home scenes untouched', () => {
    const home = getWorldConfigForPage('home')
    const about = home.find((scene) => scene.id === 'sec_about')
    expect(about?.post.bloom).toBe(HOME_PEAK_BLOOM)
    const menu = home.find((scene) => scene.id === 'sec_menu')
    expect(menu?.post.gradeShadows).toEqual([0.82, 0.84, 1.0])
    expect(menu?.post.gradeHighlights).toEqual([1.0, 0.98, 0.72])
  })
})
