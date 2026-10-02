// src/Experience/SectionStateMachine.ts — the scroll story state.
//
// This owner holds page sections, the active-section index, and the
// scroll-driven state policy (READY -> VIEWING -> PASSED thresholds plus
// the pure sectionIndexAt arrival rule). SceneCoordinator keeps the
// frame-facing delegates and the scene-side writes (fog, group fades,
// transforms). SceneCoordinator orchestrates beginRoute/buildSections and
// delegates section deadline updates here.

import { Section, SectionState } from '../core/Section'
import type { PageId } from '../core/routeManifest'
import { getWorldConfigForPage, type PhaseConfig } from '../core/WorldConfig'

export class SectionStateMachine {
  public sections: Section[] = []
  private _configs: readonly PhaseConfig[] = []
  private _currentSectionIndex: number = 1 // Intro = index 1 (canonical Lab/Contact finale = 0)

  public get currentSectionIndex(): number {
    return this._currentSectionIndex
  }

  /** The active page's phase configs (empty before beginRoute). */
  public get configs(): readonly PhaseConfig[] {
    return this._configs
  }

  /**
   * Rebuild the page-specific config contract after init or SPA navigation:
   * load the configs, drop the derived map and dispose the previous route's
   * sections. Section construction is a separate step (buildSections) so the
   * coordinator can run its route-visibility gate in between.
   */
  public beginRoute(page: PageId): readonly PhaseConfig[] {
    this._configs = getWorldConfigForPage(page)
    this.disposeSections()
    return this._configs
  }

  /** Build the Section instances for the configs beginRoute loaded. */
  public buildSections(): void {
    this._configs.forEach((config, index) => {
      const section = new Section(config, index)
      if (index === 1) {
        // Intro = index 1 (canonical Lab/Contact finale = 0)
        section.forceState(SectionState.VIEWING)
      } else {
        section.forceState(SectionState.READY)
      }
      this.sections.push(section)
    })
  }

  /**
   * Write the section-arrival index (the pure sectionIndexAt midpoint rule).
   * Returns true when the active section changed, so the caller can run the
   * per-arrival scene writes (fog re-target) exactly once.
   */
  public arrive(activeIndex: number): boolean {
    if (activeIndex === this._currentSectionIndex) return false
    this._currentSectionIndex = activeIndex
    return true
  }

  /** Scroll-driven state thresholds (Junni: trigger on entering/leaving
   *  scroll ranges). The 0.1/0.7 boundaries and the 0.8/0.5 deadline
   *  durations are pinned by SceneCoordinator.scrollStates.test.ts. */
  public applyScrollStates(fromSec: Section, toSec: Section, t: number, reduced: boolean): void {
    if (fromSec.state === SectionState.READY) {
      fromSec.switchState(SectionState.VIEWING, 0.8, reduced)
    }
    if (toSec.state === SectionState.READY && t > 0.1) {
      toSec.switchState(SectionState.VIEWING, 0.8, reduced)
    }
    if (t > 0.7 && fromSec.state === SectionState.VIEWING) {
      fromSec.switchState(SectionState.PASSED, 0.5, reduced)
    }
  }

  /** Advance the sections' pending state deadlines (called from the frame
   *  path where the former StateBus tick used to run). */
  public updateSections(dt: number): void {
    this.sections.forEach((s) => {
      s.update(dt)
    })
  }

  public disposeSections(): void {
    this.sections.forEach((s) => {
      s.dispose()
    })
    this.sections = []
  }
}
