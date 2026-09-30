// scripts/prerender-blog.mjs — build-time SSG of the static blog pages
// (Phase 9, slice 4).
//
// Renders each blog page (the index + every published article) through the
// shared SSG content pipeline: `BlogPage.vue` (the SFC shell + first-party
// editorial body) is SSR-rendered with a throwaway Vite middleware server,
// then `renderBlogDocument` (`src/core/blogMeta.ts`) wraps the body into a
// standalone HTML document (the generated `<head>`: title / description /
// Open Graph / Twitter / JSON-LD + the per-variant script tags). The result
// is written over the Vite build inputs — `blog.html` (the index) and
// `blog/<slug>.html` (the articles) at the project root — so Vite rewrites
// the `/src/assets/blog.less` stylesheet URL and ships the body markup as
// static output at `/blog` and `/blog/<slug>`. The pipeline is deterministic
// (fixed meta table, fixed content sources): the committed files are the
// committed build output, and the sources of truth are `content/blog/*.html`,
// `src/core/blogMeta.ts` and the SFCs under `src/app/views/blog/`.
//
// No 3D is loaded anywhere in this pipeline: the throwaway server loads only
// the Vue SFC compiler (no Tres/Three in the graph), and the generated
// documents carry no application bundle.
//
// Run as a prebuild step: `node scripts/prerender-blog.mjs` before `vite build`.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
  const { default: BlogPage } = await server.ssrLoadModule('/src/app/views/blog/BlogPage.vue')
  const { BLOG_CONTENT } = await server.ssrLoadModule('/src/core/blogContent.ts')
  const { BLOG_PAGE_META, renderBlogDocument, assertBlogMetaClosedSet } =
    await server.ssrLoadModule('/src/core/blogMeta.ts')
  const { BLOG_ARTICLES, blogArticlePath } = await server.ssrLoadModule('/src/core/blogPages.ts')
  const { createSSRApp, h } = await import('vue')
  const { renderToString } = await import('@vue/server-renderer')

  const metaErrors = assertBlogMetaClosedSet()
  if (metaErrors.length > 0) throw new Error(`blog meta closed-set: ${metaErrors.join('; ')}`)

  // The closed set: the index plus every published article — same slugs the
  // sitemap consumes. Missing content or meta fails the build.
  const pages = [
    { key: 'index', variant: 'index' },
    ...BLOG_ARTICLES.map((article) => ({ key: article.slug, variant: 'article' })),
  ]

  const outDir = resolve(root, 'blog')
  mkdirSync(outDir, { recursive: true })

  for (const page of pages) {
    const meta = BLOG_PAGE_META[page.key]
    if (!meta) throw new Error(`BLOG_PAGE_META is missing "${page.key}"`)
    const body = BLOG_CONTENT[page.key]
    if (!body || body.length === 0) throw new Error(`blog content is missing for "${page.key}"`)

    const bodyHtml = await renderToString(
      createSSRApp(h(BlogPage, { variant: page.variant, body })),
    )
    const document = renderBlogDocument(page.key, meta, bodyHtml)

    // The index lives at the root (`blog.html` → `/blog`); articles live under
    // `blog/<slug>.html` → `/blog/<slug>`. These paths are the Vite build
    // inputs, so the emitted files keep the same layout in `dist/`.
    const out =
      page.variant === 'index' ? resolve(root, 'blog.html') : resolve(outDir, `${page.key}.html`)
    writeFileSync(out, document, 'utf8')
    console.log(
      `[prerender-blog] wrote ${out} (${document.length} chars) — ${
        page.variant === 'index' ? '/blog' : blogArticlePath(page.key)
      }`,
    )
  }

  // The generated documents are committed build output (the Vite build
  // inputs), so run them through the repo formatter to keep the tree
  // format-clean without a manual pass.
  execFileSync('bunx', ['prettier', '--write', 'blog.html', 'blog'], {
    cwd: root,
    stdio: 'inherit',
  })
} finally {
  await server.close()
}
