// ShowreelTheater — lazy owner of the fullscreen showreel playback surface.
//
// The showreel is no longer a UIKit modal: it is a dedicated render mode of
// the ONE renderer pipeline. While the theater is open, Experience swaps the
// rendered scene for this owner's private scene (one orthographic camera +
// one fullscreen quad with a TSL NodeMaterial), so the WebGL world never
// re-mounts and the shared post graph (grain, chromatic separation, CRT
// bezel) keeps grading the frame. "One canvas, one renderer, one loop" holds.
//
// The transition is authored in the shader: a phosphor scan bar sweeps the
// viewport while horizontal signal slices lock in with a hash-staggered
// displacement, then the film is revealed cover-fit. The same graph runs the
// exit in reverse (the frozen last film frame stays as the backdrop). Under
// reduced motion the transition snaps: no sweep, no slices, instant state.
//
// Media contract: the <video> element and its VideoTexture are created
// lazily by this owner, the source is only assigned on the first open
// (no showreel bytes on the initial page load), and the decoded poster
// texture stands in until the first real video frame is decodable.

import * as THREE from 'three'
import { MeshBasicNodeMaterial, type UniformNode } from 'three/webgpu'
import {
  Fn,
  uv,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  sin,
  fract,
  floor,
  abs,
  smoothstep,
  mix,
  step,
  texture,
} from 'three/tsl'
import { eventBus } from '../../core/EventBus'
import { prefersReducedMotion } from '../../core/motionPolicy'

/** Duration of the enter transition, in seconds. */
const ENTER_DURATION = 1.05
/** Duration of the exit transition, in seconds. */
const EXIT_DURATION = 0.65
/** Number of horizontal signal slices in the transition. */
const SLICE_COUNT = 22

type ShowreelPhase = 'closed' | 'enter' | 'open' | 'exit'

export interface ShowreelState {
  phase: ShowreelPhase
  playing: boolean
  time: number
  duration: number
}

/** Smooth symmetric ease for the transition progress. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export class ShowreelTheater {
  /** Private render surface — swapped in by Experience while active. */
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private phase: ShowreelPhase = 'closed'
  private disposed = false
  private reducedMotion = prefersReducedMotion()

  /** 0 (fully covered acquisition field) → 1 (film fully revealed). */
  private progress = 0
  /** Shader clock — advances only while a transition runs. */
  private transitionTime = 0
  /** Progress the current enter started from (continuous re-entry mid-exit). */
  private enterStart = 0
  /** Progress the current exit started from (continuous close mid-enter). */
  private exitStart = 1

  private video: HTMLVideoElement | null = null
  private videoTexture: THREE.VideoTexture | null = null
  private posterTexture: THREE.Texture | null = null
  private readonly mediaListeners = new AbortController()

  // Per-instance uniform nodes — JS-advanced only on rendered frames.
  private readonly _progressUni: UniformNode<'float', number>
  private readonly _timeUni: UniformNode<'float', number>
  private readonly _videoAspectUni: UniformNode<'float', number>
  private readonly _viewAspectUni: UniformNode<'float', number>
  private readonly _hasFrameUni: UniformNode<'float', number>
  private readonly _glitchUni: UniformNode<'float', number>

  private readonly material: MeshBasicNodeMaterial
  private readonly quad: THREE.Mesh

  constructor(
    private readonly videoSrc: string,
    private readonly posterSrc: string,
  ) {
    const progress = uniform(0)
    const time = uniform(0)
    const videoAspect = uniform(16 / 9)
    const viewAspect = uniform(16 / 9)
    const hasFrame = uniform(0)
    const glitch = uniform(1)
    // The acquisition field + frontier glow read as one phosphor signal —
    // constant across UI themes because the theater is always dark.
    const tint = uniform(new THREE.Color(0x9fffcf))

    const videoTex = this.ensureVideoTexture()
    const posterTex = this.ensurePosterTexture()

    const mat = new MeshBasicNodeMaterial({
      transparent: false,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    })

    mat.colorNode = Fn(() => {
      // ── Cover-fit sampling ──
      // Map viewport UV into the film's UV space so the media fills the
      // screen and crops the overflow (never letterboxes). A wider film
      // (videoAspect > viewAspect) crops left/right; otherwise top/bottom.
      const base = uv().sub(0.5)
      const sx = mix(float(1.0), viewAspect.div(videoAspect), step(viewAspect, videoAspect))
      const sy = mix(float(1.0), videoAspect.div(viewAspect), step(videoAspect, viewAspect))
      const fitUv = base.mul(vec2(sx, sy)).add(0.5)

      // ── Signal slices ──
      // Hash-staggered horizontal displacement: every slice locks at its own
      // threshold while the scan bar sweeps, so the reveal reads as an
      // acquired signal rather than a wipe.
      const slice = floor(fitUv.y.mul(float(SLICE_COUNT)))
      const seed = sin(slice.mul(12.9898)).mul(43758.5453)
      const hash = fract(seed).sub(0.5)
      const lockAt = hash.abs().mul(0.85).add(0.05)
      const unlocked = step(lockAt, progress.oneMinus())
      const shifted = fitUv.add(vec2(hash.mul(0.18).mul(unlocked), float(0.0))).clamp(0.0, 1.0)

      const clean = mix(texture(posterTex, fitUv), texture(videoTex, fitUv), hasFrame)
      const sliced = mix(texture(posterTex, shifted), texture(videoTex, shifted), hasFrame)
      // Unlocked slices carry the displaced sampler; locked ones converge on
      // the clean film so the graph settles to a single image at progress 1.
      const media = mix(sliced, clean, unlocked.oneMinus())

      // ── Reveal field ──
      const sweepY = progress.oneMinus() // 1 → 0 as the bar sweeps down
      const frontierDist = uv().y.sub(sweepY)
      // Thin phosphor frontier + soft trailing glow around the frontier.
      const frontier = smoothstep(0.015, 0.0, abs(frontierDist))
        .mul(1.6)
        .add(smoothstep(0.22, 0.0, abs(frontierDist)).mul(0.24))
      // Content below the frontier is still the dark acquisition field.
      const isRevealed = step(sweepY, uv().y)

      // ── Acquisition field ──
      // Dark phosphor wash with a faint rolling line pattern — the console
      // "no signal" state that the transition sweeps away.
      const lines = sin(uv().y.mul(240.0).add(time.mul(6.0)))
        .mul(0.5)
        .add(0.5)
        .mul(0.05)
      const flicker = sin(time.mul(23.0)).mul(0.5).add(0.5).mul(0.02)
      const field = tint.mul(lines.add(flicker).add(0.02))

      // ── Chromatic split near the frontier — strongest while transitioning.
      const split = frontier.mul(0.12).mul(glitch)
      const graded = vec3(media.r.add(split), media.g, media.b.sub(split)).clamp(0.0, 1.0)

      const composited = mix(field, graded, isRevealed)
      const withFrontier = composited.add(tint.mul(frontier).mul(0.35).mul(glitch))
      return vec4(withFrontier, 1.0)
    })()

    this.material = mat
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    this.quad.name = 'showreel-theater-quad'
    this.quad.frustumCulled = false
    this.scene.add(this.quad)

    this._progressUni = progress
    this._timeUni = time
    this._videoAspectUni = videoAspect
    this._viewAspectUni = viewAspect
    this._hasFrameUni = hasFrame
    this._glitchUni = glitch

    // Publish the initial state so a late chrome listener can still sync.
    this.emitState()
  }

  // ── Public state surface ──

  get currentPhase(): ShowreelPhase {
    return this.disposed ? 'closed' : this.phase
  }

  /** True while the theater must keep drawing frames. */
  get isAnimating(): boolean {
    if (this.disposed || this.phase === 'closed') return false
    if (this.phase === 'enter' || this.phase === 'exit') return true
    // Open + video playing → the VideoTexture updates every frame.
    return Boolean(this.video && !this.video.paused && !this.video.ended)
  }

  // ── Commands (eventBus-driven from ShowreelConsole) ──

  open(): void {
    if (this.disposed || this.phase === 'open' || this.phase === 'enter') return
    this.ensureVideoSource()
    // Autoplay begins muted (autoplay policy); chrome surfaces the state.
    void Promise.resolve(this.video?.play()).catch(() => undefined)
    this.transitionTime = 0
    if (this.reducedMotion) {
      this.phase = 'open'
      this.progress = 1
      this._progressUni.value = 1
      this._glitchUni.value = 0
    } else {
      // Re-entry mid-exit continues from the current progress instead of
      // snapping back to the fully covered field.
      this.enterStart = this.phase === 'exit' ? this.progress : 0
      this.phase = 'enter'
      this._glitchUni.value = 1
    }
    this.emitState()
  }

  close(): void {
    if (this.disposed || this.phase === 'closed' || this.phase === 'exit') return
    this.video?.pause()
    if (this.reducedMotion) {
      this.settleClosed()
      return
    }
    this.exitStart = this.progress
    this.transitionTime = 0
    this.phase = 'exit'
    this._glitchUni.value = 1
    this.emitState()
  }

  togglePlay(): void {
    if (this.disposed || !this.video) return
    if (this.video.paused) {
      void Promise.resolve(this.video.play()).catch(() => undefined)
    } else {
      this.video.pause()
    }
  }

  /** Forward a live preference change; an open theater settles instantly. */
  setReducedMotion(reduced: boolean): void {
    if (this.disposed) return
    this.reducedMotion = reduced
    if (!reduced) return
    this._glitchUni.value = 0
    if (this.phase === 'enter') {
      this.phase = 'open'
      this.progress = 1
      this._progressUni.value = 1
      this.emitState()
    } else if (this.phase === 'exit') {
      this.settleClosed()
    }
  }

  /** Per-frame advance — called by Experience only inside the render gate. */
  update(dt: number, viewAspect: number): void {
    if (this.disposed || this.phase === 'closed') return
    this._viewAspectUni.value = viewAspect
    if (this.video && this.video.videoWidth > 0) {
      this._videoAspectUni.value = this.video.videoWidth / this.video.videoHeight
    }

    if (this.phase === 'enter') {
      this.transitionTime += dt
      const t = easeInOutCubic(Math.min(1, this.transitionTime / ENTER_DURATION))
      this.progress = this.enterStart + (1 - this.enterStart) * t
      if (this.progress >= 1) {
        this.progress = 1
        this.phase = 'open'
        this._glitchUni.value = 0
        this.emitState()
      }
    } else if (this.phase === 'exit') {
      this.transitionTime += dt
      const t = easeInOutCubic(Math.min(1, this.transitionTime / EXIT_DURATION))
      this.progress = this.exitStart * (1 - t)
      if (this.progress <= 0) {
        this.settleClosed()
        return
      }
    }
    this._progressUni.value = this.progress
    this._timeUni.value = this.transitionTime
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.mediaListeners.abort()
    this.video?.pause()
    this.videoTexture?.dispose()
    this.posterTexture?.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
    this.quad.removeFromParent()
    this.scene.clear()
    this.video?.remove()
    this.video = null
    this.videoTexture = null
    this.posterTexture = null
  }

  // ── Internals ──

  private settleClosed(): void {
    this.phase = 'closed'
    this.progress = 0
    this.transitionTime = 0
    this._progressUni.value = 0
    this._timeUni.value = 0
    this.emitState()
  }

  private ensureVideoTexture(): THREE.VideoTexture {
    if (this.videoTexture) return this.videoTexture
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.loop = true
    video.playsInline = true
    // Keep the element inert and out of layout — the shader samples it.
    video.style.display = 'none'
    video.setAttribute('aria-hidden', 'true')
    document.body.appendChild(video)

    const tex = new THREE.VideoTexture(video)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false

    video.addEventListener(
      'loadeddata',
      () => {
        this._hasFrameUni.value = 1
      },
      { once: true, signal: this.mediaListeners.signal },
    )
    const sync = () => this.emitState()
    video.addEventListener('timeupdate', sync, { signal: this.mediaListeners.signal })
    video.addEventListener('play', sync, { signal: this.mediaListeners.signal })
    video.addEventListener('pause', sync, { signal: this.mediaListeners.signal })

    this.video = video
    this.videoTexture = tex
    return tex
  }

  private ensurePosterTexture(): THREE.Texture {
    if (this.posterTexture) return this.posterTexture
    const tex = new THREE.TextureLoader().load(this.posterSrc)
    tex.colorSpace = THREE.SRGBColorSpace
    this.posterTexture = tex
    return tex
  }

  private ensureVideoSource(): void {
    this.ensureVideoTexture()
    const video = this.video
    if (!video) return
    if (!video.getAttribute('src')) {
      video.src = this.videoSrc
      video.load()
    }
  }

  private emitState(): void {
    if (this.disposed) return
    const state: ShowreelState = {
      phase: this.phase,
      playing: Boolean(this.video && !this.video.paused && !this.video.ended),
      time: this.video?.currentTime ?? 0,
      duration: Number.isFinite(this.video?.duration) ? (this.video?.duration ?? 0) : 0,
    }
    eventBus.emit('jlz:showreel-state', state)
  }
}
