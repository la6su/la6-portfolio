import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getCurrentPage, setCurrentPage } from '../core/routePage'

describe('typed route page port', () => {
  beforeEach(() => {
    setCurrentPage('home')
  })

  afterEach(() => {
    document.body.removeAttribute('data-page')
  })

  it('reads the typed page published by the router', () => {
    for (const page of ['home', 'services', 'works', 'manifesto', 'lab', 'contact'] as const) {
      setCurrentPage(page)
      expect(getCurrentPage()).toBe(page)
    }
  })

  it('keeps route state independent from DOM datasets', () => {
    setCurrentPage('works')
    document.body.setAttribute('data-page', 'contact')
    expect(getCurrentPage()).toBe('works')
  })
})
