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
  currentPhase: string
  phaseProgress: number
  bakuMaterial: BakuMaterialState
  envColor: THREE.Color
}

export interface Project {
  id: string
  title: string
  description: string
  textureUrl: string
  detailTextureUrl: string
  color: string
  viewPosition: { x: number; y: number; z: number }
  viewLookAt: { x: number; y: number; z: number }
  year?: string
  category?: string
  tags?: string[]
  slug?: string
}
