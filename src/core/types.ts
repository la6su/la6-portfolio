import * as THREE from 'three'

export enum BakuRole {
  NORMAL = 'normal',
  GLASS = 'glass',
  WIRE = 'wire',
  GRID = 'grid',
}

export interface CameraTarget {
  position: THREE.Vector3
  lookAt: THREE.Vector3
  fov: number
}

export interface BakuMaterialState {
  role?: BakuRole
  color?: THREE.ColorRepresentation
  emissive?: THREE.ColorRepresentation
  roughness?: number
  metalness?: number
}

export interface WorldState {
  phaseProgress: number
  bakuMaterial: BakuMaterialState
}
