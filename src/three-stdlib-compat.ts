// Compatibility entry for the three-stdlib barrel under the Cientos runtime.
//
// The Cientos bundle imports the whole three-stdlib barrel, whose index
// re-exports ~200 modules — including classic-WebGL postprocessing passes
// (UnrealBloomPass, SSAOPass, …) whose `three` imports reference symbols the
// WebGPU build does not ship (`ShaderLib`, `WebGLCubeRenderTarget`, …). That
// barrel fails resolution-time import validation in the bundler even though
// none of those modules are used.
//
// The app mounts exactly one Cientos component (CameraControls, ADR 0005).
// This shim re-exports only the 28 three-stdlib modules the Cientos bundle
// statically references, each from its own file (relative paths into the
// package — its exports map allows only the barrel entry), so the graph stays
// tree-shakable (three-stdlib ships `sideEffects: false`) and no
// classic-only module enters the build. The two remaining classic-only reads
// (`UniformsLib`, `UniformsUtils` in Water/LineMaterial) are satisfied by the
// `three` compat entry (see src/three-webgpu-compat.ts).
//
// When adopting another Cientos component, add the modules its import needs
// here (scripts/check-stdlib-modules.mjs computes the list).

export { DRACOLoader } from '../node_modules/three-stdlib/loaders/DRACOLoader.js'
export { DecalGeometry } from '../node_modules/three-stdlib/geometries/DecalGeometry.js'
export { FBXLoader } from '../node_modules/three-stdlib/loaders/FBXLoader.js'
export { FontLoader } from '../node_modules/three-stdlib/loaders/FontLoader.js'
export { GLTFExporter } from '../node_modules/three-stdlib/exporters/GLTFExporter.js'
export { GLTFLoader } from '../node_modules/three-stdlib/loaders/GLTFLoader.js'
export { HorizontalBlurShader } from '../node_modules/three-stdlib/shaders/HorizontalBlurShader.js'
export { Line2 } from '../node_modules/three-stdlib/lines/Line2.js'
export { LineGeometry } from '../node_modules/three-stdlib/lines/LineGeometry.js'
export { LineMaterial } from '../node_modules/three-stdlib/lines/LineMaterial.js'
export { MapControls } from '../node_modules/three-stdlib/controls/OrbitControls.js'
export { MarchingCubes } from '../node_modules/three-stdlib/objects/MarchingCubes.js'
export { MeshSurfaceSampler } from '../node_modules/three-stdlib/math/MeshSurfaceSampler.js'
export { OrbitControls } from '../node_modules/three-stdlib/controls/OrbitControls.js'
export { PointerLockControls } from '../node_modules/three-stdlib/controls/PointerLockControls.js'
export { PositionalAudioHelper } from '../node_modules/three-stdlib/helpers/PositionalAudioHelper.js'
export { RGBELoader } from '../node_modules/three-stdlib/loaders/RGBELoader.js'
export { Reflector } from '../node_modules/three-stdlib/objects/Reflector.js'
export { Refractor } from '../node_modules/three-stdlib/objects/Refractor.js'
export { RoundedBoxGeometry } from '../node_modules/three-stdlib/geometries/RoundedBoxGeometry.js'
export { SVGLoader } from '../node_modules/three-stdlib/loaders/SVGLoader.js'
export { SimplexNoise } from '../node_modules/three-stdlib/math/SimplexNoise.js'
export { Sky } from '../node_modules/three-stdlib/objects/Sky.js'
export { TextGeometry } from '../node_modules/three-stdlib/geometries/TextGeometry.js'
export { TransformControls } from '../node_modules/three-stdlib/controls/TransformControls.js'
export { VerticalBlurShader } from '../node_modules/three-stdlib/shaders/VerticalBlurShader.js'
export { Water } from '../node_modules/three-stdlib/objects/Water.js'
export { toCreasedNormals } from '../node_modules/three-stdlib/utils/BufferGeometryUtils.js'
