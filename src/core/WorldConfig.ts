// src/core/WorldConfig.ts — 6 sections (0=Contact finale slot, 1-4=story, 5=Menu)

import * as THREE from 'three'
import { BakuRole } from './types'
import type { PostParams } from './postParams'
import { worldSlotAt, WORLD_SLOT_COUNT } from './worldSlots'

// ── Types ──
export interface CameraTransform {
  position: THREE.Vector3
  target: THREE.Vector3
  fov: number
}

export interface BakuTransform {
  position: THREE.Vector3
  rotation: THREE.Quaternion
  scale: THREE.Vector3
  opacity: number
  role: BakuRole
  material: {
    color: THREE.Color
    emissive: THREE.Color
    roughness: number
    metalness: number
  }
}

export interface LightTransform {
  ambientColor: THREE.Color
  intensity: number
}

interface FogTransform {
  color: THREE.Color
  density: number
}

/**
 * The authored per-section post values (WorldConfig remains the single source
 * of visible post-processing values). Field docs live on the canonical shape
 * (core/postParams.ts) — this type is its section-authored projection without
 * the renderer-owned bloom blur shape.
 */
type PostTransform = Pick<
  PostParams,
  | 'bloom'
  | 'vignette'
  | 'grain'
  | 'chromatic'
  | 'refract'
  | 'border'
  | 'gradeShadows'
  | 'gradeHighlights'
>

interface SectionLightDef {
  hexColor: string
  intensity?: number
  distance?: number
  position: [number, number, number]
}

/** Transition easing authored in WorldConfig. The list is closed: only these
 *  two curves are used by any section, so SceneCoordinator implements exactly
 *  them (no dead 'linear'/'cubic-bezier' branches). */
export type SceneTransitionEasing = 'ease-out' | 'ease-in-out'

/** Per-section 3D scene control. All optional — sections without these
 *  use defaults (objects visible when their scene group is visible,
 *  standard transition). */
export interface SceneControl {
  /** 3D objects visibility per section. false = hidden. */
  objects?: {
    wireframeText?: boolean
    bakuCarousel?: boolean
  }
  /** Transition easing for camera + baku morph when entering this section.
   *  (The former duration field had zero readers — the crossfade speed and
   *  switch durations are owned by Section/PostProcessingManager.) */
  transition?: {
    easing: SceneTransitionEasing
  }
}

/** Shared fallback for sections that do not override camera smoothing. */
export const DEFAULT_CAMERA_SMOOTHING = 5

export interface PhaseConfig {
  id: string
  context: string
  domSection: string
  range: [number, number]
  camera: CameraTransform
  camFovOffset: number
  camFovDuration: number
  camSmoothing: number
  baku: BakuTransform
  lighting: LightTransform
  fog: FogTransform
  post: PostTransform
  ui: { showGallery: boolean }
  ground: { color: THREE.Color; opacity: number }
  sectionLights?: SectionLightDef[]
  /** Per-section 3D scene control (background pattern, objects, transition). */
  scene?: SceneControl
  /** Section theme: 'light' = light background (dark text), 'dark' = dark background (light text).
   *  Inverse mode flips these. See ThemeManager + ContentReveal. */
  theme: 'light' | 'dark'
}

type RawScene = {
  id: string
  context: string
  domSection: string
  range: [number, number]
  camPos?: [number, number, number]
  camTarget?: [number, number, number]
  camFov?: number
  camFovOffset?: number
  camFovDuration?: number
  camSmoothing?: number
  bakuRole?: BakuRole
  bakuOpacity?: number
  bakuColor?: number
  bakuEmissive?: number
  postBloom?: number
  postVignette?: number
  postGrain?: number
  postChromatic?: number
  postRefract?: number
  postBorder?: number
  postGradeShadows?: [number, number, number]
  postGradeHighlights?: [number, number, number]
  lightColor?: number
  lightIntensity?: number
  fogColor?: number
  fogDensity?: number
  bgColor?: number
  showGallery?: boolean
  groundColor?: number
  groundOpacity?: number
  /** Per-section theme: 'light' (light bg, dark text) or 'dark' (dark bg, light text). */
  sectionTheme?: 'light' | 'dark'
  /** Per-section 3D scene control (optional — omitted = defaults). */
  sceneObjects?: SceneControl['objects']
  sceneTransition?: SceneControl['transition']
}

// ── Defaults (shared by ~80% of sections) ──
const DEFAULTS: Omit<RawScene, 'id' | 'context' | 'domSection' | 'range'> = {
  camPos: [0, 0, 3.5],
  camTarget: [0, 0, 0],
  camFov: 60,
  camFovOffset: 0.3,
  camFovDuration: 0.8,
  camSmoothing: DEFAULT_CAMERA_SMOOTHING,
  bakuRole: BakuRole.GLASS,
  bakuOpacity: 0.4,
  bakuColor: 0xb8b8b8,
  bakuEmissive: 0x050505,
  postBloom: 0,
  postVignette: 0,
  postGrain: 0,
  postChromatic: 0,
  postRefract: 0,
  postBorder: 0.0,
  postGradeShadows: [1.0, 1.0, 1.0],
  postGradeHighlights: [1.0, 1.0, 1.0],
  lightColor: 0xffffff,
  lightIntensity: 1.2,
  fogColor: 0x000000,
  fogDensity: 0.005,
  bgColor: 0x000000,
  showGallery: false,
  groundColor: 0x101010,
  groundOpacity: 0,
  sectionTheme: 'dark',
  sceneTransition: { easing: 'ease-out' },
}

// 6 sections (4 story frames + Contact finale/Lab=0 + Menu=5)
// Index: 0=lab, 1=intro, 2=about, 3=works, 4=contact, 5=menu
// The per-slot DOM anchor and story range are owned by the canonical
// world-slot contract (src/core/worldSlots.ts); the home scenes below only
// carry their authored per-section overrides.
const HOME_RAW: Array<Omit<RawScene, 'domSection' | 'range'>> = [
  {
    ...DEFAULTS,
    id: 'sec_lab',
    context: 'LAB — Experiments',
    sectionTheme: 'dark',
  },
  {
    ...DEFAULTS,
    id: 'sec_intro',
    context: 'Studio — Home',
    sceneTransition: { easing: 'ease-in-out' },
  },
  {
    ...DEFAULTS,
    id: 'sec_about',
    context: 'TRINITY — About',
    camFovOffset: 0.4,
    camFovDuration: 0.9,
    camSmoothing: 6,
    bakuOpacity: 0.35,
    bakuColor: 0xc0c0c0,
    postBloom: 0.4,
    lightColor: 0x050505,
    lightIntensity: 1.2,
    groundOpacity: 0.08,
    sceneTransition: { easing: 'ease-out' },
  },
  {
    ...DEFAULTS,
    id: 'sec_works',
    context: 'WORKS — Gallery',
    camFovOffset: 0.5,
    camFovDuration: 1.0,
    camSmoothing: 6,
    bakuOpacity: 0.4,
    bakuColor: 0xc0c0c0,
    showGallery: true,
    lightColor: 0x050505,
    lightIntensity: 1.2,
    groundOpacity: 0.1,
    sceneObjects: { bakuCarousel: true },
    sceneTransition: { easing: 'ease-out' },
  },
  {
    ...DEFAULTS,
    id: 'sec_contact',
    context: 'CONTACT — Footer',
    postBloom: 0.2,
    lightColor: 0xffffff,
    lightIntensity: 1.5,
    groundColor: 0x121212,
    groundOpacity: 0.4,
    sceneObjects: { wireframeText: true },
    sceneTransition: { easing: 'ease-out' },
  },
  {
    ...DEFAULTS,
    id: 'sec_menu',
    context: 'MENU — Navigation',
    bakuOpacity: 0.14,
    bakuColor: 0xc7c9e6,
    postBloom: 0.08,
    postRefract: 0.012,
    postGradeShadows: [0.82, 0.84, 1.0],
    postGradeHighlights: [1.0, 0.98, 0.72],
    lightColor: 0xa6a9d6,
    lightIntensity: 0.72,
    groundOpacity: 0.02,
    sceneTransition: { easing: 'ease-in-out' },
  },
]

// The canonical slot contract supplies the DOM anchor and story range so the
// slot model is declared in exactly one place.
const RAW: RawScene[] = HOME_RAW.map((scene, index) => {
  const slot = worldSlotAt(index)
  return { ...scene, domSection: slot.domSection, range: [slot.range[0]!, slot.range[1]!] }
})

// ── Helpers ──
const _toVec = (v: [number, number, number]) => new THREE.Vector3(...v)
const _toColor = (hex: number) => new THREE.Color(hex)

function toPhaseConfig(r: RawScene): PhaseConfig {
  return {
    id: r.id,
    context: r.context,
    domSection: r.domSection ?? r.id.replace(/^sec_/, ''),
    range: r.range,
    camera: { position: _toVec(r.camPos!), target: _toVec(r.camTarget!), fov: r.camFov! },
    camFovOffset: r.camFovOffset!,
    camFovDuration: r.camFovDuration!,
    camSmoothing: r.camSmoothing!,
    baku: {
      position: new THREE.Vector3(),
      rotation: new THREE.Quaternion(),
      scale: new THREE.Vector3(0.4, 0.4, 0.4),
      opacity: r.bakuOpacity!,
      role: r.bakuRole!,
      material: {
        // GLASS cube: metalness MUST be 0 (glass is a dielectric, not metal).
        // roughness=0.05 matches SplashCube.buildCube (mirror-smooth glass).
        color: _toColor(r.bakuColor!),
        emissive: _toColor(r.bakuEmissive!),
        roughness: 0.05,
        metalness: 0.0,
      },
    },
    lighting: {
      ambientColor: _toColor(r.lightColor!),
      intensity: r.lightIntensity!,
    },
    fog: { color: _toColor(r.fogColor!), density: r.fogDensity! },
    post: {
      bloom: r.postBloom!,
      vignette: r.postVignette!,
      grain: r.postGrain!,
      chromatic: r.postChromatic!,
      refract: r.postRefract!,
      border: r.postBorder!,
      gradeShadows: r.postGradeShadows!,
      gradeHighlights: r.postGradeHighlights!,
    },
    ui: { showGallery: r.showGallery! },
    ground: {
      color: _toColor(r.groundColor!),
      opacity: r.groundOpacity!,
    },
    theme: r.sectionTheme!,
    scene:
      r.sceneObjects || r.sceneTransition
        ? { objects: r.sceneObjects, transition: r.sceneTransition }
        : undefined,
  }
}

// ── Content page configs — minimal 3D, unique atmosphere per page ──

type ContentPalette = {
  bakuColor: number
  bakuEmissive: number
  fogColor: number
  groundColor: number
  /** Authored restrained bloom for the page family (WebGPU post graph only;
   * WebGLBackend direct-renders without post, so values must read as polish,
   * never as the primary content carrier). Bounded by home's authored range
   * (sec_contact 0.2 … sec_about 0.4). */
  postBloom: number
  /** Ink-tinted grade channels — the page's voice in the shared crossfaded
   * post graph. Shadows tint dark areas, highlights tint bright areas
   * (1 = neutral), mirroring sec_menu's authored duotone at lower strength. */
  postGradeShadows: [number, number, number]
  postGradeHighlights: [number, number, number]
}

// Per-page post voices are derived from the same family hue as the baku
// palette so a route reads as one authored atmosphere, not a random preset.
// Strengths stay below home's peak (0.4) — content pages carry meaning in
// their DOM first; the scene is a backing grade.
const PALETTES: Record<string, ContentPalette> = {
  services: {
    bakuColor: 0xc0b0a0,
    bakuEmissive: 0x8a7a5a,
    fogColor: 0x0a0805,
    groundColor: 0x1a1208,
    postBloom: 0.12,
    postGradeShadows: [0.96, 0.94, 1.0],
    postGradeHighlights: [1.0, 0.985, 0.94],
  },
  manifesto: {
    bakuColor: 0xaac4cc,
    bakuEmissive: 0x6a9aaa,
    fogColor: 0x051015,
    groundColor: 0x081a1a,
    postBloom: 0.14,
    postGradeShadows: [0.88, 0.96, 1.0],
    postGradeHighlights: [1.0, 1.0, 0.98],
  },
  works: {
    bakuColor: 0xb0b0ce,
    bakuEmissive: 0x7a7aaa,
    fogColor: 0x080814,
    groundColor: 0x101020,
    postBloom: 0.18,
    postGradeShadows: [0.9, 0.9, 1.0],
    postGradeHighlights: [1.0, 1.0, 1.0],
  },
  lab: {
    bakuColor: 0xc0b0a0,
    bakuEmissive: 0x8a7a5a,
    fogColor: 0x0a0805,
    groundColor: 0x1a1408,
    postBloom: 0.1,
    postGradeShadows: [1.0, 0.96, 0.9],
    postGradeHighlights: [1.0, 0.99, 0.94],
  },
  contact: {
    bakuColor: 0xa0c0cc,
    bakuEmissive: 0x6a8a9a,
    fogColor: 0x050a0f,
    groundColor: 0x08141a,
    postBloom: 0.16,
    postGradeShadows: [0.88, 0.95, 1.0],
    postGradeHighlights: [1.0, 1.0, 0.97],
  },
}

function makeContentScenes(pageId: string): PhaseConfig[] {
  const p = PALETTES[pageId]
  if (!p) return RAW.map(toPhaseConfig)
  // The world stays dark; inverse is an explicit user preference.
  // Content pages mirror the six-face track geometry: the frame count and
  // story ranges come from the canonical slot tuple; only the DOM anchor
  // namespace is content-page-specific (`content-${idx}`), not the home slot
  // anchor.
  return Array.from({ length: WORLD_SLOT_COUNT }, (_, idx) =>
    toPhaseConfig({
      ...DEFAULTS,
      id: `content_${pageId}_${idx}`,
      context: `Content — ${pageId} face ${idx}`,
      domSection: `content-${idx}`,
      range: [...worldSlotAt(idx).range],
      sectionTheme: 'dark',
      bakuColor: p.bakuColor,
      bakuEmissive: p.bakuEmissive,
      // Authored per-page voice instead of hard zeros: the route switch now
      // crossfades bloom + grade channels between home sections and content
      // palettes through the existing PostProcessingManager machinery.
      postBloom: p.postBloom,
      postGradeShadows: [...p.postGradeShadows],
      postGradeHighlights: [...p.postGradeHighlights],
      fogColor: p.fogColor,
      groundColor: p.groundColor,
      groundOpacity: 0.05,
    }),
  )
}

const CONTENT_PAGES = new Set(['services', 'works', 'manifesto', 'lab', 'contact'])

export function getWorldConfigForPage(pageKey: string): readonly PhaseConfig[] {
  if (CONTENT_PAGES.has(pageKey)) {
    return makeContentScenes(pageKey)
  }
  return RAW.map(toPhaseConfig) // home — full scenes
}
