import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('../../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

// The gamepad reads the shared Input singleton; stub its mouse so pointer
// tests are deterministic in jsdom.
const mouseMock = vi.hoisted(() => ({ x: 0, y: 0 }))

vi.mock('../Experience/Input', () => ({
  input: {
    getMouse: () => mouseMock,
  },
}))

import { LabGamepad } from '../Experience/World/LabGamepad'

/** The authored display pose from LabGamepad (drift here breaks the settle). */
const AUTHORED = { x: -0.12, y: -0.24, z: 0.04 }

describe('LabGamepad motion', () => {
  beforeEach(() => {
    motion.reduced = false
    mouseMock.x = 0
    mouseMock.y = 0
  })

  it('starts at the authored pose and never advertises motion while hidden', () => {
    const gamepad = new LabGamepad()
    expect(gamepad.rotation.x).toBeCloseTo(AUTHORED.x)
    expect(gamepad.rotation.y).toBeCloseTo(AUTHORED.y)
    expect(gamepad.position.y).toBe(0)
    // Visibility is externally toggled by the coordinator's route gate; the
    // object is created visible (lab is the entry route in its test).
    gamepad.visible = false
    expect(gamepad.isAnimating).toBe(false)

    gamepad.update(1 / 60)
    // A hidden object never advances its idle clock.
    expect((gamepad as unknown as { _clock: number })._clock).toBe(0)
  })

  it('tilts toward the pointer and spins the crank only on rendered frames', () => {
    const gamepad = new LabGamepad()
    gamepad.visible = true
    expect(gamepad.isAnimating).toBe(true)

    mouseMock.x = 1
    mouseMock.y = 0.5
    gamepad.update(1 / 60)

    // Pointer at +x yaw/roll the body positively, +y pitches it negatively.
    expect(gamepad.rotation.y).toBeGreaterThan(AUTHORED.y)
    expect(gamepad.rotation.z).toBeGreaterThan(AUTHORED.z)
    expect(gamepad.rotation.x).toBeLessThan(AUTHORED.x)

    const crank = gamepad.getObjectByName('gamepad-crank') as THREE.Group
    const crankStart = crank.rotation.x
    expect(crankStart).toBeLessThan(0)
    expect((gamepad as unknown as { _clock: number })._clock).toBeGreaterThan(0)

    // The tilt is amplitude-capped: the pointer sits at the corner, yet the
    // pose stays close to the authored framing.
    expect(Math.abs(gamepad.rotation.y - AUTHORED.y)).toBeLessThanOrEqual(0.21)
    gamepad.dispose()
  })

  it('resets to the authored pose for a clean route re-entry', () => {
    const gamepad = new LabGamepad()
    gamepad.visible = true
    mouseMock.x = -0.9
    gamepad.update(1 / 60)
    expect(gamepad.rotation.y).not.toBeCloseTo(AUTHORED.y)

    gamepad.resetMotion()
    expect(gamepad.rotation.y).toBeCloseTo(AUTHORED.y)
    expect(gamepad.rotation.x).toBeCloseTo(AUTHORED.x)
    expect(gamepad.position.y).toBe(0)
    expect((gamepad as unknown as { _clock: number })._clock).toBe(0)
    gamepad.dispose()
  })

  it('settles under reduced motion, freezes the crank and refuses new motion', () => {
    const gamepad = new LabGamepad()
    gamepad.visible = true
    mouseMock.x = 0.8
    gamepad.update(1 / 60)
    const crank = gamepad.getObjectByName('gamepad-crank') as THREE.Group
    const frozenCrank = crank.rotation.x
    const clockAtSettle = (gamepad as unknown as { _clock: number })._clock

    motion.reduced = true
    gamepad.setReducedMotion(true)

    expect(gamepad.rotation.y).toBeCloseTo(AUTHORED.y)
    expect(gamepad.position.y).toBe(0)
    expect(gamepad.isAnimating).toBe(false)

    mouseMock.x = -0.6
    gamepad.update(1 / 60)
    // Settled: pointer energy is refused, the clock does not advance and the
    // crank keeps its current angle instead of jumping to a reset.
    expect(gamepad.rotation.y).toBeCloseTo(AUTHORED.y)
    expect((gamepad as unknown as { _clock: number })._clock).toBe(clockAtSettle)
    expect(crank.rotation.x).toBeCloseTo(frozenCrank)
    gamepad.dispose()
  })
})
