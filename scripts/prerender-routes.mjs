// Generate static entry documents for the SPA's known public routes.
// The client still owns interaction and scene startup; these documents give
// direct requests and non-JS crawlers the correct semantic page and metadata.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";
import vue from "@vitejs/plugin-vue";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const origin = (
  process.env.JLZ_SITE_ORIGIN ?? "https://justlovejazz.dev"
)
  .trim()
  .replace(/\/+$/, "");
const startMarker = "<!--jlz-app-content-start-->";
const endMarker = "<!--jlz-app-content-end-->";

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  plugins: [vue()],
});

function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

function setTagAttribute(tag, attribute, value) {
  const pattern = new RegExp("\\b" + attribute + '="[^"]*"');
  if (!pattern.test(tag))
    throw new Error("HTML tag is missing " + attribute + ": " + tag);
  return tag.replace(pattern, attribute + '="' + escapeHtml(value) + '"');
}

function setMeta(html, selectorAttribute, selectorValue, content) {
  const matcher = new RegExp(
    "<meta\\b(?=[^>]*\\b" +
      selectorAttribute +
      '="' +
      selectorValue +
      '")[^>]*>',
  );
  const tag = html.match(matcher)?.[0];
  if (!tag)
    throw new Error("Static route document is missing meta " + selectorValue);
  return html.replace(tag, setTagAttribute(tag, "content", content));
}

function applyMetadata(document, metadata) {
  let html = document.replace(
    /<title>[\s\S]*?<\/title>/,
    "<title>" + escapeHtml(metadata.title) + "</title>",
  );
  html = setMeta(html, "name", "description", metadata.description);
  html = setMeta(html, "property", "og:title", metadata.title);
  html = setMeta(html, "property", "og:description", metadata.description);
  html = setMeta(html, "property", "og:url", origin + metadata.path);
  html = setMeta(html, "property", "og:type", metadata.type ?? "website");
  html = setMeta(html, "property", "og:image", origin + "/preview.jpg");
  html = setMeta(
    html,
    "property",
    "og:image:secure_url",
    origin + "/preview.jpg",
  );
  html = setMeta(html, "name", "twitter:title", metadata.title);
  html = setMeta(html, "name", "twitter:description", metadata.description);
  html = setMeta(html, "name", "twitter:image", origin + "/preview.jpg");
  const canonical = html.match(/<link\b(?=[^>]*\brel="canonical")[^>]*>/)?.[0];
  if (!canonical)
    throw new Error("Static route document is missing canonical link");
  return html.replace(
    canonical,
    setTagAttribute(canonical, "href", origin + metadata.path),
  );
}

try {
  const modules = await Promise.all([
    server.ssrLoadModule("/src/app/views/ServicesView.vue"),
    server.ssrLoadModule("/src/app/views/WorksView.vue"),
    server.ssrLoadModule("/src/app/views/ManifestoView.vue"),
    server.ssrLoadModule("/src/app/views/LabView.vue"),
    server.ssrLoadModule("/src/app/views/ContactView.vue"),
    server.ssrLoadModule("/src/app/views/CaseStudyView.vue"),
    server.ssrLoadModule("/src/core/pageMetaData.ts"),
    server.ssrLoadModule("/src/core/i18n.ts"),
    server.ssrLoadModule("/src/Data/CaseStudies.ts"),
    server.ssrLoadModule("/src/Data/Projects.ts"),
    server.ssrLoadModule("/src/app/routes.ts"),
  ]);
  const [
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
  ] = modules;
  const { createSSRApp } = await import("vue");
  const { createMemoryHistory, createRouter } = await import("vue-router");
  const { renderToString } = await import("@vue/server-renderer");
  const template = readFileSync(resolve(dist, "index.html"), "utf8");

  if (!template.includes(startMarker) || !template.includes(endMarker)) {
    throw new Error(
      "Built index.html is missing the prerender content markers",
    );
  }
  const homeMetadata = pageMeta.PAGE_META_DATA.home;
  const homeDocument = applyMetadata(template, {
    title: i18n.TRANSLATIONS.EN[homeMetadata.titleKey],
    description: i18n.TRANSLATIONS.EN[homeMetadata.descKey],
    path: "/",
  });
  writeFileSync(resolve(dist, "index.html"), homeDocument, "utf8");

  const views = [
    { page: "services", path: "/services", component: services.default },
    { page: "works", path: "/works", component: works.default },
    { page: "manifesto", path: "/manifesto", component: manifesto.default },
    { page: "lab", path: "/lab", component: lab.default },
    { page: "contact", path: "/contact", component: contact.default },
  ];

  async function renderRoute(path, component) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: routing.jlzRouteRecords(),
    });
    await router.push(path);
    await router.isReady();
    const app = createSSRApp(component);
    app.use(router);
    return renderToString(app);
  }

  async function writeRoute(path, component, metadata, relativeOutput) {
    const body = await renderRoute(path, component);
    const content = template.replace(
      new RegExp(startMarker + "[\\s\\S]*?" + endMarker),
      startMarker + body + endMarker,
    );
    const document = applyMetadata(
      content,
      Object.assign({}, metadata, { path }),
    );
    const output = resolve(dist, relativeOutput);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, document, "utf8");
    console.log("[prerender-routes] wrote " + output + " — " + path);
  }

  for (const route of views) {
    const meta = pageMeta.PAGE_META_DATA[route.page];
    const translations = i18n.TRANSLATIONS.EN;
    await writeRoute(
      route.path,
      route.component,
      {
        title: translations[meta.titleKey],
        description: translations[meta.descKey],
      },
      route.path.slice(1) + ".html",
    );
  }

  for (const study of studies.CASE_STUDIES) {
    const project = projects.PROJECTS.find(
      (item) => item.id === study.projectId,
    );
    if (!project)
      throw new Error("Case study has no project record: " + study.projectId);
    const path = "/works/" + study.projectId;
    const studyData = studies.CASE_STUDY_BY_PROJECT.get(study.projectId);
    const description =
      studyData?.outcome ?? "Independent creative technology studies.";
    await writeRoute(
      path,
      caseStudy.default,
      {
        title: project.title + " — JUSTLOVEJAZZ",
        description,
        type: "article",
      },
      path.slice(1) + ".html",
    );
  }
} finally {
  await server.close();
}
