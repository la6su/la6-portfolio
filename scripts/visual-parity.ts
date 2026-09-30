#!/usr/bin/env bun
/**
 * Visual parity tooling for the Vue/Tres migration (Phase 2 visual gate).
 *
 * Implements the frozen protocol metric from
 * `docs/evidence/README.md` ("Measurement protocol"): capture
 * visual parity at identical state; outside approved masks, at most 0.5% of
 * pixels may exceed a 0.1 perceptual threshold; store the diff and masks with
 * the evidence. The perceptual threshold is computed as the L2 distance of
 * the sRGB channels normalized to [0,1]:
 *
 *   delta = sqrt(dR^2 + dG^2 + dB^2) / 255      (per pixel)
 *   exceed = delta > 0.1
 *   pass   = (exceeded pixels outside masks) / (pixels outside masks) <= 0.005
 *
 * Reference-frame naming convention (machine-readable; all evidence lives
 * under `docs/evidence/visual-parity/`):
 *
 *   frame:   <commit7>-<scope>-<backend>-<cycles>c-<utc:YYYYMMDDTHHMMZ>.png
 *   diff:    <commit7>-<scope>-<backendA>-vs-<backendB>-<cycles>c-<utc:YYYYMMDDTHHMMZ>-diff.png
 *   report:  <diff base>-report.json
 *   mask:    <diff base>-mask.png
 *
 * `<cycles>` is the number of deterministic `__jlzTresCycle()` owner-update
 * steps after the probe reports `ready` (the probe scene has no internal
 * timers or wall-clock reads; N cycles from a fresh mount is an identical
 * scene state). The example below uses a deterministic eval step; replace
 * `--settle` with the matching settle time for production pages.
 *
 * Commands (run with bun, against the CDP endpoint of the running Chrome):
 *
 *   bun scripts/visual-parity.ts capture \
 *     --url "https://project.6la.ru/?no-scene=1" \
 *     --out docs/evidence/visual-parity/<frame>.png \
 *     --settle 700 --commit 6f02896 \
 *     --meta "device=Linux x86_64, NVIDIA Lovelace (non-fallback), 60 Hz" \
 *     --meta "viewport=1267x1297 CSS, DPR 1, Chrome 151.0.7922.137"
 *
 *   bun scripts/visual-parity.ts diff \
 *     --a docs/evidence/visual-parity/<frame A>.png \
 *     --b docs/evidence/visual-parity/<frame B>.png \
 *     --base docs/evidence/visual-parity/<diff base> \
 *     [--masks <mask.json>] [--threshold 0.1] [--max-fraction 0.005]
 *
 * `capture` opens a fresh tab, pins its device metrics (default
 * 1267x1297, DPR 1, so both backend runs lay out identically), navigates to
 * the probe page, waits for `[data-status]` to reach `ready` (or an
 * `error:*` state), runs the `--eval` argument in the page (a bare
 * expression is evaluated as-is; a function expression such as
 * `async () => {...}` is invoked and awaited), settles, and screenshots
 * exactly the page's first `<canvas>` element via the canvas bounding box
 * (DOM overlays are excluded from the comparison surface). It writes a
 * sidecar `<frame>.png.meta.json` with the capture metadata required by the
 * protocol (commit, url, browser, viewport, canvas CSS/backing size, probe
 * status fields, timestamp). The tab is closed again.
 *
 * `diff` loads both PNGs in a page, computes the per-pixel delta, honours the
 * optional approved masks (JSON: `{ "masks": [{ "label", "x", "y", "width",
 * "height" }] }`, canvas-pixel coordinates), and writes the diff image
 * (exceeding pixels red, everything else scaled delta), the mask overlay and
 * the JSON report. Exit code 0 when the fraction passes, 1 otherwise.
 *
 * The CDP transport is a minimal raw-WebSocket client (Node/Bun native
 * WebSocket, no extra dependencies). It works both against a local CDP
 * endpoint and over a reverse tunnel that forwards the DevTools protocol.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

interface Args {
  [key: string]: string | number | boolean | string[]
}

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument: ${arg}`)
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = true
    } else {
      const existing = out[key]
      if (Array.isArray(existing)) {
        existing.push(next)
      } else if (existing === undefined) {
        out[key] = next
      } else {
        out[key] = [String(existing), next]
      }
      i++
    }
  }
  return out
}

function requireString(args: Args, key: string): string {
  const value = args[key]
  if (typeof value !== 'string') throw new Error(`Missing required --${key} <value>`)
  return value
}

function singleString(args: Args, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

function numberArg(args: Args, key: string, fallback: number): number {
  const value = args[key]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a finite number`)
  return parsed
}

function ensureParent(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/* ------------------------------------------------------------------ *
 * Minimal raw-CDP client over the native WebSocket.
 * ------------------------------------------------------------------ */

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

class CdpClient {
  private ws: WebSocket
  private nextId = 1
  private pending = new Map<number, PendingCall>()
  private closed = false

  constructor(wsUrl: string) {
    this.ws = new WebSocket(wsUrl)
    this.ws.binaryType = 'arraybuffer'
    this.ws.addEventListener('message', (event) => {
      let message: { id?: number; error?: { message?: string }; result?: unknown }
      try {
        message = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (typeof message.id !== 'number') return // event, not a response
      const entry = this.pending.get(message.id)
      if (!entry) return
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) {
        entry.reject(new Error(`CDP error: ${message.error?.message ?? 'unknown'}`))
      } else {
        entry.resolve(message.result)
      }
    })
    this.ws.addEventListener('error', () => {
      if (this.closed) return
      this.closed = true
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error('CDP WebSocket closed'))
      }
      this.pending.clear()
    })
  }

  ready(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true })
      this.ws.addEventListener('error', () => reject(new Error('CDP WebSocket connect failed')), {
        once: true,
      })
    })
  }

  send(method: string, params?: Record<string, unknown>, sessionId?: string, timeoutMs = 120_000) {
    if (this.closed) return Promise.reject(new Error('CDP client is closed'))
    const id = this.nextId
    this.nextId += 1
    const message: Record<string, unknown> = { id, method, params: params ?? {} }
    if (sessionId) message.sessionId = sessionId
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP call ${method} timed out after ${timeoutMs} ms`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
    })
    this.ws.send(JSON.stringify(message))
    return promise
  }

  close(): void {
    this.closed = true
    for (const entry of this.pending.values()) clearTimeout(entry.timer)
    this.pending.clear()
    try {
      this.ws.close()
    } catch {
      // The socket may already be gone; nothing left to clean up.
    }
  }
}

async function connectBrowser(args: Args): Promise<CdpClient> {
  const raw = singleString(args, 'cdp') ?? 'http://127.0.0.1:9222'
  const httpBase = raw.replace(/^ws/, 'http').replace(/\/+$/, '')
  const version = (await fetch(`${httpBase}/json/version`, {
    signal: AbortSignal.timeout(15_000),
  }).then((response) => response.json())) as { webSocketDebuggerUrl?: string }
  if (!version.webSocketDebuggerUrl) throw new Error('CDP endpoint has no browser WebSocket URL')
  const client = new CdpClient(version.webSocketDebuggerUrl)
  await client.ready()
  return client
}

interface FreshTab {
  client: CdpClient
  sessionId: string
  targetId: string
  browserName: string
  close(): Promise<void>
}

/** Open a fresh tab, pin its device metrics, and return a session-bound helper. */
async function openFreshTab(
  client: CdpClient,
  url: string,
  width: number,
  height: number,
  dpr: number,
): Promise<FreshTab> {
  const created = (await client.send('Target.createTarget', { url })) as { targetId: string }
  const { targetId } = created
  const attached = (await client.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })) as { sessionId: string }
  const sessionId = attached.sessionId
  const send = (method: string, params?: Record<string, unknown>) =>
    client.send(method, params, sessionId)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: dpr,
    mobile: false,
  })
  const version = (await client.send('Browser.getVersion')) as { product: string }
  const tab: FreshTab = {
    client,
    sessionId,
    targetId,
    browserName: version.product,
    close: async () => {
      try {
        await client.send('Target.closeTarget', { targetId })
      } catch {
        // The tab may already be gone; the capture either finished or failed.
      }
    },
  }
  return tab
}

async function evaluateExpression(
  client: CdpClient,
  sessionId: string,
  expression: string,
  timeoutMs = 120_000,
): Promise<unknown> {
  const result = (await client.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
    timeoutMs,
  )) as { result?: { value?: unknown }; exceptionDetails?: unknown }
  if (result.exceptionDetails) {
    throw new Error(
      `In-page evaluation failed: ${JSON.stringify(result.exceptionDetails).slice(0, 400)}`,
    )
  }
  return result.result?.value
}

/* ------------------------------------------------------------------ *
 * capture
 * ------------------------------------------------------------------ */

async function commandCapture(args: Args): Promise<void> {
  const url = requireString(args, 'url')
  const out = requireString(args, 'out')
  const evalFn = singleString(args, 'eval') ?? ''
  const settleMs = numberArg(args, 'settle', 0)
  const commit = singleString(args, 'commit') ?? ''
  const viewport = singleString(args, 'viewport') ?? '1267x1297'
  const [viewWidth, viewHeight] = viewport.split('x').map((value) => Number(value))
  if (!Number.isFinite(viewWidth) || !Number.isFinite(viewHeight)) {
    throw new Error('--viewport expects <width>x<height>')
  }
  const dpr = numberArg(args, 'dpr', 1)
  const reducedMotion =
    args['reduced-motion'] === true || singleString(args, 'reduced-motion') === '1'
  const extraMeta: Record<string, string> = {}
  const metaValues = args.meta
  const metaList = Array.isArray(metaValues)
    ? metaValues
    : typeof metaValues === 'string'
      ? [metaValues]
      : []
  for (const pair of metaList) {
    const eq = pair.indexOf('=')
    if (eq <= 0) throw new Error(`--meta expects key=value, got: ${pair}`)
    extraMeta[pair.slice(0, eq)] = pair.slice(eq + 1)
  }

  const client = await connectBrowser(args)
  const tab = await openFreshTab(client, url, viewWidth, viewHeight, dpr)
  try {
    await client.send('Target.activateTarget', { targetId: tab.targetId })
    if (reducedMotion) {
      await client.send(
        'Emulation.setEmulatedMedia',
        { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
        tab.sessionId,
      )
    }
    const status = await new Promise<string | null>((resolve) => {
      const started = Date.now()
      const poll = async () => {
        try {
          const value = (await evaluateExpression(
            client,
            tab.sessionId,
            `(() => {
              const probe = document.querySelector('[data-status]')?.textContent?.trim() ?? ''
              if (probe) return probe
              const canvas = document.querySelector('canvas')
              const routeReady = (window).__jlzRouterReady === true
              const routeRoot = document.querySelector('[data-page-view]')
              return routeReady && canvas && routeRoot ? 'production-ready' : ''
            })()`,
            15_000,
          )) as string
          if (
            value === 'ready' ||
            value === 'production-ready' ||
            value.startsWith('error') ||
            Date.now() - started > 120_000
          ) {
            resolve(value || null)
            return
          }
        } catch {
          // Navigation may briefly detach the runtime context; keep polling.
        }
        setTimeout(poll, 400)
      }
      void poll()
    })
    if (status !== 'ready' && status !== 'production-ready') {
      throw new Error(`Probe did not reach ready (status: ${status ?? 'timeout'})`)
    }
    if (evalFn) {
      const trimmed = evalFn.trim()
      // Accept either an expression or a function expression (which is invoked).
      const isFunctionExpression = /^(async\s+)?(function\b|\([^)]*\)\s*=>|[\w$.]+\s*=>)/.test(
        trimmed,
      )
      const expression = isFunctionExpression ? `(${trimmed})()` : trimmed
      const evalResult = await evaluateExpression(client, tab.sessionId, expression)
      console.error(`[visual-parity] eval result: ${JSON.stringify(evalResult)}`)
    }
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs))
    const rect = (await evaluateExpression(
      client,
      tab.sessionId,
      `(() => {
        const canvas = document.querySelector('canvas')
        if (!canvas) return null
        const box = canvas.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height }
      })()`,
    )) as { x: number; y: number; width: number; height: number } | null
    if (!rect || rect.width < 1 || rect.height < 1) {
      throw new Error('Canvas is not visible or has zero size')
    }
    const shot = (await client.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
        captureBeyondViewport: false,
      },
      tab.sessionId,
    )) as { data: string }
    ensureParent(out)
    writeFileSync(out, Buffer.from(shot.data, 'base64'))
    const probe = (await evaluateExpression(
      client,
      tab.sessionId,
      `(() => {
        const canvas = document.querySelector('canvas')
        const rect = canvas ? canvas.getBoundingClientRect() : null
        const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null
        return {
          dataStatus: text('[data-status]'),
          dataBackend: text('[data-backend]'),
          dataRenderPath: text('[data-render-path]'),
          dataMotionMode: text('[data-motion-mode]'),
          canvasCssWidth: rect ? Math.round(rect.width) : null,
          canvasCssHeight: rect ? Math.round(rect.height) : null,
          canvasBackingWidth: canvas ? canvas.width : null,
          canvasBackingHeight: canvas ? canvas.height : null,
          viewportCss: window.innerWidth + 'x' + window.innerHeight,
          devicePixelRatio: window.devicePixelRatio,
          visibilityState: document.visibilityState,
        }
      })()`,
    )) as Record<string, unknown>
    const meta = {
      tool: 'scripts/visual-parity.ts capture',
      frame: out.split('/').pop() ?? out,
      url,
      commit,
      capturedAtUtc: new Date().toISOString(),
      browser: tab.browserName,
      viewport: `${viewWidth}x${viewHeight} CSS, DPR ${dpr}`,
      ...probe,
      ...extraMeta,
    }
    const metaPath = `${out}.meta.json`
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ ok: true, frame: out, meta: metaPath, ...probe }, null, 2))
  } finally {
    await tab.close()
    client.close()
  }
}

/* ------------------------------------------------------------------ *
 * diff
 * ------------------------------------------------------------------ */

interface MaskRect {
  label: string
  x: number
  y: number
  width: number
  height: number
}

function loadMasks(args: Args): MaskRect[] {
  const masksPath = singleString(args, 'masks')
  if (!masksPath) return []
  const parsed = JSON.parse(readFileSync(masksPath, 'utf8')) as { masks: MaskRect[] } | MaskRect[]
  const rects = Array.isArray(parsed) ? parsed : parsed.masks
  if (!Array.isArray(rects)) throw new Error(`Mask file must contain a "masks" array: ${masksPath}`)
  return rects
}

/** Runs inside a blank page; receives the frames as base64 PNG payloads. */
const DIFF_PAGE_FN = `async ({ aB64, bB64, threshold, masks }) => {
  const load = (dataBase64) =>
    new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('PNG decode failed'))
      image.src = 'data:image/png;base64,' + dataBase64
    })
  const [imageA, imageB] = await Promise.all([load(aB64), load(bB64)])
  const width = imageA.width
  const height = imageA.height
  if (width !== imageB.width || height !== imageB.height) {
    throw new Error('Size mismatch: ' + width + 'x' + height + ' vs ' + imageB.width + 'x' + imageB.height)
  }
  const draw = (image) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('2d context unavailable')
    context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, width, height).data
  }
  const pixelsA = draw(imageA)
  const pixelsB = draw(imageB)

  const masked = new Uint8Array(width * height)
  for (const rect of masks) {
    const x0 = Math.max(0, Math.floor(rect.x))
    const y0 = Math.max(0, Math.floor(rect.y))
    const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
    const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) masked[y * width + x] = 1
    }
  }

  const diff = new ImageData(width, height)
  const mask = new ImageData(width, height)
  let exceeded = 0
  let maskedCount = 0
  let maxDelta = 0
  let sumDelta = 0
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    const dR = (pixelsA[offset] - pixelsB[offset]) / 255
    const dG = (pixelsA[offset + 1] - pixelsB[offset + 1]) / 255
    const dB = (pixelsA[offset + 2] - pixelsB[offset + 2]) / 255
    const delta = Math.sqrt(dR * dR + dG * dG + dB * dB)
    if (delta > maxDelta) maxDelta = delta
    sumDelta += delta
    if (masked[i]) {
      maskedCount += 1
      mask.data[offset] = 255
      mask.data[offset + 1] = 255
      mask.data[offset + 2] = 255
      mask.data[offset + 3] = 255
      diff.data[offset] = 40
      diff.data[offset + 1] = 40
      diff.data[offset + 2] = 40
      diff.data[offset + 3] = 255
      continue
    }
    const value = Math.round(Math.min(1, delta / threshold) * 200)
    if (delta > threshold) {
      exceeded += 1
      diff.data[offset] = 255
      diff.data[offset + 1] = 40
      diff.data[offset + 2] = 40
      diff.data[offset + 3] = 255
    } else {
      diff.data[offset] = 20
      diff.data[offset + 1] = value
      diff.data[offset + 2] = value
      diff.data[offset + 3] = 255
    }
  }
  const toBase64 = (imageData) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2d context unavailable')
    context.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png').split(',')[1]
  }
  const unmasked = width * height - maskedCount
  return {
    width,
    height,
    pixels: width * height,
    maskedPixels: maskedCount,
    unmaskedPixels: unmasked,
    exceededPixels: exceeded,
    fraction: unmasked > 0 ? exceeded / unmasked : 0,
    maxDelta,
    meanDelta: sumDelta / (width * height),
    diffB64: toBase64(diff),
    maskB64: toBase64(mask),
  }
}`

interface DiffResult {
  width: number
  height: number
  pixels: number
  maskedPixels: number
  unmaskedPixels: number
  exceededPixels: number
  fraction: number
  maxDelta: number
  meanDelta: number
  diffB64: string
  maskB64: string
}

async function commandDiff(args: Args): Promise<void> {
  const aPath = requireString(args, 'a')
  const bPath = requireString(args, 'b')
  const base = requireString(args, 'base')
  const threshold = numberArg(args, 'threshold', 0.1)
  const maxFraction = numberArg(args, 'maxFraction', 0.005)
  const masks = loadMasks(args)
  const aB64 = readFileSync(aPath).toString('base64')
  const bB64 = readFileSync(bPath).toString('base64')

  const client = await connectBrowser(args)
  const tab = await openFreshTab(client, 'about:blank', 800, 600, 1)
  try {
    const result = (await evaluateExpression(
      client,
      tab.sessionId,
      `(${DIFF_PAGE_FN})(${JSON.stringify({ aB64, bB64, threshold, masks })})`,
      180_000,
    )) as DiffResult
    const diffPath = `${base}-diff.png`
    const reportPath = `${base}-report.json`
    const maskPath = `${base}-mask.png`
    ensureParent(diffPath)
    writeFileSync(diffPath, Buffer.from(result.diffB64, 'base64'))
    writeFileSync(maskPath, Buffer.from(result.maskB64, 'base64'))
    const pass = result.fraction <= maxFraction
    const report = {
      tool: 'scripts/visual-parity.ts diff',
      protocol:
        'docs/evidence/README.md "Measurement protocol": at most 0.5% of pixels may exceed a 0.1 perceptual threshold outside approved masks',
      metric:
        'per-pixel L2 distance of sRGB channels normalized to [0,1]; exceed when delta > threshold',
      a: aPath,
      b: bPath,
      threshold,
      maxFraction,
      masks: masks.map((rect) => rect.label),
      generatedAtUtc: new Date().toISOString(),
      ...result,
      pass,
    }
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = pass ? 0 : 1
  } finally {
    await tab.close()
    client.close()
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 0) {
    console.error('Usage: see the header of scripts/visual-parity.ts')
    process.exit(2)
  }
  const [command, ...rest] = argv
  const args = parseArgs(rest)
  if (command === 'capture') {
    await commandCapture(args)
  } else if (command === 'diff') {
    await commandDiff(args)
  } else {
    throw new Error(`Unknown command: ${command} (expected capture or diff)`)
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error)
  process.exit(2)
})
