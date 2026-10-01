import type { Group } from 'three'
import type { LabGamepadResources } from '../World/LabGamepad'

/**
 * A Lab experiment owns only the object it adds to the shared world. It must
 * not create a renderer, environment map or an independent render loop.
 *
 * Motion contract (optional so inert experiments stay legal): an object that
 * carries authored motion exposes the same ambient/demand surface as route
 * stages — an `isAnimating` ambient signal, a `update(dt)` advanced only on
 * rendered frames, a `setReducedMotion` settle hook and a `resetMotion` for
 * clean route re-entry. SceneCoordinator calls these defensively.
 */
export interface LabExperimentObject {
  /** Visibility port mirrored by the Vue-owned scene root. */
  visible: boolean
  /** Resources supplied as props to the experiment's declarative owner. */
  readonly resources: LabGamepadResources
  bindNodes(root: Group, crankPivot: Group): void
  unbindNodes(root: Group): void
  dispose(): void
  isAnimating?: boolean
  update?(dt: number): void
  setReducedMotion?(reduced: boolean): void
  resetMotion?(): void
}

interface LabExperiment {
  id: string
  page: 'lab'
  load: () => Promise<LabExperimentObject>
}

/**
 * Accepted experiments are listed here before they can enter the shared scene.
 * The catalogue content may describe future research, but only this manifest
 * is allowed to allocate route-specific GPU resources.
 */
export const labExperiments: readonly LabExperiment[] = [
  {
    id: 'gamepad',
    page: 'lab',
    async load() {
      const { LabGamepad } = await import('../World/LabGamepad')
      return new LabGamepad()
    },
  },
]

export function getLabExperiment(page: string): LabExperiment | undefined {
  return labExperiments.find((experiment) => experiment.page === page)
}
