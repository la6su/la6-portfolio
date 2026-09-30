import type { Object3D } from 'three'

const KEEP_VISIBLE = new WeakSet<Object3D>()

export function keepSceneObjectVisible(object: Object3D): void {
  KEEP_VISIBLE.add(object)
}

export function isSceneObjectKeptVisible(object: Object3D): boolean {
  return KEEP_VISIBLE.has(object)
}
