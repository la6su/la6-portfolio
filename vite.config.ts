import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { templateCompilerOptions } from '@tresjs/core'
import { resolve } from 'node:path'

import { existsSync, readFileSync } from 'fs'
import { jlzAdminPlugin } from './admin/vite-plugin'
import { publishedPages, validateBuilderDocuments } from './src/builder/documents'
import { BLOG_ARTICLES } from './src/core/blogPages'

const VUE_FEATURE_FLAGS = {
  __VUE_OPTIONS_API__: 'false',
  __VUE_PROD_DEVTOOLS__: 'false',
  __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
}

// ═══════════════════════════════════════════════════════════════════════
// TREE-SHAKING (automatic — no extra config needed)
// ═══════════════════════════════════════════════════════════════════════
// CSS: UIKit 3 components are imported individually from LESS source
//   in src/assets/_import.less — only used components emit CSS rules.
//   Unused components (label, search, tab, drop, offcanvas, etc.) are
//   commented out and produce zero CSS output.
// JS:  Vite/Rolldown tree-shakes unused ESM exports automatically.
//   UIKit 3 is an ESM package — only imported JS modules are bundled.
// ═══════════════════════════════════════════════════════════════════════

// Approved (`published: true`) Page Builder documents → static `/p/<slug>`
// and `/p/<slug>/ru`
// routes (Phase 9, slice 5). The closed set is the admin-owned collection
// (`src/builder/generated/documents.json`); the publish pipeline
// (`scripts/publish-builder-pages.mjs`) renders these into the Vite build
// inputs below and the sitemap generator consumes the same set.
const publishedBuilderSlugs = (() => {
  const collectionPath = resolve(__dirname, 'src/builder/generated/documents.json')
  if (!existsSync(collectionPath)) return [] as string[]
  const validation = validateBuilderDocuments(
    JSON.parse(readFileSync(collectionPath, 'utf8')) as unknown,
  )
  if (!validation.ok || !validation.documents)
    throw new Error(`documents.json is invalid: ${validation.errors.join('; ')}`)
  return publishedPages(validation.documents).map((document) => document.slug)
})()

export default defineConfig(() => ({
  base: '/',
  resolve: {
    // TresJS 5.9 statically imports WebGLRenderer from bare `three`. The
    // application supplies WebGPURenderer itself, so use the WebGPU entry and
    // retain only a dead-path WebGLRenderer compatibility symbol. The
    // three-stdlib entry keeps the Cientos barrel resolution to the modules
    // Cientos actually references (see src/three-stdlib-compat.ts).
    //
    // This alias is also the dev dedup seam: pre-bundled dependencies share
    // the optimizer's single three.core chunk automatically, while raw-served
    // modules importing bare `three` (the application graph and the
    // three-stdlib deep files) resolve here instead of the classic entry —
    // the only evaluated core is the optimizer's shared three/webgpu chunk
    // (see src/three-webgpu-compat.ts for the matching UniformsUtils seam).
    alias: [
      { find: /^three$/, replacement: resolve(__dirname, 'src/three-webgpu-compat.ts') },
      { find: /^three-stdlib$/, replacement: resolve(__dirname, 'src/three-stdlib-compat.ts') },
    ],
  },
  define: VUE_FEATURE_FLAGS,
  optimizeDeps: {
    rolldownOptions: {
      transform: {
        define: VUE_FEATURE_FLAGS,
      },
    },
  },
  publicDir: 'public',
  build: {
    target: 'es2023',
    outDir: 'dist',
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
    rollupOptions: {
      // Multi-page entry: index (/) → blog (/blog).
      // index.html is the seamless 3D experience with inline splash overlay.
      // three.js loads LAZY (dynamic import) — does NOT block FCP.
      // Blog documents are SSG outputs: `scripts/prerender-blog.mjs` renders
      // `BlogPage.vue` (SFC shell + `content/blog/*.html` editorial sources)
      // and writes them to the Vite build inputs — `blog.html` (the index →
      // `/blog`) and `blog/<slug>.html` (the articles → `/blog/<slug>`) — the
      // same closed set the sitemap consumes (`src/core/blogPages.ts`). The
      // generated head is the single source for SEO/Open Graph/JSON-LD
      // (`src/core/blogMeta.ts`). Vite rewrites the stylesheet URL and ships
      // the body as static HTML (no application bundle, no 3D).
      input: {
        index: resolve(__dirname, 'index.html'),
        blog: resolve(__dirname, 'blog.html'),
        ...Object.fromEntries(
          BLOG_ARTICLES.map((article) => [
            `blog/${article.slug}`,
            resolve(__dirname, `blog/${article.slug}.html`),
          ]),
        ),
        // Published builder documents (SSG output of
        // scripts/publish-builder-pages.mjs — standalone static pages, no
        // application bundle, the per-page Less rewritten by Vite).
        ...Object.fromEntries([
          ...publishedBuilderSlugs.map((slug) => [
            `p/${slug}`,
            resolve(__dirname, `p/${slug}.html`),
          ]),
          ...publishedBuilderSlugs.map((slug) => [
            `p/${slug}/ru`,
            resolve(__dirname, `p/${slug}/ru/index.html`),
          ]),
        ]),
      },
      output: {
        // ───────────────────────────────────────────────────────────────────
        // Vite 8 ships rolldown (not rollup). Rolldown's *deprecated*
        // `output.manualChunks(id)` function is internally transformed into
        // a single `codeSplitting.groups` entry whose `name(id)` callback
        // returns a chunk name per module. In rolldown 1.0.x that transform
        // does NOT reliably isolate `node_modules/three` — the manualChunks
        // function IS invoked for every three.js module and DOES return
        // `'vendor-three'` (verified by probing), but rolldown still ends
        // up re-merging the statically-imported three.js code into the
        // consuming app chunks (`chunk-core` 624 KB, `chunk-assets` 565 KB).
        //
        // The supported, non-deprecated API is `output.codeSplitting.groups`
        // with explicit `test` regexps + `priority`. Groups with higher
        // priority are matched first; matched modules are removed from
        // lower-priority groups, so vendor chunks cleanly win over the app
        // fallback. See `node_modules/rolldown/dist/shared/define-config-*.d.mts`
        // (`CodeSplittingGroup`, `CodeSplittingOptions`) for the full
        // option reference.
        //
        // ───────────────────────────────────────────────────────────────────
        codeSplitting: {
          // `includeDependenciesRecursively` defaults to true — captured
          // modules' transitive deps are pulled into the same group, which
          // keeps three.js's internal addons (ktx-parse, zstddec,
          // WorkerPool, …) inside vendor-three instead of leaking into app
          // chunks.
          groups: [
            // ── Vendor chunks (highest priority — matched first) ──────────
            // Vite injects this virtual module into the splash shell for
            // dynamic imports. Isolate it so the shell cannot inherit the
            // heavy 3D chunk that also uses the helper.
            {
              name: 'chunk-runtime',
              test: /\0vite\/preload-helper\.js$/,
              priority: 40,
            },
            {
              // Contact owns its GLTF/DRACO path and loads it only on that
              // route. Keep the loader implementations out of the shared
              // Three.js delivery without pulling their core dependencies
              // into the route chunk.
              name: 'vendor-three-contact-loaders',
              test: /[\\/]three[\\/]examples[\\/]jsm[\\/]loaders[\\/](?:GLTFLoader|DRACOLoader)\.js$/,
              includeDependenciesRecursively: false,
              priority: 35,
            },
            {
              // Contact typography is a dynamic stage. Keep its font and
              // geometry addons out of the shared Three.js delivery so
              // visiting other routes does not pay for them.
              name: 'vendor-three-contact-geometry',
              test: /[\\/]three[\\/]examples[\\/]jsm[\\/](?:geometries[\\/]TextGeometry|loaders[\\/]FontLoader)\.js$/,
              includeDependenciesRecursively: false,
              priority: 34,
            },
            {
              // ADR 0005's first Cientos adoption (Lab camera exploration):
              // the whole ecosystem surface loads ONLY when the exploration
              // policy activates on the Lab route (the async
              // LabCameraControls boundary in SceneHost). Priority above
              // vendor-three so three-stdlib — matched by both — stays in
              // this lazy group instead of the shared Three.js delivery.
              //
              // Only modules with NO eager importer may live here:
              // `@vueuse/core` looked like part of the Cientos surface but is
              // a static dependency of the eager @tresjs/core — matching it
              // here turned this chunk into an eager boot dependency (and,
              // through the misc chunk's commonJS interop for stats-gl, a
              // circular init order that crashed every page at boot).
              name: 'vendor-lab-controls',
              test(id) {
                return /[\\/]node_modules[\\/](?:@tresjs[\\/]cientos|camera-controls|three-stdlib|three-mesh-bvh|three-custom-shader-material|stats-gl)[\\/]/.test(
                  id,
                )
              },
              // False (the default is true!) — without it the group's
              // recursive dependency capture drags three.js itself (a
              // transitive dep of cientos/camera-controls) out of
              // vendor-three and duplicates the whole WebGPU build here.
              includeDependenciesRecursively: false,
              priority: 40,
            },
            {
              name: 'vendor-three',
              // Match every Three.js and three-stdlib module.
              test(id) {
                return /[\\/]node_modules[\\/](three|three-stdlib)[\\/]/.test(id)
              },
              priority: 30,
            },
            {
              name: 'vendor-ui',
              test: /[\\/]node_modules[\\/]uikit[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-misc',
              test(id) {
                return /[\\/]node_modules[\\/]/.test(id)
              },
              priority: 10,
            },
            // ── App chunks (lower priority). `name(id)` returns the chunk
            //    name based on src path, or null to fall through to
            //    rolldown's automatic chunking. Order matters — most
            //    specific paths first.
            {
              name(id) {
                if (id.includes('/src/core/Section')) return 'chunk-sections'
                if (id.includes('/src/Experience/Camera')) return 'chunk-camera'
                if (id.includes('/src/Experience/Cursor')) return 'chunk-cursor'
                if (id.includes('/src/Experience/World/')) return 'chunk-world'
                if (id.includes('/src/Experience/Renderer')) return 'chunk-renderer'
                if (id.includes('/src/core/PostProcessingManager')) return 'chunk-post'
                if (id.includes('/src/core/')) return 'chunk-core'
                if (id.includes('/src/UI/')) return 'chunk-ui'
                if (id.includes('/src/Experience/')) return 'chunk-experience'
                return null
              },
              priority: 5,
            },
          ],
        },
      },
    },
    minify: 'esbuild',
  },
  plugins: [
    vue(templateCompilerOptions),
    // /admin/ is a separate development application. The plugin owns its
    // fixed-path save/compile API and apply:'serve' keeps it out of builds.
    jlzAdminPlugin(),
    {
      // Strip @vite/client from HTML + intercept the HTTP request.
      // Through the Caddy/XTransformPort gateway, /@vite/client resolves to
      // the Next.js app (port 3000) which returns HTML instead of JS — this
      // breaks all module loading. We need to: (1) remove the script tag from
      // HTML so the browser never requests it, and (2) return a stub for
      // direct localhost access.
      name: 'block-vite-client',
      apply: 'serve',
      transformIndexHtml(html) {
        // Remove the @vite/client script tag from the HTML
        return html.replace(/<script[^>]*src="[^"]*\/@vite\/client[^"]*"[^>]*><\/script>\s*/g, '')
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url && req.url.includes('/@vite/client')) {
            res.setHeader('Content-Type', 'text/javascript')
            res.end(
              [
                '// Vite client stub — prevents reload loop through proxy',
                'export function createHotContext() {',
                '  return { accept() {}, dispose() {}, prune() {}, on() {}, off() {}, send() {}, invalidate() {}, decline() {} }',
                '}',
                'export function updateStyle() {}',
                'export function removeStyle() {}',
                'export function defineDevServer() {}',
                'export const transport = null',
              ].join('\n'),
            )
            return
          }
          next()
        })
      },
    },
    {
      // Prerender the 6 home sections into index.html at build time so the
      // 3D app boots with DOM content already present (SEO, the no-scene
      // contract, domcontentloaded e2e assertions). The source is the home
      // SFC SSR'd by `scripts/prerender-home.mjs` (single source of truth) —
      // the prerendered shell is REPLACED, not hydrated, by the Vue client on
      // mount.
      name: 'prerender-index',
      transformIndexHtml(html, ctx) {
        // Only inject into index.html (not blog).
        if (!ctx.path.endsWith('index.html')) return html
        // The prerendered shell is a build artifact: a fresh clone running the
        // documented `bun run dev` flow has no prerender/ yet. Serve the bare
        // template instead of failing every dev request — the Vue client
        // replaces the shell content on mount either way.
        const prerenderPath = resolve(__dirname, 'prerender', 'home.html')
        const prerender = existsSync(prerenderPath) ? readFileSync(prerenderPath, 'utf8') : ''
        return html.replace('<div id="app"></div>', `<div id="app">${prerender}</div>`)
      },
    },
  ],
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        rewriteUrls: 'all',
      },
    },
  },
  server: {
    // Disable HMR — when accessing through a reverse proxy (Caddy gateway),
    // the HMR WebSocket connection is unstable (proxy idle timeout ~30s).
    // When the WebSocket disconnects, Vite client triggers location.reload(),
    // causing the page to reload every ~30 seconds.
    hmr: false,
    // Allow the reverse proxy host so Vite doesn't block requests from
    // project.6la.ru (Caddy forwards to localhost:5173). Loopback hosts are
    // always allowed; this names the one public host that proxies in.
    allowedHosts: ['project.6la.ru'],
  },
}))
