// Adopts the six section roots declared by SceneGroupRoots.vue and owns only
// the behavior/resource controllers attached to the Works root.

import * as THREE from 'three'
import { attachWorksSection } from './WorksSection'
import type { PageId } from '../../core/routeManifest'
import type { StorySide } from '../../core/storyState'
import { WORKS_SLOT_INDEX, WORLD_SLOT_COUNT } from '../../core/worldSlots'
import { clearSectionGroupAttachments, sectionGroupAttachmentsOf } from '../sceneOwners'

export class SectionGroups {
  readonly groups: THREE.Group[]
  private _disposed = false

  constructor(
    scene: THREE.Scene,
    page: () => PageId,
    storySide: () => StorySide,
    roots: readonly THREE.Group[],
  ) {
    if (roots.length !== WORLD_SLOT_COUNT) {
      throw new Error(`Expected ${WORLD_SLOT_COUNT} Vue-owned section roots, received ${roots.length}.`)
    }
    for (const [index, root] of roots.entries()) {
      if (root.parent !== scene) {
        throw new Error(`Vue-owned section root ${index} is not attached to the Tres scene.`)
      }
    }

    this.groups = [...roots]
    const worksRoot = this.groups[WORKS_SLOT_INDEX]
    if (!worksRoot) throw new Error('Vue-owned Works scene root is missing.')
    attachWorksSection(worksRoot, page, storySide)
  }

  at(index: number): THREE.Group | undefined {
    if (this._disposed) return undefined
    return this.groups[index]
  }

  dispose(): void {
    if (this._disposed) return
    this._disposed = true
    for (const group of this.groups) {
      const attachments = sectionGroupAttachmentsOf(group)
      attachments?.carousel?.dispose()
      attachments?.particles?.dispose()
      attachments?.ownedTextures?.forEach((texture) => texture.dispose())
      clearSectionGroupAttachments(group)
    }
    // The roots stay mounted in Vue; the persistent host owns their removal.
    this.groups.length = 0
  }
}
