// src/Experience/Scene/SectionGroups.ts — Phase 8 slice 2: the stable
// section groups owner.
//
// Migrates the legacy `World.sceneGroups` creation + disposal: the six
// stable section groups (one per canonical slot, geometry-hidden until bespoke visuals are ready)
// now enter the Tres-owned scene directly under this owner. Experience
// creates the owner (fresh per buildWorld) and is the single disposal
// owner.
//
// `SceneCoordinator`, `Experience` and `ExperienceUI` read this owner through
// their typed coordination boundary for visibility, particle activity and the
// Works-group reference. No legacy World adapter remains.
//
// Phase 8 slice 6: the BakuCarousel (attached to the declarative Works root)
// keeps its scene-graph position here — its
// disposal (BakuCarousel-first ordering) stays in this owner, while its
// reference + init live on Experience.

import * as THREE from 'three'
// Works attaches its live BakuCarousel + JunniParticles to a declarative root.
import { attachWorksSection } from './WorksSection'
import { disposeMaterialDeep } from '../../Utils/dispose'
import type { PageId } from '../../core/routeManifest'
import type { StorySide } from '../../core/storyState'
import { WORKS_SLOT_INDEX } from '../../core/worldSlots'
import { clearSectionGroupAttachments, sectionGroupAttachmentsOf } from '../sceneOwners'
import { isSceneObjectKeptVisible } from '../sceneRuntimeState'

/** Canonical six-slot layout (one group per world slot / cube face). */
const SECTION_GROUP_COUNT = 6

/** Dispose geometry/material resources below a root, excluding known owners. */
export function disposeSceneObjectResources(
  root: THREE.Object3D,
  skip: ReadonlySet<THREE.Object3D> = new Set(),
): void {
  root.traverse((obj) => {
    if (skip.has(obj)) return
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Points ||
      obj instanceof THREE.Line ||
      obj instanceof THREE.Sprite
    ) {
      obj.geometry?.dispose()
      if (Array.isArray(obj.material)) obj.material.forEach((m) => disposeMaterialDeep(m))
      else if (obj.material) disposeMaterialDeep(obj.material)
    }
  })
}

/**
 * Hide non-particle geometry until bespoke visuals are ready (T-070..T-074).
 * Particles (THREE.Points / InstancedMesh) + explicitly retained objects
 * remain for atmospheric depth.
 */
function hideSectionGeometry(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj === group) return
    if (obj instanceof THREE.Points) return
    if (obj instanceof THREE.InstancedMesh) return
    if (isSceneObjectKeptVisible(obj)) return
    obj.visible = false
  })
}

export class SectionGroups {
  readonly groups: THREE.Group[] = []
  private _disposed = false
  private readonly adopted = new Set<THREE.Object3D>()

  constructor(
    scene: THREE.Scene,
    count: number = SECTION_GROUP_COUNT,
    page: () => PageId = () => 'home',
    storySide: () => StorySide = () => 'center',
    sectionRoots?: readonly THREE.Group[],
  ) {
    for (let i = 0; i < count; i++) {
      const root = sectionRoots?.[i]
      const group =
        i === WORKS_SLOT_INDEX
          ? attachWorksSection(root ?? new THREE.Group(), page, storySide)
          : (root ?? new THREE.Group())
      if (root) this.adopted.add(group)
      // Hide non-particle geometry until bespoke visuals are ready (T-070..T-074).
      // Particles remain for atmospheric depth. Remove this call section by section
      // as real visuals are added.
      hideSectionGeometry(group)
      if (!group.parent) scene.add(group)
      this.groups.push(group)
      group.visible = i === 1 // Intro = index 1
    }
  }

  public at(i: number): THREE.Group | undefined {
    if (this._disposed) return undefined
    return this.groups[i]
  }

  public dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this.groups.forEach((group) => {
      const attachments = sectionGroupAttachmentsOf(group)
      const ownedTextures = attachments?.ownedTextures
      ownedTextures?.forEach((texture) => texture.dispose())
      // If the group hosts a BakuCarousel, call its
      // dispose() FIRST — it removes 6 window listeners + clears snapTimer
      // + disposes card materials/textures/geometry. The traverse below
      // SKIPS the gallery's descendants (already disposed) to avoid a
      // fragile double-dispose on the same materials/geometries.
      const gallery = attachments?.carousel
      // Collect gallery + all its descendants so the traverse can skip them.
      const galleryDescendants = new Set<THREE.Object3D>()
      if (gallery) {
        galleryDescendants.add(gallery)
        gallery.traverse((o) => galleryDescendants.add(o))
      }
      gallery?.dispose?.()
      // JunniParticles owns a terminal lifecycle flag and removes itself from
      // the graph. Dispose it before the generic sweep and skip its subtree so
      // geometry/material resources are not released twice.
      const particles = attachments?.particles
      const particleDescendants = new Set<THREE.Object3D>()
      if (particles instanceof THREE.Object3D) {
        particleDescendants.add(particles)
        particles.traverse((object) => particleDescendants.add(object))
        particles.dispose?.()
      }
      const ownedSubtrees = new Set([...galleryDescendants, ...particleDescendants])
      disposeSceneObjectResources(group, ownedSubtrees)
      clearSectionGroupAttachments(group)
      if (!this.adopted.has(group)) group.parent?.remove(group)
    })
    this.groups.length = 0
  }
}
