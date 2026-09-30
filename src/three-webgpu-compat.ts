// Compatibility entry for the current TresJS runtime.
//
// The application always supplies its own WebGPURenderer factory. TresJS 5.9
// still imports WebGLRenderer for its default renderer path and an instanceof
// guard, so keep that symbol available without retaining Three's classic
// renderer module in the production graph.
export * from 'three/webgpu'

/** Unreachable when SceneHost supplies its renderer factory. */
export class WebGLRenderer {
  constructor() {
    throw new Error('The classic WebGLRenderer path is not supported')
  }
}

// Classic-shader surface the three-stdlib deep modules (via the Cientos
// barrel shim) still import from `three`:
//
// - UniformsUtils is the REAL implementation, taken from three's src tree —
//   NOT from a physical build/three.core.js import. The WebGPU build does not
//   re-export UniformsUtils (a classic-shader helper), and a physical build
//   import evaluates the entire classic core a second time: production
//   rolldown merges it with the WebGPU graph's copy (same absolute module),
//   but the dev server serves it as a distinct URL — a second evaluated core,
//   "THREE.WARNING: Multiple instances of Three.js being imported." at dev
//   boot. The src-tree file is a relative-import leaf (ColorManagement,
//   utils) that evaluates nothing else; production tree-shakes it to the same
//   pure functions at a ~1 KB cost. Invariant: no application-graph module may
//   import a three build entry directly.
// - UniformsLib (fog/lights/common uniform chunks) exists only in the
//   classic renderer split. The two stdlib modules that read it (Water,
//   LineMaterial) merge it into shader uniforms at module evaluation; the
//   for...in merge treats the missing entries as empty and neither module is
//   instantiated in this app, so an empty library is eval-safe without
//   pulling the classic renderer into the graph.
export { UniformsUtils } from 'three/src/renderers/shaders/UniformsUtils.js'

// Two more classic-only symbols the Cientos bundle imports for components
// this app does not mount (eval-safe stubs, same reasoning as UniformsLib):
//
// - ShaderChunk — a mutable chunk registry; the Cientos SoftShadows component
//   patches `shadowmap_pars_fragment` while mounted. The empty record matches
//   the real shape; evaluation-time reads yield undefined and that component
//   is never mounted here.
// - WebGLCubeRenderTarget — constructed lazily by the Environment components'
//   computeds; a dead-path constructor keeps the unreachable instantiation
//   loud instead of silently misbehaving.
export const ShaderChunk = {}

export class WebGLCubeRenderTarget {
  constructor() {
    throw new Error('WebGLCubeRenderTarget requires the classic WebGL renderer path')
  }
}

export const UniformsLib = {}
