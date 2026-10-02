// Per-page head metadata for the static blog pages and the pure document
// renderer that wraps the prerendered body into a standalone HTML document.
//
// The blog pages are standalone semantic documents (no 3D app shell, no
// hydration). This module is the single source for everything that lives in
// their `<head>` (title, description, Open Graph, Twitter Card, JSON-LD) and
// for the document wrapper itself (doctype, head, body, the per-variant
// script tags). The `scripts/prerender-blog.mjs` build step renders the SFC
// shell + content through `renderToString` and passes the result to
// `renderBlogDocument`; the generated files become the Vite build inputs, so
// Vite only rewrites the stylesheet URL — the body markup ships byte-for-byte.
//
// Pure by design — no DOM, no window — unit-testable without a browser.

import { BLOG_ARTICLES, BLOG_INDEX_PATH, blogArticlePath } from './blogPages'
import { SITE_ORIGIN } from './siteConfig'

/** The site origin used for canonical/OG URLs (override for staging). */
export const BLOG_SITE_ORIGIN = SITE_ORIGIN

const SITE_NAME = 'JUSTLOVEJAZZ'
const OG_IMAGE = `${BLOG_SITE_ORIGIN}/preview.jpg`
const TWITTER_HANDLE = '@justlovejazz'

/** The structured fields of one blog page's head. */
interface BlogPageMetaBase {
  /** `<title>` content. */
  title: string
  /** `<meta name="description">` content. */
  description: string
  /** Index-only robots directives or article-only keywords. */
  robots?: string
  keywords?: string
  /** og:title / twitter:title content. */
  ogTitle: string
  /** og:description content. */
  ogDescription: string
  /** twitter:description content (falls back to ogDescription). */
  twitterDescription?: string
  /** og:image:alt / twitter:image:alt content. */
  imageAlt: string
}

interface BlogIndexMeta extends BlogPageMetaBase {
  ogType: 'website'
  robots: string
}

interface BlogArticleMeta extends BlogPageMetaBase {
  ogType: 'article'
  keywords: string
  article: { section: string; tags: string[] }
}

type BlogArticleSlug = (typeof BLOG_ARTICLES)[number]['slug']
type BlogPageKey = 'index' | BlogArticleSlug

/** Metadata for the index and every article in the canonical blog list. */
export const BLOG_PAGE_META: { index: BlogIndexMeta } & Record<BlogArticleSlug, BlogArticleMeta> = {
  index: {
    title: 'Blog — Case Studies & Process Notes | JUSTLOVEJAZZ',
    description:
      'JUSTLOVEJAZZ blog — case studies and process notes on WebGPU, TSL shaders, interactive 3D, and studio workflow. Real engineering stories from the studio.',
    robots: 'index, follow, max-image-preview:large, max-snippet:-1',
    ogType: 'website',
    ogTitle: 'JUSTLOVEJAZZ Blog — Case Studies & Process Notes',
    ogDescription:
      'Case studies and process notes on WebGPU, TSL shaders, interactive 3D, and studio workflow.',
    imageAlt: 'JUSTLOVEJAZZ blog preview',
  },
  'undercurrent-webgpu-fluid': {
    title: 'Undercurrent — WebGPU Fluid Simulation | JUSTLOVEJAZZ Blog',
    description:
      'Case study: Undercurrent — a WebGPU fluid simulation portfolio. How we built a real-time GPU fluid solver using TSL node graphs, with performance budget at 60fps on mid-range hardware.',
    ogType: 'article',
    ogTitle: 'Undercurrent — WebGPU Fluid Simulation',
    ogDescription:
      'Case study: how we built a real-time GPU fluid solver using TSL node graphs, with performance budget at 60fps.',
    twitterDescription:
      'Case study: how we built a real-time GPU fluid solver using TSL node graphs.',
    imageAlt: 'Undercurrent — WebGPU fluid simulation preview',
    keywords: 'WebGPU, TSL, fluid simulation, Three.js, case study, shader art',
    article: {
      section: 'Case Studies',
      tags: ['WebGPU', 'TSL', 'Fluid Simulation'],
    },
  },
  'glassmorphism-webgpu': {
    title: 'Glassmorphism on WebGPU | JUSTLOVEJAZZ Blog',
    description:
      'Case study: Glassmorphism on WebGPU — building a real glass material with transmission, clearcoat, and iridescence across Three.js WebGPU and WebGL2 backends.',
    ogType: 'article',
    ogTitle: 'Glassmorphism on WebGPU',
    ogDescription:
      'Building a real glass material with transmission, clearcoat, and iridescence across WebGPU and WebGL2.',
    twitterDescription:
      'Building a real glass material with transmission, clearcoat, and iridescence.',
    imageAlt: 'Glassmorphism on WebGPU preview',
    keywords: 'glassmorphism, WebGPU, MeshPhysicalMaterial, Three.js, iridescence, case study',
    article: {
      section: 'Case Studies',
      tags: ['Glassmorphism', 'WebGPU', 'Three.js'],
    },
  },
  'on-demand-rendering': {
    title: 'On-Demand Rendering — Zero Idle Draw Calls | JUSTLOVEJAZZ Blog',
    description:
      'Process note: On-demand rendering — how we cut idle GPU draw calls to zero by gating renderer.update() behind a _needsRender flag, with ambient breathing as the only exception.',
    ogType: 'article',
    ogTitle: 'On-Demand Rendering — Zero Idle Draw Calls',
    ogDescription:
      'How we cut idle GPU draw calls to zero by gating renderer.update() behind a _needsRender flag.',
    twitterDescription: 'How we cut idle GPU draw calls to zero by gating renderer.update().',
    imageAlt: 'On-demand rendering preview',
    keywords: 'on-demand rendering, GPU performance, Three.js, WebGPU, process note',
    article: {
      section: 'Process Notes',
      tags: ['Performance', 'WebGPU', 'Three.js'],
    },
  },
  'tsl-changes-everything': {
    title: 'Why TSL Changes Everything | JUSTLOVEJAZZ Blog',
    description:
      'Process note: Why TSL changes everything — TypeScript-safe shader programming, cross-backend compilation (WebGPU + WebGL2), and the end of raw GLSL string concatenation.',
    ogType: 'article',
    ogTitle: 'Why TSL Changes Everything',
    ogDescription:
      'TypeScript-safe shader programming, cross-backend compilation, and the end of raw GLSL string concatenation.',
    twitterDescription: 'TypeScript-safe shader programming, cross-backend compilation.',
    imageAlt: 'TSL preview',
    keywords: 'TSL, Three.js, WebGPU, shaders, TypeScript, process note',
    article: {
      section: 'Process Notes',
      tags: ['TSL', 'WebGPU', 'Shaders'],
    },
  },
}

/** The static path of a page key (`index` → the list page). */
export function blogMetaPath(key: BlogPageKey): string {
  return key === 'index' ? BLOG_INDEX_PATH : blogArticlePath(key)
}

/** Escape a value for use inside a double-quoted HTML attribute. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Remove the comment markers Vue's SSR emits around fragments (`<!--[-->` /
 * `<!--]-->`) and for inactive `v-if` branches (`<!---->`). The blog body is
 * trusted editorial markup with no HTML comments of its own (the `content/blog`
 * sources are comment-free), so stripping exactly these three tokens yields
 * clean static HTML that matches the hand-maintained documents byte-for-byte
 * in structure.
 */
export function stripSsrComments(html: string): string {
  return html.replace(/<!--\[-->|<!--\]-->|<!---->/g, '')
}

const metaTag = (name: string, content: string): string =>
  `    <meta name="${esc(name)}" content="${esc(content)}" />`

const propertyTag = (property: string, content: string): string =>
  `    <meta property="${esc(property)}" content="${esc(content)}" />`

/** The JSON-LD payload of one page (Blog for the index, BlogPosting per post). */
function jsonLd(
  key: BlogPageKey,
  meta: BlogIndexMeta | BlogArticleMeta,
  origin: string,
): Record<string, unknown> {
  const url = `${origin}${blogMetaPath(key)}`
  if (meta.ogType === 'article') {
    const publishedTime = BLOG_ARTICLES.find((article) => article.slug === key)!.publishedTime
    return {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: meta.ogTitle,
      description: meta.ogDescription,
      image: OG_IMAGE,
      datePublished: publishedTime,
      dateModified: publishedTime,
      author: { '@type': 'Organization', name: SITE_NAME, url: `${origin}/` },
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        logo: { '@type': 'ImageObject', url: `${origin}/logo.svg` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      keywords: meta.keywords,
      articleSection: meta.article.section,
    }
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${SITE_NAME} Blog`,
    url,
    description: meta.ogDescription,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${origin}/logo.svg` },
    },
    blogPost: BLOG_ARTICLES.map((article) => {
      const articleMeta = BLOG_PAGE_META[article.slug]
      return {
        '@type': 'BlogPosting',
        headline: articleMeta.ogTitle,
        url: `${origin}${blogArticlePath(article.slug)}`,
        datePublished: article.publishedTime,
      articleSection: articleMeta.article.section,
      }
    }),
  }
}

/**
 * Assemble a standalone blog HTML document: the generated `<head>` (from the
 * meta table) + the prerendered SSG body + the per-variant script tags.
 * The body is first-party editorial markup and is inlined raw (the SFC layer
 * is the trusted source); every meta value is attribute-escaped.
 */
export function renderBlogDocument(
  key: BlogPageKey,
  meta: BlogIndexMeta | BlogArticleMeta,
  body: string,
  origin: string = BLOG_SITE_ORIGIN,
): string {
  // The body comes from `renderToString` (Vue SSR) — strip the fragment/v-if
  // comment markers so the emitted document is clean static HTML.
  body = stripSsrComments(body)
  const path = blogMetaPath(key)
  const url = `${origin}${path}`
  const head: string[] = [
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
    '    <meta name="theme-color" content="#050507" />',
    '    <meta name="color-scheme" content="dark light" />',
    '    <meta name="author" content="JUSTLOVEJAZZ" />',
    metaTag('description', meta.description),
  ]
  if (meta.robots) head.push(metaTag('robots', meta.robots))
  if (meta.keywords) head.push(metaTag('keywords', meta.keywords))
  head.push(
    '',
    `    <title>${esc(meta.title)}</title>`,
    '',
    '    <link rel="icon" type="image/svg+xml" href="/logo.svg" />',
    '    <link rel="apple-touch-icon" href="/logo.svg" />',
    '    <link rel="mask-icon" href="/logo.svg" color="#232534" />',
    '    <link rel="manifest" href="/site.webmanifest" />',
    `    <link rel="canonical" href="${esc(url)}" />`,
    '',
    '    <!-- Open Graph -->',
    propertyTag('og:type', meta.ogType),
    propertyTag('og:site_name', SITE_NAME),
    propertyTag('og:locale', 'en_US'),
    propertyTag('og:title', meta.ogTitle),
    propertyTag('og:description', meta.ogDescription),
    propertyTag('og:url', url),
    propertyTag('og:image', OG_IMAGE),
    propertyTag('og:image:secure_url', OG_IMAGE),
    propertyTag('og:image:type', 'image/jpeg'),
    propertyTag('og:image:width', '1200'),
    propertyTag('og:image:height', '630'),
    propertyTag('og:image:alt', meta.imageAlt),
  )
  if (meta.ogType === 'article') {
    head.push(
      propertyTag(
        'article:published_time',
        BLOG_ARTICLES.find((article) => article.slug === key)!.publishedTime,
      ),
      propertyTag('article:author', SITE_NAME),
      propertyTag('article:section', meta.article.section),
      ...meta.article.tags.map((tag) => propertyTag('article:tag', tag)),
    )
  }
  head.push(
    '',
    '    <!-- Twitter Card -->',
    metaTag('twitter:card', 'summary_large_image'),
    metaTag('twitter:site', TWITTER_HANDLE),
    metaTag('twitter:creator', TWITTER_HANDLE),
    metaTag('twitter:title', meta.ogTitle),
    metaTag('twitter:description', meta.twitterDescription ?? meta.ogDescription),
    metaTag('twitter:image', OG_IMAGE),
    metaTag('twitter:image:alt', meta.imageAlt),
    '',
    '    <link rel="preload" href="/fonts/commissioner-variable.woff2" as="font" type="font/woff2" crossorigin />',
    '    <link rel="stylesheet" href="/fonts/commissioner.css" />',
    '    <link rel="stylesheet" href="/src/assets/blog.less" />',
    ...(meta.ogType === 'article'
      ? ['    <link rel="stylesheet" href="/vendor/prism/prism-tomorrow.css" />']
      : []),
    '',
    '    <script type="application/ld+json">',
    `${JSON.stringify(jsonLd(key, meta, origin), null, 2).replace(/^/gm, '      ')}`,
    '    </script>',
  )

  const scripts =
    meta.ogType === 'article'
      ? [
          '    <script>',
          "      document.getElementById('year').textContent = String(new Date().getFullYear())",
          '    </script>',
          '    <script defer src="/vendor/prism/prism-core.min.js"></script>',
          '    <script defer src="/vendor/prism/prism-clike.min.js"></script>',
          '    <script defer src="/vendor/prism/prism-javascript.min.js"></script>',
          '    <script defer src="/vendor/prism/prism-typescript.min.js"></script>',
          '    <script defer src="/vendor/prism/prism-glsl.min.js"></script>',
          '    <script defer src="/vendor/prism/prism-css.min.js"></script>',
          '    <script defer src="/js/blog.js"></script>',
        ]
      : ['    <script defer src="/js/blog.js"></script>']

  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    ...head,
    '  </head>',
    '  <body>',
    body,
    ...scripts,
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}
