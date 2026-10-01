import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { sharedThreeAsset } from './build-assets'

const DIST_DIR = 'dist'
const ASSETS_DIR = join(DIST_DIR, 'assets')
const THREE_GZIP_BUDGET = 350_000
const UIKIT_GZIP_BUDGET = 56_000
const SPLASH_GZIP_BUDGET = 5_000

function gzipBytes(bytes: Uint8Array | string): number {
  // Match a typical server/CDN gzip response rather than relying on the
  // smallest possible level-9 artifact.
  return gzipSync(bytes, { level: 6 }).byteLength
}

function uniqueAsset(pattern: RegExp, label: string): string {
  const matches = readdirSync(ASSETS_DIR)
    .filter((name) => pattern.test(name))
    .map((name) => join(ASSETS_DIR, name))

  if (matches.length !== 1) {
    throw new Error(
      `Expected one ${label} asset, found ${matches.length}. Run "bun run build" first.`,
    )
  }
  return matches[0]!
}

function executableInlineScripts(html: string): string[] {
  return [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter((match) => !match[1]!.includes('application/ld+json') && !match[1]!.includes('src='))
    .map((match) => match[2]!)
}

function startupAssets(html: string): string[] {
  const paths = new Set<string>()
  const entry = html.match(/<script[^>]+type="module"[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1]
  if (!entry) throw new Error('Could not find the built shell entry in dist/index.html.')
  paths.add(join(DIST_DIR, entry.slice(1)))

  for (const match of html.matchAll(
    /<link[^>]+rel="modulepreload"[^>]+href="(\/assets\/[^"]+\.js)"/g,
  )) {
    paths.add(join(DIST_DIR, match[1]!.slice(1)))
  }
  return [...paths]
}

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path) : [path]
  })
}

function formatKb(bytes: number): string {
  return `${(bytes / 1000).toFixed(2)} kB`
}

const html = readFileSync(join(DIST_DIR, 'index.html'), 'utf8')
const threeAsset = join(ASSETS_DIR, sharedThreeAsset(readdirSync(ASSETS_DIR)))
const threeGzip = gzipBytes(readFileSync(threeAsset))
const uiAsset = uniqueAsset(/^vendor-ui-[\w-]+\.js$/, 'vendor-ui')
const uiGzip = gzipBytes(readFileSync(uiAsset))
const splashGzip =
  startupAssets(html).reduce((total, path) => total + gzipBytes(readFileSync(path)), 0) +
  executableInlineScripts(html).reduce((total, script) => total + gzipBytes(script), 0)

const mediaFiles = walkFiles(join('public', 'assets'))
const mediaBytes = mediaFiles.reduce((total, path) => total + statSync(path).size, 0)
const largestMedia = mediaFiles.reduce((largest, path) =>
  statSync(path).size > statSync(largest).size ? path : largest,
)

console.log(
  [
    `Splash startup: ${formatKb(splashGzip)} gzip / ${formatKb(SPLASH_GZIP_BUDGET)}`,
    `Lazy Three.js:  ${formatKb(threeGzip)} gzip / ${formatKb(THREE_GZIP_BUDGET)} (${basename(threeAsset)})`,
    `UIkit vendor:   ${formatKb(uiGzip)} gzip / ${formatKb(UIKIT_GZIP_BUDGET)} (${basename(uiAsset)})`,
    `Public media:   ${formatKb(mediaBytes)} total; largest ${formatKb(statSync(largestMedia).size)} (${largestMedia})`,
  ].join('\n'),
)

const failures: string[] = []
if (splashGzip > SPLASH_GZIP_BUDGET) {
  failures.push(
    `Splash startup exceeds its budget by ${formatKb(splashGzip - SPLASH_GZIP_BUDGET)}.`,
  )
}
if (threeGzip > THREE_GZIP_BUDGET) {
  failures.push(`Lazy Three.js exceeds its budget by ${formatKb(threeGzip - THREE_GZIP_BUDGET)}.`)
}
if (uiGzip > UIKIT_GZIP_BUDGET) {
  failures.push(`UIkit vendor exceeds its budget by ${formatKb(uiGzip - UIKIT_GZIP_BUDGET)}.`)
}
if (failures.length > 0) {
  throw new Error(failures.join('\n'))
}
