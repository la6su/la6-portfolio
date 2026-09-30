import { describe, it, expect } from 'vitest'
import { maxDprForMode } from '../core/DeviceCapability'

// The pure DPR-cap contract shared by the DeviceCapability singleton and the
// SceneHost's live TresCanvas `:dpr` prop. Both DPR writers (Tres size
// manager + Renderer owner) derive from this one function; a divergence let
// Tres re-apply the stale boot cap after every resize on the mobile
// WebGL-fallback path (Inspection 12).
describe('maxDprForMode — per-mode fill-rate cap', () => {
  it('caps WebGPU at 1.5 regardless of device class', () => {
    expect(maxDprForMode('webgpu', false)).toBe(1.5)
    expect(maxDprForMode('webgpu', true)).toBe(1.5)
  })

  it('caps WebGL at 1 on mobile and 1.5 on desktop', () => {
    expect(maxDprForMode('webgl', true)).toBe(1)
    expect(maxDprForMode('webgl', false)).toBe(1.5)
  })

  it('caps unsupported at 1', () => {
    expect(maxDprForMode('unsupported', false)).toBe(1)
    expect(maxDprForMode('unsupported', true)).toBe(1)
  })
})
