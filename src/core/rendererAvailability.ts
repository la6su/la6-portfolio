import { readonly, ref } from 'vue'
import { noSceneRequested } from './sceneMode'

const available = ref(typeof window === 'undefined' || !noSceneRequested)

export const rendererAvailable = readonly(available)

export function setRendererAvailable(value: boolean): void {
  available.value = value
}
