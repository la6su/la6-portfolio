import { expect, test } from "@playwright/test";

const projectTextures = [
  "/assets/projects/ebb-vibes/cover-studio-v2.jpg",
  "/assets/projects/mono-sunday/cover-studio-v2.jpg",
  "/assets/projects/till-at-night/cover-studio-v2.jpg",
  "/assets/projects/nocturne-blue/cover-studio-v2.jpg",
];

test("public SPA routes render on direct entry with route metadata", async ({
  page,
}) => {
  const routes = [
    ["/", "home"],
    ["/services", "services"],
    ["/works", "works"],
    ["/manifesto", "manifesto"],
    ["/lab", "lab"],
    ["/contact", "contact"],
    ["/works/porsche-911-spider", "case-study"],
    ["/works/pro193", "case-study"],
  ] as const;

  for (const [path, view] of routes) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator(`[data-page-view="${view}"]`)).toHaveCount(1);
    if (path === "/") {
      await expect(page.locator('[data-page-view="home"] h1')).toHaveCount(1);
      const fontPath = "/fonts/commissioner-variable.woff2";
      const fontResponse = await page.request.get(fontPath);
      expect(fontResponse.headers()["content-type"]).toContain("font/woff2");
      expect(
        await page.evaluate(async () => {
          const faces = await document.fonts.load(
            "600 16px Commissioner",
            "Portfolio",
          );
          return faces.some((face) => face.status === "loaded");
        }),
      ).toBe(true);
    }
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute(
      "content",
      "",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    );
    if (path === "/works/pro193") {
      const detailPath = "/assets/projects/nocturne-blue/detail.jpg";
      const image = page.locator(".jlz-case-media img");
      await expect(image).toHaveAttribute("src", detailPath);
      const response = await page.request.get(detailPath);
      expect(response.headers()["content-type"]).toContain("image/jpeg");
      const decodedWidth = await page.evaluate(async (src) => {
        const probe = new Image();
        probe.src = src;
        await probe.decode();
        return probe.naturalWidth;
      }, detailPath);
      expect(decodedWidth).toBe(1344);
    }
  }
});

test("language toggle updates translated content and document metadata", async ({
  page,
}) => {
  await page.goto("/services", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-page-view="services"]')).toHaveCount(1);
  await page.waitForFunction(() =>
    Boolean(
      (window as Window & { __jlzRouterReady?: boolean }).__jlzRouterReady,
    ),
  );

  const toggle = page.locator("#cfg-lang");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const englishTitle = await page.title();
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  await expect(page.locator(".jlz-lang-value")).toContainText("RU");
  await expect(page).not.toHaveTitle(englishTitle);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute(
    "content",
    "",
  );

  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(englishTitle);
});

test("unknown direct path falls back to home and browser history restores routes", async ({
  page,
}) => {
  await page.goto("/this-route-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator('[data-page-view="home"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/this-route-does-not-exist$/);

  await page.goto("/services", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-page-view="services"]')).toHaveCount(1);
  await page
    .locator(".jlz-topbar__brand")
    .evaluate((element: HTMLAnchorElement) => element.click());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-page-view="home"]')).toHaveCount(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.locator('[data-page-view="services"]')).toHaveCount(1);
});

test("direct section hashes activate the matching story slot after runtime readiness", async ({
  page,
}) => {
  await page.goto("/manifesto#section-manifesto-clarity", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });

  const enter = page.locator("#jlz-splash-enter");
  await expect(enter).toHaveClass(/is-ready/, { timeout: 60_000 });
  await expect(page.locator("#jlz-splash-status")).toHaveText("READY");
  const targetSection = page.locator('[data-page-section="manifesto-clarity"]');
  await expect(targetSection).toHaveClass(/section-active/);
  await expect(
    page.locator('#cinematic-nav [data-story-index="2"]'),
  ).toHaveAttribute("aria-current", "step");

  await enter.click();
  await page.evaluate(() => {
    const runtime = window as Window & {
      __jlzEmit?: (event: string, detail?: unknown) => void;
    };
    runtime.__jlzEmit?.("jlz:navigate", {
      path: "/services#section-services-motionRealtime",
    });
  });
  await expect(page).toHaveURL(/\/services#section-services-motionRealtime$/);
  await expect(
    page.locator('[data-page-section="services-motionRealtime"]'),
  ).toHaveClass(/section-active/);
  await expect(
    page.locator('#cinematic-nav [data-story-index="3"]'),
  ).toHaveAttribute("aria-current", "step");
});

test("home text reveal waits for splash dismissal", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-section="intro"]')).toHaveClass(
    /section-active/,
  );
  const title = page
    .locator('[data-page-view="home"] .studio-title:not([data-blur-fade="off"])')
    .first();
  const enter = page.locator("#jlz-splash-enter");

  await expect(enter).toHaveClass(/is-ready/, { timeout: 60_000 });
  await expect(title).not.toHaveAttribute("data-visible", "true");

  await enter.click();
  await expect(title).toHaveAttribute("data-visible", "true");
});

test("DOM-only mode keeps semantic route navigation available without a canvas", async ({
  page,
}) => {
  await page.goto("/?no-scene", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".jlz-route-fallback")).toBeVisible();
  await expect(page.locator("#jlz-showreel-trigger")).toHaveCount(0);
  await expect(page.locator(".jlz-scene-host")).toHaveCount(0);
  await expect(page.locator(".jlz-route-fallback__nav a")).toHaveCount(7);

  const enter = page.locator("#jlz-splash-enter");
  await expect(enter).toHaveClass(/is-ready/, { timeout: 20_000 });
  await enter.click();
  await expect(page.locator("#jlz-app-loader")).toHaveCount(0, {
    timeout: 2_000,
  });
  await page
    .getByRole("navigation", { name: "Portfolio routes" })
    .getByRole("link", { name: /02 Services/ })
    .click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.locator('[data-page-view="services"]')).toHaveCount(1);
  await expect(page.locator("#app canvas")).toHaveCount(0);
  await page.goto("/works?no-scene", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-page-view="works"]')).toHaveCount(1);
  await expect(page.locator(".jlz-works-actions button")).toHaveCount(0);
  await expect(page.locator(".jlz-works-aperture")).toHaveCount(0);
  await page.goto("/works/pro193?no-scene", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-page-view="case-study"]')).toHaveCount(1);
  await expect(page.locator(".jlz-works-aperture")).toHaveCount(0);
  await expect(page.locator(".jlz-case-copy button")).toHaveCount(0);
  await page.goto("/contact?no-scene", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-page-view="contact"]')).toHaveCount(1);
  await expect(page.locator('[uk-icon*="telegram"] svg')).toHaveCount(1);
});

test("blog routes publish valid static documents", async ({
  page,
}) => {
  const paths = [
    "/blog",
    "/blog/undercurrent-webgpu-fluid",
    "/blog/glassmorphism-webgpu",
    "/blog/on-demand-rendering",
    "/blog/tsl-changes-everything",
  ];

  for (const path of paths) {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} should be published`).toBe(200);
    await expect(page.locator("html")).toHaveAttribute(
      "lang",
      path.includes("/ru/") ? "ru" : "en",
    );
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    );
    if (path === "/blog") {
      const response = await page.request.get(
        "/fonts/commissioner-variable.woff2",
      );
      expect(response.headers()["content-type"]).toContain("font/woff2");
      expect(
        await page.evaluate(async () => {
          const faces = await document.fonts.load(
            "600 16px Commissioner",
            "Портфолио",
          );
          return faces.some((face) => face.status === "loaded");
        }),
      ).toBe(true);
    }

  }
});

test("blog article links point to published blog routes", async ({
  page,
  request,
}) => {
  const articles = [
    "/blog/undercurrent-webgpu-fluid",
    "/blog/glassmorphism-webgpu",
    "/blog/on-demand-rendering",
    "/blog/tsl-changes-everything",
  ];
  const linkedPaths = new Set<string>(["/blog"]);

  for (const article of articles) {
    await page.goto(article, { waitUntil: "domcontentloaded" });
    const links = await page
      .locator('a[href^="/blog"]')
      .evaluateAll((anchors) =>
        anchors.map(
          (anchor) => new URL((anchor as HTMLAnchorElement).href).pathname,
        ),
      );
    links.forEach((path) => linkedPaths.add(path));
  }

  for (const path of linkedPaths) {
    const response = await request.get(path);
    expect(response.status(), `${path} should resolve`).toBe(200);
  }
});

test("Works lazy scene survives repeated route mount and release cycles", async ({
  page,
}) => {
  const errors: string[] = [];
  const textureResponses = new Map<string, number>();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (projectTextures.includes(path))
      textureResponses.set(path, response.status());
  });

  await page.goto("/works", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });
  await expect(page.locator('[data-page-view="works"]')).toHaveCount(1);
  await page.waitForFunction((paths) => {
    const resources = performance.getEntriesByType("resource");
    return paths.every((path) =>
      resources.some((resource) => new URL(resource.name).pathname === path),
    );
  }, projectTextures);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page
      .locator(".jlz-topbar__brand")
      .evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForFunction(() => location.pathname === "/");
    await expect(page.locator('[data-page-view="home"]')).toHaveCount(1);

    await page
      .locator(".jlz-works-entrance")
      .evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForFunction(() => location.pathname === "/works");
    await expect(page.locator('[data-page-view="works"]')).toHaveCount(1);
    await expect(page.locator("#app canvas")).toHaveCount(1);
  }

  expect(Object.fromEntries(textureResponses)).toEqual(
    Object.fromEntries(projectTextures.map((path) => [path, 200])),
  );
  expect(errors).toEqual([]);
});

test("Contact scene survives repeated route mount and release cycles", async ({
  page,
}) => {
  const errors: string[] = [];
  const dracoAssets = new Set<string>();
  let cyprusAssetStatus: number | undefined;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/assets/gltf/cyprus_3d.glb") {
      cyprusAssetStatus = response.status();
    }
  });
  page.on("requestfinished", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/assets/draco_")) dracoAssets.add(path);
  });

  await page.goto("/contact", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });
  await expect(page.locator('[data-page-view="contact"]')).toHaveCount(1);
  await page.waitForFunction(() =>
    performance
      .getEntriesByType("resource")
      .some(
        (resource) =>
          new URL(resource.name).pathname === "/assets/gltf/cyprus_3d.glb",
      ),
  );

  expect(cyprusAssetStatus).toBe(200);
  await page.waitForFunction(() => {
    const resources = performance.getEntriesByType("resource");
    return resources.filter((resource) =>
      new URL(resource.name).pathname.startsWith("/assets/draco_"),
    ).length >= 2;
  });
  expect(dracoAssets.size).toBe(2);
  expect([...dracoAssets].filter((path) => path.endsWith(".wasm"))).toHaveLength(1);
  expect([...dracoAssets].filter((path) => path.endsWith(".js"))).toHaveLength(1);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    await page
      .locator(".jlz-topbar__brand")
      .evaluate((element: HTMLAnchorElement) => element.click());
    await page.waitForFunction(() => location.pathname === "/");
    await page.goBack();
    await page.waitForFunction(() => location.pathname === "/contact");
    await expect(page.locator('[data-page-view="contact"]')).toHaveCount(1);
    await expect(page.locator("#app canvas")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("Lab route mounts its lazy 3D experiment without browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/lab", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });
  await expect(page.locator('[data-page-view="lab"]')).toHaveCount(1);
  await page.waitForFunction(() => {
    const canvas = document.querySelector("canvas");
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
  });

  expect(errors).toEqual([]);
});

test("Showreel lazily mounts its TresPortal scene and closes cleanly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });
  const trigger = page.locator("#jlz-showreel-trigger");
  await trigger.evaluate((element: HTMLButtonElement) => element.click());
  const consolePanel = page.locator("#jlz-showreel-console");
  await expect(consolePanel).toHaveAttribute("data-state", "open");
  const video = page.locator('video[aria-hidden="true"]');
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth))
    .toBe(1920);
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await expect(consolePanel).toHaveAttribute("data-state", "closed");
  await trigger.evaluate((element: HTMLButtonElement) => element.click());
  await expect(consolePanel).toHaveAttribute("data-state", "open");
  await page.keyboard.press("Escape");
  await expect(consolePanel).toHaveAttribute("data-state", "closed");
  expect(errors).toEqual([]);
});

test("navigation sheet moves focus in and restores it after Escape", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });

  const launcher = page.locator("#jlz-menu-launcher");
  await launcher.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("body")).toHaveAttribute(
    "data-cinematic-sheet",
    "menu",
  );
  const close = page.getByRole("button", { name: "Close navigation" });
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-cinematic-sheet",
    "menu",
  );
  await expect(launcher).toBeFocused();
});

test("Vue story rail reflects and requests the active story slot", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });
  const enter = page.locator("#jlz-splash-enter");
  await expect(enter).toHaveClass(/is-ready/, { timeout: 60_000 });
  await enter.click();

  const rail = page.getByRole("navigation", { name: "Narrative sections" });
  await expect(rail.locator("[data-story-index]")).toHaveCount(4);
  const activeSection = rail.locator('[data-story-index="1"]');
  await expect(activeSection).toHaveAttribute("aria-current", "step");

  const nextSection = rail.locator('[data-story-index="3"]');
  await nextSection.click();
  await expect(nextSection).toHaveAttribute("aria-current", "step");
  await expect(nextSection).toHaveClass(/is-active/);
});

test("fullscreen project overlay traps and restores keyboard focus", async ({
  page,
}) => {
  await page.goto("/works", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });

  const trigger = page.getByRole("button", { name: "View material" }).first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: "Fullscreen project viewer",
  });
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close" });
  await expect(close).toBeFocused();

  await page.locator(".jlz-fs-next").focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("reduced-motion preference reaches the shell and cinematic controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const runtime = window as Window & {
      __jlzHost?: object;
      __jlzRouterReady?: boolean;
    };
    return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
  });

  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  const enter = page.locator("#jlz-splash-enter");
  await expect(enter).toHaveClass(/is-ready/, { timeout: 20_000 });
  await enter.click();
  await expect(page.locator("#jlz-app-loader")).toHaveCount(0, {
    timeout: 2_000,
  });
  await expect
    .poll(() =>
      page
        .locator(".jlz-storyline")
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toMatch(/^(0s|0ms)$/);

  await page.goto("/lab", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-page-view="lab"]')).toHaveCount(1);
  const canvas = page.locator("#app canvas");
  await expect
    .poll(() =>
      canvas.evaluate((element) => getComputedStyle(element).pointerEvents),
    )
    .toBe("none");
  const hasFinePointer = await page.evaluate(
    () => window.matchMedia("(pointer: fine)").matches,
  );

  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(false);
  await expect
    .poll(() =>
      canvas.evaluate((element) => getComputedStyle(element).pointerEvents),
    )
    .toBe(hasFinePointer ? "auto" : "none");
});

test("key routes avoid horizontal overflow at mobile and desktop widths", async ({
  page,
}) => {
  const routes = [
    "/",
    "/services",
    "/works",
    "/contact",
    "/blog",
  ];
  const viewports = [
    { width: 390, height: 844 },
    { width: 1280, height: 900 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const path of routes) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      if (path.startsWith("/blog")) {
        await expect(page.locator("h1").first()).toBeVisible();
      } else {
        const view = path === "/" ? "home" : path.slice(1);
        await expect(page.locator(`[data-page-view="${view}"]`)).toHaveCount(1);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${path} overflows at ${viewport.width}px`).toBe(false);
    }
  }
});

test("coarse-pointer touch scroll stays on the semantic route", async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "This real touch injection uses the Chromium DevTools Protocol.",
  );
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForFunction(() => {
      const runtime = window as Window & {
        __jlzHost?: object;
        __jlzRouterReady?: boolean;
      };
      return Boolean(runtime.__jlzHost && runtime.__jlzRouterReady);
    });
    const enter = page.locator("#jlz-splash-enter");
    await expect(enter).toHaveClass(/is-ready/, { timeout: 20_000 });
    await enter.click();
    await expect(page.locator("#jlz-app-loader")).toHaveCount(0, {
      timeout: 2_000,
    });
    expect(
      await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    const canvas = page.locator("#app canvas");
    await expect(canvas).toHaveAttribute("aria-hidden", "true");
    await expect
      .poll(() =>
        canvas.evaluate((element) => getComputedStyle(element).pointerEvents),
      )
      .toBe("none");
    await expect
      .poll(() =>
        page
          .locator("#spa-content")
          .evaluate((element) => getComputedStyle(element).touchAction),
      )
      .toContain("pan-y");

    const session = await context.newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 195, y: 700, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: 195, y: 220, id: 1 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() =>
        page.locator("#spa-content").evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

test("Renderer initialization failure reaches the accessible boot error state", async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.JLZ_RENDERER_INIT_FAILURE_CHROME !== "1" ||
      testInfo.project.name !== "chromium",
    "Run with JLZ_RENDERER_INIT_FAILURE_CHROME=1 to disable both browser GPU APIs.",
  );

  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".jlz-boot-gate")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#jlz-splash-enter")).toHaveCount(0);
  await expect(page.locator(".jlz-boot-gate")).toHaveAttribute("role", "alert");
  await page.getByRole("button", { name: "Continue without 3D" }).click();
  await expect(page.locator("#jlz-app-loader")).toHaveCount(0, {
    timeout: 2_000,
  });
  await expect(page.locator('[data-page-view="home"]')).toHaveCount(1);
  await expect(page.locator('[data-page-view="home"]')).toBeFocused();
  await expect(page.locator("#jlz-showreel-trigger")).toHaveCount(0);
  await expect(page.locator(".jlz-route-fallback")).toBeVisible();
  await expect(page.locator(".jlz-route-fallback__nav a")).toHaveCount(7);
  await page
    .getByRole("navigation", { name: "Portfolio routes" })
    .getByRole("link", { name: /02 Services/ })
    .click();
  await expect(page).toHaveURL(/\/services$/);
  await expect(page.locator('[data-page-view="services"]')).toHaveCount(1);
  await page
    .getByRole("navigation", { name: "Portfolio routes" })
    .getByRole("link", { name: /03 Works/ })
    .click();
  await expect(page).toHaveURL(/\/works$/);
  await expect(page.locator(".jlz-works-actions button")).toHaveCount(0);
  await expect(page.locator(".jlz-works-aperture")).toHaveCount(0);
  // Three attempts its WebGL fallback in this fixture with both backends
  // disabled. The app catches the renderer failure and keeps route navigation
  // available.
  expect(pageErrors).toHaveLength(1);
  expect(pageErrors[0]).toContain("getSupportedExtensions");
});

test("Renderer recovers from WebGL context loss on the persistent canvas", async ({
  page,
}, testInfo) => {
  const recoveryEnabled =
    testInfo.project.name === "chromium"
      ? process.env.JLZ_WEBGL_RECOVERY_CHROME === "1"
      : testInfo.project.name === "firefox" &&
        process.env.JLZ_WEBGL_RECOVERY_FIREFOX === "1";
  test.skip(
    !recoveryEnabled,
    "Opt in with the browser-specific JLZ_WEBGL_RECOVERY_* flag.",
  );

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    // The induced loss is expected to make Three report its WebGL device lost.
    if (
      message.type() === "error" &&
      !message.text().startsWith("[Renderer] WebGPU device lost") &&
      !message.text().startsWith(
        "THREE.THREE.WebGPURenderer: WebGL Device Lost:",
      )
    ) {
      errors.push(message.text());
    }
  });

  await page.goto("/?force-webgl-backend", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const probe = (window as Window & { __jlzHost?: JlzHostProbe }).__jlzHost;
    return Boolean(
      probe && probe.mode === "webgl" && probe.backend === "WebGLBackend",
    );
  });
  await expect(page.locator("#jlz-splash-status")).toHaveText("READY", {
    timeout: 20_000,
  });
  await page.locator("#app canvas").evaluate(async (canvas) => {
    const gl = canvas.getContext("webgl2");
    const extension = gl?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("WEBGL_lose_context is unavailable.");
    canvas.dataset.recoveryCanvas = "persistent";
    const contextLost = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("WebGL context loss timed out.")),
        5_000,
      );
      canvas.addEventListener(
        "webglcontextlost",
        (event) => {
          event.preventDefault();
          window.clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
    extension.loseContext();
    await contextLost;
    extension.restoreContext();
  });

  const recovered = await page
    .waitForFunction(
      () =>
        (window as Window & { __jlzHost?: JlzHostProbe }).__jlzHost
          ?.recovered === true,
      undefined,
      { timeout: 15_000 },
    )
    .then(
      () => true,
      () => false,
    );
  if (!recovered) {
    const failure = await page
      .locator(".renderer-unsupported")
      .innerText()
      .catch(() => "no failure UI");
    throw new Error(
      `Renderer did not recover. Failure UI: ${failure}. Browser errors: ${errors.join(" | ")}`,
    );
  }
  await expect(page.locator("#app canvas")).toHaveCount(1);
  await expect(page.locator("#app canvas")).toHaveAttribute(
    "data-recovery-canvas",
    "persistent",
  );
  expect(errors).toEqual([]);
});
