// src/Experience/SceneTransformPass.ts — the pooled scroll→world transform.
//
// The second extraction of the NEXT item 4.1 SceneCoordinator split: the
// scroll transform pass owns the GC-free result pool, the revision-keyed
// reuse cache, the range-bucket mapping with per-section easing (including
// the parity-locked second ease for bg/group fades), the group visibility
// fade loop with its per-group mesh cache, the arrival fog re-target and
// the camera/baku/env lerp. The SectionStateMachine owns the state policy
// the pass drives; SceneCoordinator keeps the frame-facing delegates.

import * as THREE from 'three'
import { type CameraTarget, type WorldState, BakuRole } from '../core/types'
import type { PageId } from '../core/routeManifest'
import { type PhaseConfig, type SceneTransitionEasing } from '../core/WorldConfig'
import { clampStoryProgress, sectionIndexAt } from '../core/storyProgress'
import { easeOutCubic, smoothstep01 } from '../Utils/easing'
import type { SceneCoordinatorOwners } from './sceneOwners'
import type { SectionStateMachine } from './SectionStateMachine'

export interface WorldTransformResult {
  cameraTarget: CameraTarget
  worldState: WorldState
}

/** The facts the pass reads per call. Getters, not values: the route, the
 *  reduced-motion policy and the lazy owner identity can change between
 *  frames; the story machine and the scene are stable peers. */
interface SceneTransformPassContext {
  scene: THREE.Scene
  story: SectionStateMachine
  owners: SceneCoordinatorOwners
  page: () => PageId
  isReducedMotion: () => boolean
}

export class SceneTransformPass {
  // A demand frame can be raised by an unrelated owner while story progress
  // remains unchanged. Reuse the pooled transform and skip route reconciliation
  // until an owner-side setter or route/config rebuild invalidates this pass.
  private _transformRevision = 0
  private _transformCacheRevision = -1
  private _transformCacheScroll = Number.NaN
  private _transformCachePage: PageId | null = null
  // Ranges are cached: configs.map(c => c.range) used to run every frame in
  // updateTransform (~360 array allocs/sec at 60 fps). Ranges are immutable
  // after init(), so they are built once.
  private _rangesCache: [number, number][] | null = null
  private readonly _meshCache = new WeakMap<THREE.Group, THREE.Mesh[]>()
  private readonly _opacityCache = new WeakMap<THREE.Material, { base: number; lastFade: number }>()

  // ── GC-free object pool for per-frame transforms (avoids allocs/frame)
  private _poolPos = new THREE.Vector3()
  private _poolLookAt = new THREE.Vector3()
  private _poolBakuColor = new THREE.Color()
  private _poolBakuEmissive = new THREE.Color()
  private _poolEnvColor = new THREE.Color()
  // The transform result is consumed synchronously by Experience.update().
  // Pool its nested metadata too; otherwise the vectors/colors above still
  // sat inside a fresh object graph on every demand-driven frame.
  private _poolResult: WorldTransformResult = {
    cameraTarget: { position: this._poolPos, lookAt: this._poolLookAt, fov: 0 },
    worldState: {
      currentPhase: '',
      phaseProgress: 0,
      bakuMaterial: {
        role: BakuRole.NORMAL,
        color: this._poolBakuColor,
        emissive: this._poolBakuEmissive,
        roughness: 0,
        metalness: 0,
      },
      envColor: this._poolEnvColor,
    },
  }

  constructor(private readonly _ctx: SceneTransformPassContext) {}

  /** Drop the route-derived range cache alongside the revision bump (route
   *  config rebuild — the ranges are rebuilt from the new configs lazily). */
  public resetForRoute(): void {
    this._rangesCache = null
    this.invalidate()
  }

  /** Force the next updateTransform to recompute instead of reusing the pool. */
  public invalidate(): void {
    this._transformRevision += 1
  }

  // ── Range-based scroll mapping: scrollValue → section index + eased t
  // Uses PhaseConfig.range[] for weighted scroll buckets
  // Applies S-curve easing to t so transitions have "comfort zones"
  public updateTransform(scrollValue: number): WorldTransformResult {
    // Story progress contract: non-finite settles to 0, clamp to [0, 1].
    scrollValue = clampStoryProgress(scrollValue)
    const sections = this._ctx.story.sections
    if (sections.length === 0) return this.defaultResult()
    // Route and carousel ownership are stable for this synchronous transform
    // pass. Snapshot them once so the six-group visibility loop cannot repeat
    // owner lookups on every group while preserving the live getter boundary
    // across subsequent route transitions.
    const page = this._ctx.page()
    if (
      this._transformCacheRevision === this._transformRevision &&
      this._transformCachePage === page &&
      Object.is(this._transformCacheScroll, scrollValue)
    ) {
      return this._poolResult
    }
    this._transformCacheRevision = this._transformRevision
    this._transformCachePage = page
    this._transformCacheScroll = scrollValue
    const carouselOwner = this._ctx.owners.carousel()

    // ── Find from/to indices from range config
    // Use the cached ranges (built once in init) instead of map() every frame
    const configs = this._ctx.story.configs
    const ranges = this._rangesCache ?? configs.map((c) => c.range)
    if (!this._rangesCache) this._rangesCache = ranges
    let fromIndex = 0
    let toIndex = 1
    let t = 0

    // Map scrollValue to range index
    for (let i = 0; i < ranges.length; i++) {
      const [rStart, rEnd] = ranges[i]!
      if (scrollValue >= rStart && scrollValue < rEnd) {
        // scrollValue is inside this section's range
        fromIndex = i
        toIndex = Math.min(i + 1, sections.length - 1)
        const rangeWidth = rEnd - rStart
        t = (scrollValue - rStart) / rangeWidth
      } else if (scrollValue >= rEnd && i < ranges.length - 1) {
        // scrollValue is past this range, check next
        continue
      }
    }

    // Clamp edge case: scrollValue at exactly 1.0 → last section
    if (scrollValue >= 1.0) {
      fromIndex = sections.length - 1
      toIndex = fromIndex
      t = 0 // at the last section, no transition (was t=1)
    }

    // ── Ease t through per-section easing (from scene.transition config)
    // Default: smoothstep (S-curve, comfort plateaus at section centers).
    // Per-section: can use 'linear', 'ease-out', 'ease-in-out' for different feels.
    const fromCfg = configs[fromIndex]!
    const toCfg = configs[toIndex]!
    const easing =
      toCfg?.scene?.transition?.easing ?? fromCfg?.scene?.transition?.easing ?? 'ease-in-out'
    t = this._applyEasing(t, easing)

    // Deliberate second ease (parity-locked): bg + group fade use the doubly-
    // eased t so each section's color holds until mid-transition, then quickly
    // flips. Prevents the about section's dark bg from bleeding into
    // flexible's light bg too early (white text contrast loss). Camera/baku
    // still use the single-eased t.
    const bgT = this._applyEasing(t, easing)

    // ── Update current section index + fire per-section systems ──
    // CinematicNav changes its active DOM chapter at the midpoint between two
    // native scroll frames. Keep the 3D arrival in that same neutral point.
    // Using `fromIndex` here made down-scroll arrivals happen at the *end* of
    // a frame while up-scroll arrivals happened immediately after leaving it,
    // creating a visible direction-dependent second beat.
    // The midpoint rule itself is the pure storyProgress contract (unit-
    // locked, including the .5 boundary and direction independence).
    const activeIndex = sectionIndexAt(scrollValue, sections.length)
    if (this._ctx.story.arrive(activeIndex)) {
      // Junni changeSection() pattern: lights + fog + env sphere driven by section data
      const activeCfg = configs[activeIndex]
      if (activeCfg) {
        // Phase 8 slice 1: section-arrival light targets moved to Experience
        // (same frame, same config — only the lerp start moves a few lines
        // later in the frame path).
        // Inline WorldAtmosphere.setFog — fog exists from init(), reuse instance.
        const existingFog = this._ctx.scene.fog
        if (existingFog instanceof THREE.FogExp2) {
          existingFog.color.copy(activeCfg.fog.color)
          existingFog.density = activeCfg.fog.density
        } else {
          this._ctx.scene.fog = new THREE.FogExp2(
            activeCfg.fog.color.clone(),
            activeCfg.fog.density,
          )
        }
        // EnvSphere follows the active theme through the jlz:theme-applied
        // listener in Experience.ts. Per-section pattern overrides were
        // removed because they could break theme contrast.
      }
    }

    // The cursor signal belongs to the standalone Works route. On home it
    // remains outside the large media stream, where it would cut across the
    // case artwork instead of supporting it. Route replacement can retain the
    // same section index, so this must run outside the arrival-only branch.
    const trail = this._ctx.owners.drawTrail()
    if (trail) {
      const isStandaloneWorks = page === 'works'
      trail.object.visible = isStandaloneWorks || (activeIndex === 3 && !carouselOwner?.isActive)
    }

    // ── BG sphere section switch (junni pattern: lerp BG color continuously)
    // setProgress() lerps between fromIndex and toIndex colors using eased t,
    // (BG.setProgress removed — bg.color was never read by anyone.)
    // EnvSphere follows the active theme via jlz:theme-applied.

    // ── Scene group visibility with opacity fade (junni switchVisibility pattern)
    // From group fades out as t→1, to group fades in. Both visible during
    // transition. NON-DESTRUCTIVE: cache base opacity in the pass-owned state,
    // then apply the transition fade
    // multiplicatively. Keep factory opacity values as the base and apply the
    // transition fade multiplicatively.
    const groups = this._ctx.owners.sectionGroups()?.groups ?? []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!
      const isFrom = i === fromIndex
      const isTo = i === toIndex
      let fade = 0
      if (isFrom) fade = 1 - bgT
      if (isTo) fade = bgT
      if (isFrom && isTo) fade = 1

      const shouldShow = isFrom || isTo
      // The carousel is only on the Works group (index 3) — read it from the
      // Experience-owned reference.
      const carousel = i === 3 ? carouselOwner : undefined
      const cfg = configs[i]
      const showCarousel = page === 'home' && cfg?.scene?.objects?.bakuCarousel === true

      if (shouldShow) {
        g.visible = fade > 0.001
        // A-006: Use cached mesh list instead of traverse every frame.
        let meshCache = this._meshCache.get(g)
        if (!meshCache) {
          meshCache = []
          g.traverse((obj) => {
            if (obj instanceof THREE.Mesh) {
              const mat = obj.material
              if (!Array.isArray(mat) && 'opacity' in mat) {
                const material = mat as THREE.Material & { opacity: number }
                this._opacityCache.set(material, { base: material.opacity, lastFade: Number.NaN })
                meshCache!.push(obj)
              }
            }
          })
          this._meshCache.set(g, meshCache)
        }
        for (const mesh of meshCache) {
          const m = mesh.material as THREE.Material & { opacity: number }
          const state = this._opacityCache.get(m) ?? { base: m.opacity, lastFade: Number.NaN }
          this._opacityCache.set(m, state)
          if (state.lastFade !== fade) {
            m.opacity = state.base * fade
            state.lastFade = fade
          }
        }

        // BakuCarousel visibility — only on the home Works phase. Its state is
        // also reset below when this group is outside the active transition;
        // otherwise a content-route visit can leave an already-open carousel
        // suspended and make a later /#section-works return non-deterministic.
        if (carousel) {
          carousel.visible = showCarousel && fade > 0.01
          carousel.setActive(showCarousel && fade > 0.5)
        }

        // ── Per-section 3D object visibility (SceneControl) ──
        // Toggle section-specific 3D content based on config.
        // objects undefined = defaults (visible if present in scene group).
        const sceneObjects = cfg?.scene?.objects
        if (sceneObjects && i === 4) {
          const visible = sceneObjects.wireframeText !== false && fade > 0.01
          this._ctx.owners.contactTypographyStage()?.setActive(visible && fade > 0.5)
        }
      } else {
        g.visible = false
        // Keep route transitions authoritative even while the owning group is
        // hidden. This ensures the next arrival in Works starts from a known
        // inactive slider state rather than a stale home-frame state.
        carousel?.setActive(false)
        if (carousel) carousel.visible = false
      }
    }

    const fromSec = sections[fromIndex]
    const toSec = sections[toIndex] ?? sections[fromIndex]
    if (!fromSec) return this.defaultResult()
    if (!toSec) return this.defaultResult()

    // ── State transitions (Junni: trigger on entering/leaving scroll ranges)
    this._ctx.story.applyScrollStates(fromSec, toSec, t, this._ctx.isReducedMotion())

    // ── Lerp transforms from Section transforms (Junni pattern)
    const fromCam = fromSec.cameraTransform
    const toCam = toSec.cameraTransform
    const fromBaku = fromSec.bakuTransform
    const toBaku = toSec.bakuTransform
    const fromLight = fromSec.lightData
    const toLight = toSec.lightData

    // fromCfg/toCfg already declared above (for easing selection)
    // Use the config from section's phaseConfig for ground/post/lighting

    // ── Ground plane update (junni pattern: lerp color + opacity per section)
    // The GroundPlane owner owns the theme-override/lerp state (syncTheme flips
    // it to a contrasting tone per theme); the pass forwards its eased
    // `t` (the lerp needs the per-section eased t from here).
    this._ctx.owners.ground()?.applyTransform(fromCfg.ground, toCfg.ground, t)

    // Scroll-driven parallax: subtle camera depth drift within a section.
    // sin(t * PI) peaks at mid-transition (t=0.5) — camera nudges forward,
    // giving a "breathing" depth feel as user scrolls between sections.
    const parallaxZ = Math.sin(t * Math.PI) * 0.4
    const parallaxY = Math.cos(t * Math.PI) * 0.15

    this._poolPos.lerpVectors(fromCam.position, toCam.position, t)
    this._poolPos.y += parallaxY
    this._poolPos.z += parallaxZ

    const result = this._poolResult
    const cameraTarget = result.cameraTarget
    const worldState = result.worldState
    const bakuMaterial = worldState.bakuMaterial
    cameraTarget.lookAt = this._poolLookAt.lerpVectors(fromCam.target, toCam.target, t)
    cameraTarget.fov = THREE.MathUtils.lerp(fromCam.fov, toCam.fov, t)
    // Arrival metadata drives discrete systems (theme, post, cube) while the
    // transform/material values remain a continuous from→to blend.
    worldState.currentPhase = configs[activeIndex]!.id
    worldState.phaseProgress = t
    bakuMaterial.role = toBaku.role
    bakuMaterial.color = this._poolBakuColor.lerpColors(
      fromBaku.material.color,
      toBaku.material.color,
      t,
    )
    bakuMaterial.emissive = this._poolBakuEmissive.lerpColors(
      fromBaku.material.emissive,
      toBaku.material.emissive,
      t,
    )
    bakuMaterial.roughness = THREE.MathUtils.lerp(
      fromBaku.material.roughness,
      toBaku.material.roughness,
      t,
    )
    bakuMaterial.metalness = THREE.MathUtils.lerp(
      fromBaku.material.metalness,
      toBaku.material.metalness,
      t,
    )
    worldState.envColor = this._poolEnvColor.lerpColors(
      fromLight.ambientColor,
      toLight.ambientColor,
      t,
    )
    return result
  }

  /** Apply easing function to t (0..1) based on scene.transition.easing config.
   *  'ease-in-out' (default) = smoothstep (S-curve, comfort plateaus)
   *  'ease-out' = fast start, slow end (decelerate into section)
   *  Only these two easings are authored in WorldConfig — the config type is
   *  narrowed to match, so no other branches exist. */
  private _applyEasing(t: number, easing: SceneTransitionEasing): number {
    return easing === 'ease-out' ? easeOutCubic(t) : smoothstep01(t)
  }

  private defaultResult(): WorldTransformResult {
    const cfg: PhaseConfig = {
      id: 'step01',
      context: 'phase_step01',
      domSection: 'hero',
      range: [0, 1],
      camera: { position: new THREE.Vector3(0, 0, 8), target: new THREE.Vector3(0, 0, 0), fov: 55 },
      baku: {
        position: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
        scale: new THREE.Vector3(0.4),
        opacity: 1,
        role: BakuRole.NORMAL,
        material: {
          color: new THREE.Color(),
          emissive: new THREE.Color(),
          roughness: 0.2,
          metalness: 0.8,
        },
      },
      lighting: { ambientColor: new THREE.Color(), intensity: 1 },
      fog: { color: new THREE.Color(), density: 0.03 },
      // This fallback must preserve cross-backend visual parity too.
      post: {
        bloom: 0.2,
        vignette: 0.5,
        grain: 0.03,
        chromatic: 0,
        refract: 0,
        border: 0.0,
        gradeShadows: [1, 1, 1],
        gradeHighlights: [1, 1, 1],
      },
      ui: { showGallery: false },
      ground: { color: new THREE.Color(0x000000), opacity: 0 },
      camFovOffset: 0.3,
      camFovDuration: 0.8,
      camSmoothing: 5,
      theme: 'dark',
    }
    return this.buildResultFromConfig(cfg)
  }

  private buildResultFromConfig(cfg: PhaseConfig): WorldTransformResult {
    const cam = cfg.camera
    const baku = cfg.baku
    const light = cfg.lighting

    return {
      cameraTarget: {
        position: cam.position.clone(),
        lookAt: cam.target.clone(),
        fov: cam.fov,
      },
      worldState: {
        currentPhase: cfg.id,
        phaseProgress: 0,
        bakuMaterial: {
          role: baku.role,
          color: baku.material.color.clone(),
          emissive: baku.material.emissive.clone(),
          roughness: baku.material.roughness,
          metalness: baku.material.metalness,
        },
        envColor: light.ambientColor.clone(),
      },
    }
  }
}
