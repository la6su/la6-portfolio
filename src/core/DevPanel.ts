// src/core/DevPanel.ts — Unified debug panel (Tweakpane) for dev mode.
//
// Replaces both DevPanel + DebugStats. Single panel top-right with:
//   - Stats: FPS, frame time, draw calls, triangles, heap, backend, section
//   - Navigation: section slider, prev/next buttons
//   - BakuCarousel: prev/next, trigger morph
//   - Render: exposure, force render toggle, reload
//
// Hidden by default. Toggle with Backquote (`) or Ctrl+D — state is
// persisted to localStorage so the choice survives reloads.
// Production: never constructed (Experience.init guards on import.meta.env.DEV).

import { Pane } from 'tweakpane'
import type * as THREE from 'three'
import type { RuntimeResourceSnapshot } from './RuntimeResourceSnapshot'
import { getLang } from './i18n'
import { FrameGapStats } from './FrameGapStats'
import { inspectUnifiedBackend } from './unifiedRenderer'

interface CarouselDebugControls {
  isActive: boolean
  setActive(active: boolean): void
}

interface GroundDebugControls {
  object: { visible: boolean } | null
}

interface DevPanelHost {
  scene: THREE.Scene
  renderer: {
    instance: {
      backend?: unknown
      info?: {
        render?: {
          drawCalls?: number
          frameCalls?: number
          calls?: number
          triangles?: number
        }
        memory?: { geometries?: number; textures?: number }
      }
      toneMappingExposure: number
    }
    getResourceSnapshot(scene: THREE.Scene): RuntimeResourceSnapshot
  }
  ground: GroundDebugControls
  carousel(): CarouselDebugControls | null
  sectionIndex(): number
  worldSectionIndex(): number
  navigateProject(direction: -1 | 1): void
  needsRender(): boolean
  lowFps(): boolean
  setDebugContinuousRendering(enabled: boolean): void
}

const STORAGE_KEY = 'jlz:devpanel'

interface DevPanelState {
  visible: boolean
}

function loadState(): DevPanelState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { visible: false }
}

function saveState(s: DevPanelState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

interface PaneLike {
  element: HTMLElement
  addFolder(opts: { title: string; expanded?: boolean }): PaneLike
  addBinding(
    target: object,
    key: string,
    opts?: Record<string, unknown>,
  ): {
    on(evt: 'change', cb: (ev: { value: unknown }) => void): void
  }
  addButton(opts: { title: string }): { on(evt: 'click', cb: () => void): void }
  refresh(): void
  dispose(): void
}

export class DevPanel {
  private pane: PaneLike
  private state: DevPanelState
  private readonly host: DevPanelHost
  private refreshInterval: ReturnType<typeof setInterval> | null = null
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null

  // Live stats (updated by interval, bound to Tweakpane readonly fields)
  private stats = {
    fps: 0,
    frameMs: 0,
    frameP50: 0,
    frameP95: 0,
    drawCalls: 0,
    triangles: 0,
    heap: 0,
    backend: '?',
    section: 0,
    rendering: false,
    lang: '?',
    lowFps: false,
    sceneGeometries: 0,
    sceneMaterials: 0,
    sceneTextures: 0,
    rendererCanvasCount: 0,
    documentCanvasCount: 0,
  }

  // Controls
  private controls = {
    exposure: 1.0,
    forceRender: false,
    groundVisible: true,
  }

  constructor(host: DevPanelHost) {
    this.host = host
    this.state = loadState()

    this.pane = new Pane({
      title: 'JLZ · dev',
      expanded: this.state.visible,
    }) as unknown as PaneLike
    this.pane.element.style.position = 'fixed'
    this.pane.element.style.top = '12px'
    this.pane.element.style.right = '12px'
    this.pane.element.style.zIndex = '99999'
    this.pane.element.style.opacity = '0.92'

    this.syncControls()
    this.buildStatsFolder()
    this.buildCarouselFolder()
    this.buildRenderFolder()
    this.buildSceneFolder()

    this.bindToggle()
    this.applyVisibility()
    this.startRefresh()
  }

  // ── Stats folder ──────────────────────────────────────────────────────
  private buildStatsFolder(): void {
    const f = this.pane.addFolder({ title: 'Stats', expanded: true })
    f.addBinding(this.stats, 'fps', { readonly: true, label: 'fps' })
    f.addBinding(this.stats, 'frameMs', { readonly: true, label: 'frame ms' })
    f.addBinding(this.stats, 'frameP50', { readonly: true, label: 'p50 ms' })
    f.addBinding(this.stats, 'frameP95', { readonly: true, label: 'p95 ms' })
    f.addBinding(this.stats, 'lowFps', { readonly: true, label: 'low fps ⚠' })
    f.addBinding(this.stats, 'backend', { readonly: true, label: 'backend' })
    f.addBinding(this.stats, 'lang', { readonly: true, label: 'lang' })
    f.addBinding(this.stats, 'drawCalls', { readonly: true, label: 'draw calls' })
    f.addBinding(this.stats, 'triangles', { readonly: true, label: 'triangles' })
    f.addBinding(this.stats, 'heap', { readonly: true, label: 'heap MB' })
    f.addBinding(this.stats, 'section', { readonly: true, label: 'section' })
    f.addBinding(this.stats, 'rendering', { readonly: true, label: 'rendering' })
    f.addBinding(this.stats, 'rendererCanvasCount', {
      readonly: true,
      label: 'renderer canvases',
    })
    f.addBinding(this.stats, 'documentCanvasCount', {
      readonly: true,
      label: 'document canvases',
    })
    f.addBinding(this.stats, 'sceneGeometries', { readonly: true, label: 'scene geometries' })
    f.addBinding(this.stats, 'sceneMaterials', { readonly: true, label: 'scene materials' })
    f.addBinding(this.stats, 'sceneTextures', { readonly: true, label: 'scene textures' })
  }

  // ── Navigation is deliberately absent: the cinematic story track owns it,
  // and DevPanel stays a diagnostics surface, not a second navigation input
  // (the 2026-07-11 slider/prev-next folder was removed for that reason).

  // ── BakuCarousel folder ───────────────────────────────────────────────
  private buildCarouselFolder(): void {
    const f = this.pane.addFolder({ title: 'BakuCarousel', expanded: false })
    f.addButton({ title: '← Prev card' }).on('click', () => {
      this.host.navigateProject(-1)
    })
    f.addButton({ title: 'Next card →' }).on('click', () => {
      this.host.navigateProject(1)
    })
    f.addButton({ title: 'Trigger morph' }).on('click', () => {
      const carousel = this.host.carousel()
      carousel?.setActive(!carousel.isActive)
    })
  }

  // ── Scene folder (ground plane + diagnostics) ───────────────────────
  private buildSceneFolder(): void {
    const f = this.pane.addFolder({ title: 'Scene', expanded: false })
    f.addBinding(this.controls, 'groundVisible', { label: 'ground plane' }).on('change', (ev) => {
      if (this.host.ground.object) this.host.ground.object.visible = ev.value as boolean
    })
    f.addButton({ title: 'Reset ground (section 4 only)' }).on('click', () => {
      // Restore the contact-only ground visibility invariant.
      if (this.host.ground.object) {
        this.host.ground.object.visible = this.host.worldSectionIndex() === 4
      }
      this.controls.groundVisible = this.host.ground.object?.visible ?? false
      this.pane.refresh()
    })
  }

  // ── Render folder ─────────────────────────────────────────────────────
  private buildRenderFolder(): void {
    const f = this.pane.addFolder({ title: 'Render', expanded: false })
    f.addBinding(this.controls, 'exposure', { label: 'exposure', min: 0, max: 3, step: 0.05 }).on(
      'change',
      (ev) => {
        this.host.renderer.instance.toneMappingExposure = ev.value as number
      },
    )
    f.addBinding(this.controls, 'forceRender', { label: 'force render' }).on('change', (ev) =>
      this.host.setDebugContinuousRendering(Boolean(ev.value)),
    )
    f.addButton({ title: 'Reload page' }).on('click', () => location.reload())
  }

  // ── Refresh loop — updates stats + force-render ───────────────────────
  private startRefresh(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval)
    this.refreshInterval = setInterval(() => {
      // The panel is hidden by default. Avoid traversing the entire scene for
      // resource counts or refreshing Tweakpane while its diagnostics are out
      // of view; the next visible refresh reads a fresh snapshot.
      if (!this.state.visible) return

      // Update stats from renderer info
      const r = this.host.renderer.instance
      const backend = inspectUnifiedBackend(r)
      this.stats.backend =
        backend.backendName === 'WebGPUBackend'
          ? 'WebGPU'
          : backend.backendName === 'WebGLBackend'
            ? 'WebGL2'
            : 'Unknown'
      const renderInfo = r?.info?.render
      this.stats.drawCalls = renderInfo?.drawCalls ?? renderInfo?.frameCalls ?? 0
      this.stats.triangles = renderInfo?.triangles ?? 0

      // Heap (Chrome only)
      const perf = performance as unknown as { memory?: { usedJSHeapSize: number } }
      this.stats.heap = perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : 0

      // Section + rendering state
      this.stats.section = this.host.sectionIndex()
      this.stats.rendering = this.host.needsRender()
      this.stats.lowFps = this.host.lowFps()
      this.stats.lang = getLang()
      const resources = this.getResourceSnapshot()
      this.stats.rendererCanvasCount = resources.rendererCanvasCount
      this.stats.documentCanvasCount = resources.documentCanvasCount
      this.stats.sceneGeometries = resources.scene.geometries
      this.stats.sceneMaterials = resources.scene.materials
      this.stats.sceneTextures = resources.scene.textures

      // Actual rendered frames, not the browser's independent rAF cadence.
      if (performance.now() - this._lastRenderedAt > 750) {
        this._fps = 0
        this._frameMs = 0
      }
      this.stats.fps = this._fps
      this.stats.frameMs = this._frameMs
      const framePercentiles = this._frameGaps.snapshot()
      if (framePercentiles) {
        this.stats.frameP50 = framePercentiles.p50
        this.stats.frameP95 = framePercentiles.p95
      }

      this.pane.refresh()
    }, 500)
  }

  private _fps = 0
  private _frameMs = 0
  private _fpsLastTime: number | null = null
  private _lastRenderedAt = 0
  private _fpsFrames = 0
  private readonly _frameGaps = new FrameGapStats()

  /** Record one real scene render. Idle on-demand frames intentionally read 0. */
  recordRenderFrame(now = performance.now()): void {
    const gap = this._lastRenderedAt > 0 ? now - this._lastRenderedAt : 0
    this._lastRenderedAt = now
    if (this._fpsLastTime === null || gap > 100) {
      this._fps = 0
      this._frameMs = 0
      this._fpsLastTime = now
      this._fpsFrames = 0
      this._frameGaps.reset()
      this.stats.frameP50 = 0
      this.stats.frameP95 = 0
      return
    }

    this._frameGaps.record(gap)
    this._fpsFrames += 1
    const delta = now - this._fpsLastTime
    if (delta < 500) return

    this._fps = Math.round((this._fpsFrames * 1000) / delta)
    this._frameMs = Math.round((delta / this._fpsFrames) * 10) / 10
    this._fpsFrames = 0
    this._fpsLastTime = now
  }

  /** Development-only stable inventory for DevTools and soak automation. */
  public getResourceSnapshot(): RuntimeResourceSnapshot {
    return this.host.renderer.getResourceSnapshot(this.host.scene)
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private syncControls(): void {
    this.controls.exposure = this.host.renderer.instance.toneMappingExposure ?? 1.0
  }

  private applyVisibility(): void {
    const el = this.pane.element
    if (this.state.visible) {
      el.style.display = ''
      el.style.pointerEvents = 'auto'
    } else {
      el.style.display = 'none'
      el.style.pointerEvents = 'none'
    }
  }

  private bindToggle(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      // Toggle on: ` (backtick), ~ (Shift+backtick), or Ctrl+D
      if (e.key === '`' || e.key === '~' || (e.ctrlKey && e.key.toLowerCase() === 'd')) {
        e.preventDefault()
        this.state.visible = !this.state.visible
        this.applyVisibility()
        saveState(this.state)
      }
    }
    window.addEventListener('keydown', this.keydownHandler)
  }

  dispose(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
    }
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler)
      this.keydownHandler = null
    }
    this.pane.dispose()
  }
}
