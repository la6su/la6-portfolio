# Refactor plan — la6-portfolio

This is the repository's only work queue. Keep it current and actionable:
update phase status and evidence when work changes; do not append session logs.
Removed project documents are not requirements and must not be reconstructed.

## Objective and architecture

Deliver a production-ready EN/RU portfolio based on Vue 3, TresJS, Three.js
WebGPU and TSL, with a working WebGL 2 fallback and usable semantic content
when no renderer can start. Use
[three-vue-tres](https://github.com/hawk86104/three-vue-tres) as the reference
for declarative Vue/Tres scene composition and focused behavior components.
Adopt its relevant patterns, not its unrelated editor, plugin, or publishing
systems.

Keep the architecture small and legible. Vue owns application and scene
hierarchy; Tres owns component and renderer integration; Three owns rendering
primitives and GPU APIs; Cientos owns its controls/helpers. Project code owns
only product-specific behavior: story-to-world mapping, scene transitions,
render-demand policy, TSL effects, backend recovery, and async resource
lifecycle. Every persistent DOM/GPU resource has one owner and a visible
cleanup path. Prefer library behavior when it supplies the same contract;
preserve custom policy only when code or measurements prove the difference.

## Agent workflow

1. Read `AGENTS.md`, this plan, `package.json`, and affected sources before a
   structural change. Trace runtime, build, generated-content, and test callers
   before deleting anything.
2. Work in vertical slices: name the ownership change, make the smallest
   complete source change, run relevant gates, update this plan, and commit it.
3. Prefer Vue/Tres declarations for stable nodes and props. Keep imperative
   code for algorithms or Three APIs that cannot be expressed cleanly in Vue.
   Do not merge or split modules based on line count alone.
4. Do not claim browser, GPU, WebGPU, recovery, accessibility, or performance
   evidence beyond what was actually exercised. Record real remaining gaps.
5. Tracked `dist/` is the repository's current release artifact: regenerate it
   with the sources for release-facing changes, but do not change its tracking
   policy until the external deployment consumer is identified.

## Current audit decisions

- The source tree is already mostly declarative for the scene: `SceneHost.vue`
  and owner SFCs declare stable roots and leaves; controllers adopt those nodes
  and own algorithms/resources. Continue the audit for remaining parallel
  construction and duplicated disposal.
- Current constructor audit: scene section roots, Works installation meshes,
  and case planes are Vue/Tres-declared. Cyprus's `primitive` is the loaded
  glTF hierarchy; showreel's private `Scene`/`OrthographicCamera` serve its
  offscreen render algorithm. `EnvSphereOwner` directly declares each rounded
  surface so its per-mesh geometry cleanup stays separate from its shared
  materials; Cientos `RoundedBox` wraps a mesh and fallback material without
  simplifying that ownership contract.
- `SceneCoordinator` and `SceneFramePass` remain separate: one coordinates
  story/route/transforms and policy, the other owns the per-frame owner
  fan-out. `SceneTransformPass` contains the scroll-to-world mapping algorithm.
  Their current call graph does not justify merging them.
- Keep `RenderScheduler`: Tres 5.9.2 on-demand gates renderer calls but retains
  its RAF loop; this project also requires zero idle ticks, settled activity
  windows, and hidden-tab pause/resume. Reconsider only if equivalent behavior
  is verified against installed Tres source and browser evidence. Scene-frame
  exceptions stop that loop once and are reported to native console; a later
  invalidation can retry the owner.
- Keep the typed `EventBus` for communication across the classic HTML shell,
  Vue router/views, and independently owned runtime/UI controllers. Do not
  replace it with another abstraction absent a concrete same-owner duplicate.
- `ErrorTracker` was removed: it duplicated native console reporting and
  suppressed unhandled rejection visibility. Boot failures remain explicitly
  caught and shown by the app shell.
- The persistent top bar/contact launcher now lives declaratively in
  `app/PersistentConsole.vue` under `AppShell`; `CinematicNav` retains native
  scroll, story position, input, and hash behavior. `FullscreenOverlayView.vue`
  declares the modal structure; its controller adopts the Vue root and owns
  UIKit/focus, decoded-poster, and keyboard behavior. `ShowreelConsole.vue`
  renders theater state declaratively and owns its UI subscriptions/input until
  AppShell unmount. `RouteTransitionView.vue` declares the transition surface;
  the route controller retains only guard timing and cancel policy.

## Phases

Status: `active`, `queued`, or `done`. Mark a phase `done` only when its stated
acceptance evidence exists.

### 0. Repository and production baseline — active

**Established:** repository/package identity matches `la6su/la6-portfolio`;
installed matrix is Vue 3.5.43, Vue Router 5.3.1, Tres core/Cientos 5.9.2,
Three 0.186.1, Vite 8.3.2, plugin-vue 6.0.9, TypeScript 6.0.3; installed
dependencies are not tracked; generated blog and builder inputs have known
sources and build consumers; scripts/dependencies and Node/Bun boundaries were
audited with no proven unused direct dependency. CI contains unit, type, lint,
repository, and browser jobs. TypeScript 7.0.2 is released, but the installed
`typescript-eslint` peer range ends below 6.1.0, so a TypeScript 7 upgrade is
not currently compatible with the lint matrix.

**Remaining:** identify the deploy consumer for tracked `dist/` (84 tracked
files in the last audit) before changing its tracking policy; prove clean
checkout install/build and deployed static routing/cache behavior. The only
local GitHub workflow, `.github/workflows/quality.yml`, runs checks and browser
tests but has no deployment step. `public/` headers do not establish whether
Cloudflare Pages, Netlify, or another consumer publishes the output.
The artifact was tracked from the repository's initial commit and was stale;
it has now been regenerated from the current source during the brand-asset
cleanup. Keep tracking it while the host is unknown, and inspect clean-build
and served-route behavior separately.

**Accept when:** frozen install, repository checks, production build/budgets,
generated-route checks, and the actual deploy contract are reproducible.

### 1. Declarative scene ownership — active

**Established:** Tres/Vue declares camera, lights, environment, section roots,
feature roots and many mesh leaves. Works cards, carousel cards, typography,
ink, Cyprus, Lab, particles, environment, and showreel portal use owner SFCs.
Controllers adopt Vue nodes; resource disposal has explicit owners. Section
groups no longer synthesize fallback roots; Works metadata no longer uses a
WeakMap attachment bag.

**Constructor inventory:** a source-wide search found no imperative
construction of stable app scene nodes and no runtime `scene.add/remove`.
Remaining `new THREE.*` matches are materials, custom Lab geometry, or the
showreel's offscreen `Scene`/`OrthographicCamera`. Cyprus's Vue `<primitive>`
adopts the loaded glTF hierarchy. The similarly named `scene.add` in
`WebGPUPostPipeline` is a TSL node operation, not a Three scene mutation.
These remain algorithm/resource cases; moving them into the template would
not simplify ownership. Route-cycle resource evidence is still required.

**Remaining:** prove route-cycle resource plateaus and finish auditing the
remaining `:dispose="null"`/manual insertion sites for single ownership; keep
the already reviewed constructors in Vue where they form stable hierarchy.

**Accept when:** scene hierarchy has one Vue/Tres owner, adopted nodes have one
resource-disposal owner, and route mount/release cycles show no detached nodes,
leaks, or duplicate construction.

### 2. Runtime orchestration and lifecycle — active

**Established:** Tres `delta` is forwarded through SceneHost; the duplicate
`Experience/Time` clock is removed. Device capability is snapshotted outside
camera updates. `Experience.destroy()` and async lazy-stage release have
focused tests. The unused global error tracker is removed. Route-specific
stage contracts remain separate from the generic stale-request lifecycle.
The fullscreen behavior controller is released when its Vue host unmounts.
`ExperienceUI` now owns that controller lifecycle directly; the forwarding
`UIManager` and its bootstrap setup/cleanup are removed.
Project controls initialize synchronously after the ready scene is built; the
one-frame readiness RAF and duplicate in-flight promise state are removed.
Initialization failures release a partially created overlay and carousel
callback.
The DOM-only boot no longer initializes scene-only UI lifecycle subscriptions;
the unreferenced `twitter` product icon module was removed. Module-private
pointer input is one ES-module instance and starts only in `Experience.init()`;
it no longer installs a global listener during module evaluation. Cursor
activity already wakes the shared loop, so the second Works-only pointer
listener and RAF were removed; DrawTrail consumes the same Input state in that
scheduler frame.

**Next audit:** trace `Experience.ts` end to end and test every remaining
boundary before simplifying: `ExperienceUI`, `StageRegistry`/`LazyStage`,
readiness, renderer replacement, and teardown. Collapse only
forwarding state or duplicate owners. Confirm listeners, timers, observer,
RAF, media, controls, pending imports, and renderer candidates reach terminal
cleanup on route leave, boot failure, recovery, and Vue unmount.

**Accept when:** one composition root coordinates runtime; initialization,
route changes, recovery, and teardown are idempotent and covered by tests;
no abandoned async task can reattach resources.

### 3. WebGPU, TSL, fallback, and scheduling — active

**Established:** WebGPU and WebGL backend selection is capability-based;
software/fallback policy and accessible no-GPU continuation exist. Demand
rendering coalesces invalidations and pauses on hidden tabs. Renderer recovery
is bounded and tested at policy/DOM boundaries; a device snapshot avoids
per-frame capability detection. The Contact production test verifies that
Cyprus downloads only the selected Draco wrapper/WASM pair; Three's loader
module also emits its default standalone decoder assets, but that GLTF route
does not request them.

**Remaining:** exercise actual WebGPU and forced WebGL renderer recovery on
physical GPU hardware. Local Chromium/Firefox production suites currently use
software WebGL; an earlier SwiftShader context-loss scenario did not recover,
so hardware recovery remains unresolved. Audit TSL graph/material ownership,
shader compile/prewarm behavior, CanvasTexture parity, resize/DPR, idle draw
counts, and route resource plateaus from measurements.

**Accept when:** actual backend behavior is evidenced on supported hardware;
no-WebGPU uses WebGL 2 where available; no-GPU retains accessible content;
recovery/teardown work on a real device; settled scenes produce no unnecessary
loop/draw or unbounded route resource growth.

### 4. App shell, content, accessibility, and browser support — active

**Established:** SPA routes, EN/RU metadata, standalone blog/builder pages,
browser history, unknown-route fallback, menu/modal keyboard focus, reduced
motion, mobile overflow, and touch scrolling have production-browser coverage.
Persistent console, fullscreen modal, showreel chrome, route transition, and
story rail are Vue-owned.
Behavior controllers keep media/rendering policies at their existing owners;
Vue removes app-shell markup and UI listeners on unmount. Firefox is confirmed
by the user and the local suite.

**Established:** the story rail's active state comes from the existing
`jlz:story-index-change` event; current page headings supply the rail's labels
after translation. Keeping that small DOM projection avoids a second set of
route-specific translated strings. Vue owns the rail root lifetime; the
controller resets its inert/sheet state and listeners without removing it.

**Established:** production-browser checks cover cold-entry section hashes
deferred until runtime readiness and in-app hashes to lazy route sections
after their DOM mounts. Both pass in Chromium and Firefox.

**Established:** if the scene is explicitly disabled or renderer startup fails,
Vue replaces cinematic controls with route links reused from `NAV_ITEMS`. The
`?no-scene` path navigates to a lazy SPA route without a canvas in Chromium and
Firefox. The opt-in both-APIs-disabled Chromium case also continues after its
accessible boot gate; Three emits one `getSupportedExtensions` TypeError while
constructing its unavailable WebGL fallback, which Tres reports and the app
handles as boot failure. Scene-only project and showreel actions are omitted
in this fallback; case-study and route links remain available.

**Next audit:** walk focus, contrast, touch targets, resize/orientation, and
renderer-failure navigation across EN/RU routes. Run the production suite in
Safari/WebKit. The local WebKit
binary cannot launch because this host lacks `libicu74`, `libxml2`, and
`libflite1`; CI installs browser dependencies and is the current execution
path.

**Accept when:** route/content and accessibility essentials pass desktop and
mobile production walks in Chromium, Firefox, and Safari/WebKit; the portfolio
remains navigable without GPU initialization.

### 5. Performance, dead code, and release audit — active

**Established:** project-owned interpolation helpers were replaced with
Three's `MathUtils`; unused device getters and compatibility alias, duplicate
clock, Works WeakMap metadata, and global error tracker were removed. The
preloaded Commissioner font is WOFF2. Large media was reduced and unreferenced
assets removed after source/content searches. Frame-owner failures are no
longer swallowed by the render scheduler. Historical comments about removed
handlers, no-op methods, and effects were removed from active runtime files;
they no longer describe current ownership or APIs. Current source slices
passed Chromium and Firefox production suites, Vue type-check, lint, and 77
unit tests.

**Next audit:** finish source-to-output inventory for generated CSS, routes,
content generators, tests and package scripts (public runtime assets and
TypeScript scripts are now source-referenced and checked). Remove proven dead
or duplicate paths in focused commits. Inspect route chunk sizes, texture/font
cost, CPU frame work, GPU allocations, and build budgets; use measured results
and retain deploy-required artifacts. Then perform a fresh full source review
against this plan and record the release audit evidence.

**Audit finding:** removed stale comments referring to the deleted `src/pages`
tree and prior imperative router/admin renderers. Current comments describe
the Vue Router timing, hash dispatch, and reactive refresh behavior directly.
The same pass removed references to deleted carousel helpers, scene adapters,
and glass-cube render paths from their active owner modules.
The package's unused `type-check` script duplicated the CI-authoritative
`type-check:vue` entry with plain `tsc`; removed it so the Vue-aware check is
the single documented type-check command.
The ESLint ignore list also excluded every production/build script; removed
that blind spot and configured Node/Bun globals for those files. Lint now
covers the generators and release checks that run as part of the build.
The executable TypeScript scripts were also outside `tsconfig.json`. Replaced
their three Bun-only helpers with Node child-process/path/timer APIs and added
`scripts/**/*.ts` to the existing Vue-aware type-check graph; this adds no
runtime dependency and keeps Bun as the package/script runner. The expanded
check found and fixed an unchecked source-map array access in
`bundle-breakdown.ts`. Vue type-check, lint, all 77 unit tests, stdlib checks,
and `git diff --check` pass with the expanded coverage.
**Asset audit:** every public runtime media/font/Prism asset is referenced by
the app, blog, or builder output. `favicon.svg` and `logo.svg` were identical;
all generated and authored pages now use `logo.svg`, and the duplicate source
asset/cache rule was removed. The manifest keeps one `any` icon entry because
the mark has no maskable safe-zone padding. A successful production build
regenerated the tracked release output; no static HTML/manifest/header file
refers to the removed URL.

**Accept when:** clean install/build, all deterministic checks, Chromium/
Firefox/WebKit browser matrix, actual GPU/recovery evidence, route/resource
stress, deployment contract, and hardware-specific performance results pass;
no known dead active path or unowned persistent resource remains.

## Current checkpoint — 2026-10-01

The application shell and stable scene hierarchy are Vue/Tres-owned. Behavior
controllers remain for Three algorithms, browser/media policy, route-guard
timing, and lifecycle work that the framework does not supply. Recent audits
removed duplicate renderer-query parsing, a redundant UIkit global assignment,
the unused project icon registration, the standalone overlay adapter,
project-controls readiness RAF/promise state, the Input class's redundant
singleton guard/import side effect, the duplicate Works pointer wake
listener/RAF, and the Works room-count literals. These changes are committed.
The `?no-scene` flag now has one Vue-free source used by bootstrap, SceneHost,
and both Vue shell controls. `dist/` remains tracked pending deploy-contract
evidence. The local quality workflow was inspected and confirmed not to deploy;
the output consumer remains unknown. After discovering the tracked output was
stale since the initial commit, the successful production build was retained
to synchronize release HTML, assets, and headers with source.

**Verified locally:** Vue type-check, ESLint, all 77 unit tests, production
build/budgets on Vite 8.3.2, and the full production Chromium suite (17 passed, 3 opt-in
renderer scenarios skipped). That includes repeated lazy-stage mount/release,
route metadata, DOM-only navigation and icons, renderer-failure continuation,
showreel/fullscreen behavior, reduced motion, and host teardown. Firefox
production route, hash, and fallback suites passed in the prior matrix run.
The refreshed tracked release output, including the deduplicated brand asset,
also passed the production Chromium suite (17 passed, 3 opt-in renderer
scenarios skipped). Build budgets measured 3.03 kB gzip startup, 310.95 kB
shared Three, and 53.84 kB UIkit.
The dedicated Chromium host-teardown test also passes after adding coverage for
the create-to-mount microtask race: host teardown now waits for a stale stage's
declared-node release without waiting on unrelated in-flight imports.
These browser runs use software rendering. They do not prove physical-GPU
WebGPU, device-loss recovery, or GPU performance. WebKit remains unverified on
this host because its browser dependencies are missing.

**Next actions:**

1. Continue phase 2's `Experience.ts` ownership and teardown trace. The
   create-to-mount teardown race is fixed and covered; inspect the remaining
   boot/UI lifecycle owners and async stage continuations, changing only a
   demonstrated duplicate or missing cleanup path.
2. Continue phase 1 with route resource plateau evidence; finish phase 5's
   source-to-output map for generated CSS, routes, content, and test fixtures.
   Public runtime assets, TypeScript scripts, and current release output have
   been inventoried or synchronized. Preserve Three scratch objects and
   offscreen scenes where their runtime algorithms require them.
3. Continue phase 4's EN/RU keyboard, contrast, touch, resize, and renderer
   failure walk; run WebKit in CI or a host with its declared libraries.
4. Close phase 0 only after identifying the actual deploy consumer and
   reproducing clean install/build and static routing/cache behavior.
5. Close phase 3/5 only with physical WebGPU/WebGL, recovery, resource-plateau,
   idle-render, and performance evidence on supported hardware.

## Follow-on goal policy

Only after this plan's full release acceptance is evidenced, perform a fresh
independent audit across application code, generated content, dependencies,
assets, deployment, and runtime. Use/install additional skills only when a
finding needs that domain review. Derive a new phased plan and autonomous goal
from evidence, then repeat audit → plan → implementation → verification until
production-quality architecture and performance gates pass. Do not create that
follow-on goal before release acceptance; keep one canonical work queue.
