import { describe, expect, it } from 'vitest'
import { Section, SectionState } from '../core/Section'
import { getWorldConfigForPage } from '../core/WorldConfig'

describe('Section lifecycle', () => {
  it('ignores state transitions after dispose', () => {
    const section = new Section(getWorldConfigForPage('home')[1]!, 1)

    section.dispose()
    section.dispose()
    section.switchState(SectionState.VIEWING)
    section.forceState(SectionState.PASSED)

    expect(section.state).toBe(SectionState.READY)
  })

  it('flips the state exactly one duration after the first switchState', () => {
    const section = new Section(getWorldConfigForPage('home')[1]!, 1)

    section.switchState(SectionState.VIEWING, 0.8)
    expect(section.state).toBe(SectionState.READY)

    section.update(0.4)
    expect(section.state).toBe(SectionState.READY)

    section.update(0.4)
    expect(section.state).toBe(SectionState.VIEWING)
  })

  it('keeps the first deadline when scroll re-triggers the same target', () => {
    // updateTransform() calls switchState every frame while the state still
    // reads READY — restarting the deadline per frame would defer the flip
    // indefinitely (the StateBus artifact this replaced).
    const section = new Section(getWorldConfigForPage('home')[1]!, 1)

    section.switchState(SectionState.VIEWING, 0.8)
    for (let frame = 0; frame < 100; frame++) {
      section.switchState(SectionState.VIEWING, 0.8)
      section.update(1 / 60)
    }
    expect(section.state).toBe(SectionState.VIEWING)
  })

  it('flips instantly under reduced motion and ignores a stale pending flip', () => {
    const section = new Section(getWorldConfigForPage('home')[1]!, 1)

    section.switchState(SectionState.VIEWING, 0.8, true)
    expect(section.state).toBe(SectionState.VIEWING)
  })

  it('forceState cancels a pending flip', () => {
    const section = new Section(getWorldConfigForPage('home')[1]!, 1)

    section.switchState(SectionState.VIEWING, 0.8)
    section.forceState(SectionState.PASSED)
    section.update(0.8)
    expect(section.state).toBe(SectionState.PASSED)
  })
})
