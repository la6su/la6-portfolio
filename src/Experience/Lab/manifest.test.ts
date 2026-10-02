import { beforeEach, describe, expect, it, vi } from 'vitest'

const labGamepad = vi.hoisted(() => ({ construct: vi.fn() }))

vi.mock('../World/LabGamepad', () => ({
  LabGamepad: class {
    constructor() {
      labGamepad.construct()
      return {}
    }
  },
}))

import { getLabExperiment } from './manifest'

describe('Lab experiment loading', () => {
  beforeEach(() => labGamepad.construct.mockClear())

  it('does not construct GPU resources after its route request is retired', async () => {
    let isCurrent = true
    const loading = getLabExperiment('lab')!.load(() => isCurrent)
    isCurrent = false

    await expect(loading).resolves.toBeNull()
    expect(labGamepad.construct).not.toHaveBeenCalled()
  })
})
