// BakuCarousel.ts — an infinite 3D media stream for the home Works section.
//
// The planes keep their final editorial composition while entering like an
// exposed contact sheet: the centre case resolves first, then the right and
// left neighbours register with an asymmetric stagger.
// Horizontal drag moves the media beneath the viewer without rotating the world.
// Clicking a case uses a focus → travel handoff before UIkit takes ownership.

import * as THREE from 'three'
// uiChrome.ts removed — inline the guard here. Guard against the cinematic
// navigator, project overlay, app loader and both responsive sheets.
function isUiChromeEvent(e: Event): boolean {
  const target = e.target as HTMLElement | null
  if (!target) return false
  return !!target.closest(
    '#cinematic-nav, #jlz-fs-overlay, #jlz-app-loader, [data-cinematic-menu], [data-contact-footer], [data-baku-carousel-control]',
  )
}
import { PROJECTS } from '../../Data/Projects'
import { CasePlane, CLOTH_PARAMS } from './CasePlane'
import { loadCaseTexture, releaseCaseTexture } from './caseTexture'
import type { PageId } from '../../core/routeManifest'
import type { StorySide } from '../../core/storyState'
import { eventBus } from '../../core/EventBus'
import { prefersReducedMotion } from '../../core/motionPolicy'
import { smoothstep01 } from '../../Utils/easing'
import { carouselCardMetadataOf, setCarouselCardMetadata } from './cardMetadata'
import { keepSceneObjectVisible } from '../sceneRuntimeState'
// PlaneTransition removed — unified animation uses direct overlay open.

// A dozen plane instances preserve the infinite wrap while the framing exposes
// only the centre case and its two adjacent neighbours. They share four
// project textures, so the added continuity does not multiply GPU media.
const CARD_COUNT = 12
const CARD_TEXTURE_URLS: string[] = Array.from({ length: CARD_COUNT }, (_, i) => {
  const p = PROJECTS[i % PROJECTS.length]!
  return p.textureUrl || p.detailTextureUrl
})

// At the configured Works camera distance these dimensions frame exactly
// three large cards, with a deliberate breathing gap between each one.
const CARD_SCALE = 3.05
const CARD_SPACING = 3.34
const MORPH_DAMPING = 3.0
const SCROLL_DAMPING = 8.8
const DRAG_SENSITIVITY = 0.0046
const TAP_THRESHOLD = 6 // px — if pointerup within this distance of down, it's a tap
// Momentum only; the slider never auto-advances and has no hard endpoints.
const MOMENTUM_DECAY = 0.84 // per-frame velocity decay after drag release
const MOMENTUM_THRESHOLD = 0.0007 // below this → snap to nearest card
const SNAP_STEP = 1

export class BakuCarousel extends THREE.Group {
  /** Wake the shared demand-driven renderer after pointer-driven state changes. */
  onActivity: (() => void) | null = null
  private cards: CasePlane[] = []
  private scroll = { current: 0, target: 0 }
  private _morphT = 0 // 0 = cube, 1 = carousel (raw, before easing)
  private _morphTarget = 0
  private _active = false
  private initialized = false
  private _disposed = false
  private _reducedMotion = prefersReducedMotion()
  private _camera: THREE.Camera | null = null
  private _raycaster: THREE.Raycaster = new THREE.Raycaster()
  private _ndc: THREE.Vector2 = new THREE.Vector2()
  // A visible settled carousel still receives coordinator demand frames when
  // another owner (for example JunniParticles) is active. Keep one explicit
  // reconciliation pass, then avoid rewriting all card transforms/uniforms
  // until motion or a lifecycle policy change makes the layout dirty again.
  private _layoutDirty = true

  // Input state
  private isDown = false
  private dragStartX = 0
  private dragStartY = 0
  private dragMoved = false
  private dragAxis: 'pending' | 'carousel' | 'scroll' = 'pending'
  private pointerDownHandler: ((e: PointerEvent) => void) | null = null
  private pointerMoveHandler: ((e: PointerEvent) => void) | null = null
  private pointerUpHandler: ((e: PointerEvent) => void) | null = null
  private controlClickHandler: ((e: MouseEvent) => void) | null = null
  // (keydownHandler removed — story arrows are owned by CinematicNav.)
  private snapTimer: ReturnType<typeof setTimeout> | null = null

  // Momentum is only applied after a deliberate horizontal drag.
  private velocity = 0 // current scroll velocity (for momentum after drag)

  // Callback — fired when user taps/clicks a carousel card
  private _onCardClick: ((index: number) => void) | null = null
  // No transition state — unified to direct overlay open.

  // Reusable temp vectors (avoid per-frame alloc)
  private _tmpStreamPos = new THREE.Vector3()
  private _tmpRingRot = new THREE.Euler()

  constructor(
    private readonly page: () => PageId = () => 'home',
    private readonly storySide: () => StorySide = () => 'center',
  ) {
    super()
    this.name = 'baku-carousel'
  }

  /** Activate the slider — start morphing from cube faces to case planes. */
  setActive(active: boolean): void {
    if (this._disposed) return
    if (active === this._active) return // no-op on repeated calls (fixes A-1)
    this._active = active
    this._morphTarget = active ? 1 : 0
  }

  /** Forward live motion policy to the card owners without per-frame media queries. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    this.cards.forEach((card) => card.setReducedMotion(reduced))
    if (!reduced) return

    if (this.snapTimer) clearTimeout(this.snapTimer)
    this.snapTimer = null
    this.isDown = false
    this.dragMoved = false
    this.dragAxis = 'pending'
    this.velocity = 0
    this._morphT = this._morphTarget
    this.scroll.current = this.scroll.target
    this._layoutDirty = true

    // SceneCoordinator intentionally skips decorative carousel updates under
    // reduced motion. Reconcile the settled transforms once so the last
    // intermediate frame cannot remain visible or keep demand active.
    this.update(0)
  }

  get isActive(): boolean {
    return this._active
  }

  get morphProgress(): number {
    return this._morphT
  }

  /** True when the carousel is actively morphing or scrolling (needs rendering). */
  get isAnimating(): boolean {
    if (this._disposed) return false
    // Morphing: _morphT not at target
    const morphing = Math.abs(this._morphTarget - this._morphT) > 0.001
    // Scrolling: scroll.current not at target
    const scrolling = Math.abs(this.scroll.target - this.scroll.current) > 0.001
    // Active drag
    const dragging = this.isDown
    let planeMotion = false
    for (let index = 0; index < this.cards.length; index += 1) {
      if (this.cards[index]!.isAnimating) {
        planeMotion = true
        break
      }
    }
    return morphing || scrolling || dragging || planeMotion
  }

  /** Set camera reference for raycast-based tap detection. */
  setCamera(cam: THREE.Camera): void {
    if (this._disposed) return
    this._camera = cam
  }

  /** Set callback for card click (index = which card was tapped). */
  onCardClick(cb: (index: number) => void): () => void {
    if (this._disposed) return () => undefined
    this._onCardClick = cb
    return () => {
      if (this._onCardClick === cb) this._onCardClick = null
    }
  }

  async init(): Promise<void> {
    if (this.initialized || this._disposed) return
    this.initialized = true

    // Load only the UNIQUE project textures once (8, not 12) — cards reference
    // them by index, avoiding duplicate GPU textures + HTTP requests.
    const uniqueUrls = [...new Set(CARD_TEXTURE_URLS)]
    const acquiredTextures = new Map<string, THREE.Texture>()
    let initFailed = false
    let uniqueTextures: THREE.Texture[]
    try {
      uniqueTextures = await Promise.all(
        uniqueUrls.map((url) =>
          loadCaseTexture(url).then((texture) => {
            // A sibling load can reject before this promise settles. Release a
            // late success immediately instead of over-releasing a shared
            // cache entry in the catch path.
            if (initFailed) releaseCaseTexture(url, texture)
            else acquiredTextures.set(url, texture)
            return texture
          }),
        ),
      )
    } catch (error) {
      initFailed = true
      acquiredTextures.forEach((texture, url) => releaseCaseTexture(url, texture))
      this.initialized = false
      throw error
    }
    if (this._disposed) {
      // The owner may have been torn down while textures were decoding. The
      // cards do not exist yet, so release the cache references explicitly.
      uniqueUrls.forEach((url, index) => releaseCaseTexture(url, uniqueTextures[index]))
      return
    }
    const urlToTexture = new Map(uniqueUrls.map((url, i) => [url, uniqueTextures[i]!]))

    const stagedCards: CasePlane[] = []
    try {
      CARD_TEXTURE_URLS.forEach((url, i) => {
        const tex = urlToTexture.get(url)!
        const plane = new CasePlane(tex)
        plane.setReducedMotion(this._reducedMotion)
        plane.scale.setScalar(CARD_SCALE)
        setCarouselCardMetadata(plane, {
          textureIndex: i,
          textureUrl: url,
          projectIndex: i % PROJECTS.length,
        })
        // Keep cards visible through SectionGroups' geometry-hiding step.
        keepSceneObjectVisible(plane)
        stagedCards.push(plane)
        this.add(plane)
      })

      this.cards = stagedCards
      this.addEventListeners()
    } catch (error) {
      stagedCards.forEach((card) => {
        card.removeFromParent()
        card.dispose()
      })
      uniqueUrls.forEach((url, index) => releaseCaseTexture(url, uniqueTextures[index]))
      this.initialized = false
      throw error
    }
  }

  private addEventListeners(): void {
    this.pointerDownHandler = (e: PointerEvent) => {
      if (!this._active || this._morphT < 0.5) return
      if (this.storySide() === 'menu' || isUiChromeEvent(e)) return
      // D-15 fix: only intercept on home page (carousel is home-only; on
      // content pages the window listener would block WorkCard clicks if
      // the carousel's _active flag were stuck true from a prior home visit).
      if (this.page() !== 'home') return
      this.isDown = true
      this.onActivity?.()
      this.dragStartX = e.clientX
      this.dragStartY = e.clientY
      this.dragMoved = false
      this.dragAxis = 'pending'
      this.velocity = 0 // reset velocity on new drag
    }
    this.pointerMoveHandler = (e: PointerEvent) => {
      if (!this.isDown || !this._active) return
      const dx = e.clientX - this.dragStartX
      const dy = e.clientY - this.dragStartY
      if (
        this.dragAxis === 'pending' &&
        (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD)
      ) {
        this.dragAxis = Math.abs(dx) > Math.abs(dy) ? 'carousel' : 'scroll'
        this.dragMoved = true
      }
      if (this.dragAxis === 'scroll') {
        this.isDown = false
        return
      }
      if (this.dragAxis !== 'carousel') return
      if (e.cancelable) e.preventDefault()

      // Track velocity for momentum and the plane deformation field.
      const delta = -dx * DRAG_SENSITIVITY
      this.velocity = delta
      this.scroll.target += delta
      this.onActivity?.()

      this.dragStartX = e.clientX
      this.dragStartY = e.clientY
      this.scheduleSnap()
    }
    this.pointerUpHandler = (e: PointerEvent) => {
      if (!this.isDown) return
      this.isDown = false
      this.onActivity?.()
      // If pointer didn't move much → treat as a TAP on a carousel card
      if (!this.dragMoved && this.dragAxis === 'pending') {
        this.handleTap(e.clientX, e.clientY)
      } else {
        // Phase 4: momentum — apply velocity decay in update() until threshold
        // scheduleSnap() will fire after momentum settles
        this.scheduleSnap(300) // delayed snap — give momentum time to settle
      }
    }
    // (keyboard handler removed — story arrows are owned by CinematicNav.
    //  BakuCarousel navigation is via horizontal pointer drag; card taps are
    //  raycast by handleTap() and the open is wired by ExperienceUI.)
    window.addEventListener('pointerdown', this.pointerDownHandler)
    window.addEventListener('pointermove', this.pointerMoveHandler, { passive: false })
    window.addEventListener('pointerup', this.pointerUpHandler)
    window.addEventListener('pointercancel', this.pointerUpHandler)
    this.controlClickHandler = (event: MouseEvent) => {
      const control = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        '[data-baku-carousel-control]',
      )
      if (!control || !this._active || this.page() !== 'home') return
      event.preventDefault()
      const direction = control.dataset.bakuCarouselControl
      if (direction === 'prev') this.prev()
      if (direction === 'next') this.next()
      if (direction === 'prev' || direction === 'next') this.onActivity?.()
    }
    window.addEventListener('click', this.controlClickHandler)
  }

  /** Tap detected → raycast to check if a card was actually hit.
   *  Only opens overlay if the tap landed on a carousel card mesh.
   *  Taps on the baku cube or empty space are ignored. */
  private handleTap(clientX: number, clientY: number): void {
    if (!this._camera) {
      // No camera — fall back to front card
      this._onCardClick?.(this.getFrontCardIndex())
      eventBus.emit('jlz:wobble-pulse')
      return
    }
    // Convert screen coords to NDC
    this._ndc.x = (clientX / window.innerWidth) * 2 - 1
    this._ndc.y = -(clientY / window.innerHeight) * 2 + 1
    this._raycaster.setFromCamera(this._ndc, this._camera)
    // Raycast against revealed case planes only.
    const hitTargets: THREE.Object3D[] = []
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!
      if (card.visible) {
        hitTargets.push(card)
      }
    }
    const intersects = this._raycaster.intersectObjects(hitTargets, false)
    if (intersects.length > 0) {
      const hit = intersects[0]!.object as THREE.Mesh
      const idx = carouselCardMetadataOf(hit)?.projectIndex ?? -1
      if (idx < 0) return
      // Unified cloth wobble pulse — same as WorksPlaneStage.openProject()
      const hitCard = hit as CasePlane
      hitCard.pulse(CLOTH_PARAMS.pulseAmount)
      // Open the overlay directly with the unified cinematic reveal — no
      // 3D plane-to-fullscreen handoff (it caused a double effect).
      this._onCardClick?.(idx)
    }
    // No hit → tap was on cube or empty space → ignore (no overlay open)
  }

  /** Get the project index currently facing the camera (front of stream).
   *  Uses scroll.current (the settled value). */
  getFrontCardIndex(): number {
    if (this.cards.length === 0) return 0
    const idx = Math.round(-this.scroll.current / SNAP_STEP)
    return ((idx % PROJECTS.length) + PROJECTS.length) % PROJECTS.length
  }

  /** Get the index of the card that WILL face the camera after the current
   *  scroll animation settles (uses scroll.target, not scroll.current).
   *  Use this right after prev()/next() to know which project to load. */
  getTargetCardIndex(): number {
    if (this.cards.length === 0) return 0
    const idx = Math.round(-this.scroll.target / SNAP_STEP)
    return ((idx % PROJECTS.length) + PROJECTS.length) % PROJECTS.length
  }

  private scheduleSnap(delay = 180): void {
    if (this._disposed) return
    if (this.snapTimer) clearTimeout(this.snapTimer)
    this.snapTimer = setTimeout(() => this.snap(), delay)
  }

  next(): void {
    if (this._disposed) return
    this.scroll.target -= SNAP_STEP
    this.onActivity?.()
  }

  prev(): void {
    if (this._disposed) return
    this.scroll.target += SNAP_STEP
    this.onActivity?.()
  }

  private snap(): void {
    if (this._disposed) return
    this.scroll.target = Math.round(this.scroll.target / SNAP_STEP) * SNAP_STEP
    this.velocity = 0 // clear velocity after snap
  }

  /** Wrap an unbounded position into the physical instances around the camera. */
  private wrapSlot(value: number, count: number): number {
    return ((((value + count / 2) % count) + count) % count) - count / 2
  }

  update(dt: number): void {
    if (this._disposed) return
    if (!this._layoutDirty && !this.isAnimating) return
    // Time-based damping keeps reveal timing identical at 60/90/120Hz.
    this._morphT = THREE.MathUtils.damp(this._morphT, this._morphTarget, MORPH_DAMPING, dt)
    if (Math.abs(this._morphTarget - this._morphT) < 0.001) {
      this._morphT = this._morphTarget
    }

    // Eased morph for animations (smoothstep gives ease-in/ease-out)
    const easedT = smoothstep01(this._morphT)

    // Phase 4: momentum — apply velocity after drag release
    if (!this.isDown && Math.abs(this.velocity) > MOMENTUM_THRESHOLD) {
      // Velocity is authored in 60 Hz frame units. Integrate the decaying
      // velocity over the elapsed frame span so the fling travels the same
      // distance at 60/120/144 Hz (not merely the same decay curve).
      const frameSpan = Math.max(0, dt) * 60
      const decay = Math.pow(MOMENTUM_DECAY, frameSpan)
      const displacementScale = (1 - decay) / (1 - MOMENTUM_DECAY)
      this.scroll.target += this.velocity * displacementScale
      // Keep momentum duration stable across refresh rates. The authored
      // factor is calibrated for 60 Hz, so scale its exponent by elapsed time.
      this.velocity *= decay
      if (Math.abs(this.velocity) < MOMENTUM_THRESHOLD) {
        this.velocity = 0
        this.scheduleSnap(120) // snap after momentum settles
      }
    }

    // Scroll lerp (only matters when morphed into the media stream).
    this.scroll.current = THREE.MathUtils.damp(
      this.scroll.current,
      this.scroll.target,
      SCROLL_DAMPING,
      dt,
    )
    const n = this.cards.length
    for (let i = 0; i < n; i++) {
      const card = this.cards[i]!

      // ── Infinite media-stream target ──
      const rawSlot = i + this.scroll.current / SNAP_STEP
      const slot = this.wrapSlot(rawSlot, n)
      const distance = Math.abs(slot)
      this._tmpStreamPos.set(slot * CARD_SPACING, 0, 0)
      this._tmpRingRot.set(0, 0, 0)

      // Contact-sheet reveal: the centre establishes the composition, then the
      // right and left frames register on deliberately different beats.
      const delay =
        distance < 0.5
          ? 0.02
          : slot > 0
            ? 0.2 + Math.min(distance - 1, 2) * 0.055
            : 0.4 + Math.min(distance - 1, 2) * 0.04
      const localReveal = smoothstep01((easedT - delay) / 0.55)
      card.position.copy(this._tmpStreamPos)
      const entranceDirection = distance < 0.5 ? 0 : Math.sign(slot)
      card.position.x += entranceDirection * (1 - localReveal) * 0.28
      card.position.y += (1 - localReveal) * (distance < 0.5 ? -0.055 : slot > 0 ? 0.065 : -0.075)
      card.rotation.copy(this._tmpRingRot)

      const scale = THREE.MathUtils.lerp(distance < 0.5 ? 0.955 : 0.94, 1, localReveal)
      card.scale.setScalar(CARD_SCALE * scale)
      const streamReveal = localReveal * THREE.MathUtils.clamp(3.25 - distance, 0, 1)
      card.setReveal(streamReveal)
      // No scroll-induced motion bend — keeps textures distortion-free.
      // The wobble is reserved for explicit pulse events (card tap/open).
      // Hidden idle cards still receive their reveal/transform uniforms above,
      // but do not need per-frame cloth time advancement. Keep the CasePlane
      // idle guard active for those cards while preserving updates for visible
      // or already-animating cards during morph and teardown.
      card.update(dt, this._active && (card.visible || card.isAnimating))
    }
    this._layoutDirty = false
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    if (this.pointerDownHandler) window.removeEventListener('pointerdown', this.pointerDownHandler)
    if (this.pointerMoveHandler) window.removeEventListener('pointermove', this.pointerMoveHandler)
    if (this.pointerUpHandler) {
      window.removeEventListener('pointerup', this.pointerUpHandler)
      window.removeEventListener('pointercancel', this.pointerUpHandler)
    }
    if (this.controlClickHandler) window.removeEventListener('click', this.controlClickHandler)
    if (this.snapTimer) clearTimeout(this.snapTimer)
    this.pointerDownHandler = null
    this.pointerMoveHandler = null
    this.pointerUpHandler = null
    this.controlClickHandler = null
    this.snapTimer = null
    this._onCardClick = null
    this.onActivity = null
    this._camera = null
    this.isDown = false
    this.dragMoved = false
    this.dragAxis = 'pending'
    this.velocity = 0
    this._active = false
    this._morphTarget = 0
    this._morphT = 0
    this.scroll.current = 0
    this.scroll.target = 0
    // Release refcounted textures via the cache. Each unique URL is released
    // once; the cache disposes the GPU texture when the last consumer drops.
    const releasedUrls = new Set<string>()
    for (const card of this.cards) {
      const url = carouselCardMetadataOf(card)?.textureUrl
      if (url && !releasedUrls.has(url)) {
        releaseCaseTexture(url, card.texture ?? undefined)
        releasedUrls.add(url)
      }
      card.dispose()
    }
    this.cards = []
    this.clear()
  }
}
