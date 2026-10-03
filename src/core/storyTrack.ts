// DOM discovery and scroll observation for the story track.
//
// The pure position math (clamp, rounding, slot rescale) lives in
// `storyState.ts`; this module owns the DOM half of the same contract: which
// element scrolls, which children are the main story sections (the lab/menu
// sheets are excluded), and how a scroll burst becomes one throttled frame.
//
// Two owners consume this module with deliberately different clocks:
//
//   - `CinematicNav` (scene mode) rebinds the track on every route change and
//     adds side-sheet, label, focus, and activity behavior on top;
//   - the `useJlzPage` no-scene branch binds once per mounted route and only
//     publishes the active section.
//
// What must not be duplicated between them is the discovery selector pair,
// the sheet-exclusion set, and the rAF-throttled passive scroll listener.

import type { PageId } from './routeManifest'
import { clampStoryPosition, mainSectionFromPosition } from './storyState'

/** Sheet sections that are story sides, not main story frames. */
const EXCLUDED_SECTIONS = new Set(['lab', 'menu', 'page-lab', 'page-menu'])

export interface StoryTrack {
  /** The scrolling element: the home `#spa-content` root or the page's `.jlz-page`. */
  scroller: HTMLElement
  /** The main story sections in track order, excluding the sheet sections. */
  mainSections: HTMLElement[]
  /** The dataset key the sections carry (`data-section` home, `data-page-section` pages). */
  sectionKey: 'section' | 'pageSection'
}

/**
 * Resolve the story scroller and its main sections for a route root. Home
 * routes scroll the root itself; content pages scroll their `.jlz-page`
 * child. Returns null when the page-mode scroller is absent.
 */
export function resolveStoryTrack(root: HTMLElement, page: PageId): StoryTrack | null {
  const pageMode = page !== 'home'
  const scroller = pageMode ? (root.querySelector<HTMLElement>('.jlz-page') ?? null) : root
  if (!scroller) return null
  const sectionKey: StoryTrack['sectionKey'] = pageMode ? 'pageSection' : 'section'
  const selector = pageMode ? ':scope > [data-page-section]' : ':scope > [data-section]'
  const mainSections = [...scroller.querySelectorAll<HTMLElement>(selector)].filter(
    (section) => !EXCLUDED_SECTIONS.has(section.dataset[sectionKey] ?? ''),
  )
  return { scroller, mainSections, sectionKey }
}

/**
 * Read the clamped story position and the 0-based main-section index for the
 * track's current scroll offset. The pure mapping is `storyState`'s contract.
 */
export function storyPositionFromScroll(track: StoryTrack): {
  position: number
  index: number
} {
  const height = Math.max(1, track.scroller.clientHeight || window.innerHeight)
  const position = clampStoryPosition(track.scroller.scrollTop / height, track.mainSections.length)
  return { position, index: mainSectionFromPosition(position, 0, track.mainSections.length) }
}

/**
 * One rAF-throttled frame per scroll burst over the track's scroller, via a
 * passive listener. `sync()` schedules the same throttled frame for callers
 * that publish the initial position after binding. Owners dispose the
 * observer when the track is rebound or unmounted; dispose cancels a pending
 * frame and removes the listener.
 */
export function observeStoryScroll(
  scroller: HTMLElement,
  onFrame: () => void,
): { dispose: () => void; sync: () => void } {
  let frame: number | null = null
  const schedule = (): void => {
    if (frame !== null) return
    frame = requestAnimationFrame(() => {
      frame = null
      onFrame()
    })
  }
  scroller.addEventListener('scroll', schedule, { passive: true })
  return {
    sync: schedule,
    dispose: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      scroller.removeEventListener('scroll', schedule)
    },
  }
}
