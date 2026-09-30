import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { withNoToneMapping } from '../core/toneMappingGuard'

describe('withNoToneMapping', () => {
  it('restores the renderer state after a successful operation', () => {
    const renderer = { toneMapping: THREE.ACESFilmicToneMapping }
    const result = withNoToneMapping(renderer, () => renderer.toneMapping)

    expect(result).toBe(THREE.NoToneMapping)
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
  })

  it('restores the renderer state when graph construction throws', () => {
    const renderer = { toneMapping: THREE.ACESFilmicToneMapping }

    expect(() =>
      withNoToneMapping(renderer, () => {
        throw new Error('graph build failed')
      }),
    ).toThrow('graph build failed')
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping)
  })
})
