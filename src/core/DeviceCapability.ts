type RendererMode = 'webgpu' | 'webgl'
export type QualityTier = 'high' | 'medium' | 'low'

/**
 * Pure per-mode DPR cap — the fill-rate budget. Full-screen TSL post scales
 * with pixel count: a 2× DPR renders four pixels per CSS pixel and can miss
 * v-sync on 120/144Hz panels even with light geometry, so 1.5 stays crisp
 * while cutting ~44% of the fill work. WebGL2 drops to 1 on mobile. This is
 * shared by DeviceCapability and SceneHost's live TresCanvas `:dpr`
 * cap — Tres re-applies the prop on every internal sizes change, so both
 * writers must agree or the stale one wins after a resize.
 */
export function maxDprForMode(mode: RendererMode, isMobile: boolean): number {
  return mode === 'webgl' && isMobile ? 1 : 1.5
}

/** Keep the full-screen TSL graph off low-tier devices on either backend. */
export function supportsPostProcessing(tier: QualityTier): boolean {
  return tier !== 'low'
}

const TIER_SETTINGS: Record<QualityTier, { postMultiplier: number }> = {
  low: {
    postMultiplier: 0.4,
  },
  medium: {
    postMultiplier: 0.7,
  },
  high: {
    postMultiplier: 1.0,
  },
}

function detectMobile(): boolean {
  const hasTouch = navigator.maxTouchPoints > 0
  const smallScreen = Math.min(screen.width, screen.height) < 768
  const uaMobile = /Mobi|Android|Silicon|iPhone/i.test(navigator.userAgent)
  if (hasTouch && smallScreen) return true
  if (hasTouch && uaMobile) return true
  if (smallScreen && uaMobile) return true
  return false
}

function isLowEndDesktop(): boolean {
  const cores = navigator.hardwareConcurrency || 4
  const dpr = window.devicePixelRatio || 1
  const viewportPx = screen.width * screen.height
  // Low-end: <=4 cores, low DPR, small viewport
  return cores <= 4 && dpr < 1.3 && viewportPx < 1920 * 1080
}

export class DeviceCapability {
  private static instance: DeviceCapability
  public tier: QualityTier
  public mode: RendererMode
  public readonly isMobile: boolean
  public readonly isTouch: boolean

  public get maxDpr(): number {
    return maxDprForMode(this.mode, this.isMobile)
  }

  public get postProcessing(): boolean {
    return supportsPostProcessing(this.tier)
  }

  private constructor() {
    this.isMobile = detectMobile()
    this.isTouch = navigator.maxTouchPoints > 0

    this.mode = this.detectInitialRendererMode()
    this.tier = this.detectTier()
  }

  public static getInstance(): DeviceCapability {
    if (!DeviceCapability.instance) {
      DeviceCapability.instance = new DeviceCapability()
    }
    return DeviceCapability.instance
  }

  /**
   * Commit the renderer that was actually created. WebGPU availability is only
   * a hint: WebGPURenderer can still fall back to WebGL after async init.
   */
  public setFinalRendererMode(mode: RendererMode, isFallbackAdapter: boolean | null = null): void {
    this.mode = mode
    this.tier = isFallbackAdapter === true ? 'low' : this.detectTier()
  }

  /** Initial DPR/tier hint; SceneHost records the backend Three initializes. */
  private detectInitialRendererMode(): RendererMode {
    // WebGPU requires a SECURE CONTEXT (HTTPS or localhost).
    // Accessing via LAN IP (http://192.168.x.x) is NOT secure context —
    // navigator.gpu is undefined even if the browser supports WebGPU.
    // Check isSecureContext first and log a warning if not secure.
    if ('gpu' in navigator) {
      return 'webgpu'
    }
    // WebGPU API exists but not available — likely non-secure context
    if (
      typeof navigator !== 'undefined' &&
      !('gpu' in navigator) &&
      typeof isSecureContext !== 'undefined' &&
      !isSecureContext
    ) {
      console.warn(
        '[DeviceCapability] WebGPU not available — page is not a secure context.\n' +
          'WebGPU requires HTTPS or localhost. Accessing via LAN IP (http://192.168.x.x) will NOT work.\n' +
          'Use http://localhost:5173/ or configure Vite with HTTPS for LAN access.',
      )
    }
    // Three's WebGPURenderer owns WebGL2 backend detection and initialization.
    // Do not probe with a second canvas/context here.
    return 'webgl'
  }

  // ── Tier detection: weigh all signals ──

  private detectTier(): QualityTier {
    // Mobile: start at low, upgrade with strong signals
    if (this.isMobile) {
      return this.detectMobileTier()
    }

    // Desktop: weigh performance signals
    if (isLowEndDesktop()) return 'low'

    const cores = navigator.hardwareConcurrency || 8
    const dpr = window.devicePixelRatio || 1
    const isWebGPU = this.mode === 'webgpu'
    const isWebGL2 = this.mode === 'webgl'

    // WebGPU: allow 'high' tier on capable desktops (native WebGPU via
    // Vulkan/D3D12/Metal handles TSL post-processing well). The original
    // 'medium' cap was a workaround for ANGLE/OpenGL fallback on Chrome/
    // Wayland/NVIDIA — that's a local env issue, not fundamental to WebGPU.
    if (isWebGPU) {
      if (cores >= 8 && dpr >= 1.5) return 'high'
      return 'medium'
    }

    // WebGL2: High only with strong signal
    if (isWebGL2 && cores >= 12 && dpr >= 2) return 'high'
    if (isWebGL2 && cores >= 6) return 'medium'

    return 'low'
  }

  private detectMobileTier(): QualityTier {
    const cores = navigator.hardwareConcurrency || 2
    const dpr = window.devicePixelRatio || 1

    // High-end mobile: 8+ cores, high DPR
    if (cores >= 8 && dpr >= 3) return 'medium'
    // Mid-range: 6+ cores or moderate DPR
    if (cores >= 6 || dpr >= 2) return 'medium'

    return 'low'
  }

  // ── Per-operation helpers ──

  public scaleIntensity(value: number): number {
    return value * TIER_SETTINGS[this.tier].postMultiplier
  }
}
