// Short UI sounds synthesized at runtime with Web Audio oscillators.
//
// Lazy-init: AudioContext is created on the first play() call (after a user
// gesture, per browser autoplay policy). If AudioContext is unavailable or
// muted, play() is a silent no-op.
//

type SfxName = 'hover' | 'click' | 'open' | 'close'

export class SfxSystem {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private _muted = false
  private _started = false
  private _disposed = false

  /** Mute/unmute master gain. When muted, play() is a silent no-op. */
  setMuted(muted: boolean): void {
    this._muted = muted
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(muted ? 0 : 0.15, this.ctx.currentTime)
    }
  }

  get muted(): boolean {
    return this._muted
  }

  /** Play a named SFX. Lazy-inits AudioContext on first call (user gesture). */
  play(name: SfxName): void {
    if (this._muted || this._disposed) return
    if (!this._started) this.init()
    if (!this.ctx || !this.master) return
    // Browsers suspend AudioContext when a tab is backgrounded. Resume it on
    // the next interaction so scheduled effects work after returning.
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {
        /* ignore — will retry next play() */
      })
    }
    switch (name) {
      case 'hover':
        this.tick(880, 0.04, 0.08)
        break
      case 'click':
        this.tap(180, 0.08, 0.18)
        break
      case 'open':
        this.sweep(220, 660, 0.18, 0.12)
        break
      case 'close':
        this.sweep(660, 220, 0.18, 0.12)
        break
    }
  }

  /** Initialize AudioContext + master gain. Safe to call multiple times. */
  private init(): void {
    if (this._started || this._disposed) return
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this._muted ? 0 : 0.15
      this.master.connect(this.ctx.destination)
      this._started = true
    } catch {
      console.warn('[SfxSystem] Web Audio API not available — SFX disabled')
    }
  }

  /** Short high-frequency tick (hover). Sine, quick attack + decay. */
  private tick(freq: number, dur: number, peak: number): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, t)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** Short low-frequency tap (click). Triangle, slightly longer. */
  private tap(freq: number, dur: number, peak: number): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** Frequency sweep (open = up, close = down). Sine, smooth glide. */
  private sweep(fromHz: number, toHz: number, dur: number, peak: number): void {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(fromHz, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), t + dur)
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(peak, t + 0.02)
    gain.gain.setValueAtTime(peak, t + dur - 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(gain).connect(this.master)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  dispose(): void {
    this._disposed = true
    this.ctx?.close()
    this.ctx = null
    this.master = null
    this._started = false
  }
}

const SOUND_STORAGE_KEY = 'jlz:sound'

/** Read the sound preference from localStorage.
 *  Returns true (muted) when the key is absent, 'off', or any non-'on' value.
 *  This matches the persistent console's default. */
export function getSoundMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) !== 'on'
  } catch {
    return true
  }
}

/** Write the sound preference to localStorage. */
export function setSoundMutedPreference(muted: boolean): void {
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, muted ? 'off' : 'on')
  } catch {
    /* localStorage unavailable */
  }
}
