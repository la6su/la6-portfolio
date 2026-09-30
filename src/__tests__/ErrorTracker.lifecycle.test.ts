import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorTracker } from '../core/ErrorTracker'

describe('ErrorTracker listener lifecycle', () => {
  afterEach(() => {
    ErrorTracker.dispose()
    vi.restoreAllMocks()
  })

  it('removes the window error listener and permits one clean re-init', () => {
    const report = vi.spyOn(ErrorTracker, 'report')
    ErrorTracker.init()

    window.dispatchEvent(new ErrorEvent('error', { message: 'first failure' }))
    ErrorTracker.dispose()
    window.dispatchEvent(new ErrorEvent('error', { message: 'after dispose' }))

    ErrorTracker.init()
    window.dispatchEvent(new ErrorEvent('error', { message: 'second failure' }))

    expect(report).toHaveBeenCalledTimes(2)
    expect(report.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ message: 'first failure' }))
    expect(report.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ message: 'second failure' }),
    )
  })

  it('keeps init idempotent while active', () => {
    const report = vi.spyOn(ErrorTracker, 'report')
    ErrorTracker.init()
    ErrorTracker.init()

    window.dispatchEvent(new ErrorEvent('error', { message: 'one listener' }))

    expect(report).toHaveBeenCalledOnce()
  })
})
