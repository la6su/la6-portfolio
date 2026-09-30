// scripts/prerender-home.mjs — build-time prerender of the home route.
//
// Renders `src/app/views/HomeView.vue` (the living home SFC) to static HTML
// via a throwaway Vite middleware server + `renderToString`, and writes the
// result to `prerender/home.html`. The `prerender-index` Vite plugin inlines
// that file into `index.html` at build time so the 3D app boots with DOM
// content already present (SEO, the no-scene contract, domcontentloaded
// assertions). The prerendered shell is REPLACED — not hydrated — by the Vue
// client on mount, so the source is the SFC itself (single source of truth);
// the legacy string templates (src/pages) are the deletion target.
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
  // prerender plugin and the admin plugin). Only the Vue SFC compiler is
  // needed to load and render the route SFC.
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  plugins: [vue()],
})

try {
  const mod = await server.ssrLoadModule('/src/app/views/HomeView.vue')
  const { createSSRApp } = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')
  const html = await renderToString(createSSRApp(mod.default))
  const out = resolve(root, 'prerender', 'home.html')
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, html, 'utf8')
  console.log(`[prerender-home] wrote ${out} (${html.length} chars)`)
} finally {
  await server.close()
}
