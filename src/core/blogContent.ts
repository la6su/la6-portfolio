// Static blog content registry.
//
// One entry per static blog page (the index plus every published article):
// the page key maps to the first-party editorial `<main>` source. The HTML
// files under `content/blog/` are loaded with Vite's `?raw` suffix so the
// markup stays a verbatim string (no template-compilation of editorial
// copy, no escaping round-trips). This registry is the single source the
// SSG pipeline renders through `BlogPage.vue`; the closed set matches
// `BLOG_ARTICLES` (the same slugs the sitemap consumes) — a new article is
// a `content/blog/<slug>.html` file + a `BLOG_ARTICLES` entry + a
// `BLOG_PAGE_META` entry.
import index from '../../content/blog/index.html?raw'
import undercurrent from '../../content/blog/undercurrent-webgpu-fluid.html?raw'
import glassmorphism from '../../content/blog/glassmorphism-webgpu.html?raw'
import onDemand from '../../content/blog/on-demand-rendering.html?raw'
import tsl from '../../content/blog/tsl-changes-everything.html?raw'
import indexRu from '../../content/blog/ru/index.html?raw'
import undercurrentRu from '../../content/blog/ru/undercurrent-webgpu-fluid.html?raw'
import glassmorphismRu from '../../content/blog/ru/glassmorphism-webgpu.html?raw'
import onDemandRu from '../../content/blog/ru/on-demand-rendering.html?raw'
import tslRu from '../../content/blog/ru/tsl-changes-everything.html?raw'

/** The `<main>` inner HTML of each static blog page, keyed by page key. */
export const BLOG_CONTENT: Record<string, string> = {
  index,
  'undercurrent-webgpu-fluid': undercurrent,
  'glassmorphism-webgpu': glassmorphism,
  'on-demand-rendering': onDemand,
  'tsl-changes-everything': tsl,
}

/** Fully localized editorial source, keyed identically to the EN registry. */
export const BLOG_CONTENT_RU: Record<string, string> = {
  index: indexRu,
  'undercurrent-webgpu-fluid': undercurrentRu,
  'glassmorphism-webgpu': glassmorphismRu,
  'on-demand-rendering': onDemandRu,
  'tsl-changes-everything': tslRu,
}
