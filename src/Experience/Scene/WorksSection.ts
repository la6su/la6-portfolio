// src/Experience/Scene/WorksSection.ts — the Works section contents
// (slot 3, the cube back face).
//
// The Tres root is declarative. This creator attaches the live BakuCarousel
// and JunniParticles to that root; SectionGroups owns their disposal.

import * as THREE from 'three'
import { JunniParticles } from '../World/JunniParticles'
import { BakuCarousel } from '../World/BakuCarousel'
import type { PageId } from '../../core/routeManifest'
import type { StorySide } from '../../core/storyState'
import { sectionGroupAttachmentsOf, setSectionGroupAttachments } from '../sceneOwners'
import { keepSceneObjectVisible } from '../sceneRuntimeState'

/** Attach the Works content to its declarative scene root. */
export function attachWorksSection(
  g: THREE.Group,
  page: () => PageId = () => 'home',
  storySide: () => StorySide = () => 'center',
): THREE.Group {
  // Shared sprite sheet texture (6 frames, 768×128 — junni pattern.jpg).
  // Loaded by this creator so the group is the explicit texture owner:
  // multiple SectionGroups instances must never overwrite a module-level
  // texture slot owned by another instance.
  // Disable mipmaps on the sprite sheet — the default LinearMipmapLinearFilter
  // averages across frame boundaries at distance, so visible color bleeds
  // between adjacent animation frames. LinearFilter (no mipmaps) keeps the
  // frames crisp.
  const particleTexture = new THREE.TextureLoader().load('/textures/sec3-particles.jpg')
  particleTexture.colorSpace = THREE.SRGBColorSpace
  particleTexture.minFilter = THREE.LinearFilter
  particleTexture.generateMipmaps = false
  const ownedTextures = [particleTexture]

  // BakuCarousel — the project stream resolves from depth around the baku.
  // Once revealed (morphT > 0.5) the stream can be scrolled/dragged,
  // and clicking a card opens the fullscreen FullscreenOverlay.
  const carousel = new BakuCarousel(page, storySide)
  keepSceneObjectVisible(carousel)
  g.add(carousel)
  setSectionGroupAttachments(g, { carousel, ownedTextures })

  // JunniParticles — exact junni Section3 params:
  //   num=100, range=[7,8,7], size=0.2 (PlaneGeometry base), speed=1.0
  // scaleNode = num.y * size (num.y = 0.05-1.0 → final 0.01-0.2)
  // Blending is theme-aware (setBlending via jlz:theme-applied).
  const particles = new JunniParticles({
    count: 100,
    range: [7, 8, 7],
    size: 0.2,
    speed: 1.0,
    color: 0x4488ff,
    texture: particleTexture,
    textureTiles: [6, 1],
  })
  keepSceneObjectVisible(particles)
  g.add(particles)
  setSectionGroupAttachments(g, {
    ...sectionGroupAttachmentsOf(g),
    particles,
  })

  return g
}
