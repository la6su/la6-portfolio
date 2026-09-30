// src/Experience/Camera.ts — Cinematic camera: inertia, organic shake, FOV dynamics
import * as THREE from 'three'
import { Sizes } from './Sizes'
import { input } from './Input'
// (Easings import removed — inline easeInOutQuart, only function used)
import { Device } from '../core/DeviceCapability'
import { prefersReducedMotion } from '../core/motionPolicy'
import { isLabCameraActive } from '../core/labCameraPolicy'
import type { CameraTarget } from '../core/types'
import { getCurrentPage } from '../core/routePage'

const SP_STIFFNESS = 8
const SP_DAMPING = 3

export class Camera {
  instance: THREE.PerspectiveCamera
  private _disposed = false
  private _reducedMotion = prefersReducedMotion()

  // Owner-scoped scratch/state. These used to live at module scope, which
  // coupled concurrent Camera wrappers during HMR, recovery and tests.
  private readonly _offsetVec = new THREE.Vector3()
  private readonly _tempQuat = new THREE.Quaternion()
  private readonly _tempEuler = new THREE.Euler()
  private readonly springX = { pos: 0, vel: 0, target: 0 }
  private readonly springY = { pos: 0, vel: 0, target: 0 }

  // Smooth state
  private smoothPosition = new THREE.Vector3()
  private smoothTarget = new THREE.Vector3()
  private smoothFov = 75

  // ── Action shake ──
  private shakePower = 0
  private shakeDuration = 0
  private shakeTime = 0

  // ── Organic shake clock ──
  private organicTime = 0

  // ── FOV pulse ──
  private fovOffset = 0
  private sectionFovOffset = 0
  private targetFovOffset = 0
  // No pulse is active until pulse() or setFovOffset() starts a transition.
  // Starting settled prevents the demand scheduler from treating a newly
  // constructed camera as animated before the first authored transition.
  private fovTransitionT = 1
  private fovStartOffset = 0
  private fovDuration = 1.0
  // C12 fix: pulse phase-2 timer stored so destroy() can clear it.
  // Previously untracked → fired on destroyed Camera after HMR.
  private _pulseTimer: ReturnType<typeof setTimeout> | null = null

  // A-015: Per-section cursor follow strength
  private _cursorFollowStrength: number | null = null

  // Lab exploration (ADR 0005): true while the previous update() found the
  // Lab CameraControls owning the pose. The first frame after the hand-back
  // adopts the orbit pose as the smoothing origin (no authored-framing snap).
  private _yielded = false

  /** Set cursor follow strength for current section (A-015) */
  setCursorFollow(strength: number): void {
    if (this._disposed) return
    this._cursorFollowStrength = strength
  }

  /** @param instance Physical camera declared by the persistent SceneHost. */
  constructor(
    private readonly sizes: Sizes,
    instance: THREE.PerspectiveCamera,
  ) {
    this.instance = instance
    this.smoothPosition.set(0, 0, 3)
    this.instance.position.copy(this.smoothPosition)

    this.resize()
  }

  /**
   * Apply the current viewport port to the externally-owned camera.
   * Experience calls this from the single Sizes resize fan-out, so the camera
   * no longer installs a competing window listener beside Tres's own size
   * manager.
   */
  resize(): void {
    if (this._disposed) return
    this.instance.aspect = this.sizes.width / this.sizes.height
    this.instance.updateProjectionMatrix()
  }

  /** Release only wrapper-owned timers and state. */
  destroy(): void {
    if (this._disposed) return
    this._disposed = true
    // C12 fix: clear pending pulse timer so it doesn't fire on a destroyed Camera.
    if (this._pulseTimer) {
      clearTimeout(this._pulseTimer)
      this._pulseTimer = null
    }
  }

  /** Lerp camera base state toward target with exponential smoothing */
  updateSmooth(target: CameraTarget, deltaT: number, smoothing = 5) {
    if (this._disposed) return
    // While the Lab CameraControls own the pose the authored track is stale:
    // smoothing toward it would fight the user's orbit. update() re-adopts
    // the authored state from the live orbit pose on hand-back.
    if (isLabCameraActive()) return
    if (!target) return
    const lerp = 1 - Math.exp(-smoothing * deltaT)

    this.smoothPosition.lerp(target.position, lerp)
    this.smoothTarget.lerp(target.lookAt, lerp)
    this.smoothFov += (target.fov - this.smoothFov) * lerp
  }

  /** Trigger an action shake (impact on section change) */
  shake(power = 0.1, duration = 0.5) {
    if (this._disposed) return
    this.shakePower = power
    this.shakeDuration = duration
    // D-27 fix: reset shakeTime so the new shake starts at phase 0 (was
    // continuing from the previous shake's phase → phase discontinuity).
    this.shakeTime = 0
  }

  /** True while action shake is active (needs rendering). */
  get isShaking(): boolean {
    return !this._disposed && this.shakePower > 0 && this.shakeDuration > 0
  }

  /** True while the FOV pulse transition is animating (needs rendering). */
  get isPulsing(): boolean {
    return !this._disposed && this.fovTransitionT < 1
  }

  /** Set FOV offset for cinematic zoom-in on section arrival */
  setFovOffset(value: number, duration = 1) {
    if (this._disposed) return
    this.sectionFovOffset = value
    if (this._reducedMotion) {
      if (this._pulseTimer) {
        clearTimeout(this._pulseTimer)
        this._pulseTimer = null
      }
      this.fovOffset = value
      this.targetFovOffset = value
      this.fovStartOffset = value
      this.fovTransitionT = 1
      this.fovDuration = duration
      return
    }
    this.fovStartOffset = this.fovOffset
    this.targetFovOffset = value
    this.fovDuration = duration
    this.fovTransitionT = 0
  }

  /** Zoom pulse — FOV dips then returns for a "push-in" feel on section change.
   *  Positive amount = zoom in (FOV decreases). ~0.04 = subtle, ~0.08 = noticeable.
   *  Uses a two-phase transition: dips to -amount over half duration, then back to 0. */
  pulse(amount = 0.05, duration = 0.8): void {
    if (this._disposed) return
    if (this._reducedMotion) return
    // Clear any pending pulse timer (rapid section changes can overlap pulses)
    if (this._pulseTimer) {
      clearTimeout(this._pulseTimer)
      this._pulseTimer = null
    }
    // Phase 1: dip to -amount (zoom in)
    this.fovStartOffset = this.fovOffset
    this.targetFovOffset = -amount
    this.fovDuration = duration * 0.4
    this.fovTransitionT = 0
    // Phase 2: return to 0 after dip completes
    this._pulseTimer = setTimeout(() => {
      this.fovStartOffset = this.fovOffset
      this.targetFovOffset = this.sectionFovOffset
      this.fovDuration = duration * 0.6
      this.fovTransitionT = 0
      this._pulseTimer = null
    }, duration * 400)
  }

  /** Settle cinematic camera reactions on a live motion-policy change. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    if (!reduced) return

    if (this._pulseTimer) {
      clearTimeout(this._pulseTimer)
      this._pulseTimer = null
    }

    this.shakePower = 0
    this.shakeDuration = 0
    this.shakeTime = 0
    this.springX.vel = 0
    this.springY.vel = 0
    this.springX.pos = 0
    this.springY.pos = 0
    this.springX.target = 0
    this.springY.target = 0

    // A pending pulse is decorative and returns to the persistent section
    // framing target; it must never freeze the transient dip on screen.
    this.fovOffset = this.sectionFovOffset
    this.targetFovOffset = this.sectionFovOffset
    this.fovStartOffset = this.sectionFovOffset
    this.fovTransitionT = 1

    this.instance.position.copy(this.smoothPosition)
    this.instance.lookAt(this.smoothTarget)
    const portraitWeight = Math.max(0, Math.min(1, 1 - this.instance.aspect / 1.5))
    this.instance.fov = this.smoothFov + this.fovOffset + portraitWeight * 20
    this.instance.updateProjectionMatrix()
  }

  update(deltaT: number) {
    if (this._disposed) return
    // ── 0. Lab exploration yield (ADR 0005) ──
    // While the declarative Lab CameraControls own the camera the cinematic
    // writer yields completely — position, lookAt and fov are the user's.
    if (isLabCameraActive()) {
      this._yielded = true
      return
    }
    if (this._yielded) {
      // Hand-back: adopt the orbit pose as the smoothing origin so the
      // authored framing eases back in instead of snapping. The orientation
      // stays continuous because the controls orbit the same authored target
      // the writer looks at.
      this.smoothPosition.copy(this.instance.position)
      this.smoothFov = this.instance.fov
      this._yielded = false
    }
    // Preserve authored timing on high-refresh displays. A fixed lower bound
    // would advance shake, organic motion and FOV transitions faster than
    // wall-clock time at 144/240 Hz; only clamp invalid negatives and stalls.
    const dt = Math.min(Math.max(deltaT, 0), 0.1)

    // ── 1. Spring-damper cursor follow ──
    const mouse = input.getMouse()

    this.springX.target = mouse.x
    this.springY.target = mouse.y

    this.springX.vel += (this.springX.target - this.springX.pos) * SP_STIFFNESS * dt
    this.springY.vel += (this.springY.target - this.springY.pos) * SP_STIFFNESS * dt

    this.springX.vel *= Math.exp(-SP_DAMPING * dt)
    this.springY.vel *= Math.exp(-SP_DAMPING * dt)

    this.springX.pos += this.springX.vel * dt
    this.springY.pos += this.springY.vel * dt

    // ── 2. Build position ──
    const isMobile = Device.isMobile
    const isHome = getCurrentPage() === 'home'
    // Respect prefers-reduced-motion: disable cursor follow + organic shake
    // + FOV breath (SPEC.md motion rules).
    const reduced = this._reducedMotion
    const pos = this.instance.position

    // Cursor follow — spring-damper (disabled on mobile + reduced motion)
    const cursorX = isMobile || reduced ? 0 : this.springX.pos
    const cursorY = isMobile || reduced ? 0 : this.springY.pos

    // A-015: Per-section cursor follow strength (junni cameraRange pattern).
    // Works section (idx=3) gets stronger follow for interactive feel.
    // Uses _currentSectionIndex set by Experience.update via setCursorFollow.
    const cursorFollow = isHome ? 0.19 : (this._cursorFollowStrength ?? 0.15)
    pos.set(
      this.smoothPosition.x + cursorX * cursorFollow,
      this.smoothPosition.y + cursorY * cursorFollow,
      this.smoothPosition.z,
    )

    // ── 3. Organic shake (continuous handheld) — desktop, non-reduced only ──
    if (!isMobile && !reduced) {
      this.organicTime += dt
      const ot = this.organicTime
      const amp = isHome ? 0.0026 : 0.002
      const ox = (Math.sin(ot * 0.7) * 0.3 + Math.sin(ot * 1.3) * 0.2) * amp
      const oy = (Math.sin(ot * 0.9) * 0.2 + Math.sin(ot * 1.7) * 0.3) * amp
      const oz = (Math.sin(ot * 1.1) * 0.4 + Math.sin(ot * 2.1) * 0.1) * amp
      pos.x += ox
      pos.y += oy
      pos.z += oz
    }

    // ── 4. Look at target ──
    this.instance.lookAt(this.smoothTarget)

    // ── 5. FOV — dynamic offset (pop zoom) ──
    if (this.fovTransitionT < 1) {
      this.fovTransitionT = Math.min(1, this.fovTransitionT + dt / this.fovDuration)
      const easeT =
        this.fovTransitionT < 0.5
          ? 8 * this.fovTransitionT ** 4
          : 1 - 8 * (this.fovTransitionT - 1) ** 4
      this.fovOffset = this.fovStartOffset + (this.targetFovOffset - this.fovStartOffset) * easeT
    }

    if (this.fovOffset > 0) {
      this._offsetVec.set(0, 0, -this.fovOffset * 0.05)
      this._offsetVec.applyQuaternion(this.instance.quaternion)
      pos.add(this._offsetVec)
    }

    // Blend FOV smoothly. Breathing disabled on mobile + reduced motion.
    const fovBreath = isHome && !isMobile && !reduced ? Math.sin(this.organicTime * 0.45) * 0.18 : 0
    // A-002: Portrait FOV adaptation — widen FOV on portrait so objects fit
    const aspect = this.instance.aspect
    const portraitWeight = Math.max(0, Math.min(1, 1 - aspect / 1.5))
    const portraitBoost = portraitWeight * 20 // up to +20° on narrow portrait
    const targetFov = this.smoothFov + this.fovOffset + fovBreath + portraitBoost
    // D-13 fix: delta-time-aware FOV lerp (was fixed 0.25/frame → frame-rate
    // dependent: slower on low-FPS, faster on high-FPS). Now converges at the
    // same rate regardless of FPS. 10 = convergence rate (≈0.25 at 60fps).
    const fovLerp = 1 - Math.exp(-10 * deltaT)
    this.instance.fov += (targetFov - this.instance.fov) * fovLerp
    // PERF-13: only recompute projection matrix when fov actually changed
    // (sub-threshold float drift would cause needless matrix recompute).
    if (Math.abs(targetFov - this.instance.fov) > 0.001) {
      this.instance.updateProjectionMatrix()
    }

    // ── 6. Action shake ──
    if (this.shakePower > 0 && this.shakeDuration > 0) {
      this.shakeTime += dt
      const sx = Math.sin(this.shakeTime * 7) * Math.sin(this.shakeTime * 4) * 0.1 * this.shakePower
      const sy =
        Math.sin(this.shakeTime * 3.3) * Math.sin(this.shakeTime * 5.2) * 0.1 * this.shakePower
      this._tempEuler.set(sx, sy, 0)
      this._tempQuat.setFromEuler(this._tempEuler)
      this.instance.quaternion.multiply(this._tempQuat)
      this.shakeDuration -= dt
      if (this.shakeDuration <= 0) {
        this.shakePower = 0
        this.shakeDuration = 0
        this.shakeTime = 0
      }
    }
  }
}
