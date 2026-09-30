import { describe, expect, it, vi } from 'vitest'
import { LabGamepad } from '../Experience/World/LabGamepad'

describe('LabGamepad lifecycle', () => {
  it('clears the child graph after releasing GPU resources', () => {
    const gamepad = new LabGamepad()
    expect(gamepad.children.length).toBeGreaterThan(0)

    const geometryDispose = vi.spyOn(
      (gamepad as unknown as { _geometries: Array<{ dispose: () => void }> })._geometries[0]!,
      'dispose',
    )
    gamepad.dispose()

    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(gamepad.children).toHaveLength(0)
    const internals = gamepad as unknown as {
      _geometries: unknown[]
      _materials: unknown[]
    }
    expect(internals._geometries).toHaveLength(0)
    expect(internals._materials).toHaveLength(0)
    expect(() => gamepad.dispose()).not.toThrow()
  })
})
