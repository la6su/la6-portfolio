import { describe, expect, it } from 'vitest'
import { EnvSphere, PAVILION_SURFACES } from '../../../../src/Experience/World/EnvSphere'

describe('declarative pavilion owner', () => {
  it('exposes five declarative surfaces and their shared material owner', () => {
    const pavilion = new EnvSphere()

    expect(PAVILION_SURFACES.map(({ name }) => name)).toEqual([
      'pavilion-back',
      'pavilion-left',
      'pavilion-right',
      'pavilion-ceiling',
      'pavilion-floor',
    ])
    expect(Object.keys(pavilion.materials)).toEqual(['back', 'left', 'right', 'ceiling', 'floor'])
    expect(pavilion.materials.back.color.getHex()).toBe(0x0b0e14)

    pavilion.dispose()
  })

  it('settles a section palette transition through the runtime controller', () => {
    const pavilion = new EnvSphere()
    pavilion.changeSection(4, true)

    expect(pavilion.isAnimating).toBe(true)
    for (let frame = 0; frame < 40; frame++) pavilion.update(0.1)

    expect(pavilion.isAnimating).toBe(false)
    expect(pavilion.materials.back.color.getHex()).toBe(0xe3ecf3)
    pavilion.dispose()
  })
})
