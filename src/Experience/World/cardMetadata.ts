import type { Object3D } from 'three'

export interface WorksCardMetadata {
  projectIndex: number
  textureUrl: string
}

export interface CarouselCardMetadata {
  textureIndex: number
  projectIndex: number
  textureUrl: string
}

const WORKS_CARDS = new WeakMap<Object3D, WorksCardMetadata>()
const CAROUSEL_CARDS = new WeakMap<Object3D, CarouselCardMetadata>()

export function setWorksCardMetadata(object: Object3D, metadata: WorksCardMetadata): void {
  WORKS_CARDS.set(object, metadata)
}

export function worksCardMetadataOf(object: Object3D): WorksCardMetadata | undefined {
  return WORKS_CARDS.get(object)
}

export function setCarouselCardMetadata(object: Object3D, metadata: CarouselCardMetadata): void {
  CAROUSEL_CARDS.set(object, metadata)
}

export function carouselCardMetadataOf(object: Object3D): CarouselCardMetadata | undefined {
  return CAROUSEL_CARDS.get(object)
}
