// PointerInkStage base lifecycle — the shared shell both ink voices
// (ContactHaloStage, ManifestoInkStage) used to test through their own
// subclasses. The shell owns the reveal damp, the damped pointer chase with
// energy decay, reduced-motion settling, the disposed guard and the
// refcounted plane geometry; this suite pins it once through a minimal
// harness voice. Per-voice contracts (the theme tints) stay in the
// ContactHaloStage/ManifestoInkStage files.

import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const motion = vi.hoisted(() => ({ reduced: false }))

vi.mock('../../core/motionPolicy', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

// The shell reads the shared Input singleton; stub its mouse so pointer
// tests are deterministic in jsdom.
const mouseMock = vi.hoisted(() => ({ x: 0, y: 0 }))

vi.mock('../Experience/Input', () => ({
  input: {
    getMouse: () => mouseMock,
  },
}))

import { PointerInkStage } from '../Experience/World/PointerInkStage'

/** Minimal voice: the whole shell contract, none of the art. The planeSize
 *  key is unique to this file so the shared-geometry map never collides with
 *  the voice suites running in the same worker. */
class HarnessInkStage extends PointerInkStage {
  constructor() {
    super({
      stageName: 'harness-ink-stage',
      meshName: 'harness-ink',
      meshPosition: [0, 0, -2],
      planeSize: [1.5, 1],
      peakOpacity: 0.2,
      tints: [0x112233, 0x445566],
      focusScale: [0.5, 0.25],
      damping: { rise: 8, decay: 1.2, chase: 2.2 },
      // The placeholder art uses the same cast idiom as the real voices
      // (their chains funnel through `(smoothstep as any)` — the config's
      // declared return type is stricter than what TSL math ops return).
      inkField: (({ energy }: { energy: { max(n: number): unknown } }) =>
        energy.max(0.0)) as ConstructorParameters<typeof PointerInkStage>[0]['inkField'],
    })
  }
}

describe('PointerInkStage shell lifecycle', () => {
  beforeEach(() => {
    motion.reduced = false
    mouseMock.x = 0
    mouseMock.y = 0
  })

  it('stays hidden and inert until activated', () => {
    const stage = new HarnessInkStage()
    expect(stage.visible).toBe(false)
    expect(stage.isAnimating).toBe(false)

    stage.update(1 / 60)
    expect(stage.isAnimating).toBe(false)
    stage.dispose()
  })

  it('reveals with a damp, reports ambient motion while active, and hides on deactivate', () => {
    const stage = new HarnessInkStage()
    stage.setActive(true)
    expect(stage.visible).toBe(true)

    stage.update(0.1)
    const reveal = (stage as unknown as { reveal: number }).reveal
    expect(reveal).toBeGreaterThan(0)
    expect(reveal).toBeLessThan(1)
    expect(stage.isAnimating).toBe(true)

    // Settle the reveal (exponential damp asymptote).
    for (let i = 0; i < 200; i++) stage.update(1 / 60)
    expect((stage as unknown as { reveal: number }).reveal).toBeGreaterThan(0.999)

    stage.setActive(false)
    expect(stage.visible).toBe(false)
    expect(stage.isAnimating).toBe(false)
    // The next visit starts from a clean transparent state.
    expect((stage as unknown as { reveal: number }).reveal).toBe(0)
    stage.dispose()
  })

  it('chases the pointer and decays energy at rest', () => {
    const stage = new HarnessInkStage()
    stage.setActive(true)

    mouseMock.x = 1
    mouseMock.y = 0.5
    stage.update(1 / 60)

    const pointer = (stage as unknown as { _pointerUni: { value: THREE.Vector2 } })._pointerUni
      .value
    expect(pointer.x).toBeGreaterThan(0)
    expect(pointer.y).toBeGreaterThan(0)

    const energy = () => (stage as unknown as { energy: number }).energy
    expect(energy()).toBeGreaterThan(0)

    // Pointer rests: energy must decay toward zero, not freeze.
    for (let i = 0; i < 120; i++) stage.update(1 / 60)
    expect(energy()).toBeLessThan(0.01)

    stage.dispose()
  })

  it('keeps uniforms settled under reduced motion and refuses new pointer energy', () => {
    const stage = new HarnessInkStage()
    stage.setActive(true)
    motion.reduced = true
    stage.setReducedMotion(true)

    const snapshot = () => {
      const s = stage as unknown as {
        energy: number
        reveal: number
        _timeUni: { value: number }
        _pointerUni: { value: THREE.Vector2 }
      }
      return {
        energy: s.energy,
        reveal: s.reveal,
        time: s._timeUni.value,
        pointer: `${s._pointerUni.value.x},${s._pointerUni.value.y}`,
      }
    }

    stage.update(1 / 60)
    const settled = snapshot()
    expect(settled.energy).toBe(0)
    expect(settled.time).toBe(0)
    expect(settled.pointer).toBe('0,0')

    mouseMock.x = 0.8
    mouseMock.y = -0.4
    stage.update(1 / 60)
    expect(snapshot()).toEqual(settled)
    expect(stage.isAnimating).toBe(false)

    stage.dispose()
  })

  it('ignores mutations after dispose', () => {
    const stage = new HarnessInkStage()
    stage.setActive(true)
    stage.update(0.5)
    const revealAtDispose = (stage as unknown as { reveal: number }).reveal
    expect(revealAtDispose).toBeGreaterThan(0)
    stage.dispose()

    stage.setTheme(true)
    stage.setActive(true)
    stage.setReducedMotion(true)
    stage.update(1 / 60)

    // Frozen at the disposed state: no mutation resurrects the animation or
    // advances the damp.
    expect(stage.isAnimating).toBe(false)
    expect((stage as unknown as { reveal: number }).reveal).toBe(revealAtDispose)
  })

  it('releases shared geometry with the final stage owner', () => {
    const first = new HarnessInkStage()
    const second = new HarnessInkStage()
    const mesh = first.getObjectByName('harness-ink') as THREE.Mesh
    const materialDispose = vi.spyOn(mesh.material as THREE.Material, 'dispose')
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose')

    first.dispose()
    first.dispose()
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(geometryDispose).not.toHaveBeenCalled()

    second.dispose()
    expect(geometryDispose).toHaveBeenCalledTimes(1)
  })
})
