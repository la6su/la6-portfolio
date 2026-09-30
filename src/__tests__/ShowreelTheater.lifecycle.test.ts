import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

import { ShowreelTheater } from '../Experience/World/ShowreelTheater'
import { eventBus } from '../core/EventBus'
import type { ShowreelState } from '../Experience/World/ShowreelTheater'

const FPS = 1 / 60

/** Advance the theater through real time with 60 Hz steps. */
function runFor(theater: ShowreelTheater, seconds: number): void {
  const steps = Math.round(seconds / FPS)
  for (let i = 0; i < steps; i++) theater.update(FPS, 16 / 9)
}

describe('ShowreelTheater lifecycle', () => {
  let states: ShowreelState[]
  let unsub: () => void

  beforeEach(() => {
    motion.reduced = false
    states = []
    unsub = eventBus.on('jlz:showreel-state', (state) => states.push({ ...state }))
  })

  afterEach(() => {
    unsub()
    document.body.innerHTML = ''
  })

  it('stays closed and inert until opened', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    expect(theater.currentPhase).toBe('closed')
    expect(theater.isAnimating).toBe(false)
    // A closed theater ignores frames.
    expect(() => theater.update(FPS, 16 / 9)).not.toThrow()
    expect(theater.currentPhase).toBe('closed')
    theater.dispose()
  })

  it('enters through a transition, settles open, and exits back to closed', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    expect(theater.currentPhase).toBe('enter')
    expect(theater.isAnimating).toBe(true)

    // Mid-transition the phase is still entering and the transition keeps
    // raising render demand.
    runFor(theater, 0.5)
    expect(theater.currentPhase).toBe('enter')

    // The enter duration is 1.05 s — a full second of frames settles it.
    runFor(theater, 0.75)
    expect(theater.currentPhase).toBe('open')
    // Video is paused in jsdom → an open, paused theater needs no frames.
    expect(theater.isAnimating).toBe(false)

    theater.close()
    expect(theater.currentPhase).toBe('exit')
    expect(theater.isAnimating).toBe(true)

    runFor(theater, 0.8)
    expect(theater.currentPhase).toBe('closed')
    expect(theater.isAnimating).toBe(false)
    theater.dispose()
  })

  it('publishes its state over the typed bus (closed → enter → open → exit → closed)', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    runFor(theater, 1.2)
    theater.close()
    runFor(theater, 0.8)
    const phases = states.map((s) => s.phase)
    expect(phases[0]).toBe('closed')
    expect(phases).toContain('enter')
    expect(phases).toContain('open')
    expect(phases).toContain('exit')
    expect(phases[phases.length - 1]).toBe('closed')
    theater.dispose()
  })

  it('snaps instantly under reduced motion', () => {
    motion.reduced = true
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    expect(theater.currentPhase).toBe('open')
    expect(theater.isAnimating).toBe(false)
    theater.close()
    expect(theater.currentPhase).toBe('closed')
    theater.dispose()
  })

  it('a live preference change settles an open theater synchronously', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    runFor(theater, 0.3)
    expect(theater.currentPhase).toBe('enter')
    theater.setReducedMotion(true)
    expect(theater.currentPhase).toBe('open')
    expect(theater.isAnimating).toBe(false)
    theater.close()
    expect(theater.currentPhase).toBe('closed')
    theater.dispose()
  })

  it('keeps continuous progress when re-opening mid-exit', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    runFor(theater, 1.2)
    expect(theater.currentPhase).toBe('open')
    theater.close()
    runFor(theater, 0.2)
    expect(theater.currentPhase).toBe('exit')
    theater.open()
    expect(theater.currentPhase).toBe('enter')
    // The transition resumes instead of flashing back to the dark field.
    runFor(theater, 1.2)
    expect(theater.currentPhase).toBe('open')
    theater.dispose()
  })

  it('reports activity while the video plays', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    runFor(theater, 1.2)
    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    let paused = false
    Object.defineProperty(video!, 'paused', { get: () => paused, configurable: true })
    expect(theater.isAnimating).toBe(true)
    paused = true
    expect(theater.isAnimating).toBe(false)
    theater.dispose()
  })

  it('assigns the source only once across repeated opens', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    runFor(theater, 1.2)
    const video = document.querySelector('video')!
    expect(video.getAttribute('src')).toBe('/assets/video/coming-soon.mp4')
    theater.close()
    runFor(theater, 0.8)
    theater.open()
    expect(document.querySelectorAll('video').length).toBe(1)
    theater.dispose()
  })

  it('disposes the video element and detaches from the bus', () => {
    const theater = new ShowreelTheater('/assets/video/coming-soon.mp4', '/poster.jpg')
    theater.open()
    theater.dispose()
    expect(theater.currentPhase).toBe('closed')
    expect(theater.isAnimating).toBe(false)
    expect(document.querySelectorAll('video').length).toBe(0)
    const before = states.length
    // A disposed owner no longer publishes state.
    theater.open()
    expect(states.length).toBe(before)
  })
})
