// Generate static entry documents for the SPA's known public routes.
// The client still owns interaction and scene startup; these documents give
// direct requests and non-JS crawlers the correct semantic page and metadata.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { JSDOM } from 'jsdom'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist')
const origin = (process.env.JLZ_SITE_ORIGIN ?? 'https://justlovejazz.dev')
  .trim()
  .replace(/\/+$/, '')
const startMarker = '<!--jlz-app-content-start-->'
const endMarker = '<!--jlz-app-content-end-->'

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  plugins: [vue()],
})

function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return value.replace(/[&<>"']/g, (character) => entities[character])
}

function setTagAttribute(tag, attribute, value) {
  const pattern = new RegExp('\\b' + attribute + '="[^"]*"')
  if (!pattern.test(tag)) throw new Error('HTML tag is missing ' + attribute + ': ' + tag)
  return tag.replace(pattern, attribute + '="' + escapeHtml(value) + '"')
}

function setMeta(html, selectorAttribute, selectorValue, content) {
  const matcher = new RegExp(
    '<meta\\b(?=[^>]*\\b' + selectorAttribute + '="' + selectorValue + '")[^>]*>',
  )
  const tag = html.match(matcher)?.[0]
  if (!tag) throw new Error('Static route document is missing meta ' + selectorValue)
  return html.replace(tag, setTagAttribute(tag, 'content', content))
}

function applyMetadata(document, metadata) {
  let html = document.replace(
    /<title>[\s\S]*?<\/title>/,
    '<title>' + escapeHtml(metadata.title) + '</title>',
  )
  html = setMeta(html, 'name', 'description', metadata.description)
  html = setMeta(html, 'property', 'og:title', metadata.title)
  html = setMeta(html, 'property', 'og:description', metadata.description)
  html = setMeta(html, 'property', 'og:url', origin + metadata.path)
  html = setMeta(html, 'property', 'og:type', metadata.type ?? 'website')
  html = setMeta(html, 'property', 'og:locale', metadata.lang === 'RU' ? 'ru_RU' : 'en_US')
  html = setMeta(html, 'property', 'og:image', origin + '/preview.jpg')
  html = setMeta(html, 'property', 'og:image:secure_url', origin + '/preview.jpg')
  html = setMeta(html, 'name', 'twitter:title', metadata.title)
  html = setMeta(html, 'name', 'twitter:description', metadata.description)
  html = setMeta(html, 'name', 'twitter:image', origin + '/preview.jpg')
  const canonical = html.match(/<link\b(?=[^>]*\brel="canonical")[^>]*>/)?.[0]
  if (!canonical) throw new Error('Static route document is missing canonical link')
  html = html.replace(canonical, setTagAttribute(canonical, 'href', origin + metadata.path))
  html = html.replace(/<html\b[^>]*\blang="[^"]*"/, (tag) =>
    setTagAttribute(tag, 'lang', metadata.lang === 'RU' ? 'ru' : 'en'),
  )
  const basePath = metadata.basePath ?? (metadata.path.replace(/^\/ru(?=\/|$)/, '') || '/')
  const alternates = [
    ['en', basePath],
    ['ru', basePath === '/' ? '/ru/' : '/ru' + basePath],
    ['x-default', basePath],
  ]
    .map(
      ([lang, path]) => `    <link rel="alternate" hreflang="${lang}" href="${origin}${path}" />`,
    )
    .join('\n')
  return html.replace('</head>', `${alternates}\n  </head>`)
}

function translateDocument(document, lang, dictionary) {
  const dom = new JSDOM(document)
  const root = dom.window.document
  root.documentElement.lang = lang === 'RU' ? 'ru' : 'en'
  for (const element of root.querySelectorAll('[data-i18n]')) {
    const value = dictionary[element.getAttribute('data-i18n')]
    if (value) element.textContent = value
  }
  for (const element of root.querySelectorAll('[data-i18n-placeholder]')) {
    const value = dictionary[element.getAttribute('data-i18n-placeholder')]
    if (value) element.setAttribute('placeholder', value)
  }
  for (const element of root.querySelectorAll('[data-i18n-aria-label]')) {
    const value = dictionary[element.getAttribute('data-i18n-aria-label')]
    if (value) element.setAttribute('aria-label', value)
  }
  for (const element of root.querySelectorAll('[data-i18n-title]')) {
    const value = dictionary[element.getAttribute('data-i18n-title')]
    if (value) element.setAttribute('title', value)
  }
  const output = dom.serialize().replace(/[ \t]+$/gm, '')
  dom.window.close()
  return output
}

try {
  const modules = await Promise.all([
    server.ssrLoadModule('/src/app/views/HomeView.vue'),
    server.ssrLoadModule('/src/app/views/ServicesView.vue'),
    server.ssrLoadModule('/src/app/views/WorksView.vue'),
    server.ssrLoadModule('/src/app/views/ManifestoView.vue'),
    server.ssrLoadModule('/src/app/views/LabView.vue'),
    server.ssrLoadModule('/src/app/views/ContactView.vue'),
    server.ssrLoadModule('/src/app/views/CaseStudyView.vue'),
    server.ssrLoadModule('/src/core/pageMetaData.ts'),
    server.ssrLoadModule('/src/core/i18n.ts'),
    server.ssrLoadModule('/src/Data/CaseStudies.ts'),
    server.ssrLoadModule('/src/Data/Projects.ts'),
    server.ssrLoadModule('/src/app/routes.ts'),
  ])
  const [
    home,
    services,
    works,
    manifesto,
    lab,
    contact,
    caseStudy,
    pageMeta,
    i18n,
    studies,
    projects,
    routing,
  ] = modules
  const { createSSRApp } = await import('vue')
  const { createMemoryHistory, createRouter } = await import('vue-router')
  const { renderToString } = await import('@vue/server-renderer')
  const template = readFileSync(resolve(dist, 'index.html'), 'utf8')

  if (!template.includes(startMarker) || !template.includes(endMarker)) {
    throw new Error('Built index.html is missing the prerender content markers')
  }
  const views = [
    { page: 'home', path: '/', component: home.default },
    { page: 'services', path: '/services', component: services.default },
    { page: 'works', path: '/works', component: works.default },
    { page: 'manifesto', path: '/manifesto', component: manifesto.default },
    { page: 'lab', path: '/lab', component: lab.default },
    { page: 'contact', path: '/contact', component: contact.default },
  ]

  async function renderRoute(path, component, lang) {
    i18n.setLang(lang)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routing.jlzRouteRecords(),
    })
    await router.push(path)
    await router.isReady()
    const app = createSSRApp(component)
    app.use(router)
    return renderToString(app)
  }

  async function writeRoute(path, basePath, component, metadata, relativeOutput, lang) {
    const body = await renderRoute(path, component, lang)
    const content = template.replace(
      new RegExp(startMarker + '[\\s\\S]*?' + endMarker),
      startMarker + body + endMarker,
    )
    const document = translateDocument(
      applyMetadata(content, Object.assign({}, metadata, { path, basePath, lang })),
      lang,
      i18n.TRANSLATIONS[lang],
    )
    const output = resolve(dist, relativeOutput)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, document, 'utf8')
    console.log('[prerender-routes] wrote ' + output + ' — ' + path)
  }

  for (const lang of ['EN', 'RU']) {
    for (const route of views) {
      const meta = pageMeta.PAGE_META_DATA[route.page]
      const translations = i18n.TRANSLATIONS[lang]
      const path = lang === 'RU' ? (route.path === '/' ? '/ru/' : '/ru' + route.path) : route.path
      const outputPath =
        lang === 'RU'
          ? route.path === '/'
            ? 'ru/index.html'
            : `ru${route.path}.html`
          : route.path === '/'
            ? 'index.html'
            : route.path.slice(1) + '.html'
      await writeRoute(
        path,
        route.path,
        route.component,
        {
          title: translations[meta.titleKey],
          description: translations[meta.descKey],
        },
        outputPath,
        lang,
      )
    }
  }
  // The directory index serves `/ru/`; the exact `/ru` URL also needs a
  // localized document so static hosts do not fall back to the English root.
  copyFileSync(resolve(dist, 'ru/index.html'), resolve(dist, 'ru.html'))

  for (const study of studies.CASE_STUDIES) {
    const project = projects.PROJECTS.find((item) => item.id === study.projectId)
    if (!project) throw new Error('Case study has no project record: ' + study.projectId)
    const path = '/works/' + study.projectId
    const studyData = studies.CASE_STUDY_BY_PROJECT.get(study.projectId)
    const description = studyData?.outcome ?? 'Independent creative technology studies.'
    for (const lang of ['EN', 'RU']) {
      const localized = lang === 'RU' ? '/ru' + path : path
      const outputPath = (lang === 'RU' ? 'ru/' : '') + path.slice(1) + '.html'
      const localizedDescription =
        lang === 'RU' ? (studyData?.ru?.outcome ?? description) : description
      await writeRoute(
        localized,
        path,
        caseStudy.default,
        {
          title: project.title + ' — JUSTLOVEJAZZ',
          description: localizedDescription,
          type: 'article',
        },
        outputPath,
        lang,
      )
    }
  }
} finally {
  await server.close()
}
