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
- UI interactions use `ExperienceUIHost` accessors backed by the composition
  root for Baku, the burst, carousel, and Works stage. Removed coordinator
  getters that exposed those owner objects without coordinating them. Continue
  auditing remaining coordinator APIs for genuine policy versus forwarding.
- `RenderPipeline` used Three's `backend.constructor.name` as a fallback for
  test doubles even though the pinned WebGPU backend exposes
  `isWebGPUBackend`; removed that redundant name probe. The installed Three
  implementation has the marker, though its Backend declaration omits it, so
  the read uses a narrow optional-property type.
- `worldSlots.ts` owns stable slot identity and index. Replaced repeated Intro,
  Works, and Contact slot literals in the coordinator and both scene passes
  with derived constants; Contact/Services chapter-local indices remain local
  because they are different contracts.
- The coordinator's camera setter only forwarded a stable camera object each
  frame. The frame pass now receives the persistent Tres camera at construction;
  the per-frame setter and its forwarding API are removed.
- SceneHost's SwiftShader-to-WebGL fallback awaited renderer initialization
  without cancelling on host unmount, and explicit teardown could dispose that
  candidate while `init()` was still pending. The host now aborts the helper
  and waits for init settlement before its terminal disposal; the helper's
  existing late-abort test verifies that it releases the candidate after init.
- `inspectUnifiedBackend` retained a constructor-name fallback despite both
  pinned Three backend classes exposing `isWebGPUBackend` / `isWebGLBackend`.
  Removed the guess and added tests for both markers and an unknown backend.
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
| Scene coordination | `SceneCoordinator` owns route/story orchestration; `SceneTransformPass` owns scroll-to-world math; `SceneFramePass` owns per-frame updates. Scene-stage getters for typography/halo/manifesto and the internal section-group getter have no external readers and are private. UI interactions previously fetched Baku, burst, carousel, and Works stage through coordinator getters; moved those reads to `ExperienceUIHost`, backed by Experience and StageRegistry, and deleted the forwarding getters. Experience frame policy reads its carousel owner directly. Replaced repeated Intro/Works/Contact slot literals with constants derived by `worldSlots.ts`; slot roots remain Vue-owned. Removed the coordinator/frame-pass camera setter that Experience called each frame with the same persistent camera. `prewarmHomeMedia` uses the pinned Three `WebGPURenderer.compileAsync()` API directly; failures remain non-fatal because prewarm is an optimization. The passes retain distinct algorithms and caches; remaining coordinator methods and pass contexts still need caller-by-caller review. | Continue tracing every Experience/ExperienceUI coordinator call and each pass context field; remove only proven pass-through state. | P1: every surviving class has a direct responsibility and a caller that benefits from its boundary. |
| Experience composition root | `Experience.ts` initializes renderer, scene, feature UI, theme, motion, recovery, diagnostics and frame policy. Lifecycle-generation guards stop awaited mounts and the dev-only DevPanel import from creating owners after destroy. Teardown was synchronous at the app boundary even though `StageRegistry.dispose()` waits on Vue `nextTick`; app unmount could therefore dispose the backend before stage controllers released resources. `Experience.destroy()` returns an idempotent completion promise, publishes that promise before teardown callbacks can re-enter, and the app awaits it before Vue unmount. Completion covers route-stage + showreel teardown. The dev host test direct-loads Contact, waits for all three lazy stages and opens the showreel; their release traces precede backend/renderer disposal. The development runtime teardown hook is published before `Experience.init()`, and teardown stops callbacks immediately but waits for active `WebGPURenderer.compileAsync()` home prewarm before releasing scene owners and renderer pipeline. Five deterministic stale-continuation tests cover carousel mount, particle mount, coordinator init, home carousel texture initialization, and GPU prewarm disposal ordering. SceneHost now aborts software-adapter fallback init on unmount and awaits its completion before final renderer disposal; helper coverage proves late-aborted init releases only after settlement. | Continue the method-by-method error/teardown map, including recovery candidates and Tres's own pre-ready initialization; exercise the browser lifecycle boundary on supported hardware when available. Keep coordination here only where it is the single natural owner. | P1: each listener, timer, observer, renderer candidate and async continuation has one owner and terminal cleanup. |
| Lazy route stages | `LazyStage.ts` centralizes real stale-import, mount, in-flight release and idempotent cleanup races; `StageRegistry.ts` supplies route-specific contracts. Experience awaits registry disposal before its caller unmounts SceneHost, so asynchronous stage release finishes while the backend remains alive. The dev host gate observes Contact typography, Cyprus GLTF and halo stages reaching ready, then proves each reports release before backend disposal. | Retain shared lifecycle only while focused race tests represent production behavior; remove slot/test seams or repeated contract fields that serve no production behavior. Add direct release-order cases for route leave during asset loading if current unit coverage does not establish them. | P1: route leave during create/mount/load releases exactly once and before backend disposal. |
| Route hash dispatch | `app/index.ts` had both `createSingleFrameOwner` generation/cancel state and `hashNavigationGeneration`; afterEach cancels the owned frame before starting the next poll, so the second stale token duplicated cancellation. Removed the redundant counter; direct and lazy-route hash flows pass in Firefox production browser. New Vitest coverage proves superseded frame callbacks and callbacks cancelled before execution are no-ops; deferred initial hashes dispatch only the newest request and stop after invalidation. Router error and Vue unmount both call the same cancellation owner. | Keep the cancellation helper tests aligned with those two integration cleanup call sites; assess the route hash flow during the full accessibility/navigation browser pass. | P1: no stale hash dispatch; no duplicate generation state. |
| Bootstrap status | Removed the false 15→40→55→95→100 percentages and 150 ms display delay. Splash now announces real `INITIALIZING`, `PREPARING SCENE`, and `READY` states through a polite live status; failure remains `SIGNAL LOST`. | Done; keep phase labels tied to actual boot transitions. | No estimated completion percentage without measurable work progress. |
| Dev builder API | `admin/vite-plugin.ts` exposes unauthenticated GET and source-writing POST middleware whenever Vite serves. Default `dev` was observed listening only on `127.0.0.1:5179`; headless Chromium loaded `/admin/`, mounted the editor, and fetched the document list successfully with no browser errors after adding the shared SVG favicon. `dev:hmr` intentionally remains network-facing. `vite.config.ts` allows `project.6la.ru`, but that is a Host check, not authentication. The reverse proxy/access-control configuration and whether it shares this host are outside the repository; remote reachability remains unverified. | Confirm the actual proxy target/bind requirement and that proxy auth/ACL covers `/admin/` and `/__jlz-admin/*`; keep this deployment check open until evidence is available. Assess whether explicit `dev:hmr` exposure is acceptable on the local network. | P0 verify: remote unauthenticated clients cannot read or mutate builder sources; local editor works. |
| Build/dependency integration | Vite 8/Rolldown code-splitting rules and Three/Tres/Cientos compatibility aliases are pinned to observed ecosystem behavior; the stdlib checker guards its imported module set. Unified renderer initialization calls pinned `WebGPURenderer.init()` directly. Both `RenderPipeline` and `inspectUnifiedBackend` use Three's explicit backend markers, with tests asserting that unmarked backends stay unknown. Three's installed Tres teardown closes over its initial renderer instance; SceneHost separately owns and disposes the current recovery replacement after scene unmount, so recovery does not need an extra deferral wrapper. Direct dependency usage was traced; no unused package was proven. | Keep compatibility seams small; on upgrades verify peer compatibility, bundle duplication, lazy chunk placement and checker output. Do not delete shims based on apparent complexity. | P1: lockfile install, type check, stdlib check, build and budgets agree after upgrades. |
| Static content and routes | Blog and builder sources are consumed by render/prerender scripts and multi-page Vite inputs; they are live build inputs even when not browser-imported. Runtime route manifest is separate from static blog/published-builder routes by design. Review found generated sitemap/blog used the site-origin env while builder preview images ignored its supplied origin. Origin normalization now has one shared source, all generated builder social URLs use their page origin, and a regression test covers the staging host. A staging-origin build confirmed sitemap, blog and both builder locales use the override; the production build regenerates from defaults. The latest full `bun run build` completed both in the worktree and from a `git archive HEAD` clean checkout: expected routes emitted, sitemap contained 13 URLs, Vite built 360 modules, and budgets passed. Generated blog, builder, sitemap, home-prerender and `dist/` outputs compared byte-for-byte between both builds. | Keep the source/output map current and confirm deployment consumes tracked `dist/` or runs the same build. | P1: each generated artifact has one source and deterministic build owner. |
| CSS and UIkit | `_console-language.less` (1256 lines), `_import.less` (600), and component sheets contain large authored styling surfaces. LESS entry points compile; duplicate emitted selectors are predominantly UIkit breakpoint rules, keyframes, CSS custom properties or intentional cascade overrides, not identical duplicate blocks. A repository-wide literal reachability scan found `.jlz-admin-theme-fields` only in `admin/admin.less`; removed it from a shared rule while retaining the live inspector selector. | Continue selector reachability against authored HTML, Vue templates, blog and builder markup; account for runtime-generated state classes before deleting. Review actual declaration overlap separately from responsive/keyframe variants. Check responsive, reduced-motion, focus and EN/RU variants after each slice. | P2: no selector removal without closed markup/input search and browser verification. |
| Public media and budgets | Public runtime assets resolve to app/blog/builder references; `coming-soon.mp4` dominates transfer size (~5.27 MB). `ffprobe`: H.264 1920×1080 30 fps, AAC, 9.87 s, ~4.28 Mbit/s. Build budget reports media total/largest but does not fail on aggregate media size. | Inspect delivery/use and quality target; compare a re-encode and browser support before replacing. Then choose per-file/aggregate budgets from measurements. | P2: savings retain visual/audio quality and browser support; budget failures are actionable. |
| Release/deployment | CI checks and browser-tests; no deploy workflow or host config exists in repository. `dist/` remains tracked pending identification of its consumer. | Identify host, rewrite/history behavior, cache headers and whether host consumes committed `dist/` or builds source. Reproduce from a clean checkout. | P0 verify: documented release path matches deployment. |
| Render loop and animation | Tres is the only scene render-loop driver; `RenderScheduler` controls its open/close window. Other RAF users are DOM text reveal, UIkit content refresh, route-hash polling and route announcement. | Keep the one scene loop. Inspect per-call cleanup and whether each DOM animation has an independent cancellation owner during unmount. | P1: no second scene loop or uncanceled callback after owner teardown. |
| Cross-browser/GPU | Current combined production run passed 33 tests across system Chromium and Firefox (40 total; 7 opt-in renderer skips) after the backend-marker change. The focused dev Chromium host-teardown gate also passed. Earlier independent full suites passed Chromium and Firefox. WebKit cannot launch locally: cached MiniBrowser is missing ICU 74, libxml2.so.2, Flite, WebKitGTK/JSC and libjxl libraries. `nvidia-smi` cannot communicate with a driver in this environment. | Run WebKit in CI/host with declared dependencies, then actual WebGPU/WebGL and context recovery on a machine where the NVIDIA driver is available. | P0 release evidence; software render results do not prove physical-GPU behavior. |

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
audited with no proven unused direct dependency. Package identity and links
match the new repository. README describes the Vue/Tres, WebGPU and WebGL stack.
CI now runs the production build explicitly and fails when tracked generated
outputs drift from their sources; unit, type, lint, repo and browser checks
remain enabled. TypeScript 7.0.2 is released, but the installed
`typescript-eslint` peer range ends below 6.1.0, so a TypeScript 7 upgrade is
not currently compatible with the lint matrix.

**Remaining:** identify the deploy consumer for tracked `dist/` (84 tracked
files in the last audit) before changing its tracking policy; prove clean
checkout install/build and deployed static routing/cache behavior. The only
local GitHub workflow, `.github/workflows/quality.yml`, runs quality and browser
checks but has no deployment step. `public/` headers do not establish whether
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
globals, stage release ordering and boot failure exits. The route hash's
duplicate invalidation state is already removed; simplify other state only
when the trace proves it redundant. Confirm listeners, timers, observer, RAF,
media, controls, pending imports and renderer candidates reach terminal cleanup
on route leave, boot failure, recovery and Vue unmount.
The first-frame false-success and pending-cancel paths are fixed and covered by
unit tests; Chromium and Firefox production suites confirm successful boot,
renderer-failure UI, and host teardown resource ordering.
The current lifecycle pass added generation checks immediately after the
carousel and particle Vue mount awaits in `buildScene()`, and after the
development-only DevPanel import. A stale initialization now stops before it
constructs later scene controllers or republishes the runtime diagnostic
global. Existing 81 unit tests, Vue type-check, ESLint, build and budgets pass;
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

**Next audit:** finish focus, contrast, touch-target and resize/orientation
walks across EN/RU routes. Chromium and Firefox production suites now pass on
this host. Run Safari/WebKit in CI or on a host with WebKit's required system
libraries; its cached binary cannot launch here.

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
passed Chromium and Firefox production suites, Vue type-check, lint, and 81
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

Vue/Tres owns the application shell and stable scene graph. Project controllers
retain story-to-world behavior, GPU algorithms, browser policies and lifecycle
work that Tres does not supply. Recent committed cleanups removed duplicate
runtime state, renderer sizing, pointer wake logic, and stale bootstrap/UI
wrappers. The generated site origin now has one normalized source shared by
blog, builder and sitemap output. Route hash dispatch uses the RAF owner's
cancellation instead of a second stale token. Experience checks its lifecycle
generation after Vue mount awaits and after the dev-only DevPanel import.

The repo is `la6-portfolio`; `dist/` remains tracked because the deployment
consumer is unknown. `quality.yml` runs checks and browser tests but does not
deploy. Do not change release artifact policy until the actual host contract is
identified.

**Verified locally:** 93 unit tests, Vue type-check, ESLint, stdlib check,
production build and budgets pass. Current limits remain 3.03 kB startup gzip,
310.95 kB shared Three gzip and 53.84 kB UIkit gzip. An override-origin build
confirmed the generated blog, both builder locales and sitemap use the staging
origin; the normal build restored production outputs. The latest combined
Chromium/Firefox production run passed 33/40 tests; 7 opt-in renderer cases were
skipped by their explicit guards. Route, keyboard/focus, touch, responsive
overflow, localized metadata and init-error checks passed. Earlier independent
production suites passed both browsers. SceneHost teardown order passed in
dev-mode Chromium. Its gate direct-loads Contact, observes its three lazy
stages becoming ready, opens showreel, and asserts all four owners plus async
scene teardown finish before backend disposal. The cached WebKit MiniBrowser cannot launch because its
ICU 74, libxml2.so.2, Flite, WebKitGTK/JSC and libjxl dependencies are absent.
`nvidia-smi` cannot reach a GPU driver here. Browser runs use software
rendering and do not establish physical-GPU WebGPU, recovery or performance.

The route-hash cancellation change and Experience stale-init guards pass build,
type, lint and unit gates; focused cancellation tests plus the teardown browser
gate cover the relevant cleanup boundaries. Five deterministic lifecycle tests
retire Experience during carousel mount, particle mount, coordinator
initialization, carousel texture initialization, and a pending GPU prewarm;
they verify stale work stops and GPU owners remain alive until compilation
settles. The development runtime destroy hook is available during init so app
unmount can await that ordering. The loader now reports phases instead of
estimated percentages; Firefox verified the ready status alongside direct and
lazy hash navigation. The broad audit mapped runtime, app, builder, admin,
build, styling and public media; the risks and remaining source audits are
recorded in the matrix above. Renderer recovery/init failure ownership and the
remaining audit phases are still active.

**Next actions:**

1. Establish the dev builder API's actual network exposure and enforce an
   authorized boundary before treating the admin as production-safe.
2. Finish phase 2's `Experience.ts` teardown trace, including renderer recovery
   candidates and init failure; route-hash and current scene-build stale-init
   paths now have focused coverage.
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
