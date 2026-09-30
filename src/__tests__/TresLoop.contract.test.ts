import { TresCanvas, useLoop } from '@tresjs/core'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createRendererMock, installCanvasPointerShims } from './tresHarness'

type TresReadyContext = {
  renderer: {
    advance(): void
    invalidate(): void
    loop: { start(): void; stop(): void }
  }
}

const LoopProbe = defineComponent({
  props: { onTick: { type: Function, required: true } },
  setup(props) {
    useLoop().onBeforeRender(() => props.onTick())
    return () => null
  },
})

async function mountCanvas(renderMode: 'manual' | 'on-demand') {
  const renderer = createRendererMock()
  const ready = { context: null as TresReadyContext | null }
  const ticks = vi.fn()
  const wrapper = mount(TresCanvas, {
    attachTo: document.body,
    props: {
      renderMode,
      renderer: (() => renderer) as never,
      onReady: (context: TresReadyContext) => {
        ready.context = context
        context.renderer.loop.stop()
      },
    },
    slots: { default: () => h(LoopProbe, { onTick: ticks }) },
  })
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  if (!ready.context) throw new Error('TresCanvas did not become ready')
  return { wrapper, renderer, context: ready.context, ticks }
}

describe('TresJS 5.9 loop contract', () => {
  beforeAll(() => {
    installCanvasPointerShims()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it('does not render a manual frame when advance() is called after the internal RAF is stopped', async () => {
    const { wrapper, renderer, context } = await mountCanvas('manual')

    context.renderer.advance()
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(renderer.render).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not render an on-demand frame when invalidate() is called after the internal RAF is stopped', async () => {
    const { wrapper, renderer, context } = await mountCanvas('on-demand')

    context.renderer.invalidate()
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(renderer.render).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('runs useLoop callbacks while a manual RAF is active even without a pending draw', async () => {
    const { wrapper, context, ticks } = await mountCanvas('manual')
    const beforeStart = ticks.mock.calls.length

    context.renderer.loop.start()
    await new Promise((resolve) => setTimeout(resolve, 30))
    context.renderer.loop.stop()

    expect(ticks.mock.calls.length).toBeGreaterThan(beforeStart)
    wrapper.unmount()
  })
})
