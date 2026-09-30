import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('route layout ownership', () => {
  it('uses Vue-owned route roots instead of the data-page compatibility projection', () => {
    const less = readFileSync(resolve(process.cwd(), 'src/assets/main.less'), 'utf8')

    expect(less).toContain("#spa-content[data-page-view='home']")
    expect(less).toContain('#spa-content > .jlz-page')
    expect(less).not.toContain("body[data-page='home'] #spa-content")
    expect(less).not.toContain("body:not([data-page='home']) #spa-content > .jlz-page")

    const shell = readFileSync(resolve(process.cwd(), 'src/assets/components/_shell.less'), 'utf8')
    expect(shell).toContain("#spa-content[data-page-view='content']")
    expect(shell).not.toContain("body:not([data-page='home']) #spa-content")
  })
})
