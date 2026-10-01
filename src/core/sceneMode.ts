export const noSceneRequested =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('no-scene')
