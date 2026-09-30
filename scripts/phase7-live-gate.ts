#!/usr/bin/env bun
/**
 * Phase 7 live acceptance gate (development server only).
 *
 * The production e2e suite (tests/e2e.spec.ts, `bun run test:serial`) covers
 * the DOM contract of the persistent SceneHost: exactly one `canvas.canvas`,
 * splash→Enter, and route navigation that never remounts the scene root.
 * This script adds the LIVE runtime gates that need the dev-only hooks
 * (`__jlzRuntimeSnapshot` / `__jlzRuntimeDestroy`, DEV builds only):
 *
 *   1. readiness handshake — Enter becomes `is-ready` only after renderer
 *      init + actual-backend inspection + Tres context mount + the initial
 *      World's first successful render (factory return alone never
 *      satisfies readiness);
 *   2. settled idle (zero draws) — after the splash is dismissed and the
 *      scene settles, the RenderScheduler (ADR 0005: it drives the
 *      persistent Tres loop through the SceneLoopPort) reports the loop
 *      INACTIVE: the loop stopped after the settled frame, so a settled
 *      scene draws nothing;
 *   3. disposal match (Phase 6 contract) — `__jlzRuntimeDestroy()` tears
 *      the Experience down without fatal errors and the Vue-owned canvas
 *      element survives `Renderer.dispose()` (the renderer, not the DOM,
 *      is disposed).
 *   4. bounded frame trace — a short real pointer burst is captured through
 *      the production invalidation path and records the DEV-only CPU timing
 *      ring alongside backend/resource counters. This is CPU evidence only;
 *      it does not infer GPU duration.
 *
 * Backends exercised (the unified `WebGPURenderer` is the only class the app
 * constructs — the dev-forced classic `?renderer=webgl` QA owner was removed
 * in Phase 10; the automatic software-adapter policy is retained):
 *   - `/`                      — the unified `WebGPURenderer`; on a host
 *     without a real GPU the software-adapter policy (planUnifiedBackend)
 *     re-creates it on `WebGLBackend` on the SAME canvas;
 *   - `/` + reduced motion     — the synchronous-settle reduced-motion path.
 *
 * Usage:
 *   bun run dev            # terminal 1 (http://127.0.0.1:5173)
 *   bun scripts/phase7-live-gate.ts
 *   JLZ_CDP_URL=http://127.0.0.1:9222 JLZ_CDP_ORIGIN=devtools://devtools \
 *     bun scripts/phase7-live-gate.ts
 *   JLZ_HARDWARE_CHROME=1 bun scripts/phase7-live-gate.ts
 *
 * When JLZ_CDP_URL is set, the gate attaches to the existing Chromium/Chrome
 * DevTools session instead of launching headless Chromium. This is the
 * hardware-evidence path for Hermes Chrome; the session must expose a
 * localhost CDP endpoint and have the app available at BASE.
 *
 * JLZ_HARDWARE_CHROME launches the installed stable Chrome headfully instead
 * of Playwright's headless Chromium. It is the fallback hardware-evidence
 * path when an existing Chrome profile refuses browser-level CDP attachment.
 *
 * A machine-readable report is written to
 * docs/evidence/phase7-live-gate/<utc>-report.json and printed to stdout.
 * Exit code 0 = every gate passed, 1 = at least one gate failed.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { evidenceMeta } from './evidence-meta'

const BASE = process.env.JLZ_DEV_BASE ?? 'http://127.0.0.1:5173'
const READY_TIMEOUT_MS = 240_000 // software backends need time to first-render
const SETTLE_MS = 8_000 // > 2× the 2.5 s ambient breath; the loop re-settles

interface LoopDiagnostics {
  loopActive: boolean
  hidden: boolean
  frames: number
  settledFrames: number
  lastInvalidation: string | null
}

interface RuntimeSnapshot {
  resources: {
    rendererCanvasCount: number
    documentCanvasCount: number
    scene: { geometries: number; materials: number; textures: number }
    renderer: {
      geometries: number | null
      textures: number | null
      programs: number | null
    }
    post: { renderTargets: number; passes: number; webgpuPipeline: boolean }
  }
  loop: LoopDiagnostics
  timing: {
    samples: number
    scene: { p50: number; p95: number; latest: number }
    camera: { p50: number; p95: number; latest: number }
    renderer: { p50: number; p95: number; latest: number }
    total: { p50: number; p95: number; latest: number }
  } | null
  demand: {
    needsRender: boolean
    cursorSettled: boolean | null
    activity: Record<string, boolean>
  }
}

interface RunResult {
  label: string
  url: string
  reducedMotion: boolean
  /** The production backend gate (settled idle = zero draws) applies here. */
  settledIdleRequired: boolean
  dataEngine: string | null
  backendLog: string | null
  ready: boolean
  canvasCount: number
  canvasAriaHidden: boolean
  loop: LoopDiagnostics | null
  resources: RuntimeSnapshot['resources'] | null
  timing: RuntimeSnapshot['timing']
  demand: RuntimeSnapshot['demand'] | null
  timingCaptured: boolean
  destroy: { fatalErrors: string[]; canvasSurvives: boolean }
  fatalErrors: string[]
  passed: boolean
  notes: string[]
}

async function run(
  browser: import('@playwright/test').Browser,
  opts: {
    label: string
    path: string
    reducedMotion?: boolean
    settledIdleRequired?: boolean
    attachedContext?: import('@playwright/test').BrowserContext
  },
): Promise<RunResult> {
  const url = BASE + opts.path
  const result: RunResult = {
    label: opts.label,
    url,
    reducedMotion: opts.reducedMotion ?? false,
    settledIdleRequired: opts.settledIdleRequired ?? false,
    dataEngine: null,
    backendLog: null,
    ready: false,
    canvasCount: 0,
    canvasAriaHidden: false,
    loop: null,
    resources: null,
    timing: null,
    demand: null,
    timingCaptured: false,
    destroy: { fatalErrors: [], canvasSurvives: false },
    fatalErrors: [],
    passed: false,
    notes: [],
  }

  const context =
    opts.attachedContext ??
    (await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference',
    }))
  const page = await context.newPage()
  if (opts.attachedContext) {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ reducedMotion: opts.reducedMotion ? 'reduce' : 'no-preference' })
  }
  const errors: string[] = []
  page.on('console', (m) => {
    const text = m.text()
    if (m.type() === 'error') errors.push(text)
    if (text.includes('Phase 7 host ready')) result.backendLog = text
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // Gate 1 — readiness handshake: Enter is enabled only after the initial
    // World's FIRST SUCCESSFUL RENDER (see entry-app.ts / Experience.init).
    await page.waitForFunction(
      () =>
        Boolean(
          (document.getElementById('jlz-splash-enter') as HTMLElement | null)?.classList.contains(
            'is-ready',
          ),
        ),
      null,
      { timeout: READY_TIMEOUT_MS },
    )
    result.ready = true

    result.canvasCount = await page.locator('canvas.canvas').count()
    result.canvasAriaHidden =
      (await page.locator('canvas.canvas').first().getAttribute('aria-hidden')) === 'true'
    result.dataEngine = await page
      .locator('canvas.canvas')
      .first()
      .getAttribute('data-engine')
      .catch(() => null)

    // Dismiss the splash.
    await page.locator('#jlz-splash-enter').click()
    await page
      .waitForFunction(
        () =>
          !document.getElementById('jlz-app-loader') ||
          (document.getElementById('jlz-app-loader') as HTMLElement).style.display === 'none' ||
          (document.getElementById('jlz-app-loader') as HTMLElement).classList.contains(
            'uk-hidden',
          ) ||
          (document.getElementById('jlz-app-loader') as HTMLElement).getAttribute('hidden') !==
            null,
        null,
        { timeout: 15_000 },
      )
      .catch(() => result.notes.push('loader hide check timed out (not fatal)'))

    // Gate 2 — settled idle: the single loop driver stops after the settled
    // frame. Reduced motion settles synchronously, so skip the settle window.
    if (!opts.reducedMotion) await page.waitForTimeout(SETTLE_MS)

    // Capture a bounded active burst before reading the settled snapshot. The
    // pointer path is intentionally used instead of synthetic scheduler calls:
    // it exercises the real input → owner invalidation → renderer loop path
    // while keeping the trace deterministic and short.
    for (let index = 0; index < 12; index += 1) {
      await page.mouse.move(320 + index * 48, 260 + (index % 3) * 36)
      await page.waitForTimeout(16)
    }
    await page.waitForTimeout(250)
    const burstSnapshot = await page.evaluate(
      () =>
        (
          window as unknown as { __jlzRuntimeSnapshot?: () => RuntimeSnapshot | null }
        ).__jlzRuntimeSnapshot?.() ?? null,
    )
    if (burstSnapshot) {
      result.timing = burstSnapshot.timing
      result.timingCaptured = (burstSnapshot.timing?.samples ?? 0) > 0
    } else {
      result.notes.push('no __jlzRuntimeSnapshot during active burst (DevPanel missing?)')
    }

    // The burst intentionally wakes the demand-driven loop. Let that work
    // settle before applying the idle gate; timing remains in the fixed ring.
    await page.waitForTimeout(opts.reducedMotion ? 1_000 : SETTLE_MS)
    const snapshot = await page.evaluate(
      () =>
        (
          window as unknown as { __jlzRuntimeSnapshot?: () => RuntimeSnapshot | null }
        ).__jlzRuntimeSnapshot?.() ?? null,
    )
    if (snapshot) {
      result.loop = snapshot.loop
      result.resources = snapshot.resources
      result.demand = snapshot.demand
      result.timing ??= snapshot.timing
      result.timingCaptured ||= (snapshot.timing?.samples ?? 0) > 0
    } else {
      result.notes.push('no __jlzRuntimeSnapshot after settle (DevPanel missing?)')
    }

    // Gate 3 — disposal: destroy the Experience; no fatal errors and the
    // Vue-owned canvas survives (the renderer is disposed, not the DOM).
    await page.evaluate(() => {
      const hook = (window as unknown as { __jlzRuntimeDestroy?: () => void }).__jlzRuntimeDestroy
      if (!hook) throw new Error('__jlzRuntimeDestroy missing (DEV hook)')
      hook()
    })
    await page.waitForTimeout(2_500)
    result.destroy.fatalErrors = errors.slice()
    result.destroy.canvasSurvives = (await page.locator('canvas.canvas').count()) >= 1

    result.fatalErrors = errors.slice()
    // Settled idle (zero draws) is a hard gate for the unified WebGPURenderer
    // (auto backend) and the reduced-motion path. (The dev-forced classic
    // `?renderer=webgl` QA owner — the only run exempted from the settled-idle
    // gate on a GPU-less software host — was removed in Phase 10.)
    const settledOk =
      !result.settledIdleRequired || (result.loop !== null && result.loop.loopActive === false)
    const rendererCanvasOk = result.resources === null || result.resources.rendererCanvasCount === 1
    result.passed =
      result.ready &&
      result.canvasCount === 1 &&
      rendererCanvasOk &&
      result.canvasAriaHidden &&
      result.timingCaptured &&
      settledOk &&
      result.destroy.fatalErrors.length === 0 &&
      result.destroy.canvasSurvives &&
      result.fatalErrors.length === 0
    if (!result.passed) {
      result.notes.push(
        `loop=${JSON.stringify(result.loop)} demand=${JSON.stringify(result.demand)} timing=${JSON.stringify(result.timing)} fatal=${JSON.stringify(result.fatalErrors)}`,
      )
    }
  } catch (e) {
    result.notes.push(String(e))
    result.fatalErrors = errors.slice()
    result.passed = false
  } finally {
    await page.close()
    if (!opts.attachedContext) await context.close()
  }
  return result
}

async function main(): Promise<void> {
  const cdpUrl = process.env.JLZ_CDP_URL
  const hardwareChrome = process.env.JLZ_HARDWARE_CHROME === '1'
  if (cdpUrl && hardwareChrome) {
    throw new Error('Set only one of JLZ_CDP_URL or JLZ_HARDWARE_CHROME=1')
  }
  const browser = cdpUrl
    ? await chromium.connectOverCDP(cdpUrl, {
        timeout: 120_000,
        headers: { Origin: process.env.JLZ_CDP_ORIGIN ?? 'devtools://devtools' },
      })
    : await chromium.launch(
        hardwareChrome
          ? {
              channel: 'chrome',
              headless: false,
              args: ['--enable-features=UseOzonePlatform', '--ozone-platform=wayland'],
            }
          : undefined,
      )
  const attachedContext = cdpUrl ? browser.contexts()[0] : undefined
  if (cdpUrl && !attachedContext) throw new Error(`No browser context available at ${cdpUrl}`)
  const runs: RunResult[] = []
  runs.push(
    await run(browser, {
      label: 'unified (auto backend)',
      path: '/',
      settledIdleRequired: true,
      attachedContext,
    }),
  )
  runs.push(
    await run(browser, {
      label: 'unified + reduced motion',
      path: '/',
      reducedMotion: true,
      settledIdleRequired: true,
      attachedContext,
    }),
  )
  if (!cdpUrl) await browser.close()

  const allPassed = runs.every((r) => r.passed)
  // Evidence protocol (docs/evidence/README.md): revision/dirty state,
  // command and browser identity. The per-run backend identity is the
  // `data-engine` canvas attribute + the captured `Phase 7 host ready` log.
  const browserIdentity = `${
    cdpUrl ? 'chromium (CDP attached)' : hardwareChrome ? 'chrome (headful)' : 'chromium (headless)'
  } ${browser.version()}`
  const report = {
    tool: 'phase7-live-gate',
    ...evidenceMeta('bun scripts/phase7-live-gate.ts', browserIdentity),
    base: BASE,
    host: `${process.platform} ${process.arch}`,
    utc: new Date().toISOString(),
    allPassed,
    runs,
  }
  const dir = 'docs/evidence/phase7-live-gate'
  mkdirSync(dirname(join(dir, 'report.json')), { recursive: true })
  const stamp = report.utc.replace(/[:.]/g, '-')
  const outPath = join(dir, `${stamp}-report.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  console.log(`\nreport: ${outPath}`)
  console.log(allPassed ? 'PHASE 7 LIVE GATE: PASS' : 'PHASE 7 LIVE GATE: FAIL')
  if (!allPassed) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
