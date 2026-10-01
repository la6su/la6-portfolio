import { describe, expect, it } from 'vitest'
import { DEFAULT_BUILDER_DOCUMENT } from './default-document'
import { renderBuilderPageDocument } from './publish'

describe('published builder metadata', () => {
  it('uses the supplied site origin for canonical and social image URLs', () => {
    const html = renderBuilderPageDocument(
      DEFAULT_BUILDER_DOCUMENT,
      '<p>Studio</p>',
      'https://staging.example.test/',
    )

    expect(html).toContain(
      '<link rel="canonical" href="https://staging.example.test/p/studio-page" />',
    )
    expect(html).toContain('property="og:image" content="https://staging.example.test/preview.jpg"')
    expect(html).toContain(
      'property="og:image:secure_url" content="https://staging.example.test/preview.jpg"',
    )
    expect(html).toContain('name="twitter:image" content="https://staging.example.test/preview.jpg"')
    expect(html).not.toContain('https://justlovejazz.dev/preview.jpg')
  })
})
