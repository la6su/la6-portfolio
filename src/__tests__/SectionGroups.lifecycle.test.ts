import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SectionGroups } from '../Experience/Scene/SectionGroups'
import { JunniParticles } from '../Experience/World/JunniParticles'
import { sectionGroupAttachmentsOf, setSectionGroupAttachments } from '../Experience/sceneOwners'

describe('SectionGroups lifecycle', () => {
  it('attaches Works contents to its declarative root and leaves the root with Tres', () => {
    const scene = new THREE.Scene()
    const roots = Array.from({ length: 6 }, (_, index) => {
      const root = new THREE.Group()
      root.name = `section-${index}`
      scene.add(root)
      return root
    })
    const owner = new SectionGroups(scene, 6, undefined, undefined, roots)
    const worksRoot = roots[3]!

    expect(owner.at(3)).toBe(worksRoot)
    expect(sectionGroupAttachmentsOf(worksRoot)?.carousel).toBeTruthy()
    expect(sectionGroupAttachmentsOf(worksRoot)?.particles).toBeTruthy()
    const particles = sectionGroupAttachmentsOf(worksRoot)?.particles
    owner.dispose()

    expect(worksRoot.parent).toBe(scene)
    expect(particles?.parent).toBeNull()
  })

  it('adopts declarative empty roots without removing them on owner disposal', () => {
    const scene = new THREE.Scene()
    const roots = [0, 1, 2, 3, 4].map((index) => {
      const root = new THREE.Group()
      root.name = `section-${index}`
      scene.add(root)
      return root
    })
    const owner = new SectionGroups(scene, 3, undefined, undefined, roots)

    expect(owner.groups).toEqual([roots[0], roots[1], roots[2]])
    owner.dispose()

    expect(roots.slice(0, 3).every((root) => root.parent === scene)).toBe(true)
  })

  it('keeps recursive disposal terminal and makes late lookup inert', () => {
    const scene = new THREE.Scene()
    const owner = new SectionGroups(scene, 0)
    const group = new THREE.Group()
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshBasicMaterial()
    group.add(new THREE.Mesh(geometry, material))
    scene.add(group)
    owner.groups.push(group)

    const geometryDispose = vi.spyOn(geometry, 'dispose')
    const materialDispose = vi.spyOn(material, 'dispose')
    owner.dispose()
    owner.dispose()

    expect(geometryDispose).toHaveBeenCalledTimes(1)
    expect(materialDispose).toHaveBeenCalledTimes(1)
    expect(owner.at(0)).toBeUndefined()
    expect(owner.groups).toHaveLength(0)
    expect(group.parent).toBeNull()
  })

  it('gives particle owners terminal disposal before the generic resource sweep', () => {
    const scene = new THREE.Scene()
    const owner = new SectionGroups(scene, 0)
    const group = new THREE.Group()
    const particles = new JunniParticles({ count: 4 })
    setSectionGroupAttachments(group, { particles })
    group.add(particles)
    scene.add(group)
    owner.groups.push(group)

    const particleDispose = vi.spyOn(particles, 'dispose')
    const geometryDispose = vi.spyOn(particles.geometry, 'dispose')
    const materialDispose = vi.spyOn(particles.material as THREE.Material, 'dispose')

    owner.dispose()
    owner.dispose()
    particles.update(1)

    expect(particleDispose).toHaveBeenCalledOnce()
    expect(geometryDispose).toHaveBeenCalledOnce()
    expect(materialDispose).toHaveBeenCalledOnce()
    expect(particles.parent).toBeNull()
  })
})
