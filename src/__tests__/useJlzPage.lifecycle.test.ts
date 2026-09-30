import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const uiKitUpdate = vi.hoisted(() => vi.fn())
vi.mock('uikit', () => ({ default: { update: uiKitUpdate } }))

import { useJlzPage } from '../app/useJlzPage'

describe('useJlzPage idle UIkit lifecycle', () => {
  it('cancels the deferred update when the route root unmounts', async () => {
    let idleCallback: IdleRequestCallback | undefined
    const cancelIdleCallback = vi.fn()
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        idleCallback = callback
        return 1
      },
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: cancelIdleCallback,
    })
    uiKitUpdate.mockClear()

    const Root = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        useJlzPage('contact', () => root.value)
        return () => h('main', { ref: root })
      },
    })
    const host = document.createElement('div')
    const app = createApp(Root)
    app.mount(host)
    await nextTick()
    expect(uiKitUpdate).toHaveBeenCalledTimes(1)

    app.unmount()
    expect(cancelIdleCallback).toHaveBeenCalledWith(1)
    idleCallback?.(0 as unknown as IdleDeadline)
    expect(uiKitUpdate).toHaveBeenCalledTimes(1)
  })

  it('runs the deferred update while the route root remains mounted', async () => {
    let idleCallback: IdleRequestCallback | undefined
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        idleCallback = callback
        return 2
      },
    })
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: vi.fn(),
    })
    uiKitUpdate.mockClear()

    const Root = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        useJlzPage('contact', () => root.value)
        return () => h('main', { ref: root })
      },
    })
    const host = document.createElement('div')
    const app = createApp(Root)
    app.mount(host)
    await nextTick()
    idleCallback?.(0 as unknown as IdleDeadline)
    expect(uiKitUpdate).toHaveBeenCalledTimes(2)
    app.unmount()
  })

  it('cancels the deferred route announcement when the route root unmounts', async () => {
    let animationCallback: FrameRequestCallback | undefined
    const cancelAnimationFrame = vi.fn()
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        animationCallback = callback
        return 7
      },
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      value: cancelAnimationFrame,
    })
    const announcer = document.createElement('p')
    announcer.id = 'jlz-route-announcer'
    document.body.append(announcer)
    document.title = 'Contact'

    const Root = defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        useJlzPage('contact', () => root.value)
        return () => h('main', { ref: root })
      },
    })
    const host = document.createElement('div')
    const app = createApp(Root)
    app.mount(host)
    await nextTick()

    app.unmount()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7)
    animationCallback?.(0)
    expect(announcer.textContent).toBe('')
    announcer.remove()
  })
})
