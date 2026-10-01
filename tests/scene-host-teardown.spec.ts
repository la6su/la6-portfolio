import { expect, test } from "@playwright/test";

test.skip(
  process.env.JLZ_HOST_TEARDOWN_TEST !== "1",
  "Lifecycle trace hooks are available only in the dedicated Vite dev teardown run.",
);

test("SceneHost releases declared owners before disposing its renderer", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.__jlzTestLifecycleTrace = [];
  });
  await page.goto("/contact");
  await expect(page.locator("#jlz-splash-enter")).toHaveClass(/is-ready/, {
    timeout: 60_000,
  });
  for (const stage of [
    "ContactTypographyStage",
    "ContactCyprusStage",
    "ContactHaloStage",
  ]) {
    await expect
      .poll(
        () =>
          page.evaluate((label) =>
            (window.__jlzTestLifecycleTrace ?? []).includes(
              `scene-stage:${label}:ready`,
            ),
          stage),
        { timeout: 20_000 },
      )
      .toBe(true);
  }
  await page.waitForFunction(
    () => typeof window.__jlzTestUnmountVueApp === "function",
  );

  await page.evaluate(() => window.__jlzEmit?.("jlz:showreel-open"));
  await expect(page.locator("#jlz-showreel-console")).toHaveAttribute(
    "data-state",
    "open",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window.__jlzTestLifecycleTrace ?? []).includes(
          "scene-owner:showreel-quad-bound",
        ),
      ),
    )
    .toBe(true);

  // Runtime teardown may be requested by both an application owner and the
  // Vue host during shutdown. It must stay idempotent while stage detach is
  // still pending.
  await page.evaluate(() => {
    const destroy = window.__jlzRuntimeDestroy;
    if (!destroy) throw new Error("Runtime destroy hook is missing.");
    return Promise.all([destroy(), destroy()]);
  });
  await expect(page.locator("#cinematic-nav")).toHaveCount(1);
  await page.evaluate(() => window.__jlzTestUnmountVueApp?.());
  await expect(page.locator("#jlz-fs-overlay")).toHaveCount(0);
  await expect(page.locator("#jlz-showreel-console")).toHaveCount(0);
  await expect(page.locator("#jlz-route-transition")).toHaveCount(0);
  await expect(page.locator("#cinematic-nav")).toHaveCount(0);

  const anchorWasIntercepted = await page.evaluate(() => {
    const anchor = document.createElement("a");
    anchor.href = "/works";
    document.body.append(anchor);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    let interceptedByApp = false;
    const preventNavigation = (event: MouseEvent) => {
      interceptedByApp = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", preventNavigation, true);
    anchor.dispatchEvent(click);
    document.removeEventListener("click", preventNavigation, true);
    anchor.remove();
    window.__jlzEmit?.("jlz:navigate", { path: "/works" });
    return interceptedByApp;
  });
  expect(anchorWasIntercepted).toBe(false);
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 700 })
    .toBe("/contact");

  const trace = await page.evaluate(() => window.__jlzTestLifecycleTrace ?? []);
  const backendDispose = trace.lastIndexOf("renderer:backend-disposed");
  const rendererDispose = trace.indexOf("scene-host:renderer-disposed");
  const asyncSceneTeardown = trace.indexOf(
    "experience:async-scene-teardown-complete",
  );
  const showreelDispose = trace.indexOf(
    "scene-owner:showreel-media-disposed",
  );
  expect(backendDispose).toBeGreaterThanOrEqual(0);
  expect(rendererDispose).toBeGreaterThanOrEqual(0);
  expect(asyncSceneTeardown).toBeGreaterThanOrEqual(0);
  expect(showreelDispose).toBeGreaterThanOrEqual(0);
  expect(
    trace.filter((event) => event === "scene-host:renderer-disposed"),
  ).toHaveLength(1);
  for (const ownerRelease of [
    "scene-owner:env-sphere-disposed",
    "scene-owner:env-sky-disposed",
    "scene-owner:cursor-placeholder-disposed",
    "scene-owner:showreel-quad-unbound",
  ]) {
    const releaseIndex = trace.indexOf(ownerRelease);
    expect(
      releaseIndex,
      `${ownerRelease} should run during host teardown`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      releaseIndex,
      `${ownerRelease} should precede backend disposal`,
    ).toBeLessThan(backendDispose);
    expect(trace.filter((event) => event === ownerRelease)).toHaveLength(1);
  }
  expect(backendDispose).toBeLessThan(rendererDispose);
  expect(showreelDispose).toBeLessThan(backendDispose);
  expect(asyncSceneTeardown).toBeLessThan(rendererDispose);
  for (const stage of [
    "ContactTypographyStage",
    "ContactCyprusStage",
    "ContactHaloStage",
  ]) {
    const released = trace.indexOf(`scene-stage:${stage}:released`);
    expect(released, `${stage} should finish disposal`).toBeGreaterThanOrEqual(0);
    expect(released, `${stage} should release before backend disposal`).toBeLessThan(
      backendDispose,
    );
  }
  expect(pageErrors).toEqual([]);
});
