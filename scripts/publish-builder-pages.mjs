// scripts/publish-builder-pages.mjs — build-time publish of approved Page
// Builder documents (Phase 9, slice 5).
//
// An approved (`published: true`) builder document becomes static EN and RU
// routes at `/p/<slug>` and `/p/<slug>/ru`:
//
//   1. the document's nodes are SSR-rendered through the trusted Vue element
//      registry (`BuilderPage` + `elements.ts` — the same registry the admin
//      preview uses, per docs/PAGE_BUILDER.md) with a throwaway Vite
//      middleware server;
//   2. `renderBuilderPageDocument` (`src/builder/publish.ts`) wraps the body
//      into a standalone HTML document (canonical head: title / description /
//      canonical / Open Graph / Twitter — zero application scripts);
//   3. `renderBuilderPageLess` assembles the per-page Less chain (the app
//      token/UIkit base + this document's own theme overrides + this
//      document's own UIkit component set) so the page is themed by the
//      document itself, not by whatever the admin last saved.
//
// The generated artifacts are written over the Vite build inputs —
// `p/<slug>.html` and `p/<slug>/ru/index.html` at the project root — and the per-page Less to
// `src/assets/builder/<slug>.less`, so Vite rewrites the stylesheet URL and
// ships the body markup as static output at `/p/<slug>`. Stale artifacts of
// no-longer-published documents are removed. The pipeline is deterministic:
// the committed files are the committed build output, and the source of
// truth is `src/builder/generated/documents.json` (the admin-owned
// collection) plus the render/assembly modules.
//
// The legacy string renderer (`renderBuilderDocument`) is NOT used here —
// it remains for proven static output of existing artifacts, per
// docs/PAGE_BUILDER.md; the public graph renders through the registry.
//
// No 3D is loaded anywhere in this pipeline: the throwaway server loads
// only the Vue SFC compiler (no Tres/Three in the graph), and the generated
// documents carry no application bundle.
//
// Run as a prebuild step: `node scripts/publish-builder-pages.mjs` before
// `vite build` (the sitemap generator runs after this step and reads the
// same published set).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const server = await createServer({
  root,
  // Isolated: do not re-load the project config (avoids re-instantiating the
  // prerender and admin plugins). Only the Vue SFC compiler is needed.
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  plugins: [vue()],
})

try {
  const { BuilderPage } = await server.ssrLoadModule('/src/builder/vue/BuilderPage.ts')
  const { validateBuilderDocuments, publishedPages } = await server.ssrLoadModule(
    '/src/builder/documents.ts',
  )
  const { renderBuilderPageDocument, renderBuilderPageLess } =
    await server.ssrLoadModule('/src/builder/publish.ts')
  const { createSSRApp, h } = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')

  const collectionPath = resolve(root, 'src', 'builder', 'generated', 'documents.json')
  if (!existsSync(collectionPath)) {
    console.log('[publish-builder-pages] no documents.json — nothing to publish')
  } else {
    const validation = validateBuilderDocuments(JSON.parse(readFileSync(collectionPath, 'utf8')))
    if (!validation.ok) {
      throw new Error(`documents.json is invalid: ${validation.errors.join('; ')}`)
    }
    const published = publishedPages(validation.documents)

    // ── Clean stale artifacts (unpublished / removed documents) ───────────
    const outDir = resolve(root, 'p')
    const lessDir = resolve(root, 'src', 'assets', 'builder')
    const publishedSlugs = new Set(published.map((document) => document.slug))
    const expectedRootFiles = new Set([...publishedSlugs].map((slug) => `${slug}.html`))

    if (existsSync(outDir)) {
      for (const entry of readdirSync(outDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.html') && !expectedRootFiles.has(entry.name)) {
          rmSync(resolve(outDir, entry.name))
          console.log(`[publish-builder-pages] removed stale ${entry.name}`)
        } else if (entry.isDirectory() && !publishedSlugs.has(entry.name)) {
          rmSync(resolve(outDir, entry.name), { recursive: true, force: true })
          console.log(`[publish-builder-pages] removed stale ${entry.name}/`)
        }
      }
    }
    if (existsSync(lessDir)) {
      for (const file of readdirSync(lessDir)) {
        // Only per-page artifacts are pipeline-owned; the admin's shared
        // theme/components artifacts stay untouched.
        if (
          file.endsWith('.less') &&
          file !== 'theme.generated.less' &&
          file !== 'components.generated.less' &&
          !publishedSlugs.has(file.replace(/\.less$/, ''))
        ) {
          rmSync(resolve(lessDir, file))
          console.log(`[publish-builder-pages] removed stale ${file}`)
        }
      }
    }

    // ── Render + write each approved document ─────────────────────────────
    mkdirSync(outDir, { recursive: true })
    const writtenLess = []
    for (const document of published) {
      const bodyHtml = await renderToString(
        createSSRApp(h(BuilderPage, { document, editable: false })),
      )
      const html = renderBuilderPageDocument(document, bodyHtml, undefined, 'EN')
      writeFileSync(resolve(outDir, `${document.slug}.html`), html, 'utf8')
      const ruBodyHtml = await renderToString(
        createSSRApp(h(BuilderPage, { document, editable: false, locale: 'RU' })),
      )
      const ruHtml = renderBuilderPageDocument(document, ruBodyHtml, undefined, 'RU')
      const ruDir = resolve(outDir, document.slug, 'ru')
      mkdirSync(ruDir, { recursive: true })
      writeFileSync(resolve(ruDir, 'index.html'), ruHtml, 'utf8')
      const lessPath = resolve(lessDir, `${document.slug}.less`)
      writeFileSync(lessPath, renderBuilderPageLess(document), 'utf8')
      writtenLess.push(lessPath)
      console.log(
        `[publish-builder-pages] wrote EN/RU ${document.slug} (${html.length}/${ruHtml.length} chars)`,
      )
    }

    // The generated documents are committed build output (the Vite build
    // inputs), so run them through the repo formatter to keep the tree
    // format-clean without a manual pass. The per-page .less artifacts are
    // pipeline-owned too (regenerated on every build) and must be formatted
    // here as well — otherwise every build rewrites them unformatted and
    // `format:check` fails until a manual pass. The admin's shared
    // theme/components generated artifacts are intentionally not touched.
    execFileSync(
      'bunx',
      ['prettier', '--write', 'p', ...writtenLess.map((file) => relative(root, file))],
      { cwd: root, stdio: 'inherit' },
    )
  }
} finally {
  await server.close()
}
