// src/__tests__/blogMeta.test.ts — Phase 9, slice 4: the shared SSG content
// pipeline. Covers the closed-set invariant (the same slugs the sitemap
// consumes), the per-variant document assembly (head meta, JSON-LD, script
// tags, footer variant) and the no-3D guarantee of the blog SFC graph.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { mount } from '@vue/test-utils'

import { BLOG_ARTICLES, BLOG_INDEX_PATH, blogArticlePath } from '../core/blogPages'
import {
  BLOG_PAGE_META,
  BLOG_SITE_ORIGIN,
  assertBlogMetaClosedSet,
  blogMetaPath,
  renderBlogDocument,
  stripSsrComments,
} from '../core/blogMeta'
import { BLOG_CONTENT } from '../core/blogContent'
import BlogPage from '../app/views/blog/BlogPage.vue'

/** The closed set of page keys: the index plus every published article. */
function pageKeys(): string[] {
  return ['index', ...BLOG_ARTICLES.map((article) => article.slug)]
}

describe('blog meta closed set', () => {
  it('assertBlogMetaClosedSet accepts the canonical table', () => {
    expect(assertBlogMetaClosedSet()).toEqual([])
  })

  it('BLOG_PAGE_META covers exactly the index + every published article', () => {
    expect(Object.keys(BLOG_PAGE_META).sort()).toEqual([...pageKeys()].sort())
  })

  it('BLOG_CONTENT covers exactly the same closed set, non-empty', () => {
    expect(Object.keys(BLOG_CONTENT).sort()).toEqual([...pageKeys()].sort())
    for (const key of pageKeys()) {
      expect(BLOG_CONTENT[key]!.length).toBeGreaterThan(0)
    }
  })

  it('every article meta entry carries the article fields the head needs', () => {
    for (const article of BLOG_ARTICLES) {
      const meta = BLOG_PAGE_META[article.slug]!
      expect(meta.ogType).toBe('article')
      expect(meta.article?.publishedTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
      expect(meta.article?.section).toBeTruthy()
      expect(meta.article?.tags.length).toBeGreaterThan(0)
      expect(meta.keywords).toBeTruthy()
    }
  })
})

describe('stripSsrComments', () => {
  it('removes Vue SSR fragment + v-if markers, keeps the content', () => {
    const input =
      '<!--[--><div>a</div><!--]--><span v="x"><!--]--><!--[--></span><p><!--]--><!--[--></p>'
    expect(stripSsrComments(input)).toBe('<div>a</div><span v="x"></span><p></p>')
  })

  it('leaves real HTML comments intact', () => {
    const input = '<!-- Open Graph --><div></div>'
    expect(stripSsrComments(input)).toBe(input)
  })
})

describe('blogMetaPath', () => {
  it('maps the index to /blog and slugs to their article paths', () => {
    expect(blogMetaPath('index')).toBe(BLOG_INDEX_PATH)
    for (const article of BLOG_ARTICLES) {
      expect(blogMetaPath(article.slug)).toBe(blogArticlePath(article.slug))
    }
  })
})

describe('renderBlogDocument (article)', () => {
  const key = 'on-demand-rendering'
  const meta = BLOG_PAGE_META[key]!
  const doc = renderBlogDocument(key, meta, '<main id="main">BODY</main>')

  it('emits the standalone doctype and the exact title/canonical/og:url', () => {
    expect(doc.startsWith('<!doctype html>')).toBe(true)
    expect(doc).toContain(`<title>${meta.title}</title>`)
    expect(doc).toContain(
      `<link rel="canonical" href="${BLOG_SITE_ORIGIN}/blog/on-demand-rendering" />`,
    )
    expect(doc).toContain(
      `<meta property="og:url" content="${BLOG_SITE_ORIGIN}/blog/on-demand-rendering" />`,
    )
  })

  it('emits the Open Graph article fields from the meta table', () => {
    expect(doc).toContain('<meta property="og:type" content="article" />')
    expect(doc).toContain(
      '<meta property="article:published_time" content="2026-05-10T10:00:00Z" />',
    )
    expect(doc).toContain('<meta property="article:section" content="Process Notes" />')
    expect(doc).toContain('<meta property="article:tag" content="Performance" />')
    expect(doc).toContain('<meta property="article:tag" content="WebGPU" />')
    expect(doc).toContain('<meta property="article:tag" content="Three.js" />')
  })

  it('emits a BlogPosting JSON-LD with the canonical values', () => {
    const jsonLd = doc.match(/application\/ld\+json">([\s\S]*?)<\/script>/)![1]!
    const data = JSON.parse(jsonLd)
    expect(data['@type']).toBe('BlogPosting')
    expect(data.headline).toBe(meta.ogTitle)
    expect(data.datePublished).toBe('2026-05-10T10:00:00Z')
    expect(data.dateModified).toBe('2026-05-10T10:00:00Z')
    expect(data.articleSection).toBe('Process Notes')
    expect(data.keywords).toBe(meta.keywords)
    expect(data.mainEntityOfPage['@id']).toBe(`${BLOG_SITE_ORIGIN}/blog/on-demand-rendering`)
  })

  it('inlines the prerendered body verbatim', () => {
    expect(doc).toContain('<main id="main">BODY</main>')
  })

  it('loads Prism + the shared blog script', () => {
    expect(doc).toContain('<script defer src="/vendor/prism/prism-core.min.js"></script>')
    expect(doc).toContain('<script defer src="/vendor/prism/prism-typescript.min.js"></script>')
    expect(doc).toContain('<link rel="stylesheet" href="/vendor/prism/prism-tomorrow.css" />')
    expect(doc).toContain('<script defer src="/js/blog.js"></script>')
    expect(doc).toContain("document.getElementById('year')")
  })

  it('carries no application bundle or 3D code', () => {
    expect(doc).not.toMatch(/src="\/js\/app[-_.]/)
    expect(doc).not.toMatch(/\/assets\/.*\.js/)
    expect(doc).not.toContain('three')
    expect(doc).not.toContain('Tres')
  })
})

describe('renderBlogDocument (index)', () => {
  const doc = renderBlogDocument('index', BLOG_PAGE_META.index!, '<main>INDEX BODY</main>')

  it('emits og:website, no article fields, no Prism, the robots meta', () => {
    expect(doc).toContain('<meta property="og:type" content="website" />')
    expect(doc).not.toContain('article:published_time')
    expect(doc).not.toContain('prism')
    expect(doc).not.toContain('aria-label="Social links"')
    expect(doc).toContain('<link rel="canonical" href="https://justlovejazz.dev/blog" />')
    expect(doc).toContain(
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />',
    )
  })

  it('emits a Blog JSON-LD listing every published article (newest first)', () => {
    const jsonLd = doc.match(/application\/ld\+json">([\s\S]*?)<\/script>/)![1]!
    const data = JSON.parse(jsonLd)
    expect(data['@type']).toBe('Blog')
    expect(data.name).toBe('JUSTLOVEJAZZ Blog')
    expect(data.blogPost.length).toBe(BLOG_ARTICLES.length)
    const entries: Array<{ url: string; headline: string }> = data.blogPost
    entries.forEach((entry, i) => {
      const article = BLOG_ARTICLES[i]!
      expect(entry.url).toBe(`${BLOG_SITE_ORIGIN}${blogArticlePath(article.slug)}`)
      expect(entry.headline).toBe(BLOG_PAGE_META[article.slug]!.ogTitle)
    })
    expect(data.blogPost[0].datePublished).toBe(
      BLOG_PAGE_META[BLOG_ARTICLES[0]!.slug]!.article!.publishedTime,
    )
  })

  it('loads only the shared blog script', () => {
    const scripts = [...doc.matchAll(/<script defer src="(.*?)"><\/script>/g)].map((m) => m[1])
    expect(scripts).toEqual(['/js/blog.js'])
  })
})

describe('renderBlogDocument (meta safety)', () => {
  it('attribute-escapes meta values', () => {
    const hostile = {
      ...BLOG_PAGE_META.index!,
      title: `A "quoted" & <escaped> title`,
      description: `desc with "quotes" & ampersands`,
      ogDescription: `og with "quotes" & ampersands`,
    }
    const doc = renderBlogDocument('index', hostile, '<main></main>')
    expect(doc).toContain('<title>A &quot;quoted&quot; &amp; &lt;escaped&gt; title</title>')
    expect(doc).toContain(
      '<meta name="description" content="desc with &quot;quotes&quot; &amp; ampersands" />',
    )
    expect(doc).toContain(
      '<meta property="og:description" content="og with &quot;quotes&quot; &amp; ampersands" />',
    )
    expect(doc).not.toContain('"quotes" & ampersands"')
  })

  it('honours the site-origin override for canonical/OG/JSON-LD', () => {
    const doc = renderBlogDocument(
      'index',
      BLOG_PAGE_META.index!,
      '<main></main>',
      'https://staging.example.test',
    )
    expect(doc).toContain('<link rel="canonical" href="https://staging.example.test/blog" />')
    expect(doc).toContain('<meta property="og:url" content="https://staging.example.test/blog" />')
    expect(doc).not.toContain('justlovejazz.dev/blog"')
  })
})

describe('blog SFC graph: no 3D', () => {
  // The blog documents carry no application JS and must never pull Tres/Three
  // into a client bundle. The SFCs are the pipeline's source of truth —
  // assert their import graphs are minimal and scene-free.
  it('BlogLayout imports nothing (pure shell)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/views/blog/BlogLayout.vue'), 'utf8')
    expect(source).not.toMatch(/\bimport\b/)
    expect(source).not.toMatch(/@tresjs|three/i)
  })

  it('BlogPage imports only the local layout (no Tres/Three/scene code)', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/app/views/blog/BlogPage.vue'), 'utf8')
    const imports = [...source.matchAll(/^\s*import .*$/gm)].map((m) => m[0])
    expect(imports).toEqual([`import BlogLayout from './BlogLayout.vue'`])
    expect(source).not.toContain('@tresjs')
    expect(source).toContain('v-html="body"')
  })
})

describe('BlogPage SFC (the SSG shell)', () => {
  it('article variant: 3D nav item, social footer, body inlined into <main>', () => {
    const wrapper = mount(BlogPage, {
      props: { variant: 'article', body: '<p class="lead">EDITORIAL</p>' },
    })
    const html = wrapper.html()
    expect(html).toContain('Enter 3D →')
    expect(html).not.toContain('Enter studio')
    expect(html).toContain('aria-label="Social links"')
    expect(html).toContain('<main id="main" class="uk-section uk-section-large" role="main">')
    expect(html).toContain('<p class="lead">EDITORIAL</p>')
    expect(html).toContain('jlz-reading-progress')
  })

  it('index variant: studio nav item, no social footer, no Prism', () => {
    const wrapper = mount(BlogPage, { props: { variant: 'index', body: '<p>INDEX</p>' } })
    const html = wrapper.html()
    expect(html).toContain('Enter studio ↗')
    expect(html).not.toContain('Enter 3D')
    expect(html).not.toContain('aria-label="Social links"')
    expect(html).toContain('<p>INDEX</p>')
  })
})
