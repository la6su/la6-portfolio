// Demand-driven frame scheduler. It installs a callback for bounded activity
// windows and clears it when the scene settles.
//
// Contract:
// - start on dirty work or resume;
// - keep the loop while the host reports unsettled;
// - stop after the settled frame;
// - pause hidden tabs and invalidate once on resume;
// - reduced motion settles synchronously.
//
// SceneHost connects the framework-neutral LoopDriver to Tres's persistent
// loop so Tres and Cientos subscribers share one RAF.

export type FrameReason =
  | 'first-frame'
  | 'dirty'
  | 'breath'
  | 'nav'
  | 'cursor'
  | 'resize'
  | 'motion-preference'
  | 'visibility-resume'
  | 'recovery'
  /** An ecosystem `invalidate()` (Tres/Cientos) translated by the SceneHost bridge. */
  | 'external'

/** The single edge to the renderer's animation loop. */
export interface LoopDriver {
  /** Install the frame callback (delta in ms), or `null` to stop the loop. */
  setLoop(callback: ((deltaMs: number) => void) | null): void
}

/** The frame work and settle state, owned by the scene runtime. */
export interface SchedulerHost {
  /** Run one frame of work. Called only while the loop is active and visible. */
  onFrame(deltaMs: number): void
  /**
   * Called after each frame: has everything settled (no active scene work,
   * no pending demand)? `true` stops the loop after the frame.
   */
  isSettled(): boolean
}

interface SchedulerOptions {
  /**
   * Listen to `document.visibilitychange` automatically (browser default).
   * Tests drive `setHidden` manually.
   */
  autoVisibility?: boolean
}

interface SchedulerDiagnostics {
  /** True while the renderer loop is installed. */
  loopActive: boolean
  /** True while the tab is hidden (advancement paused). */
  hidden: boolean
  /** Total frames handed to the host. */
  frames: number
  /** Frames that stopped the loop (the host settled). */
  settledFrames: number
  /** Last reason that started (or would have started) the loop. */
  lastInvalidation: FrameReason | null
}

export class RenderScheduler {
  private readonly _driver: LoopDriver
  private readonly _host: SchedulerHost

  private _loopActive = false
  private _hidden = false
  private _destroyed = false
  private _frames = 0
  private _settledFrames = 0
  private _lastInvalidation: FrameReason | null = null

  private readonly _frameCallback: (deltaMs: number) => void
  private _onVisibilityChange: (() => void) | null = null

  constructor(driver: LoopDriver, host: SchedulerHost, options: SchedulerOptions = {}) {
    this._driver = driver
    this._host = host

    this._frameCallback = (deltaMs: number) => {
      if (this._destroyed || !this._loopActive) return
      this._frames += 1
      try {
        this._host.onFrame(deltaMs)
        if (this._host.isSettled()) {
          this._settledFrames += 1
          this._stop()
        }
      } catch (error) {
        // A frame owner failure must not leave the driver installed forever.
        // The next explicit invalidation can retry after the owner recovers;
        // keep the failure visible instead of silently freezing the scene.
        this._stop()
        console.error('[RenderScheduler] frame failed; loop stopped.', error)
      }
    }

    const autoVisibility = options.autoVisibility ?? typeof document !== 'undefined'
    if (autoVisibility) {
      this._hidden = document.hidden
      const onVisibilityChange = () => this.setHidden(document.hidden)
      document.addEventListener('visibilitychange', onVisibilityChange)
      this._onVisibilityChange = onVisibilityChange
    } else {
      this._onVisibilityChange = null
    }
  }

  /**
   * Request work. One-shot: the pending frame is consumed by the next tick;
   * calls while the loop is already running coalesce into it. While hidden
   * the invalidation is dropped — advancement is paused and the resume
   * invalidation (exactly one) provides the catch-up frame.
   */
  invalidate(reason: FrameReason = 'dirty'): void {
    if (this._destroyed) return
    this._lastInvalidation = reason
    if (this._hidden) {
      // Advancement is paused while hidden; the resume invalidation
      // (exactly one) covers the catch-up frame.
      return
    }
    this._start()
  }

  /**
   * Pause advancement (hidden tab) or resume it. Resuming always causes
   * exactly one invalidation, per the scheduler contract.
   */
  setHidden(hidden: boolean): void {
    if (this._destroyed || hidden === this._hidden) return
    this._hidden = hidden
    if (hidden) {
      if (this._loopActive) this._stop()
    } else {
      this.invalidate('visibility-resume')
    }
  }

  /**
   * Settle synchronously (reduced motion): stop the loop now. The current
   * frame, if any, completes; no further frames run.
   */
  settleNow(): void {
    if (this._loopActive) this._stop()
  }

  /** Stop the loop and release the visibility listener. */
  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this._stop()
    if (this._onVisibilityChange) {
      document.removeEventListener('visibilitychange', this._onVisibilityChange)
      this._onVisibilityChange = null
    }
  }

  get diagnostics(): SchedulerDiagnostics {
    return {
      loopActive: this._loopActive,
      hidden: this._hidden,
      frames: this._frames,
      settledFrames: this._settledFrames,
      lastInvalidation: this._lastInvalidation,
    }
  }

  private _start(): void {
    if (this._loopActive || this._destroyed) return
    this._loopActive = true
    this._driver.setLoop(this._frameCallback)
  }

  private _stop(): void {
    if (!this._loopActive) return
    this._loopActive = false
    this._driver.setLoop(null)
  }
}
