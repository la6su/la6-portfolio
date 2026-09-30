// tsl-helpers.ts — Typed boundary for the TSL API surface this project uses.
//
// three 0.185 ships near-complete TSL types, so production code consumes
// pass()/bloom()/swizzles without blind `as any` widening. The two residual
// gaps in the shipped types — component swizzle getters like `.x` (the
// runtime Proxy exposes them but the declarations do not) and smoothstep()
// with scalar low/high over a vec2 operand (the declarations only carry
// matching-shape overloads) — are bridged here with ONE narrow adapter each
// instead of scattering casts through the graph code.
//
// Both adapters are runtime-identical to the forms they replace:
// `split(node, components)` materializes exactly the node the `.x` getter
// would, and WGSL compiles scalar smoothstep edges per-component.

import { bloom as _bloom } from 'three/addons/tsl/display/BloomNode.js'
import { pass as _pass, split as _split, smoothstep as _smoothstep } from 'three/tsl'
import type BloomNode from 'three/addons/tsl/display/BloomNode.js'
import type { Camera, Scene } from 'three'
import type { Node, PassNode, UniformNode } from 'three/webgpu'

/** Scene pass node for post-processing (fully typed since three 0.185). */
export function tslPass(scene: Scene, camera: Camera): PassNode {
  return _pass(scene, camera)
}

/** Typed bloom() wrapper. The live graph feeds a vec3 scene color while the
 *  shipped declaration narrows the input to vec4 — the boundary keeps the
 *  honest input type instead of forcing every caller to cast. */
export function tslBloom(
  color: Node,
  strength: UniformNode<'float', number>,
  radius: UniformNode<'float', number>,
  threshold: UniformNode<'float', number>,
): BloomNode {
  return (
    _bloom as (
      color: Node,
      strength: UniformNode<'float', number>,
      radius: UniformNode<'float', number>,
      threshold: UniformNode<'float', number>,
    ) => BloomNode
  )(color, strength, radius, threshold)
}

/** Component swizzle returning a single float channel (`.x`, `.y`, …) — the
 *  typed call form of the runtime Proxy getter. */
export function tslFloat(node: Node, components: 'x' | 'y' | 'z' | 'w'): Node<'float'> {
  return _split(node, components) as Node<'float'>
}

/** Multi-component swizzle returning a vec3 (`.xyz`, `.yzx`, …). */
export function tslVec3(node: Node, components: string): Node<'vec3'> {
  return _split(node, components) as Node<'vec3'>
}

/** smoothstep(low, high, x) with scalar edges over a vec2 operand — the
 *  per-component form the WebGL2 composite mirrors. The shipped declarations
 *  only carry matching-shape overloads, so the boundary owns the one
 *  function-shape widening. */
export function tslSmoothstepPerComponent(
  low: number,
  high: number,
  x: Node<'vec2'>,
): Node<'vec2'> {
  return (_smoothstep as unknown as (low: number, high: number, x: Node<'vec2'>) => Node<'vec2'>)(
    low,
    high,
    x,
  )
}
