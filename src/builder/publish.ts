// src/builder/publish.ts — the publish pipeline's pure core (Phase 9,
// slice 5).
//
// An approved (`published: true`) builder document becomes a standalone
// static route at `/p/<slug>`: `renderBuilderPageDocument` assembles the
// document (title/description/canonical/OG head + the SSR body + zero
// scripts), and `renderBuilderPageLess` assembles the per-page Less chain
// (the app token base + the document's own theme overrides + the document's
// own UIkit component set). `scripts/publish-builder-pages.mjs` SSR-renders
// the body through the trusted Vue registry (`BuilderPage`) and writes the
// generated artifacts; this module is the shared, unit-testable core.
//
// The Less assembly leans on Less's same-scope last-definition-wins rule:
// the document's theme variables are imported AFTER the app chain, so every
// reference in the already-emitted UIkit component CSS resolves to this
// document's values (the same mechanism the admin preview uses through
// `theme.generated.less`). The per-page file lives at
// `src/assets/builder/<slug>.less` so the compiler-emitted relative
// `../../../node_modules/...` component imports resolve correctly.
import { generateBuilderComponentLess, generateBuilderThemeLess } from './compiler'
import type { BuilderDocument } from './schema'
import type { BuilderLocale } from './localization'
import { stripSsrComments } from '../core/blogMeta'

/** The public path prefix of published builder pages. */
export const BUILDER_PAGE_PREFIX = '/p'

/** The static path of one published builder document. */
export function builderPagePath(slug: string, locale: BuilderLocale = 'EN'): string {
  return locale === 'RU' ? `${BUILDER_PAGE_PREFIX}/${slug}/ru` : `${BUILDER_PAGE_PREFIX}/${slug}`
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
 * Assemble a published builder page as a standalone HTML document: the
 * canonical head (title/description/canonical/OG/Twitter + fonts + the
 * per-page stylesheet) around the prerendered body. The body comes from
 * `renderToString` (Vue SSR) and is inlined after the SSR fragment/v-if
 * markers are stripped. The document carries no application JS at all —
 * these are static semantic pages, like the blog.
 */
export function renderBuilderPageDocument(
  document: BuilderDocument,
  body: string,
  origin: string = 'https://justlovejazz.dev',
  locale: BuilderLocale = 'EN',
): string {
  const cleanBody = stripSsrComments(body)
  const bareOrigin = origin.replace(/\/+$/, '')
  const path = builderPagePath(document.slug, locale)
  const url = `${bareOrigin}${path}`
  const englishUrl = `${bareOrigin}${builderPagePath(document.slug, 'EN')}`
  const russianUrl = `${bareOrigin}${builderPagePath(document.slug, 'RU')}`
  const title = esc(locale === 'RU' ? (document.titleRu ?? document.title) : document.title)
  const description =
    locale === 'RU'
      ? (document.descriptionRu ?? document.description ?? document.title)
      : (document.description ?? document.title)
  const htmlLang = locale === 'RU' ? 'ru' : 'en'
  const ogLocale = locale === 'RU' ? 'ru_RU' : 'en_US'

  const head = [
    '    <meta charset="UTF-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
    '    <meta name="theme-color" content="#050507" />',
    '    <meta name="color-scheme" content="dark light" />',
    '    <meta name="author" content="JUSTLOVEJAZZ" />',
    `    <meta name="description" content="${esc(description)}" />`,
    '',
    `    <title>${title} | JUSTLOVEJAZZ</title>`,
    '',
    '    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '    <link rel="apple-touch-icon" href="/logo.svg" />',
    '    <link rel="mask-icon" href="/logo.svg" color="#232534" />',
    '    <link rel="manifest" href="/site.webmanifest" />',
    `    <link rel="canonical" href="${esc(url)}" />`,
    `    <link rel="alternate" hreflang="en" href="${esc(englishUrl)}" />`,
    `    <link rel="alternate" hreflang="ru" href="${esc(russianUrl)}" />`,
    `    <link rel="alternate" hreflang="x-default" href="${esc(englishUrl)}" />`,
    '',
    '    <!-- Open Graph -->',
    '    <meta property="og:type" content="website" />',
    '    <meta property="og:site_name" content="JUSTLOVEJAZZ" />',
    `    <meta property="og:locale" content="${ogLocale}" />`,
    `    <meta property="og:title" content="${title}" />`,
    `    <meta property="og:description" content="${esc(description)}" />`,
    `    <meta property="og:url" content="${esc(url)}" />`,
    '    <meta property="og:image" content="https://justlovejazz.dev/preview.jpg" />',
    '    <meta property="og:image:secure_url" content="https://justlovejazz.dev/preview.jpg" />',
    '    <meta property="og:image:type" content="image/jpeg" />',
    '    <meta property="og:image:width" content="1200" />',
    '    <meta property="og:image:height" content="630" />',
    `    <meta property="og:image:alt" content="${title} preview" />`,
    '',
    '    <!-- Twitter Card -->',
    '    <meta name="twitter:card" content="summary_large_image" />',
    '    <meta name="twitter:site" content="@justlovejazz" />',
    '    <meta name="twitter:creator" content="@justlovejazz" />',
    `    <meta name="twitter:title" content="${title}" />`,
    `    <meta name="twitter:description" content="${esc(description)}" />`,
    '    <meta name="twitter:image" content="https://justlovejazz.dev/preview.jpg" />',
    `    <meta name="twitter:image:alt" content="${title} preview" />`,
    '',
    '    <link rel="preload" href="/fonts/commissioner-variable.ttf" as="font" type="font/ttf" crossorigin />',
    '    <link rel="stylesheet" href="/fonts/commissioner.css" />',
    `    <link rel="stylesheet" href="/src/assets/builder/${esc(document.slug)}.less" />`,
  ]

  return [
    '<!doctype html>',
    `<html lang="${htmlLang}">`,
    '  <head>',
    ...head,
    '  </head>',
    '  <body>',
    `    <main id="main" class="jlz-builder-page" role="main">`,
    cleanBody,
    '    </main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}

/**
 * Assemble the per-page Less chain of one published document. The file is
 * written to `src/assets/builder/<slug>.less` by the pipeline:
 *
 *   1. the app token/UIkit chain (`_import.less`) — defines the `@jlz-*`
 *      defaults, the `:root` CSS custom properties and the baseline UIkit
 *      components;
 *   2. this document's theme overrides (last in the same scope — Less
 *      resolves every `@jlz-*` reference to these values);
 *   3. this document's UIkit component set (the delta beyond the app
 *      baseline; relative imports resolve from `src/assets/builder/`).
 */
export function renderBuilderPageLess(document: BuilderDocument): string {
  return [
    `// Generated by scripts/publish-builder-pages.mjs for document "${document.slug}".`,
    `// Do not edit by hand — the source of truth is the builder document`,
    `// in src/builder/generated/documents.json.`,
    `@import '../_import.less';`,
    generateBuilderThemeLess(document),
    generateBuilderComponentLess(document),
    '',
  ].join('\n')
}
