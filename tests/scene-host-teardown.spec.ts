import { expect, test } from '@playwright/test'

test.skip(
  process.env.JLZ_HOST_TEARDOWN_TEST !== '1',
  'Lifecycle trace hooks are available only in the dedicated Vite dev teardown run.',
)

test('DevPanel force-render wakes and sustains the Tres loop', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('jlz:devpanel'))
  await page.goto('/')
  await expect(page.locator('#jlz-splash-enter')).toHaveClass(/is-ready/, {
    timeout: 60_000,
  })

  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'd',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  )
  // Tweakpane's checkbox input has no accessible label in its DOM view; the
  // ground visibility toggle is first and force-render is the second toggle.
  const forceRender = page.locator('.tp-ckbv_i').nth(1)
  await expect(forceRender).toHaveCount(1)

  const before = await page.evaluate(() => {
    const runtime = window as Window & {
      __jlzRuntimeSnapshot?: () => { loop: { frames: number } } | null
    }
    return runtime.__jlzRuntimeSnapshot?.()?.loop.frames ?? 0
  })
  await forceRender.check({ force: true })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const runtime = window as Window & {
            __jlzRuntimeSnapshot?: () => { loop: { frames: number } } | null
          }
          return runtime.__jlzRuntimeSnapshot?.()?.loop.frames ?? 0
        }),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(before + 10)

  await forceRender.evaluate((input) => (input as HTMLInputElement).click())
})

test('SceneHost releases declared owners before disposing its renderer', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.addInitScript(() => {
    window.__jlzTestLifecycleTrace = []
  })
  await page.goto('/contact')
  await expect(page.locator('#jlz-splash-enter')).toHaveClass(/is-ready/, {
    timeout: 60_000,
  })
  for (const stage of ['ContactTypographyStage', 'ContactCyprusStage', 'ContactHaloStage']) {
    await expect
      .poll(
        () =>
          page.evaluate(
            (label) =>
              (window.__jlzTestLifecycleTrace ?? []).includes(`scene-stage:${label}:ready`),
            stage,
          ),
        { timeout: 20_000 },
      )
      .toBe(true)
  }
  await page.waitForFunction(() => typeof window.__jlzTestUnmountVueApp === 'function')

  await page.evaluate(() => window.__jlzEmit?.('jlz:showreel-open'))
  await expect(page.locator('#jlz-showreel-console')).toHaveAttribute('data-state', 'open')
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window.__jlzTestLifecycleTrace ?? []).includes('scene-owner:showreel-quad-bound'),
      ),
    )
    .toBe(true)

  // Runtime teardown may be requested by both an application owner and the
  // Vue host during shutdown. It must stay idempotent while stage detach is
  // still pending.
  await page.evaluate(() => {
    const destroy = window.__jlzRuntimeDestroy
    if (!destroy) throw new Error('Runtime destroy hook is missing.')
    return Promise.all([destroy(), destroy()])
  })
  await expect(page.locator('#cinematic-nav')).toHaveCount(1)
  await page.evaluate(() => window.__jlzTestUnmountVueApp?.())
  await expect(page.locator('#jlz-fs-overlay')).toHaveCount(0)
  await expect(page.locator('#jlz-showreel-console')).toHaveCount(0)
  await expect(page.locator('#jlz-route-transition')).toHaveCount(0)
  await expect(page.locator('#cinematic-nav')).toHaveCount(0)

  const anchorWasIntercepted = await page.evaluate(() => {
    const anchor = document.createElement('a')
    anchor.href = '/works'
    document.body.append(anchor)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    let interceptedByApp = false
    const preventNavigation = (event: MouseEvent) => {
      interceptedByApp = event.defaultPrevented
      event.preventDefault()
    }
    document.addEventListener('click', preventNavigation, true)
    anchor.dispatchEvent(click)
    document.removeEventListener('click', preventNavigation, true)
    anchor.remove()
    window.__jlzEmit?.('jlz:navigate', { path: '/works' })
    return interceptedByApp
  })
  expect(anchorWasIntercepted).toBe(false)
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 700 }).toBe('/contact')

  const trace = await page.evaluate(() => window.__jlzTestLifecycleTrace ?? [])
  const backendDispose = trace.lastIndexOf('renderer:backend-disposed')
  const rendererDispose = trace.indexOf('scene-host:renderer-disposed')
  const asyncSceneTeardown = trace.indexOf('experience:async-scene-teardown-complete')
  const showreelDispose = trace.indexOf('scene-owner:showreel-media-disposed')
  expect(backendDispose).toBeGreaterThanOrEqual(0)
  expect(rendererDispose).toBeGreaterThanOrEqual(0)
  expect(asyncSceneTeardown).toBeGreaterThanOrEqual(0)
  expect(showreelDispose).toBeGreaterThanOrEqual(0)
  expect(trace.filter((event) => event === 'scene-host:renderer-disposed')).toHaveLength(1)
  for (const ownerRelease of [
    'scene-owner:env-sphere-disposed',
    'scene-owner:env-sky-disposed',
    'scene-owner:cursor-placeholder-disposed',
    'scene-owner:showreel-quad-unbound',
  ]) {
    const releaseIndex = trace.indexOf(ownerRelease)
    expect(releaseIndex, `${ownerRelease} should run during host teardown`).toBeGreaterThanOrEqual(
      0,
    )
    expect(releaseIndex, `${ownerRelease} should precede backend disposal`).toBeLessThan(
      backendDispose,
    )
    expect(trace.filter((event) => event === ownerRelease)).toHaveLength(1)
  }
  expect(backendDispose).toBeLessThan(rendererDispose)
  expect(showreelDispose).toBeLessThan(backendDispose)
  expect(asyncSceneTeardown).toBeLessThan(rendererDispose)
  for (const stage of ['ContactTypographyStage', 'ContactCyprusStage', 'ContactHaloStage']) {
    const released = trace.indexOf(`scene-stage:${stage}:released`)
    expect(released, `${stage} should finish disposal`).toBeGreaterThanOrEqual(0)
    expect(released, `${stage} should release before backend disposal`).toBeLessThan(backendDispose)
  }
  expect(pageErrors).toEqual([])
})

test('A throwing sync disposer is isolated and teardown completes', async ({ page }) => {
  const pageErrors: string[] = []
  const teardownFailures: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('teardown failed')) {
      teardownFailures.push(message.text())
    }
  })
  await page.addInitScript(() => {
    window.__jlzTestLifecycleTrace = []
    window.__jlzTestTeardownFaults = {
      ground: () => {
        throw new Error('fault: ground disposer threw')
      },
    }
  })
  await page.goto('/contact')
  await expect(page.locator('#jlz-splash-enter')).toHaveClass(/is-ready/, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => typeof window.__jlzRuntimeDestroy === 'function')

  // The faulted release must not reject or hang the public teardown promise.
  await page.evaluate(() => window.__jlzRuntimeDestroy?.())
  await page.evaluate(() => window.__jlzTestUnmountVueApp?.())
  // The deferred backend disposal runs with the SceneHost unmount.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trace = window.__jlzTestLifecycleTrace ?? []
        return (
          trace.includes('renderer:backend-disposed') &&
          trace.includes('scene-host:renderer-disposed') &&
          trace.includes('experience:async-scene-teardown-complete')
        )
      }),
    )
    .toBe(true)
  const trace = await page.evaluate(() => window.__jlzTestLifecycleTrace ?? [])
  const backendDispose = trace.lastIndexOf('renderer:backend-disposed')
  const rendererDispose = trace.indexOf('scene-host:renderer-disposed')
  const asyncSceneTeardown = trace.indexOf('experience:async-scene-teardown-complete')
  // Owners released after the fault still ran, in the documented order.
  expect(backendDispose).toBeGreaterThanOrEqual(0)
  expect(asyncSceneTeardown).toBeGreaterThanOrEqual(0)
  for (const stage of ['ContactTypographyStage', 'ContactCyprusStage', 'ContactHaloStage']) {
    const released = trace.indexOf(`scene-stage:${stage}:released`)
    expect(released, `${stage} should still finish disposal`).toBeGreaterThanOrEqual(0)
    expect(released, `${stage} should release before backend disposal`).toBeLessThan(backendDispose)
  }
  expect(asyncSceneTeardown).toBeLessThan(rendererDispose)
  // The fault surfaced once, named, through the release error channel.
  const groundFailures = teardownFailures.filter((line) => line.includes('[Experience] ground'))
  expect(groundFailures).toHaveLength(1)
  expect(groundFailures[0]).toContain('fault: ground disposer threw')
  expect(pageErrors).toEqual([])
})

test('A rejecting async scene-owner teardown is isolated and completes', async ({ page }) => {
  const pageErrors: string[] = []
  const teardownFailures: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('teardown failed')) {
      teardownFailures.push(message.text())
    }
  })
  await page.addInitScript(() => {
    window.__jlzTestLifecycleTrace = []
    window.__jlzTestTeardownFaults = {
      showreel: () => Promise.reject(new Error('fault: showreel teardown rejected')),
    }
  })
  await page.goto('/contact')
  await expect(page.locator('#jlz-splash-enter')).toHaveClass(/is-ready/, {
    timeout: 60_000,
  })
  await page.waitForFunction(() => typeof window.__jlzRuntimeDestroy === 'function')

  // The rejected async owner flows through allSettled; the public teardown
  // promise still resolves and the remaining async owners finish.
  await page.evaluate(() => window.__jlzRuntimeDestroy?.())
  await page.evaluate(() => window.__jlzTestUnmountVueApp?.())
  // The deferred backend disposal runs with the SceneHost unmount.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trace = window.__jlzTestLifecycleTrace ?? []
        return (
          trace.includes('renderer:backend-disposed') &&
          trace.includes('scene-host:renderer-disposed') &&
          trace.includes('experience:async-scene-teardown-complete')
        )
      }),
    )
    .toBe(true)
  const trace = await page.evaluate(() => window.__jlzTestLifecycleTrace ?? [])
  expect(trace).toContain('renderer:backend-disposed')
  expect(trace).toContain('experience:async-scene-teardown-complete')
  const backendDispose = trace.lastIndexOf('renderer:backend-disposed')
  for (const stage of ['ContactTypographyStage', 'ContactCyprusStage', 'ContactHaloStage']) {
    const released = trace.indexOf(`scene-stage:${stage}:released`)
    expect(released, `${stage} should still finish disposal`).toBeGreaterThanOrEqual(0)
    expect(released, `${stage} should release before backend disposal`).toBeLessThan(backendDispose)
  }
  // The rejection surfaced once through the isolated async error channel.
  const asyncFailures = teardownFailures.filter((line) =>
    line.includes('[Experience] asynchronous scene owner'),
  )
  expect(asyncFailures).toHaveLength(1)
  expect(asyncFailures[0]).toContain('fault: showreel teardown rejected')
  expect(pageErrors).toEqual([])
})
