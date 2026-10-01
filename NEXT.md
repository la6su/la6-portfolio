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
- Delegate viewport observation, renderer DPR/size, and perspective-camera
  aspect updates to Tres 5.9.2. Its installed source confirms those contracts;
  `SceneHost.vue` provides a fixed full-viewport canvas parent. Experience
  watches Tres's size refs only to resize project-specific stage transforms.
  Device recovery still explicitly sizes the replacement renderer because it
  is swapped behind Tres's renderer manager.
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

## Full source audit — findings and work queue (2026-10-01)

This is the current source-to-runtime audit, not a claim that production
acceptance is complete. Findings below are grounded in inspected call sites,
plugin wiring, package scripts, and current module ownership. Items marked
`verify` need runtime/deployment evidence before changing architecture.

| Area | Audited evidence and finding | Next action | Priority / acceptance |
| --- | --- | --- | --- |
| Vue/Tres scene graph | `SceneHost.vue`, `sceneHost.ts`, `useSceneStages.ts`, stage owner SFCs, `Experience.buildScene()`, and scene owner controllers show Vue/Tres owning persistent roots. Experience adopts those roots. No demonstrated duplicate stable scene hierarchy remains. | Keep this as baseline; change an owner only when a concrete duplicate or cleanup defect is demonstrated. | Guardrail: no runtime `scene.add/remove` for stable app nodes; one disposal owner per GPU resource. |
| Scene coordination | `SceneCoordinator` owns route/story orchestration; `SceneTransformPass` owns scroll-to-world math; `SceneFramePass` owns per-frame updates. These are distinct algorithms, but the split carries getter-rich owner ports and coordination forwarding. Historical extraction comments describe refactor sequence rather than current responsibility. | Review each delegate and port against call sites. Remove pass-through methods/state that do not isolate an algorithm; rewrite stale extraction comments. Do not merge by file size alone. | P1: every surviving class has a direct responsibility and a caller that benefits from its boundary. |
| Experience composition root | `Experience.ts` initializes renderer, scene, feature UI, theme, motion, recovery, diagnostics and frame policy. Review found awaited Vue stage mounts and the dev-only DevPanel import could resume after destroy; lifecycle-generation guards now stop later owners from being created and prevent the diagnostic global from being republished. | Continue the method-by-method error/teardown map; look for repeated fan-outs and flags derivable from owners. Keep coordination here only where it is the single natural owner. | P1: each listener, timer, observer, renderer candidate and async continuation has one owner and terminal cleanup. |
| Lazy route stages | `LazyStage.ts` centralizes real stale-import, mount, in-flight release and idempotent cleanup races; `StageRegistry.ts` supplies route-specific contracts. | Retain shared lifecycle only while focused race tests represent production behavior; remove slot/test seams or repeated contract fields that serve no production behavior. | P1: route leave during create/mount/load releases exactly once and does not wait for unrelated imports. |
| Route hash dispatch | `app/index.ts` had both `createSingleFrameOwner` generation/cancel state and `hashNavigationGeneration`; afterEach cancels the owned frame before starting the next poll, so the second stale token duplicated cancellation. Removed the redundant counter; direct and lazy-route hash flows pass in Firefox production browser. Both function-backed owners remain private to one mount. | Add superseding navigation/router-error/unmount cases if current browser coverage does not cover them; reconsider wrapper exports and simplify their implementation only if it reduces state without weakening cancellation. | P1: no stale hash dispatch; no wrapper exported solely for test access. |
| Bootstrap progress | `entry-app.ts` reports 15% then 40% with no asynchronous work between; later 55/95 milestones are coarse phases, followed by an artificial 150 ms pause. | Decide whether the UI promises measurable progress. Use phase/status feedback or actual measurable progress; remove fabricated percentages/delay if they add no user value. | P2: loader never implies measured completion that boot cannot report. |
| Dev builder API | `admin/vite-plugin.ts` exposes unauthenticated GET and source-writing POST middleware whenever Vite serves. Package `dev` uses `vite --host`; `vite.config.ts` allows `project.6la.ru` and documents Caddy forwarding to localhost:5173. No proxy/auth configuration is in this repository, so external reachability is unproven; a reachable dev server grants document and generated Less writes. | Establish actual proxy ACL and whether `/__jlz-admin/*` is reachable remotely. Enforce a local/authorized boundary at the server/API and add request tests; do not rely on hidden UI. | P0 verify: remote unauthenticated clients cannot read or mutate builder sources; local editor still works. |
| Build/dependency integration | Vite 8/Rolldown code-splitting rules and Three/Tres/Cientos compatibility aliases are pinned to observed ecosystem behavior; the stdlib checker guards its imported module set. Direct dependency usage was traced; no unused package was proven. | Keep compatibility seams small; on upgrades verify peer compatibility, bundle duplication, lazy chunk placement and checker output. Do not delete shims based on apparent complexity. | P1: lockfile install, type check, stdlib check, build and budgets agree after upgrades. |
| Static content and routes | Blog and builder sources are consumed by render/prerender scripts and multi-page Vite inputs; they are live build inputs even when not browser-imported. Runtime route manifest is separate from static blog/published-builder routes by design. Review found generated sitemap/blog used the site-origin env while builder preview images ignored its supplied origin. Origin normalization now has one shared source, all generated builder social URLs use their page origin, and a regression test covers the staging host. A staging-origin build confirmed sitemap, blog and both builder locales use the override; the committed build was then regenerated with production defaults. | Finish source→generated-output ownership map, including metadata, authored HTML/Less and clean-checkout behavior. | P1: each generated artifact has one source and deterministic build owner. |
| CSS and UIkit | `_console-language.less` (1256 lines), `_import.less` (600), and component sheets contain large authored styling surfaces. Current search did not prove selector deadness or duplicate semantics. | Audit imports/tokens/selectors against authored HTML, Vue templates, blog and builder markup; only remove proven unused/repeated rules. Check responsive, reduced-motion, focus and EN/RU variants after each slice. | P2: no selector removal without closed markup/input search and browser verification. |
| Public media and budgets | Public runtime assets resolve to app/blog/builder references; `coming-soon.mp4` dominates transfer size (~5.27 MB). `ffprobe`: H.264 1920×1080 30 fps, AAC, 9.87 s, ~4.28 Mbit/s. Build budget reports media total/largest but does not fail on aggregate media size. | Inspect delivery/use and quality target; compare a re-encode and browser support before replacing. Then choose per-file/aggregate budgets from measurements. | P2: savings retain visual/audio quality and browser support; budget failures are actionable. |
| Release/deployment | CI checks and browser-tests; no deploy workflow or host config exists in repository. `dist/` remains tracked pending identification of its consumer. | Identify host, rewrite/history behavior, cache headers and whether host consumes committed `dist/` or builds source. Reproduce from a clean checkout. | P0 verify: documented release path matches deployment. |
| Render loop and animation | Tres is the only scene render-loop driver; `RenderScheduler` controls its open/close window. Other RAF users are DOM text reveal, UIkit content refresh, route-hash polling and route announcement. | Keep the one scene loop. Inspect per-call cleanup and whether each DOM animation has an independent cancellation owner during unmount. | P1: no second scene loop or uncanceled callback after owner teardown. |
| Cross-browser/GPU | Chromium and Firefox software-rendered suites are recorded; WebKit cannot launch on this host and physical WebGPU/recovery evidence is absent. | Run WebKit on declared CI/available host, then WebGPU/WebGL and context recovery on supported physical hardware. | P0 release evidence; do not infer GPU behavior from software renderer runs. |

### Audit execution order

1. Close the dev API exposure question and protect its write boundary.
2. Finish runtime ownership/teardown map (`Experience`, renderer recovery,
   stage registry, route/hash and app unmount); simplify proven duplicate state.
3. Complete generated content, builder/blog, CSS selector and media audits.
4. Confirm dependency/build compatibility from clean install and actual release
   host behavior; remove only proven dead paths.
5. Run browser, accessibility, resource, performance and physical GPU evidence;
   update acceptance rows with commands and results.

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

### 1. Declarative scene ownership — done

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
not simplify ownership.

**Verified route/resource soak:** in local software Chromium, visited `/`,
`/services`, `/works`, `/works/porsche-911-spider`, `/manifesto`, `/lab`, and
`/contact` three times through SPA navigation. After the cold pass, per-route
scene and renderer geometry/material/texture counts matched exactly between
passes two and three; renderer/document canvas counts stayed 1/2; page errors
were zero. The later passes include all warmed lazy owners. The focused Works
and Contact route-cycle production tests also pass. Renderer program count was
not exposed by this WebGPU wrapper (`null`); this proves stable enumerable
owner counts on software rendering, not physical-GPU allocation behavior.

**Disposal inventory:** reviewed each current `:dispose="null"` scene owner.
Each suppresses Tres's recursive disposal because the resource is borrowed,
shared/leased, or released by its stage/controller owner. Services and Lab
separate SFC-owned geometry from stage-owned material; EnvSky borrows the
pavilion material; CursorTrail releases its placeholder before Tres disposes
the replacement ribbon geometry. Removing these opt-outs would duplicate or
break the existing single-owner cleanup, so no source change was warranted.

**Evidence:** the declared scene hierarchy and single-owner disposal paths have
been audited, and warmed route cycles show a stable resource plateau. This
phase does not claim hardware-specific GPU evidence; that remains phase 3.

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
The first-render readiness gate now resolves only after a successful frame;
its timeout rejects into the existing boot error path instead of falsely
enabling Enter on a blank canvas. Destroy cancels the wait with an explicit
abort, and `Experience.init()` aborts when renderer/scene awaits return stale.
Dedicated tests cover first-frame success, timeout failure, and cancellation.
Tres's existing reactive size manager and camera registry now own viewport
observation, renderer sizing/DPR, and camera aspect. The project `Sizes`
window listener, duplicate camera resize, and ordinary renderer resize writes
were removed. Experience watches the Tres size refs for only the remaining
project-owned stage transforms; device recovery applies current dimensions to
the replacement renderer.
The DOM-only boot no longer initializes scene-only UI lifecycle subscriptions;
the unreferenced `twitter` product icon module was removed. Module-private
pointer input is one ES-module instance and starts only in `Experience.init()`;
it no longer installs a global listener during module evaluation. Cursor
activity already wakes the shared loop, so the second Works-only pointer
listener and RAF were removed; DrawTrail consumes the same Input state in that
scheduler frame.

**Next audit:** finish the method-by-method `Experience.ts` trace through
`ExperienceUI`, `StageRegistry`/`LazyStage`, renderer replacement and app
unmount. Audit async cancellation, event listener registration, diagnostic
globals, stage release ordering and boot failure exits. Then simplify only the
duplicate hash invalidation state and other state proven redundant by that
trace. Confirm listeners, timers, observer, RAF, media, controls, pending
imports and renderer candidates reach terminal cleanup on route leave, boot
failure, recovery and Vue unmount.
The first-frame false-success and pending-cancel paths are fixed and covered by
unit tests; production Chromium also confirms the successful boot and existing
renderer-failure UI path.
The current lifecycle pass added generation checks immediately after the
carousel and particle Vue mount awaits in `buildScene()`, and after the
development-only DevPanel import. A stale initialization now stops before it
constructs later scene controllers or republishes the runtime diagnostic
global. Existing 80 unit tests, Vue type-check, ESLint, build and budgets pass;
dedicated deterministic coverage for teardown during these exact awaits is
still outstanding.

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
passed Chromium and Firefox production suites, Vue type-check, lint, and 80
unit tests.

**Next audit:** finish the source-to-output inventory for generated CSS,
routes, content generators, tests and package scripts (public runtime assets
and TypeScript scripts are now source-referenced and checked). Audit authored
LESS selector reachability across Vue, static HTML, blog and builder output;
inspect video codec/dimensions before selecting media budgets. Remove proven
dead or duplicate paths in focused commits. Inspect route chunks, texture/font
cost, CPU frame work and GPU allocations from measurements. Then do a fresh
independent source review and record release evidence.

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
and `git diff --check` passed at that checkpoint; the latest readiness-gate
slice raises the unit total to 80.
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
The bootstrap's one-use `createStyleOwner` and `createReadyEventTimer` wrappers
were removed: their single style node and cancelable readiness timeout now
have direct module-local owners. This removes test-only exports and keeps the
same teardown/reschedule behavior without generic wrapper objects.
`DeviceCapability.detectTier()` no longer repeats the low-end desktop check
inside its WebGPU branch after the same predicate already returned at the
desktop policy boundary; the WebGPU tier result is unchanged.

**Verified locally:** Vue type-check, ESLint, all 80 unit tests, stdlib checks,
production build/budgets on Vite 8.3.2, and the full production Chromium suite
(17 passed, 3 opt-in renderer scenarios skipped). That includes repeated lazy-stage mount/release,
route metadata, DOM-only navigation and icons, renderer-failure continuation,
showreel/fullscreen behavior, reduced motion, and host teardown. Firefox
production route, hash, and fallback suites passed in the prior matrix run.
The refreshed tracked release output, including the deduplicated brand asset,
also passed the production Chromium suite (17 passed, 3 opt-in renderer
scenarios skipped). Build budgets measured 3.03 kB gzip startup, 310.95 kB
shared Three, and 53.84 kB UIkit.
After the readiness gate change, the 80-unit suite and same production
Chromium suite passed again; the build regenerated the tracked release output.
The bootstrap ownership simplification passes the production TypeScript/build
and ESLint checks; it retained the current startup, shared Three, and UIkit
gzip budgets. Browser behavior for this exact simplification has not been
rerun yet.
The dedicated Chromium host-teardown test also passes after adding coverage for
the create-to-mount microtask race: host teardown now waits for a stale stage's
declared-node release without waiting on unrelated in-flight imports.
After that change, the isolated Firefox production project also passed (16
passed, 4 opt-in renderer scenarios skipped). The full browser matrix remains
host-limited: Playwright's managed Chromium executable is absent and the local
WebKit binary lacks `libicu74`, `libxml2`, and `libflite1`; Firefox itself is
available and passed all non-opt-in route/lifecycle cases.
These browser runs use software rendering. They do not prove physical-GPU
WebGPU, device-loss recovery, or GPU performance. WebKit remains unverified on
this host because its browser dependencies are missing.
After delegating viewport ownership to Tres, the production Chromium suite
passed (17 passed, 3 opt-in renderer scenarios skipped) and the Firefox
project passed (16 passed, 4 opt-in renderer scenarios skipped). TypeScript,
build budgets, and ESLint also passed. WebKit remains blocked by the recorded
missing host libraries; physical-GPU behavior remains outside this software
browser evidence.
The route hash cleanup removed one stale-generation counter while keeping the
owned RAF cancellation. 80 unit tests, Vue type-check, ESLint, production
build/budgets and the focused Firefox production hash test passed. Focused
Chromium execution was attempted but the installed Playwright Chromium binary
is absent on this host. The current policy cleanup also passes all 80 unit
tests, Vue/TypeScript build, ESLint, and release budgets; removing the
unreachable predicate does not change tier selection. A broad audit pass has
mapped runtime, app, builder,
admin, build, styling and public-media ownership. It identified the
unauthenticated dev builder API exposure question, duplicate route-hash
stale-token state, misleading fixed progress percentages, and verification
work in CSS/media and deployment. These findings are now in the audit table;
they are not yet closed.

**Next actions:**

1. Establish the dev builder API's actual network exposure and enforce an
   authorized boundary before treating the admin as production-safe.
2. Finish phase 2's `Experience.ts` teardown trace and remove route hash
   dispatch's duplicated stale generation only after direct/lazy/superseded
   navigation coverage is confirmed.
3. Finish phase 5's generated-output and LESS selector audit; inspect the
   5.27 MB video before setting a measurable media budget.
4. Continue phase 4's EN/RU keyboard, contrast, touch, resize and renderer
   failure walk; run WebKit in CI or a host with its declared libraries.
5. Close phase 0 only after identifying the deploy consumer and reproducing
   clean install/build, routing and cache behavior. Close phases 3/5 only with
   physical WebGPU/WebGL, recovery, resource plateau, idle-render and
   performance evidence on supported hardware.

## Follow-on goal policy

Only after this plan's full release acceptance is evidenced, perform a fresh
independent audit across application code, generated content, dependencies,
assets, deployment, and runtime. Use/install additional skills only when a
finding needs that domain review. Derive a new phased plan and autonomous goal
from evidence, then repeat audit → plan → implementation → verification until
production-quality architecture and performance gates pass. Do not create that
follow-on goal before release acceptance; keep one canonical work queue.
