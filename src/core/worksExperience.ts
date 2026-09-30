/** Authored exhibition order shared by semantic Vue routes and the scene. */
export const WORKS_ROOMS = [
  { projectIndex: 0, signal: 0x79c0ff, rotation: -0.35 },
  { projectIndex: 1, signal: 0xe3bd7c, rotation: 0.4 },
  { projectIndex: 2, signal: 0x929bff, rotation: 1.1 },
  { projectIndex: 3, signal: 0x6dd5bc, rotation: 1.8 },
] as const

// Vue owns route intent. A view releases only its own publication: its
// unmount may follow the setup of the next route sharing the Works stage.
let caseProject: number | null = null
let publication = 0
export function setWorksCaseProject(index: number | null): () => void {
  caseProject = index
  const ownPublication = ++publication
  return () => {
    if (publication === ownPublication) {
      caseProject = null
      publication += 1
    }
  }
}
export function getWorksCaseProject(): number | null {
  return caseProject
}
