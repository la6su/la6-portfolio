import { describe, expect, it } from 'vitest'
import { sharedThreeAsset } from '../../scripts/build-assets'

describe('shared Three delivery', () => {
  it('ignores Contact addons and source maps regardless of directory order', () => {
    const assets = [
      'vendor-three-contact-geometry-abc.js',
      'vendor-three-contact-loaders-def.js',
      'vendor-three-ghi.js.map',
      'vendor-three-ghi.js',
      'vendor-ui-jkl.js',
    ]
    expect(sharedThreeAsset(assets)).toBe('vendor-three-ghi.js')
    expect(sharedThreeAsset(assets.reverse())).toBe('vendor-three-ghi.js')
  })

  it('rejects missing and ambiguous build output instead of reporting the wrong chunk', () => {
    expect(() => sharedThreeAsset(['vendor-three-contact-loaders-abc.js'])).toThrow('found 0')
    expect(() => sharedThreeAsset(['vendor-three-old.js', 'vendor-three-new.js'])).toThrow(
      'found 2',
    )
  })
})
