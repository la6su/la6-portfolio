import { describe, it, expect } from 'vitest'
import {
  INITIAL_BOOTSTRAP_STATE,
  canTransition,
  tryTransition,
  type BootstrapState,
} from '../core/bootstrapStates'

describe('bootstrap state machine', () => {
  it('the happy path advances one documented step at a time', () => {
    const happyPath: BootstrapState[] = [
      'shell-painted',
      'app-loading',
      'renderer-initializing',
      'scene-prewarming',
      'ready',
      'entered',
    ]
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(canTransition(happyPath[i]!, happyPath[i + 1]!)).toBe(true)
      expect(tryTransition(happyPath[i]!, happyPath[i + 1]!)).toBe(happyPath[i + 1])
    }
  })

  it('no happy-path step may be skipped', () => {
    expect(canTransition('shell-painted', 'renderer-initializing')).toBe(false)
    expect(canTransition('app-loading', 'ready')).toBe(false)
    expect(canTransition('scene-prewarming', 'entered')).toBe(false)
    expect(tryTransition('app-loading', 'ready')).toBeNull()
  })

  it('every initialization state may fall to failed', () => {
    for (const state of [
      'shell-painted',
      'app-loading',
      'renderer-initializing',
      'scene-prewarming',
    ] as const) {
      expect(canTransition(state, 'failed')).toBe(true)
    }
  })

  it('device loss after ready or entered returns to the explicit failed state', () => {
    expect(canTransition('ready', 'failed')).toBe(true)
    expect(canTransition('entered', 'failed')).toBe(true)
  })

  it('a retry restarts the sequence from app-loading (the shell is already painted)', () => {
    expect(canTransition('failed', 'app-loading')).toBe(true)
    expect(tryTransition('failed', 'app-loading')).toBe('app-loading')
    // ...and the re-entry then proceeds through the normal initialization
    // steps — a retry is not a jump to ready.
    expect(canTransition('failed', 'ready')).toBe(false)
    expect(canTransition('failed', 'renderer-initializing')).toBe(false)
    expect(canTransition('failed', 'shell-painted')).toBe(false)
  })

  it('terminal-ish transitions are closed off', () => {
    expect(canTransition('entered', 'ready')).toBe(false)
    expect(canTransition('entered', 'app-loading')).toBe(false)
    expect(canTransition('ready', 'ready')).toBe(false)
    for (const state of [
      'shell-painted',
      'app-loading',
      'renderer-initializing',
      'scene-prewarming',
      'ready',
      'entered',
      'failed',
    ] as const) {
      expect(tryTransition(state, state)).toBeNull()
    }
  })

  it('the entry state is the painted shell', () => {
    expect(INITIAL_BOOTSTRAP_STATE).toBe('shell-painted')
  })
})
