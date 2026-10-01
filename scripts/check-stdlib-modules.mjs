// Guard for the three-stdlib compatibility seam (src/three-stdlib-compat.ts).
//
// The Cientos bundle statically imports a fixed set of three-stdlib symbols
// through the barrel entry. The app must NOT ship the real barrel (its index
// pulls ~200 modules including classic-WebGL postprocessing passes that do
// not resolve against the WebGPU `three` build), so
// `src/three-stdlib-compat.ts` re-exports exactly the modules the Cientos
// bundle references.
//
// This script computes that import set from the installed
// `node_modules/@tresjs/cientos` bundle and diffs it against the shim's
// exports in both directions:
//
//   - a Cientos upgrade adding imports -> the shim is missing them (the
//     bundler would fail on the barrel alias; this reports WHAT to add);
//   - a Cientos upgrade dropping imports -> the shim carries dead re-exports
//     (dead code the bundler silently tree-shakes; this reports WHAT to drop);
//   - every shim path must exist (a renamed/removed three-stdlib module).
//
// The sibling seam `src/three-webgpu-compat.ts` is covered too: its curated
// classic-only symbols (WebGLRenderer, UniformsUtils, UniformsLib,
// ShaderChunk, WebGLCubeRenderTarget) exist ONLY because specific modules in
// the dependency graph reference them. When a dependency upgrade drops the
// last consumer of one, the stub becomes silently dead code — this reports
// exactly which stub to drop.
//
// Run: node scripts/check-stdlib-modules.mjs   (wired as `check:stdlib` —
// dependency-upgrade gate, not a unit test: it reads the real node_modules
// bundle rather than a Vitest stub).

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cientosBundle = join(root, 'node_modules/@tresjs/cientos/dist/trescientos.js')
const tresBundle = join(root, 'node_modules/@tresjs/core/dist/tres.js')
const stdlibShim = join(root, 'src/three-stdlib-compat.ts')
const webgpuCompat = join(root, 'src/three-webgpu-compat.ts')

const failures = []

const cientosSource = readFileSync(cientosBundle, 'utf8')
const shimSource = readFileSync(stdlibShim, 'utf8')

// Collect every symbol the Cientos bundle imports from the three-stdlib
// barrel (`import { A, B as C } from 'three-stdlib'`), including multiline
// import statements. Deep `three-stdlib/<module>` specifiers count too: the
// module path itself is the requirement.
const needed = new Set()
const importRe = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]three-stdlib(?:\/([^'"]*))?['"]/g
let match
while ((match = importRe.exec(cientosSource)) !== null) {
  for (const raw of match[1].split(',')) {
    const symbol = raw.trim().split(/\s+as\s+/)[0]
    if (symbol) needed.add(symbol)
  }
  if (match[2]) needed.add(`three-stdlib/${match[2]}`)
}

// The shim's contract: `export { SYMBOL } from '<relative path>'`.
const shimEntries = []
const exportRe = /export\s*\{\s*([A-Za-z0-9_$]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g
while ((match = exportRe.exec(shimSource)) !== null) {
  shimEntries.push({ symbol: match[1], from: match[2] })
}

const shimSymbols = new Set(shimEntries.map((entry) => entry.symbol))
const missing = [...needed].filter((symbol) => !shimSymbols.has(symbol)).sort()
const stale = [...shimSymbols].filter((symbol) => !needed.has(symbol)).sort()

const brokenPaths = shimEntries
  .filter((entry) => !existsSync(join(root, 'src', entry.from)))
  .map((entry) => `${entry.symbol} -> ${entry.from} (file not found)`)
  .sort()

if (missing.length > 0 || stale.length > 0 || brokenPaths.length > 0) {
  failures.push(
    [
      'three-stdlib shim drift against @tresjs/cientos:',
      missing.length > 0 ? `  missing from the shim (add): ${missing.join(', ')}` : null,
      stale.length > 0 ? `  dead in the shim (drop): ${stale.join(', ')}` : null,
      brokenPaths.length > 0 ? `  broken paths:\n    ${brokenPaths.join('\n    ')}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
    'Update src/three-stdlib-compat.ts to match the Cientos bundle.',
  )
} else {
  console.log(
    `three-stdlib shim OK: ${shimSymbols.size} re-exports cover the ${needed.size} symbols the Cientos bundle imports.`,
  )
}

// ── three-webgpu-compat curated-surface liveness ──
// The curated symbols exist only because concrete modules in the dependency
// graph reference them. Scan the real consumers: the Tres core bundle, the
// Cientos bundle, and exactly the stdlib files the stdlib shim re-exports.
const consumerSources = []
if (existsSync(tresBundle)) consumerSources.push(readFileSync(tresBundle, 'utf8'))
consumerSources.push(cientosSource)
for (const entry of shimEntries) {
  const file = join(root, 'src', entry.from)
  if (existsSync(file)) consumerSources.push(readFileSync(file, 'utf8'))
}
const consumerHaystack = consumerSources.join('\n')

const curated = [
  { symbol: 'WebGLRenderer', why: "TresJS's default classic renderer path" },
  { symbol: 'UniformsUtils', why: 'three-stdlib Water/LineMaterial uniform merges' },
  { symbol: 'UniformsLib', why: 'three-stdlib Water/LineMaterial uniform chunks' },
  { symbol: 'ShaderChunk', why: 'the Cientos SoftShadows component' },
  { symbol: 'WebGLCubeRenderTarget', why: 'the Cientos Environment components' },
]
const compatSource = readFileSync(webgpuCompat, 'utf8')
const deadCurated = curated.filter(({ symbol }) => {
  const uses = consumerHaystack.match(new RegExp(`\\b${symbol}\\b`, 'g'))?.length ?? 0
  return uses === 0
})
// A curated symbol missing from the compat file itself is a different drift:
// the compat entry must keep providing everything the graph reads.
const absentCurated = curated.filter(
  ({ symbol }) => !new RegExp(`\\b${symbol}\\b`).test(compatSource),
)

if (deadCurated.length > 0) {
  failures.push(
    [
      'three-webgpu-compat curated symbols with no consumer left:',
      ...deadCurated.map(({ symbol, why }) => `  ${symbol} (existed for ${why})`),
      'Drop the dead stubs from src/three-webgpu-compat.ts.',
    ].join('\n'),
  )
}
if (absentCurated.length > 0) {
  failures.push(
    [
      'three-webgpu-compat no longer provides curated symbols the graph may read:',
      ...absentCurated.map(({ symbol, why }) => `  ${symbol} (existed for ${why})`),
      'Restore them in src/three-webgpu-compat.ts.',
    ].join('\n'),
  )
}
if (deadCurated.length === 0 && absentCurated.length === 0) {
  console.log(
    `three-webgpu-compat OK: all ${curated.length} curated symbols are alive and provided.`,
  )
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure)
  process.exit(1)
}
