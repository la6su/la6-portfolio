// scripts/prerender-home.mjs — build-time prerender of the home route.
//
// Renders `src/app/views/HomeView.vue` (the living home SFC) to static HTML
// via a throwaway Vite middleware server + `renderToString`, and writes the
// result to `prerender/home.html`. The `prerender-index` Vite plugin inlines
// that file into `index.html` at build time so the 3D app boots with DOM
// content already present (SEO, the no-scene contract, domcontentloaded
// assertions). The prerendered shell is REPLACED — not hydrated — by the Vue
// client on mount, so the source is the SFC itself (single source of truth).
//
// Run as a prebuild step: `node scripts/prerender-home.mjs` before `vite build`.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root,
  // Isolated: do not re-load the project config (avoids re-instantiating the
  // prerender plugin). Only the Vue SFC compiler is
  // needed to load and render the route SFC.
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  plugins: [vue()],
})

try {
  const [{ default: HomeView }, { jlzRouteRecords }, { createSSRApp }, { createMemoryHistory, createRouter }] = await Promise.all([
    server.ssrLoadModule('/src/app/views/HomeView.vue'),
    server.ssrLoadModule('/src/app/routes.ts'),
    import('vue'),
    import('vue-router'),
  ])
  const { renderToString } = await import('@vue/server-renderer')
  const router = createRouter({ history: createMemoryHistory(), routes: jlzRouteRecords() })
  await router.push('/')
  await router.isReady()
  const app = createSSRApp(HomeView)
  app.use(router)
  const html = await renderToString(app)
  const out = resolve(root, 'prerender', 'home.html')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html, 'utf8')
  console.log(`[prerender-home] wrote ${out} (${html.length} chars)`)
} finally {
  await server.close()
}
