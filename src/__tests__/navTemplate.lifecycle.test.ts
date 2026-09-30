import { afterEach, describe, expect, it } from 'vitest'
import { initMenuLifecycle } from '../app/menuLifecycle'

describe('flat menu lifecycle', () => {
  afterEach(() => document.body.replaceChildren())

  it('updates the decorative preview for the active menu only', () => {
    const root = document.createElement('main')
    root.id = 'spa-content'
    root.innerHTML = `
      <div class="jlz-menu-preview"><span class="jlz-menu-preview__number"></span><span class="jlz-menu-preview__label"></span></div>
      <ul class="jlz-menu-nav">
        <li><a class="jlz-menu-nav__toggle"><span class="jlz-menu-nav__num">01</span><span class="jlz-menu-nav__label">Studio</span></a></li>
        <li><a class="jlz-menu-nav__toggle"><span class="jlz-menu-nav__num">02</span><span class="jlz-menu-nav__label">Services</span></a></li>
      </ul>`
    document.body.append(root)
    const dispose = initMenuLifecycle(root)
    const links = root.querySelectorAll<HTMLAnchorElement>('.jlz-menu-nav__toggle')
    links[1]!.dispatchEvent(new FocusEvent('focus'))
    expect(root.querySelector('.jlz-menu-preview__number')?.textContent).toBe('02')
    expect(root.querySelector('.jlz-menu-preview__label')?.textContent).toBe('Services')
    dispose()
  })

  it('removes preview listeners when the route root is disposed', () => {
    const root = document.createElement('main')
    root.innerHTML = `
      <div class="jlz-menu-preview"><span class="jlz-menu-preview__number"></span><span class="jlz-menu-preview__label"></span></div>
      <ul class="jlz-menu-nav"><li><a class="jlz-menu-nav__toggle"><span class="jlz-menu-nav__num">01</span><span class="jlz-menu-nav__label">Studio</span></a></li></ul>`
    document.body.append(root)
    const dispose = initMenuLifecycle(root)
    const link = root.querySelector<HTMLAnchorElement>('.jlz-menu-nav__toggle')!
    dispose()
    link.dispatchEvent(new FocusEvent('focus'))
    expect(root.querySelector('.jlz-menu-preview__number')?.textContent).toBe('')
    expect(root.querySelector('.jlz-menu-preview__label')?.textContent).toBe('')
  })
})
