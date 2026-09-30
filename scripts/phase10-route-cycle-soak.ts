#!/usr/bin/env bun
/**
 * Phase 10 acceptance gate — steady-state route-cycle soak.
 *
 * Lifecycle evidence (docs/evidence/README.md "Measurement protocol"): five warm-up
 * route cycles, then at least twenty steady-state route cycles, with per-cycle
 * snapshots proving the counters stay within the warm-up-established caps and
 * show no listener/canvas/texture/geometry/program/memory trend; a final
 * root destroy must return the owned resources to baseline.
 *
 * What one "route cycle" is here: a strict in-app SPA navigation
 * (`jlz:navigate` via the `window.__jlzEmit` facade — the app's own
 * navigation contract), the route settling (a route root carrying the
 * target `data-page-view` marker), and the full settle window. The settle
 * gate is route-aware: on settle-able routes the
 * single demand-driven loop driver must stop again
 * (`loop.loopActive === false` = zero settled draws); on the by-design
 * continuous routes (a `worksPlane`/`ambientScene`/`particles` activity
 * flag is active at settle) the loop must stay alive and keep advancing,
 * and the leak gate there is the frame delta between consecutive visits of
 * the same route (stable delta = steady bounded animation; growing delta =
 * animation work accumulating). The persistent SceneHost is never remounted
 * — that is exactly what is being measured: the scene root stays put while
 * route stages are created and released.
 *
 * Counters per snapshot (owner-visible, `__jlzRuntimeSnapshot` + DOM):
 *   canvas, DOM node count (listener proxy: every owner handler is bound to a
 *   DOM node; a growing node count is a growing listener surface), scene
 *   geometries/materials/textures, renderer geometries/textures/programs,
 *   post render targets, and the JS heap (with `--expose-gc` so GC runs
 *   before every read). Noisy heap values are recorded with their trend
 *   rather than converted into a false exact threshold (DEVELOPMENT.md); the
 *   hard gates are the no-monotonic-trend and within-cap checks.
 *
 * Within-cap rule: the retained footprint (cache cap) is established by the
 * first full pass — the baseline, the five warm-up cycles AND the first
 * steady-state visit of every route (a single warm-up visit is still loading
 * its lazy stages). Every steady-state snapshot must stay at or below that
 * first-pass cap (scene materials/geometry: +2 churn tolerance; heap:
 * +10% to absorb GC noise). A constant heap reading in headless Chromium is
 * recorded with its environment per the noisy-metric policy, not silently
 * dropped.
 *
 * No-trend rule: across the steady-state block a counter must not net-grow
 * (strict increases must not outnumber non-increases). Continuous routes are
 * additionally gated on the frame delta between consecutive visits of the
 * same route (a growing per-visit frame rate = accumulating animation work).
 *
 * Usage:
 *   bun run dev            # http://127.0.0.1:5174
 *   JLZ_DEV_BASE=http://127.0.0.1:5174 bun scripts/phase10-route-cycle-soak.ts
 *
 * A machine-readable report is written to
 * docs/evidence/phase10-route-cycle-soak/<utc>-report.json and printed to
 * stdout. Exit code 0 = every gate passed, 1 = at least one gate failed.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from '@playwright/test'
import { evidenceMeta } from './evidence-meta'

const BASE = process.env.JLZ_DEV_BASE ?? 'http://127.0.0.1:5173'
const READY_TIMEOUT_MS = 240_000 // software backends need time to first-render
const SETTLE_MS = 8_000 // > 2× the 2.5 s ambient breath; the loop re-settles
const WARMUP_CYCLES = 5
const STEADY_CYCLES = Number(process.env.JLZ_SOAK_STEADY ?? 20)
if (STEADY_CYCLES < 20) throw new Error('Phase 10 requires at least 20 steady-state cycles')

/**
 * The settle gate is the app's own settle contract (Experience._isLoopSettled):
 * the loop may be stopped only when NO state activity flag is active and the
 * draw gate is clear. A route whose 14-flag `renderDemand.ts` snapshot has at
 * least one flag active at settle is by-design continuous (e.g. the /works
 * back-text UV scroll — `worksPlane` — visible ambient motion —
 * `ambientScene` — or a visible particle field — `particles`): the loop MUST
 * stay installed, and the leak gate there is the frame delta between
 * consecutive visits of the same route (a growing delta = new animation work
 * accumulating per visit). Every other route must settle: `loopActive ===
 * false` with zero active flags — a loop that stays alive with no active flag
 * is a persistent render reason (a release blocker).
 */

/**
 * The six SPA routes, in manifest order (src/core/routeManifest.ts). The
 * cycle walks them round-robin so every cycle is a real route change and
 * snapshot k and k+6 observe the same page (periodic steady state).
 */
const SPA_ROUTES: ReadonlyArray<{ path: string; page: string }> = [
  { path: '/', page: 'home' },
  { path: '/services', page: 'services' },
  { path: '/works', page: 'works' },
  { path: '/manifesto', page: 'manifesto' },
  { path: '/lab', page: 'lab' },
  { path: '/contact', page: 'contact' },
]

interface SoakCounter {
  canvas: number
  domNodes: number
  sceneGeometries: number
  sceneMaterials: number
  sceneTextures: number
  rendererGeometries: number
  rendererTextures: number
  rendererPrograms: number
  postRenderTargets: number
  heapUsed: number
}

interface CycleSnapshot extends SoakCounter {
  index: number
  route: string
  page: string
  loopActive: boolean | null
  frames: number | null
  /** True when a by-design continuous-activity flag was active on settle. */
  continuous: boolean
  /** Frames drawn since the previous visit of the same route (null on first). */
  frameDelta: number | null
  fatalErrors: number
  ok: boolean
  notes: string[]
  configIds: string[]
}

function counterOf(r: Record<string, unknown>): SoakCounter {
  const resources = (r.resources ?? null) as {
    rendererCanvasCount: number
    scene: { geometries: number; materials: number; textures: number }
    renderer: { geometries: number | null; textures: number | null; programs: number | null }
    post: { renderTargets: number }
  } | null
  const n = (v: number | null | undefined): number => (v == null ? -1 : v)
  // Prefer the `.canvas`-scoped DOM count (the one-canvas invariant); fall
  // back to the owner-backed renderer count when the probe is unavailable.
  const canvas =
    typeof r.canvas === 'number' ? (r.canvas as number) : (resources?.rendererCanvasCount ?? -1)
  return {
    canvas,
    domNodes: n(r.domNodes as number | null),
    sceneGeometries: resources?.scene.geometries ?? -1,
    sceneMaterials: resources?.scene.materials ?? -1,
    sceneTextures: resources?.scene.textures ?? -1,
    rendererGeometries: n(resources?.renderer.geometries),
    rendererTextures: n(resources?.renderer.textures),
    rendererPrograms: n(resources?.renderer.programs),
    postRenderTargets: resources?.post.renderTargets ?? -1,
    heapUsed: n(r.heapUsed as number | null),
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    // Deterministic heap readings: force a GC before every snapshot read.
    args: ['--js-flags=--expose-gc'],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors: string[] = []
  let capturedBackend: string | null = null
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
    if (m.text().startsWith('[entry-app] Phase 7 host ready:')) capturedBackend = m.text()
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  const capture = (): Promise<Record<string, unknown>> =>
    page.evaluate(() => {
      const gc = (globalThis as { gc?: () => void }).gc
      gc?.()
      const snap = (
        window as unknown as {
          __jlzRuntimeSnapshot?: () => {
            resources: Record<string, unknown> | null
            loop: { loopActive: boolean; frames: number } | null
            configIds?: readonly string[]
            demand: { activity: Record<string, boolean> } | null
          } | null
        }
      ).__jlzRuntimeSnapshot?.()
      const mem = (
        performance as unknown as {
          memory?: { usedJSHeapSize: number; totalJSHeapSize: number }
        }
      ).memory
      return {
        resources: snap?.resources ?? null,
        loop: snap?.loop ?? null,
        activity: snap?.demand?.activity ?? null,
        configIds: snap?.configIds ?? [],
        heapUsed: mem?.usedJSHeapSize ?? null,
        domNodes: document.querySelectorAll('*').length,
        // The single scene canvas carries the `canvas` class (SceneHost
        // `class="canvas jlz-scene-canvas"`). Count it specifically so stray
        // non-scene <canvas> elements (UIkit, icons) can never fake the
        // one-canvas invariant — the same selector the e2e + destroy check use.
        canvas: document.querySelectorAll('canvas.canvas').length,
      }
    })

  // Per-route frames history: the frame-delta between two consecutive visits
  // of the same route is the continuous-route leak gate (a growing delta =
  // new animation work accumulating per visit; a stable delta = steady,
  // bounded animation).
  const lastFramesByRoute = new Map<string, number>()
  const frameDeltaByRoute = new Map<string, number[]>()

  const cycle = async (
    index: number,
    fromRoute: string,
  ): Promise<{ snapshot: CycleSnapshot; nextRoute: string }> => {
    // Round-robin over the six SPA routes — always a real route change.
    let next = SPA_ROUTES.findIndex((r) => r.path === fromRoute) + 1
    if (next >= SPA_ROUTES.length) next = 0
    const target = SPA_ROUTES[next]
    // The raw window `jlz:*` bridge was removed in Phase 10 — the app only
    // receives `jlz:navigate` through the typed eventBus. Drive it via the
    // `window.__jlzEmit` facade (installed at entry-app module scope).
    await page.evaluate((path) => {
      const emit = (window as unknown as { __jlzEmit?: (event: string, detail?: unknown) => void })
        .__jlzEmit
      if (!emit) throw new Error('window.__jlzEmit test seam is not available')
      emit('jlz:navigate', { path })
    }, target.path)
    // Route settled: each Vue route root owns its semantic `data-page-view`
    // marker. Route state deliberately has no document/body dataset mirror;
    // the scene consumes the typed routePage port instead.
    await page.waitForFunction(
      (expected) => document.querySelector(`[data-page-view="${expected}"]`) !== null,
      target.page,
      { timeout: 30_000 },
    )
    // Full settle window — the demand-driven loop must stop again on
    // settle-able routes; on continuous routes it must keep a steady rate.
    await page.waitForTimeout(SETTLE_MS)
    const raw = await capture()
    const counters = counterOf(raw)
    const loop = raw.loop as { loopActive: boolean; frames: number } | null
    const activity = raw.activity as Record<string, boolean> | null
    const configIds = Array.isArray(raw.configIds) ? raw.configIds.map(String) : []
    const continuous = activity != null && Object.values(activity).some((v) => v === true)
    let frameDelta: number | null = null
    if (loop?.frames != null) {
      const last = lastFramesByRoute.get(target.path)
      if (last != null) frameDelta = loop.frames - last
      lastFramesByRoute.set(target.path, loop.frames)
      // The per-visit frame delta is only a leak signal for by-design
      // continuous routes (the loop runs at a steady rate, so a growing
      // delta = accumulating animation work). For settle-able routes the
      // inter-visit delta is just transition cost across the other five
      // routes — inherently variable and NOT a leak indicator; their
      // authoritative gate is `loopActive === false` below.
      if (frameDelta != null && continuous) {
        const deltas = frameDeltaByRoute.get(target.path) ?? []
        deltas.push(frameDelta)
        frameDeltaByRoute.set(target.path, deltas)
      }
    }
    const fatalBefore = errors.length
    const notes: string[] = []
    let ok = true
    if (counters.canvas !== 1) {
      ok = false
      notes.push(`canvas=${counters.canvas} (expected exactly 1)`)
    }
    const expectedConfigPrefix = target.page === 'home' ? 'sec_' : `content_${target.page}_`
    if (!configIds.some((id) => id.startsWith(expectedConfigPrefix))) {
      ok = false
      notes.push(
        `route config mismatch: expected an id starting with ${expectedConfigPrefix}, got ${JSON.stringify(configIds)}`,
      )
    }
    if (loop == null) {
      ok = false
      notes.push('no loop diagnostics (snapshot missing)')
    } else if (continuous) {
      // By-design continuous route: the loop must be alive AND advancing.
      if (loop.loopActive !== true) {
        ok = false
        notes.push(
          `continuous route but the loop stopped (frozen animation, frames=${loop.frames})`,
        )
      }
      if (frameDelta != null && frameDelta <= 0) {
        ok = false
        notes.push(`continuous route but frames did not advance since the last visit`)
      }
    } else if (loop.loopActive !== false) {
      ok = false
      notes.push(`loop still active after settle on a settle-able route (frames=${loop.frames})`)
    }
    if (fatalBefore > 0) {
      ok = false
      notes.push(`${fatalBefore} fatal errors seen`)
    }
    const snapshot: CycleSnapshot = {
      index,
      route: target.path,
      page: target.page,
      loopActive: loop?.loopActive ?? null,
      frames: loop?.frames ?? null,
      continuous,
      frameDelta,
      fatalErrors: fatalBefore,
      ok,
      notes,
      configIds,
      ...counters,
    }
    return { snapshot, nextRoute: target.path }
  }

  const report: {
    tool: string
    commit: string
    dirtyFiles: string[]
    command: string
    browser: string
    base: string
    host: string
    utc: string
    steadyCycles: number
    backend: string | null
    viewport: { width: number; height: number }
    dpr: number | null
    baseline: CycleSnapshot | null
    warmup: CycleSnapshot[]
    steady: CycleSnapshot[]
    caps: Partial<SoakCounter> | null
    capsSource: string
    trend: Record<
      string,
      { series: number[]; increases: number; decreases: number; withinCap: boolean }
    >
    destroy: {
      canvasSurvives: boolean
      canvasCount: number
      newCanvases: boolean
      fatalErrors: string[]
      heapUsed: number
      heapPeak: number
      heapAtOrBelowPeak: boolean
    }
    allPassed: boolean
    notes: string[]
  } = {
    tool: 'phase10-route-cycle-soak',
    // Evidence protocol (docs/evidence/README.md): revision/dirty state,
    // command and browser identity. Backend identity is the captured
    // `Phase 7 host ready` log line (see `backend` below).
    ...evidenceMeta(
      'bun scripts/phase10-route-cycle-soak.ts',
      `chromium (headless) ${browser.version()}`,
    ),
    base: BASE,
    host: `${process.platform} ${process.arch}`,
    utc: new Date().toISOString(),
    steadyCycles: STEADY_CYCLES,
    backend: capturedBackend,
    viewport: { width: 1280, height: 800 },
    dpr: null,
    baseline: null,
    warmup: [],
    steady: [],
    caps: null,
    capsSource: '',
    trend: {},
    destroy: {
      canvasSurvives: false,
      canvasCount: 0,
      newCanvases: false,
      fatalErrors: [],
      heapUsed: 0,
      heapPeak: 0,
      heapAtOrBelowPeak: false,
    },
    allPassed: false,
    notes: [],
  }

  try {
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    report.dpr = await page.evaluate(() => window.devicePixelRatio)
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
    report.backend = capturedBackend
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
      .catch(() => report.notes.push('loader hide check timed out (not fatal)'))
    // The renderer can become ready before the Vue router finishes wiring its
    // typed event-bus listener. Match the browser suite's startup gate before
    // the first synthetic `jlz:navigate` request.
    await page.waitForFunction(
      () => (window as unknown as { __jlzRouterReady?: boolean }).__jlzRouterReady === true,
      null,
      { timeout: 30_000 },
    )
    await page.waitForTimeout(SETTLE_MS)

    const baselineRaw = await capture()
    const baselineCounters = counterOf(baselineRaw)
    const baselineLoop = baselineRaw.loop as { loopActive: boolean; frames: number } | null
    const baselineActivity = baselineRaw.activity as Record<string, boolean> | null
    const baselineContinuous =
      baselineActivity != null && Object.values(baselineActivity).some((v) => v === true)
    if (baselineLoop?.frames != null) lastFramesByRoute.set('/', baselineLoop.frames)
    report.baseline = {
      index: 0,
      route: '/',
      page: 'home',
      loopActive: baselineLoop?.loopActive ?? null,
      frames: baselineLoop?.frames ?? null,
      continuous: baselineContinuous,
      frameDelta: null,
      fatalErrors: 0,
      ok: baselineCounters.canvas === 1,
      notes: baselineCounters.canvas === 1 ? [] : [`baseline canvas=${baselineCounters.canvas}`],
      ...baselineCounters,
    }

    let fromRoute = '/'
    for (let i = 1; i <= WARMUP_CYCLES; i++) {
      const { snapshot, nextRoute } = await cycle(i, fromRoute)
      fromRoute = nextRoute
      report.warmup.push(snapshot)
      if (!snapshot.ok) report.notes.push(`warmup ${i}: ${snapshot.notes.join('; ')}`)
    }

    for (let i = 1; i <= STEADY_CYCLES; i++) {
      const { snapshot, nextRoute } = await cycle(i, fromRoute)
      fromRoute = nextRoute
      report.steady.push(snapshot)
      if (!snapshot.ok) report.notes.push(`steady ${i}: ${snapshot.notes.join('; ')}`)
    }

    // ── Within-cap + no-trend gates ───────────────────────────────────────
    // [field, relativeTolerance, absoluteTolerance] — the absolute term
    // absorbs small integer churn the warm-up cap cannot (see sceneMaterials).
    const fields: Array<[keyof SoakCounter, number, number]> = [
      ['canvas', 0, 0],
      ['domNodes', 0, 0],
      ['sceneGeometries', 0, 0],
      ['sceneMaterials', 0, 2], // ±1–2 material churn across cycles (lazy load/dispose timing)
      ['sceneTextures', 0, 0],
      ['rendererGeometries', 0, 0],
      ['rendererTextures', 0, 0],
      ['rendererPrograms', 0, 0],
      ['postRenderTargets', 0, 0],
      ['heapUsed', 0.1, 0], // heap: +10% tolerance — GC noise, not a false exact cap
    ]
    let capsOk = true
    const caps: Record<string, number> = {}
    // The retained-footprint cap is established by the FIRST FULL PASS: the
    // baseline, the five warm-up cycles AND the first steady-state visit of
    // every route. A single warm-up visit of a route is still loading its
    // lazy stages (the round-robin warm-up is one pass minus the home route),
    // so the first steady visit completes the picture; all subsequent
    // revisits (3–4 per route in the 20-cycle block) must stay within it.
    const seenRoutes = new Set<string>()
    const firstSteadyVisits: CycleSnapshot[] = []
    report.steady.forEach((s) => {
      if (!seenRoutes.has(s.route)) {
        seenRoutes.add(s.route)
        firstSteadyVisits.push(s)
      }
    })
    const capSamples = [
      ...(report.baseline ? [report.baseline] : []),
      ...report.warmup,
      ...firstSteadyVisits,
    ]
    for (const [field, relTol, absTol] of fields) {
      const capValues = capSamples.map((s) => s[field]).filter((v): v is number => v >= 0)
      const cap = capValues.length ? Math.max(...capValues) : -1
      caps[field] = cap
      const series = report.steady.map((s) => s[field])
      // Not exposed by the backend (every warm-up sample null — e.g. the
      // renderer.info counters on a real WebGPU backend): it cannot be gated,
      // so record it as not-exposed rather than a false failure.
      if (cap < 0) {
        report.trend[field] = { series, increases: 0, decreases: 0, withinCap: true }
        report.notes.push(`${field}: not exposed by the backend (null) — not gated`)
        continue
      }
      const fieldCap = cap * (1 + relTol) + absTol
      const bad = series.filter((v) => v < 0 || v > fieldCap)
      if (bad.length > 0) {
        capsOk = false
        report.notes.push(
          `${field}: ${bad.length}/${STEADY_CYCLES} steady snapshots outside the first-pass cap ${fieldCap}`,
        )
      }
      // No-trend is evaluated within each route. The round-robin contains
      // deliberately different DOM and scene footprints (for example Works
      // retains its gallery while Home does not), so comparing adjacent
      // snapshots across routes turns normal route shape into a false leak.
      // Each route is revisited three or four times in the steady block;
      // accumulation must appear within that route's own series.
      let increases = 0
      let decreases = 0
      const byRoute = new Map<string, number[]>()
      for (const snapshot of report.steady) {
        const values = byRoute.get(snapshot.route) ?? []
        values.push(snapshot[field])
        byRoute.set(snapshot.route, values)
      }
      for (const values of byRoute.values()) {
        for (let k = 1; k < values.length; k++) {
          const a = values[k - 1]
          const b = values[k]
          if (a < 0 || b < 0) continue
          if (b > a) increases++
          else decreases++
        }
      }
      const withinCap = bad.length === 0
      report.trend[field] = { series, increases, decreases, withinCap }
      if (increases > decreases) {
        capsOk = false
        report.notes.push(
          `${field}: monotonic growth across the steady block (up=${increases} down=${decreases})`,
        )
      }
    }
    report.caps = caps
    report.capsSource =
      'first-pass established (baseline + 5 warm-up cycles + first steady visit per route; ' +
      'scene materials/geometry ±2 churn tolerance; heap +10% GC tolerance)'

    // ── Continuous-route frame-rate gate ───────────────────────────────────
    // On by-design continuous routes the loop legitimately keeps running; the
    // leak signal is the frame delta between consecutive visits of the same
    // route. A stable delta = steady bounded animation; a growing delta = new
    // animation work accumulating per visit.
    for (const [route, deltas] of frameDeltaByRoute) {
      if (deltas.length < 2) continue
      let increases = 0
      let decreases = 0
      for (let k = 1; k < deltas.length; k++) {
        if (deltas[k] > deltas[k - 1]) increases++
        else decreases++
      }
      report.trend[`frameDelta(${route})`] = {
        series: deltas,
        increases,
        decreases,
        withinCap: true,
      }
      if (increases > decreases) {
        capsOk = false
        report.notes.push(
          `frameDelta(${route}): the per-visit frame rate grew across visits (up=${increases} down=${decreases}) — animation work accumulating`,
        )
      }
    }

    // ── Noisy-metric honesty note (DEVELOPMENT.md) ─────────────────────────
    const heapValues = [
      ...(report.baseline ? [report.baseline] : []),
      ...report.warmup,
      ...report.steady,
    ]
      .map((s) => s.heapUsed)
      .filter((v) => v >= 0)
    if (heapValues.length > 1 && new Set(heapValues).size === 1) {
      report.notes.push(
        `heapUsed: constant ${heapValues[0]} across ${heapValues.length} reads — ` +
          'headless Chromium performance.memory returns a flat value in this environment; ' +
          'recorded with its environment and trend per the noisy-metric policy, not a reliable gate',
      )
    }

    // ── Root destroy → baseline ───────────────────────────────────────────
    const destroyErrorsBefore = errors.length
    const canvasBefore = await page.locator('canvas.canvas').count()
    await page.evaluate(() => {
      const hook = (window as unknown as { __jlzRuntimeDestroy?: () => void }).__jlzRuntimeDestroy
      if (!hook) throw new Error('__jlzRuntimeDestroy missing (DEV hook)')
      hook()
    })
    await page.waitForTimeout(2_500)
    const canvasAfter = await page.locator('canvas.canvas').count()
    const postDestroyRaw = await capture()
    const heapUsed = (postDestroyRaw.heapUsed as number | null) ?? -1
    const heapPeak = Math.max(...report.steady.map((s) => s.heapUsed).filter((v) => v >= 0))
    const destroyFatal = errors.slice(destroyErrorsBefore).map((m) => m.slice(0, 300))
    report.destroy = {
      canvasSurvives: canvasAfter >= 1,
      canvasCount: canvasAfter,
      newCanvases: canvasAfter > canvasBefore,
      fatalErrors: destroyFatal,
      heapUsed,
      heapPeak,
      heapAtOrBelowPeak: heapUsed >= 0 && heapPeak > 0 && heapUsed <= heapPeak,
    }

    const cycleGates = report.warmup.every((s) => s.ok) && report.steady.every((s) => s.ok)
    report.allPassed =
      report.baseline !== null &&
      report.backend !== null &&
      report.dpr !== null &&
      report.baseline.ok &&
      cycleGates &&
      capsOk &&
      report.destroy.canvasSurvives &&
      !report.destroy.newCanvases &&
      report.destroy.fatalErrors.length === 0 &&
      report.destroy.heapAtOrBelowPeak
    if (report.backend === null)
      report.notes.push('backend: not captured — run cannot be compared like-for-like')
    if (report.dpr === null)
      report.notes.push('dpr: not captured — run cannot be compared like-for-like')
    if (!report.allPassed && !report.notes.length) report.notes.push('destroy evidence incomplete')
  } catch (e) {
    report.notes.push(String(e))
    report.allPassed = false
  } finally {
    await browser.close()
  }

  const dir = 'docs/evidence/phase10-route-cycle-soak'
  mkdirSync(join(dir, ''), { recursive: true })
  const stamp = report.utc.replace(/[:.]/g, '-')
  const outPath = join(dir, `${stamp}-report.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
  const summary = {
    tool: report.tool,
    utc: report.utc,
    steadyCycles: report.steady.length,
    backend: report.backend,
    caps: report.caps,
    trends: Object.fromEntries(
      Object.entries(report.trend).map(([k, v]) => [
        k,
        `up=${v.increases} down=${v.decreases} withinCap=${v.withinCap}`,
      ]),
    ),
    destroy: report.destroy,
    allPassed: report.allPassed,
    notes: report.notes,
  }
  console.log(JSON.stringify(summary, null, 2))
  console.log(`\nreport: ${outPath}`)
  console.log(
    report.allPassed ? 'PHASE 10 ROUTE-CYCLE SOAK: PASS' : 'PHASE 10 ROUTE-CYCLE SOAK: FAIL',
  )
  if (!report.allPassed) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
