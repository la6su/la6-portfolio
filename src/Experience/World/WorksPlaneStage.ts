// WorksPlaneStage — real 3D case planes for the /works route.
//
// The DOM route remains the semantic and keyboard-accessible owner. Its card
// buttons are deliberately transparent hit targets/captions; this stage owns
// the visible project media, its TSL deformation and the plane-to-fullscreen
// handoff. Textures load only when /works is actually reached.

import * as THREE from 'three'
import { PROJECTS } from '../../Data/Projects'
import { CasePlane, CLOTH_PARAMS } from './CasePlane'
import { loadCaseTexture, releaseCaseTexture } from './caseTexture'
import { setWorksCardMetadata, worksCardMetadataOf } from './cardMetadata'
import { prefersReducedMotion } from '../../core/motionPolicy'

import { WORKS_ROOMS, getWorksCaseProject } from '../../core/worksExperience'
import { eventBus } from '../../core/EventBus'
import { WorksInstallation } from './WorksInstallation'

interface CaseLayout {
  x: number
  y: number
  z: number
  scale: number
}

// One focal exhibit, positioned in the installation. DOM copy has its own
// editorial space; it no longer pretends to be a rectangle over a 3D plane.
const WIDE_LAYOUT: CaseLayout = { x: 0.19, y: -0.015, z: -3.8, scale: 0.43 }
const STACKED_LAYOUT: CaseLayout = { x: 0, y: 0.015, z: -3.8, scale: 0.84 }

export class WorksPlaneStage extends THREE.Group {
  private cards: CasePlane[] = []
  private installation: WorksInstallation | null = null
  private themeUnsub: (() => void) | null = null
  private inverse = false
  private get activeProject(): number {
    return getWorksCaseProject() ?? WORKS_ROOMS[this._sectionIndex]!.projectIndex
  }
  private _camera: THREE.Camera | null = null
  private _raycaster = new THREE.Raycaster()
  private _ndc = new THREE.Vector2()
  private _sectionIndex = 0
  private _active = false
  private _initialized = false
  private _disposed = false
  private _reducedMotion = prefersReducedMotion()
  private _stackedLayout = window.innerWidth < 960
  private _viewportAspect = window.innerWidth / window.innerHeight
  private _reveal = new Map<CasePlane, number>()
  private _tmpCameraPosition = new THREE.Vector3()
  private _tmpTargetPosition = new THREE.Vector3()
  private _tmpTargetRotation = new THREE.Euler()
  // Keep one layout reconciliation after a state/camera change, then avoid
  // rewriting all route cards while another scene owner keeps demand frames
  // flowing through the shared renderer.
  private _layoutDirty = true
  private _lastCameraPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN)
  private _lastCameraQuaternion = new THREE.Quaternion(
    Number.NaN,
    Number.NaN,
    Number.NaN,
    Number.NaN,
  )
  // Reused per-frame layout result; visible cards are laid out every frame and
  // must not allocate a fresh object for each viewport calculation.
  private _tmpScaledLayout: CaseLayout = { x: 0, y: 0, z: 0, scale: 0 }
  private _installationProject = -1

  constructor() {
    super()
    this.name = 'works-plane-stage'
    this.visible = false
    this.renderOrder = 3
    this.themeUnsub = eventBus.on('jlz:theme-applied', ({ isLight }) => {
      this.inverse = isLight
      this.installation?.setInverse(isLight)
    })
  }

  /** Settle route-local reveals and card transforms at the owner boundary. */
  setReducedMotion(reduced: boolean): void {
    if (this._disposed) return
    this._reducedMotion = reduced
    this._layoutDirty = true
    this.cards.forEach((card) => card.setReducedMotion(reduced))
    if (!reduced) return

    const activeProject = this.activeProject
    const cardCount = this.cards.length
    for (let index = 0; index < cardCount; index += 1) {
      const card = this.cards[index]!
      const projectIndex = worksCardMetadataOf(card)?.projectIndex ?? -1
      const targetReveal = activeProject === projectIndex ? 1 : 0
      this._reveal.set(card, targetReveal)
      card.setReveal(targetReveal)
    }
    this.installation?.setRoom(this._sectionIndex, true)
    if (this._active && this._camera) this.update(0)
  }

  get isAnimating(): boolean {
    if (this._disposed || !this._active) return false

    if (this.installation?.isAnimating) return true
    const activeProject = this.activeProject
    for (let index = 0; index < this.cards.length; index += 1) {
      const card = this.cards[index]!
      const projectIndex = worksCardMetadataOf(card)?.projectIndex ?? -1
      const shouldBeVisible = activeProject === projectIndex
      const reveal = this._reveal.get(card) ?? 0
      // Include departing cards and their cloth pulses: hidden cards still
      // need a few passes to settle their reveal/animation state before the
      // stage can take the settled fast path.
      if (card.isAnimating || (shouldBeVisible ? reveal < 0.995 : reveal > 0.005)) return true
    }
    return false
  }

  async init(): Promise<void> {
    if (this._initialized || this._disposed) return
    this._initialized = true

    let textures: THREE.Texture[]
    let initFailed = false
    const acquiredTextures = new Map<string, THREE.Texture>()
    try {
      textures = await Promise.all(
        PROJECTS.map((project) =>
          loadCaseTexture(project.textureUrl).then((texture) => {
            if (initFailed) releaseCaseTexture(project.textureUrl, texture)
            else acquiredTextures.set(project.textureUrl, texture)
            return texture
          }),
        ),
      )
    } catch (error) {
      initFailed = true
      acquiredTextures.forEach((texture, url) => releaseCaseTexture(url, texture))
      this._initialized = false
      throw error
    }

    if (this._disposed) {
      textures.forEach((texture, index) => releaseCaseTexture(PROJECTS[index]!.textureUrl, texture))
      this._initialized = false
      return
    }

    const stagedCards: CasePlane[] = []
    try {
      textures.forEach((texture, index) => {
        const plane = new CasePlane(texture)
        plane.setReducedMotion(this._reducedMotion)
        setWorksCardMetadata(plane, {
          projectIndex: index,
          textureUrl: PROJECTS[index]!.textureUrl,
        })
        plane.setReveal(0)
        stagedCards.push(plane)
        this._reveal.set(plane, 0)
        this.add(plane)
      })
      this.installation = new WorksInstallation()
      this.installation.setInverse(this.inverse)
      this.installation.setProject(this.activeProject)
      this.installation.setRoom(this._sectionIndex, this._reducedMotion)
      this.cards = stagedCards
      this._layoutDirty = true
      this._installationProject = -1
    } catch (error) {
      stagedCards.forEach((card) => {
        card.removeFromParent()
        card.dispose()
      })
      this._reveal.clear()
      textures.forEach((texture, index) => releaseCaseTexture(PROJECTS[index]!.textureUrl, texture))
      this._initialized = false
      throw error
    }
  }

  /** The Vue/Tres host attaches this existing lazy controller below this stage. */
  public get installationOwner(): WorksInstallation | null {
    return this.installation
  }

  setCamera(camera: THREE.Camera): void {
    if (this._disposed) return
    if (this._camera === camera) return
    this._camera = camera
    this._layoutDirty = true
  }

  /**
   * The semantic UIkit grid becomes a two-row composition below `@m`; keep
   * the actual media planes in that same layout so captions, hit targets and
   * visual media continue to describe one object on mobile and tablet.
   */
  resize(width: number, height: number): void {
    if (this._disposed) return
    this._stackedLayout = width < 960
    const aspect = width / height
    this._viewportAspect = aspect
    this._layoutDirty = true
  }

  setActive(active: boolean, sectionIndex: number): void {
    if (this._disposed) return
    const nextSection = THREE.MathUtils.clamp(sectionIndex, 0, WORKS_ROOMS.length - 1)
    const changed = active !== this._active || nextSection !== this._sectionIndex
    this._active = active
    this._sectionIndex = nextSection
    this.visible = active
    if (changed) {
      this._layoutDirty = true
      this.installation?.setProject(this.activeProject)
      this.installation?.setRoom(nextSection, this._reducedMotion)
    }
  }

  /** Open project overlay with unified wobble pulse (same as BakuCarousel).
   *  Returns false when no matching plane exists. */
  openProject(index: number, openOverlay: (index: number) => void): boolean {
    if (this._disposed || !this._active) return false
    const card = this.cards[index]
    if (!card) return false

    // Unified cloth wobble pulse — identical to BakuCarousel.handleTap()
    card.pulse(CLOTH_PARAMS.pulseAmount)
    openOverlay(index)
    return true
  }

  /** Pointer interaction for the visual plane itself, outside DOM hit targets. */
  handleTap(clientX: number, clientY: number, openOverlay: (index: number) => void): boolean {
    if (this._disposed || !this._camera || !this._active) return false
    const idx = this.hitTest(clientX, clientY)
    if (idx < 0) return false
    return this.openProject(idx, openOverlay)
  }

  /** Raycast against visible planes. Returns the project index or -1 on miss. */
  hitTest(clientX: number, clientY: number): number {
    if (this._disposed || !this._camera || !this._active) return -1
    this._ndc.x = (clientX / window.innerWidth) * 2 - 1
    this._ndc.y = -(clientY / window.innerHeight) * 2 + 1
    this._raycaster.setFromCamera(this._ndc, this._camera)
    const hits = this._raycaster.intersectObjects(
      this.cards.filter((card) => card.visible),
      false,
    )
    const hit = hits[0]?.object as CasePlane | undefined
    if (!hit) return -1
    return worksCardMetadataOf(hit)?.projectIndex ?? -1
  }

  update(dt: number): void {
    if (this._disposed || !this._camera || !this._active) return

    // Keep the stage in camera-local space while remaining a child of World.
    this._camera.getWorldPosition(this._tmpCameraPosition)
    const cameraChanged =
      !this._lastCameraPosition.equals(this._tmpCameraPosition) ||
      !this._lastCameraQuaternion.equals(this._camera.quaternion)
    const layoutDirty = this._layoutDirty || cameraChanged
    if (!layoutDirty && !this.isAnimating) return
    this.position.copy(this._tmpCameraPosition)
    this.quaternion.copy(this._camera.quaternion)

    const activeProject = this.activeProject
    if (this._installationProject !== activeProject) {
      this._installationProject = activeProject
      this.installation?.setProject(activeProject)
    }
    this.installation?.update(dt)
    if (this.installation && this._camera instanceof THREE.PerspectiveCamera) {
      const height = 2 * Math.tan(THREE.MathUtils.degToRad(this._camera.fov) / 2) * 5.6
      this.installation.setCameraLocalLayout(
        this._stackedLayout ? 0 : height * this._viewportAspect * 0.19,
        0,
        -5.6,
        Math.min(height * 0.34, height * this._viewportAspect * 0.46),
      )
    }
    for (let index = 0; index < this.cards.length; index += 1) {
      const card = this.cards[index]!
      const projectIndex = worksCardMetadataOf(card)?.projectIndex ?? -1
      const isVisible = activeProject === projectIndex
      const targetReveal = isVisible ? 1 : 0
      const reveal = this._reveal.get(card) ?? 0
      const nextReveal = this._reducedMotion
        ? targetReveal
        : THREE.MathUtils.damp(reveal, targetReveal, 10, dt)
      this._reveal.set(card, nextReveal)
      const revealChanged = Math.abs(nextReveal - reveal) >= 0.001

      // Cards that are not part of the active section fade out IN PLACE —
      // do not move them toward any layout slot, otherwise old cards slide
      // into the new secondary position and overlap the incoming card.
      if (!isVisible) {
        if (nextReveal < 0.002) {
          card.setReveal(0)
        } else {
          card.setReveal(nextReveal)
          card.update(dt, false)
        }
        continue
      }

      const layout = this._stackedLayout ? STACKED_LAYOUT : WIDE_LAYOUT
      const scaledLayout = this.layoutInView(layout)

      // Snap cards to their layout target on first appearance (reveal was 0)
      // so they never fly out from the camera-local origin.
      if (this._reducedMotion) {
        card.position.set(scaledLayout.x, scaledLayout.y, scaledLayout.z)
        card.rotation.set(-0.04, -0.13, -0.035)
        card.scale.setScalar(scaledLayout.scale)
      } else if (reveal < 0.01 && targetReveal > 0.5) {
        card.position.set(scaledLayout.x, scaledLayout.y, scaledLayout.z)
        card.rotation.set(-0.04, -0.13, -0.035)
        card.scale.setScalar(scaledLayout.scale)
      } else {
        this._tmpTargetPosition.set(scaledLayout.x, scaledLayout.y, scaledLayout.z)
        this._tmpTargetRotation.set(-0.04, -0.13, -0.035)
        card.position.lerp(this._tmpTargetPosition, 1 - Math.exp(-dt * 9))
        card.rotation.x += (this._tmpTargetRotation.x - card.rotation.x) * (1 - Math.exp(-dt * 9))
        card.rotation.y += (this._tmpTargetRotation.y - card.rotation.y) * (1 - Math.exp(-dt * 9))
        card.rotation.z += (this._tmpTargetRotation.z - card.rotation.z) * (1 - Math.exp(-dt * 9))
        const nextScale = THREE.MathUtils.damp(card.scale.x, scaledLayout.scale, 10, dt)
        card.scale.setScalar(nextScale)
      }
      card.setReveal(nextReveal)
      // A visible card with no own cloth activity does not need its time
      // uniform advanced while a sibling is pulsing. Layout/reveal changes
      // remain explicit wake boundaries; card.isAnimating keeps its own
      // wobble decay progressing until it settles.
      card.update(dt, layoutDirty || revealChanged || card.isAnimating)
    }
    this._lastCameraPosition.copy(this._tmpCameraPosition)
    this._lastCameraQuaternion.copy(this._camera.quaternion)
    this._layoutDirty = false

    // The text has its own delayed wipe: it is intentionally independent of card opacity.
  }

  private layoutInView(layout: CaseLayout): CaseLayout {
    if (!(this._camera instanceof THREE.PerspectiveCamera)) return layout

    const distance = Math.abs(layout.z)
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this._camera.fov) / 2) * distance
    const viewWidth = viewHeight * this._viewportAspect
    const widthScale = viewWidth * layout.scale
    // Portrait cards stay width-led with a deliberate gutter; the semantic
    // UIkit grid uses the same stacked rhythm below the medium breakpoint.
    const heightScale = (viewHeight * layout.scale) / (9 / 16)
    this._tmpScaledLayout.x = viewWidth * layout.x
    this._tmpScaledLayout.y = viewHeight * layout.y
    this._tmpScaledLayout.z = layout.z
    this._tmpScaledLayout.scale = this._stackedLayout
      ? Math.min(widthScale, heightScale)
      : widthScale
    return this._tmpScaledLayout
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._active = false
    this._camera = null
    this.cards.forEach((card) => {
      const url = worksCardMetadataOf(card)?.textureUrl
      if (url) releaseCaseTexture(url, card.texture ?? undefined)
      card.dispose()
    })
    this.cards = []
    this.themeUnsub?.()
    this.themeUnsub = null
    this.installation?.dispose()
    this.installation = null
    this._reveal.clear()
    this.clear()
  }
}
