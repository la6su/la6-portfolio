import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Cursor } from '../Experience/Cursor'

// Phase 7 (ADR 0004): the single loop driver stops after the settled frame.
// The cursor spring keeps moving even when the scene is settled, so the
// settle decision reads Cursor.isSettled. These tests lock the predicate:
// it is true exactly when every animated cursor value (spring position,
// radius, click bump, hover fill) has converged on its goal.

/** Run `frames` cursor frames, recording isSettled after each one. */
function stepCursor(cursor: Cursor, frames: number): boolean[] {
  const history: boolean[] = []
  for (let i = 0; i < frames; i++) {
    cursor.update()
    history.push(cursor.isSettled)
  }
  return history
}

describe('Cursor.isSettled (Phase 7 loop-settle predicate)', () => {
  let cursor: Cursor

  beforeEach(() => {
    cursor = new Cursor()
  })

  afterEach(() => {
    cursor.destroy()
  })

  it('is settled in the initial rest state (spring at rest, radius/bump/fill at goals)', () => {
    expect(cursor.isSettled).toBe(true)
  })

  it('reports unsettled after a pointer move and converges back to settled', () => {
    let wakes = 0
    cursor.onActivity = () => {
      wakes++
    }
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 640, clientY: 360, bubbles: true }))
    // The pointer move is a typed loop wake source — exactly one wake, even
    // though the event itself carries no frame.
    expect(wakes).toBe(1)
    expect(cursor.isSettled).toBe(false)
    const history = stepCursor(cursor, 200)
    expect(history[0]).toBe(false) // still moving on the first frame
    expect(history[history.length - 1]).toBe(true) // the spring converges
  })

  it('follows the stuck (magnetic) goal, not the raw pointer, once stuck', () => {
    const c = cursor as unknown as {
      isStuck: boolean
      stuckX: number
      stuckY: number
      posX: number
    }
    c.isStuck = true
    c.stuckX = 400
    c.stuckY = 300
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 900, clientY: 700, bubbles: true }))
    // While stuck the radius target flips baseRadius→targetRadius and lerps.
    const history = stepCursor(cursor, 300)
    expect(history[history.length - 1]).toBe(true)
    expect(Math.abs(c.posX - c.stuckX)).toBeLessThan(0.5) // converged on the stuck goal
    expect(Math.abs(c.posX - 900)).toBeGreaterThan(0.5) // NOT on the raw pointer
  })

  it('stays unsettled while the click bump / hover fill lerps are running', () => {
    const c = cursor as unknown as { fillTarget: number; bumpScale: number }
    c.fillTarget = 1
    c.bumpScale = 0.6
    expect(cursor.isSettled).toBe(false)
    const history = stepCursor(cursor, 200)
    expect(history[history.length - 1]).toBe(true)
  })

  it('fires onActivity for move / hover / leave events (the loop wake sources)', () => {
    let wakes = 0
    cursor.onActivity = () => {
      wakes++
    }
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(wakes).toBe(3)
  })

  it('wakes a settled loop for the click bump animation', () => {
    let wakes = 0
    cursor.onActivity = () => {
      wakes++
    }
    expect(cursor.isSettled).toBe(true)
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(wakes).toBe(1)
    expect(cursor.isSettled).toBe(false)
    stepCursor(cursor, 200)
    expect(cursor.isSettled).toBe(true)
  })

  it('stays settled across idle frames (no phantom wake)', () => {
    const history = stepCursor(cursor, 120)
    expect(history.every((s) => s)).toBe(true)
  })

  it('redraws once after a theme cache refresh, then stays idle', () => {
    const drawCircle = vi.spyOn(cursor as unknown as { drawCircle: () => void }, 'drawCircle')
    cursor.update()
    drawCircle.mockClear()

    cursor.refreshThemeCache()
    cursor.update()
    expect(drawCircle).toHaveBeenCalledOnce()

    cursor.update()
    expect(drawCircle).toHaveBeenCalledOnce()
  })

  it('becomes terminal and ignores late frames after teardown', () => {
    let wakes = 0
    cursor.onActivity = () => {
      wakes++
    }
    cursor.destroy()
    cursor.destroy()

    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    cursor.update()

    expect(wakes).toBe(0)
    expect(cursor.isSettled).toBe(true)
  })
})
