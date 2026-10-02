// Adopts the six section roots declared by SceneGroupRoots.vue and the
// behavior/resource owners for the declarative Works subtree.

import * as THREE from 'three'
import { createWorksSection, type WorksSectionOwners } from './WorksSection'
import type { PageId } from '../../core/routeManifest'
import type { StorySide } from '../../core/storyState'
import { WORKS_SLOT_INDEX, WORLD_SLOT_COUNT } from '../../core/worldSlots'

export class SectionGroups {
  readonly groups: THREE.Group[]
  readonly works: WorksSectionOwners
  private _disposed = false

  constructor(
    scene: THREE.Scene,
    page: () => PageId,
    storySide: () => StorySide,
    roots: readonly THREE.Group[],
  ) {
    if (roots.length !== WORLD_SLOT_COUNT) {
      throw new Error(
        `Expected ${WORLD_SLOT_COUNT} Vue-owned section roots, received ${roots.length}.`,
      )
    }
    for (const [index, root] of roots.entries()) {
      if (root.parent !== scene) {
        throw new Error(`Vue-owned section root ${index} is not attached to the Tres scene.`)
      }
    }

    this.groups = [...roots]
    const worksRoot = this.groups[WORKS_SLOT_INDEX]
    if (!worksRoot) throw new Error('Vue-owned Works scene root is missing.')
    this.works = createWorksSection(page, storySide)
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this.works.carousel.dispose()
    this.works.particles.dispose()
    this.works.ownedTextures.forEach((texture) => texture.dispose())
    // The roots stay mounted in Vue; the persistent host owns their removal.
    this.groups.length = 0
  }
}
