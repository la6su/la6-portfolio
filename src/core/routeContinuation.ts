import type { PageId } from './routeManifest'

/** Whether an async route continuation still belongs to the active route. */
export function isCurrentRouteContinuation(
  capturedGeneration: number,
  currentGeneration: number,
  capturedPage: PageId,
  currentPage: PageId,
): boolean {
  return capturedGeneration === currentGeneration && capturedPage === currentPage
}
