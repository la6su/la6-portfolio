import { afterEach, describe, expect, it, vi } from 'vitest'
import { devDiagnostic } from '../../../src/core/devDiagnostic'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('development diagnostics', () => {
  it('writes details at the selected level in development', () => {
    vi.stubEnv('DEV', true)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const details = { backend: 'WebGPUBackend' }

    devDiagnostic('info', '[Renderer]', details)

    expect(info).toHaveBeenCalledWith('[Renderer]', details)
  })

  it('does not write development details in production', () => {
    vi.stubEnv('DEV', false)
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

    devDiagnostic('debug', 'scene snapshot')

    expect(debug).not.toHaveBeenCalled()
  })
})
