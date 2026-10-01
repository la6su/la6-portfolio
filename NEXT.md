# Refactor plan — la6-portfolio

This is the repository's living refactor plan and sole work queue. It describes
the intended production architecture, records completed slices and current
evidence, and must be updated whenever an agent completes or materially changes
a phase. It is newly based on the current repository and the user's chosen
TresJS reference. Removed project documents are not requirements and must not be
reconstructed from memory.

## Objective

Deliver a production-ready EN/RU portfolio with a declarative Vue 3 + TresJS
scene composition model, Three.js WebGPU renderer and TSL effects, and a tested
WebGL backend fallback. Keep the project understandable to its next developer:
clear ownership, small domain boundaries, no duplicated sources of truth, no
unreachable/dead implementation, explicit lifecycle cleanup, and verified
performance and accessibility.

Cross-browser support is a product requirement: current stable Chrome/Chromium,
Firefox, and Safari must retain the portfolio's essential content and route
behavior. WebGPU is progressive enhancement; where it is unavailable or cannot
initialize, the scene must use Three's WebGL 2 backend when available. If neither
GPU path is usable, the accessible HTML portfolio remains fully navigable.
Browser support is judged by observed capability, not by assuming a browser
brand implies WebGPU support.

The architecture reference is [three-vue-tres](https://github.com/hawk86104/three-vue-tres),
especially its pattern of describing scene hierarchy in Vue and using focused
components for behavior. Apply the pattern selectively: preserve this site's
router, rendering policy, scene transitions, portfolio content, and production
constraints. Do not port the reference's wider plugin/ecosystem choices by
default. See also TresJS's [declarative versus imperative guide](https://docs.tresjs.org/essentials/concepts/declarative-vs-imperative)
and [primitive disposal behavior](https://docs.tresjs.org/api/advanced/primitives).

## Working rules for agents

1. Read `AGENTS.md`, this plan, `package.json`, and the affected source before
   changing architecture. Treat code and current tests as evidence; this plan
   records intent and can be corrected when the code disproves it.
2. Take one vertical slice at a time. State the intended ownership boundary,
   update implementation and focused checks, then update the phase status and
   checkpoint below in the same change.
3. For scene work, prefer Vue/Tres declarations for stable hierarchy and props
   for changing values. Keep imperative code in focused controllers only when
   it owns algorithms, frame updates, or Three APIs that cannot be expressed
   cleanly as reactive scene data. Avoid a second scene graph owner.
4. Give every GPU/DOM listener, timer, observer, renderer, material, geometry,
   texture, and async task a visible owner and terminal cleanup path. Document
   shared ownership where disposal is intentionally deferred or centralized.
5. Delete only after proving no runtime, build, content-generation, or test
   consumer remains. Remove references/comments that describe deleted
   architecture in the same slice. Do not restore removed docs or old plans.
6. Keep this file concise enough to be usable: update statuses/checkpoint and
   acceptance evidence; do not append chronological session logs.
7. Run the relevant deterministic checks for each slice. Do not claim browser,
   GPU, WebGPU, WebGL recovery, or hardware performance verification unless it
   was actually performed and record the environment and result.

## Architecture target

```text
Vue application shell / router / accessible HTML content
└── persistent SceneHost (TresCanvas, one renderer, one frame-loop bridge)
    ├── declarative camera, lighting, environment and section roots
    ├── route/feature scene components (lazy where useful)
    └── focused behavior controllers for animation and domain algorithms
         └── Experience orchestration and render-demand policy
              ├── scene coordination / transforms / frame passes
              ├── renderer pipeline / TSL effects / backend recovery
              └── UI, input, audio and resource owners
```

Ownership rules:

- Vue/Tres owns stable scene-node construction and route component lifetime.
- `SceneHost` owns the persistent canvas, renderer construction, Tres context,
  backend detection, and bridge to Tres's loop. There is one renderer and one
  render-loop host.
- `Experience` coordinates application-level scene behavior; it should not be
  the catch-all implementation of UI, DOM wiring, renderer internals, or every
  frame algorithm.
- Domain controllers may mutate adopted Tres nodes for continuous algorithms;
  they do not create parallel roots or silently own Vue-declared hierarchy.
- GPU resources have one disposal owner. If an adopted node has
  `:dispose="null"`, its controller/owner must explicitly dispose its
  resources. Avoid both recursive and manual disposal of the same resource.
- HTML remains the source of accessible text and controls. Canvas effects
  enhance the experience and respect reduced motion and device capability.

## Refactor phases

Status values: `done`, `active`, `queued`, `blocked`. Mark `done` only when the
acceptance evidence exists. Reorder only when a dependency or source inspection
justifies it, and record the reason in the checkpoint.

### 0. Baseline and repository hygiene — `active`

**Completed slices**

- Corrected package identity and GitHub repository metadata for
  `la6su/la6-portfolio`; refreshed the Vue/Tres/Three/Vite toolchain within the
  current lockfile and removed the unused Vue Test Utils dependency.
- Restored working build scripts required by the current package build command;
  removed an unused evidence helper and added a bundle breakdown command.
- Added `.gitignore` and stopped tracking installed `node_modules` contents.
- Removed stale references to deleted docs and corrected the TSL article's
  obsolete local-file/version references.
- Repaired the three repository skills that linked to deleted DEVELOPMENT,
  BRAND, and PAGE_BUILDER docs; they now point agents to `AGENTS.md`, `NEXT.md`,
  and current source contracts.
- Added focused unit coverage for render demand, backend policy, stage owners,
  and scene-stage ports.
- Mapped generated source-side page artifacts and their consumers. Blog and
  approved builder HTML/per-page Less are generated from canonical sources,
  committed as Vite multi-page inputs used by `bun run dev`, and regenerated
  before production build. `prerender/home.html` is optional in a fresh
  checkout. Builder metadata saves update the collection/theme; static routes
  are published by the build-time generator.
- Audited direct dependencies, package scripts, and Node/Bun APIs against app,
  admin, configs, and generators. Every direct dependency has a source, type,
  test, or build consumer; none is proven unused. Node built-ins are used by
  generators/checks; TypeScript scripts run through Bun, and
  `wait-for-url.ts` uses `Bun.sleep`. `bun install --frozen-lockfile --dry-run`, `bun run check:stdlib`,
  and Vue type-check pass; no package or lockfile churn was justified.

**Remaining work**

- Identify the external deploy consumer for tracked `dist/` and decide whether
  versioned build output is required. Preserve it until host configuration or
  another authoritative deploy source confirms the consumer.
- The current production origin is consistently `https://justlovejazz.dev` in
  README/product identity, HTML metadata, sitemap, and deploy headers; keep the
  GitHub repository URL as package repository metadata. Revisit only if the
  deployment hostname changes.
- `dist/` has 84 tracked files and is written by Vite; source scripts only read
  it for build-budget checks and local preview serves the generated directory.
  No deploy workflow, host config, or package deploy command identifies its
  external consumer. `public/_headers` is compatible with Cloudflare Pages and
  Netlify but does not identify which platform is configured. Preserve tracked
  `dist/` until deployment intent is confirmed; do not mass-delete output.
- Added production-browser checks for direct entry to every SPA route and one
  case study, canonical metadata, EN/RU document metadata, unknown-path home
  fallback, and browser back navigation. These passed in installed Chromium.
- The case-study check exposed a metadata race: the shared Works post-render
  hook overwrote the detail page canonical URL/title. The detail view now
  reapplies its metadata after route lifecycle and language changes.
- Production route checks cover the blog index, all four articles, and builder
  EN/RU documents. The audit found and fixed a stale article link to the removed
  `designing-in-the-browser` route; every internal blog link now returns 200.
- Builder RU output is a directory index (`/p/<slug>/ru/index.html`), while its
  public URL had been advertised without `/`. Direct production preview then
  served the app shell. `builderPagePath` now emits `/ru/`, keeping direct URL,
  canonical/hreflang, and generated sitemap aligned with the static output.
- Added Playwright assertions for standalone document language, canonical URL,
  h1 presence, and the builder's no-application-script contract. Blog/builder
  production tests pass in installed Chromium.
- Renderer failure previously trapped visitors behind the permanent splash even
  when the semantic route had rendered. The error gate now offers “Continue
  without 3D”, emits the normal entrance event, removes the curtain, and moves
  focus to the main landmark. The opt-in Chromium run with WebGPU and WebGL
  disabled verified the route remains visible and focus lands on its main.
- The navigation owner already moved focus into the menu on open, but the menu
  template lacked the contracted close target. Added a semantic close control;
  production keyboard coverage confirms open → focus close → Escape → restore
  launcher focus.
- Fullscreen project modal keyboard coverage exposed two focus bugs: Tab could
  escape at a boundary, and restoration ran before the modal was fully hidden.
  The modal now wraps Tab/Shift+Tab at visible focusable boundaries and restores
  the captured trigger on UIkit's `hidden` event. The production browser cycle
  verifies the wrap, Escape close, and focus return.
- Home's visible Studio heading was an `h2` with no document `h1`; it is now the
  single page `h1`, retaining its visual classes. Direct-route browser coverage
  asserts it exists.
- Full serial production Chromium suite passes (14 passed, 2 opt-in
  renderer-init/recovery scenarios skipped); it includes route/content, menu
  focus, fullscreen focus, reduced-motion, responsive, and touch checks. A
  separate no-GPU run verifies the accessible boot error state. `vue-tsc`
  passes; full ESLint has no errors or warnings.
- Reduced-motion browser coverage verifies the preference before boot,
  zero-duration cinematic control transitions, entrance completion, and live
  Lab camera-control disable/enable as the media query changes. Key 3D and
  static content routes show no horizontal document overflow at 390px and
  1280px in production Chromium.
- A production mobile-emulation touch test confirms `(pointer: coarse)`, the
  scene canvas remains `aria-hidden` and pointer-transparent, and a real
  Chromium touch swipe scrolls the semantic route container vertically.
- Added conditional Playwright projects for Chromium, Firefox, and WebKit, a
  `bun run test:matrix` entry point, and CI jobs for unit/type/lint/repository
  checks plus the production browser matrix. `playwright test --list` confirms
  Firefox/WebKit enumerate the full suite. The mobile touch test uses a real
  Chromium CDP touch sequence and verifies semantic vertical scrolling with the
  canvas remaining pointer-transparent. Playwright-managed Firefox 155 passed
  the production suite (13 passed, 3 expected skips); this independently
  exercises routes, interactions, layout, and touch behavior in Firefox.
  The WebKit binary is installed, but a production smoke attempt could not
  launch it because this host lacks required system libraries (`libicu74`,
  `libxml2`, and `libflite1`); installing them requires sudo. The CI matrix
  installs browser dependencies and remains the WebKit execution gate.
- The splash had a timing mismatch: the normal CSS exit lasts 1.2s, but a fixed
  780ms timeout removed it early. Entry and no-scene continuation now remove
  the curtain on its own `loader-exit` animation end, with a 1.3s teardown
  fallback for browsers that do not deliver that event.
- The opt-in no-GPU Chromium scenario passed again with WebGPU and WebGL both
  disabled, including “Continue without 3D”, main landmark visibility, and focus.
- Continue the application audit with accessibility, responsive layouts, and
  offline/no-GPU content usability; keep generated blog/builder routes in the
  production browser gate.
- Replace stale phase-number and historical ADR comments in active source with
  durable ownership/behavior explanations. Preserve real behavioral
  constraints and tests; remove archaeology that no longer guides decisions.

**Acceptance**: clean install is reproducible from `bun.lock`; scripts match
real files; generated-file policy is explicit; no tracked dependency install;
type-check, unit tests, lint, stdlib audit, and production build pass.

### 1. Declarative scene ownership — `active`

**Completed slices**

- `EnvSphereOwner.vue` declares sphere nodes; `EnvSphere` is a material/palette
  controller, not a `THREE.Group` scene owner.
- `ServicesStageOwner.vue` declares stage nodes; `ServicesStage` adopts those
  nodes and animates them without subclassing `THREE.Group`.
- Extracted stage references and lazy stage ports to
  `src/app/useSceneStages.ts`; section roots derive names from `WORLD_SLOTS`.
- Extracted route-stage warmup into `prewarmCurrentRouteStages`.
- Added explicit disposal for resources whose Tres nodes opt out of recursive
  disposal; fixed EnvSphere's animated-weight-to-material-color mapping.
- `WorksPlaneStage` no longer subclasses `THREE.Group`: it adopts the stable
  Vue-declared root, controls visibility/transforms, and removes only its
  dynamic leaves on teardown. The generic lazy-stage lifecycle now supports
  controller objects as well as scene objects.
- Works card leaves are published through a typed subscription and mounted by
  a Vue `v-for` as per-card `CasePlaneNode` owners. The component declares each
  `<TresMesh>`, acquires/releases shared geometry, and supplies its node to the
  TSL behavior controller. The Works stage no longer constructs or attaches
  the card meshes itself.
- `CasePlane` is now a behavior controller around its adopted mesh rather than
  a `THREE.Mesh` subclass. Geometry leasing and TSL material construction are
  shared with `BakuCarousel`, avoiding a second implementation; the card
  component owns the mesh/material/geometry cleanup and the Works stage owns
  decoded case textures. The lazy stage waits for declared cards to report
  ready before resolving its mount.
- Added a Playwright smoke gate for direct Works entry, project image loading,
  SPA navigation home and back, and browser/console errors.
- `EnvSky.vue` now opts out of Tres disposal for its borrowed `EnvSphere`
  material and explicitly disposes its locally declared plane geometry. This
  prevents the consumer from disposing the shared material ahead of its owner
  and makes teardown ownership explicit.
- Tightened the SceneHost readiness contract: its sky slot now exposes the
  actual mounted `Mesh<PlaneGeometry, MeshBasicMaterial>` type instead of
  `unknown`. Audited current ownership against the installed TresJS 5.9.2
  reconciler and current TresJS disposal docs.
- `ContactCyprusStage` is now a behavior controller that adopts the Vue-owned
  root. `ContactCyprusStageOwner.vue` declares that root and renders the lazy
  GLTF scene as a `primitive`; the controller owns the loaded geometry and
  materials, publishes the model only after Vue mounts it, and releases the
  model without detaching the declared root. Added an owner-boundary unit test
  and a production browser smoke for direct Contact entry and GLB loading.
- `ContactTypographyStage` now adopts its Vue-declared root and publishes its
  dynamic glyph object into `ContactTypographyStageOwner.vue`. The root's
  visibility remains the coordinator's typed render-demand signal, while
  `WireframeTypography` owns glyph animation and geometry/material disposal.
  Removed obsolete keep-visible markers from this route-only typography path.
- `PointerInkStage` no longer subclasses `THREE.Group` or constructs a scene
  mesh. The shared `PointerInkStageOwner.vue` declares root and plane for both
  Contact halo and Manifesto wash. The controllers retain TSL algorithms and
  own their material plus ref-counted geometry lease; tests cover root adoption
  and last-owner geometry disposal.
- `LabGamepad` is now a behavior controller, not an `Object3D` experiment.
  `LabGamepadOwner.vue` declares its complete hierarchy, including crank,
  buttons, screws, and screen. Geometry/material construction stays in an
  explicit resource factory; the controller adopts only the animated root and
  crank pivot and disposes resources once. The authored pose is shared with the
  Vue template, and the Lab owner remains lazy.
- `WireframeTypography` now emits ordered glyph geometries and animates adopted
  mesh refs instead of constructing a `THREE.Group` of glyph meshes.
  `WireframeTypographyOwner.vue` declares the per-glyph meshes; the typography
  controller owns their geometries/material and preserves reveal, bob, theme,
  and reduced-motion behavior.
- `JunniParticles` is now a TSL behavior/resource controller rather than an
  `InstancedMesh` subclass. `JunniParticlesOwner.vue` declares its instanced
  node; the controller adopts it, updates count/visibility, and owns geometry
  and material disposal. The controller owns one declared node and has an
  explicit cleanup path. A unit test covers adoption, count changes, and
  single-owner disposal.
- `BakuCarousel` is now a behavior controller rather than a `THREE.Group`.
  `BakuCarouselOwner.vue` declares its group and all 12 `CasePlaneNode` cards;
  the controller publishes texture-backed card assets, adopts mounted card
  controllers, and retains drag/raycast/momentum behavior. The controller
  releases one shared-texture cache lease per unique URL; each card owner
  disposes its own material and geometry lease. Removed a duplicate drag
  release snap timer. Added controller/root ownership coverage.
- Audited the boot-static cursor ribbon and intro burst. Their controllers had
  disposed resources already adopted by Tres nodes, creating two disposal
  owners. Resource disposal now stays with the mounted Tres leaf; the cursor
  owner separately disposes its displaced placeholder geometry. Added tests
  against the installed `@tresjs/core` disposer to prove each active leaf
  geometry/material is disposed once.
- Added `WorksInstallation` controller tests for Vue-node adoption, project
  and room application, node release, and one-time controller material
  disposal. Its geometry refs remain Vue-declared; controller-created shared
  materials use the explicit `:dispose="null"` boundary and stage disposal.
- `ShowreelTheater` keeps its separate render target and media/TSL behavior,
  while `ShowreelTheaterOwner.vue` now declares the fullscreen quad through
  TresPortal into that private scene. The controller mounts the target lazily
  on the first open request, waits for Vue/Tres before entering, and unmounts
  the portal on teardown. Tres owns the quad geometry/material; the theater
  owns video/poster textures and its HTML video element. Added production
  browser coverage for two open/Escape-close cycles and controller tests for
  lazy mount, reuse, teardown, and close-during-mount races.
- `SectionGroups` now strictly adopts the six roots emitted by
  `SceneGroupRoots.vue`. Removed its unreachable fallback that constructed
  `THREE.Group`s and inserted them into the scene, plus the obsolete geometry
  visibility/resource sweep and its `sceneRuntimeState` weak set. Tres owns the
  root lifetime; SectionGroups only disposes Works behavior controllers and
  its particle texture. Added tests for the mount contract and retained root
  ownership after controller disposal.
- GLTF resource disposal now deduplicates shared geometries, materials, and
  textures across an object tree. Contact's Cyprus loader releases source
  material graphs once before replacing them with route-owned materials, and
  teardown releases each retained GPU resource once. A focused disposal test
  covers shared geometry/material references and aliased texture slots. Removed
  the now-unused single-material disposal helper so there is one ownership
  path for this loaded subtree.

**Remaining work**

- Browser stress currently exercises three Works and Contact route
  mount/release cycles against the production build, checking one persistent
  canvas and no browser errors. Extend repeated-cycle/resource-plateau evidence
  to other route owners where useful. Concrete Works and Contact loader tests
  cover disposal during pending loads, late success, late failure, partial
  success, and decoder cleanup. Generic stale-load failure, attach/import
  races, and async route release are also covered.
- Keep WebGPU and WebGL hardware evidence separate; software browser checks do
  not complete hardware backend or performance acceptance.

**Acceptance**: each scene subtree has one construction owner, each behavior
controller adopts declared nodes through explicit typed inputs, route changes
have deterministic mount/dispose behavior, and owner-level tests cover the
observable animation/lifecycle contracts.

### 2. Runtime orchestration and lifecycle boundaries — `active`

Current focal files include `src/Experience/Experience.ts` (large orchestration
class), `src/Experience/Renderer.ts`, `src/Experience/SceneCoordinator.ts`,
`src/Experience/ExperienceUI.ts`, `src/app/SceneHost.vue`, and the frame-pass,
scheduler, and lifecycle modules. `SceneCoordinator` already delegates to
`SectionStateMachine`, `SceneTransformPass`, and `SceneFramePass`; treat that as
existing architecture, not work to recreate.

**Ownership map (source audit, 2026-10-01)**

| Boundary                                                 | Current owner                                                                                            | Lifetime / evidence                                                                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bootstrap attempt                                        | `entry-app.ts`                                                                                           | One `Experience` is constructed and `init()` awaited per attempt; failed attempts call `destroy()`. Once `SceneHost` settles, retry is disabled. |
| Canvas, Tres context, camera/scene roots and loop bridge | `SceneHost`                                                                                              | Persistent Vue host; its ready contract is passed to `Experience` as borrowed/adopted instances.                                                 |
| App behavior, renderer pipeline and frame demand         | `Experience`                                                                                             | Composition root; coordinates renderer, frame passes, route ports, DOM/UI and readiness.                                                         |
| Route stage mount/release                                | `StageRegistry` + `useSceneStages` + Vue stage owners                                                    | Route feature nodes are Vue-declared; lazy stages own import/mount generations and expose focused controllers.                                   |
| Frame state/transforms/work                              | `SceneCoordinator` and its passes                                                                        | `Experience.update()` delegates scene behavior and applies renderer work only when demand policy requires it.                                    |
| External lifecycle resources                             | Their explicit owners (`ExperienceUI`, `ShowreelController`, `ContentReveal`, `Cursor`, scheduler, etc.) | Teardown is paired in `Experience.destroy()`; scheduler stops first and lifecycle generation invalidates async continuations.                    |

The bootstrap audit found no caller that needs concurrent or repeated
`Experience.init()` support: `boot()` awaits a single invocation per attempt,
and a settled SceneHost prevents retry. Do not add an initialization
promise/manager unless a new caller or test demonstrates that contract is
needed. Keep `Experience` as composition root; do not extract a wrapper solely
to shorten the file.

**Completed slices**

- Mapped `Experience` boot, host adoption, route stages, frame coordination,
  external owners, and teardown against `entry-app`, `SceneHost`,
  `StageRegistry`, `useSceneStages`, and `SceneCoordinator`. The audit did not
  justify another lifecycle module or repeated-init support.
- `LazyStage` now records terminal release per stage instance. Previously,
  disposing during an async host `attach()` released the stage immediately and
  the stale continuation released it again; delayed dynamic imports had a
  separate late-result path. Release now returns a shared completion promise,
  so asynchronous teardown remains exactly once and repeated dispose calls can
  await it. `LazyStage.test.ts` covers disposal racing pending attach/import,
  async detach ordering, and a load failure arriving after route re-entry; the
  failure releases only its retired stage and leaves the replacement mounted.
- Audited route replacement and host teardown across `ExperienceUI`,
  `StageRegistry`, `useSceneStages`, and `SceneHost`. The host previously
  cleared only Works and Showreel declarations; Contact, Manifesto, Lab,
  carousel, and particle refs remained captured by stage ports. Added one
  `useSceneStages.clear()` teardown boundary, used it from `SceneHost`, and
  covered clearing all ten Vue-declared slots.
- Replaced phase/ADR/task-ID archaeology in `Experience.ts` with current
  ownership and runtime-invariant comments; removed notes that only recorded
  deleted code. Renamed `buildWorld()` to `buildScene()` to match the current
  Tres composition it performs.
- `SceneHost` stops the loop and detaches live ports in `onBeforeUnmount`, then
  performs its final renderer disposal in the parent `onUnmounted` hook, after
  Tres's custom scene tree has unmounted. Source inspection of TresJS 5.9.2
  exposed that its renderer-manager hook calls `renderer.dispose()` before
  `unmountCanvas()` releases that custom tree. The factory renderer now defers
  that automatic call; SceneHost flushes the idempotent disposal after child
  owner cleanup. Explicit failure and recovery cleanup bypass the deferral.
  Focused tests verify deferred disposal, immediate owner cleanup, and exactly
  once behavior. A Vue lifecycle harness reproduces Tres's manager-hook then
  custom-tree-unmount order and asserts that the scene owner disposes before
  the backend.
- Every `StageRegistry` release now awaits its matching Vue/Tres port detach
  before controller disposal. Final `Experience.destroy()` also waits for all
  outstanding stage releases before sweeping case textures and disposing the
  renderer. Tests cover Cyprus detach-before-dispose and a repeated full
  registry teardown while the first detach is pending.
- Unified renderer async initialization now disposes the new instance if
  `init()` rejects before ownership can transfer to the recovery caller. If
  disposal also rejects, both failures remain available in an `AggregateError`.
  Recovery initialization also accepts the owner `AbortSignal`: a pre-aborted
  start never initializes, and an init that settles after teardown disposes
  itself instead of becoming live. Focused tests cover normal success, failed
  init cleanup, dual failure, pre-aborted start, and late completion. Tres's
  initial init error path separately retains the renderer in `SceneHost` for
  cleanup through its `@error` handler. The WebGL restore wait already tests
  removal of its event listener and timeout when the renderer owner aborts.
- Audited failed boot through Tres 5.9.2 source: failed renderer init emits the
  canvas `error` event; `SceneHost` disposes its retained factory instance and
  rejects the one-shot ready bridge; bootstrap catches that rejection, shows
  the alert state, and does not offer in-page retry after the host settles.
  Tres's renderer manager also disposes at unmount, so the shared dispose
  boundary is now covered for repeated owner calls. An opt-in production
  Chromium test disables WebGPU and WebGL and verifies the accessible boot
  error state, no false Enter button, and no unhandled page errors.
- Audited shared pavilion/sky ownership: `EnvSphereOwner` owns its six
  materials and five geometries; `EnvSky` borrows only the sky material and
  releases only its plane geometry. Both remain mounted across route changes.
  Their `:dispose="null"` boundaries prevent a second node-level owner. On
  final host teardown, SceneHost now defers Tres's earlier renderer-manager
  dispose callback until after those Vue owners release their resources.
- Centralized development-only `info`, `debug`, and `log` output behind
  `devDiagnostic`, removing duplicated mode checks from runtime owners while
  leaving actionable `warn`/`error` reports visible. Unit tests verify output
  in development and silence in production; full ESLint now reports no
  warnings.
- Added a development-only Playwright lifecycle trace and a real `SceneHost`
  teardown test. It destroys `Experience` and unmounts the Vue app, observes
  navigation/listener cleanup and scene-owner disposal before the final active
  backend disposal, and asserts no page error. The test runs against Vite dev
  mode so production output stays free of test hooks. Wired
  `bun run test:host-teardown` into the browser CI job and README quality
  commands.
- Expanded the actual host teardown test to cover `EnvSky` geometry cleanup,
  the cursor placeholder geometry, and Showreel quad unbinding alongside
  EnvSphere resource disposal. Full-runtime testing exposed that a fallback
  renderer candidate did not share SceneHost's deferred disposal boundary and
  that `Experience.destroy()` held render-pipeline cleanup until route detach.
  Replacement candidates now use the same deferred owner; pipeline/recovery
  cleanup starts when runtime teardown starts, while the final texture sweep
  waits for stage detach. The Chromium test verifies all four owner events
  precede the final backend disposal and the app's navigation listeners stop
  intercepting events after unmount.

**Work**

- Separate remaining responsibilities into modules only where boundaries are
  cohesive: boot/readiness, frame activity collection, route-stage activation,
  input/event subscriptions, and teardown are candidates, not mandatory file
  names.
- Keep `Experience` as an understandable composition root. Avoid a generic
  service container, broad dependency injection framework, or wrappers that
  only forward calls.
- Make initialization and teardown idempotent under route changes, Vue
  unmount, HMR, failed renderer init, and device-loss recovery. Guard stale
  async completions with lifecycle generations where necessary.
- Confirm window/document handlers, timers, media queries, RAF requests, audio,
  controls, stage promises, and renderer callbacks are all released.

**Next focused slice**

- Keep `Experience`, router app, and SceneHost teardown boundaries aligned;
  cover pending stage detach and active-renderer disposal under repeated
  shutdown. Verify a live HMR websocket/update on direct local access and
  confirm Vue/Tres edits do not duplicate the persistent renderer. Keep the
  proxy-safe mode available for the gateway that cannot carry the HMR client
  and socket reliably.

**Acceptance**: ownership map is reflected in code; duplicate state is
removed; init/failure/recovery/dispose behavior is explicit and covered by
focused tests; no route transition changes the single-loop/single-renderer
invariant.

### 3. WebGPU, TSL, fallback, and render scheduling — `active`

Relevant modules include `src/core/unifiedRenderer.ts`, `rendererBackend.ts`,
`renderDemand.ts`, `RenderScheduler.ts`, `RenderPipeline.ts`,
`WebGPUPostPipeline.ts`, `PostProcessingManager.ts`, `DeviceCapability.ts`,
`src/Experience/Renderer.ts`, and `src/Experience/SceneFramePass.ts`.

**Work**

- Document and verify the actual supported backend matrix for pinned Three.js:
  native WebGPU, WebGPURenderer with WebGL backend, unsupported capability, and
  constrained/software adapters. Use installed types/implementation and
  official docs as evidence; do not assume WebGLRenderer and WebGPURenderer are
  interchangeable.
- Maintain a browser matrix for current stable Chrome/Chromium, Firefox, and
  Safari/WebKit. Exercise real browser builds for route/content startup, resize,
  reduced motion, and backend selection. Exercise WebGPU only where the tested
  browser/device exposes it; require WebGL 2 fallback for the normal no-WebGPU
  case and verify accessible no-GPU behavior when both APIs are unavailable.
  A browser brand/version alone is not evidence that WebGPU is available.
- Audit TSL node creation, shader compilation, uniform/material updates,
  post-processing graph ownership, and CanvasTexture/other fallback parity.
  Keep capability branches narrow and observable.
- Verify demand rendering settles to zero idle ticks/draws, resumes from every
  input source, handles hidden-tab and reduced-motion policies, and coalesces
  invalidation without dropping visible changes.
- Review device-loss/context-loss recovery for bounded attempts, same-canvas
  behavior, overlay cleanup, pipeline reconstruction, and terminal state.
- Measure expensive passes and resource counts on supported hardware; optimize
  based on evidence, not speculative shader rewrites.

**Completed slices**

- WebGL context-restore waits now accept an abort signal and remove their
  timeout and canvas listeners immediately when the renderer owner is disposed.
  `Renderer.dispose()` aborts its in-flight recovery wait. A repeated device
  loss callback during recovery now delegates to Three's handler without
  exhausting the bounded retry budget or publishing a false terminal failure.
  Focused tests cover restored-event completion, abort cleanup, and ignoring a
  duplicate loss while recovery is active.
- Removed eight unsafe `any` casts from CasePlane and the Contact/Manifesto
  ink TSL paths. CasePlane now uses the concrete uniform resource types; the
  shared ink-field contract accepts the actual `Node<'float'>` expressions.
  TSL expressions and smoothstep argument order are unchanged. Vue type-check,
  all 67 unit tests, and full lint pass; lint warnings fell from 15 to 7, all
  remaining warnings are `console` statements in runtime diagnostics.

**Remaining work**

- Exercise recovery through the actual renderer on physical WebGPU and forced
  WebGLBackend hardware; unit tests only cover the cancellable DOM wait and
  policy helpers. Verify teardown during both restore windows in a browser.

**Acceptance**: deterministic policy/unit tests pass; real browser checks cover
native WebGPU where supported and forced WebGL backend; the browser matrix
covers Chrome/Chromium, Firefox, and Safari/WebKit with the appropriate GPU
capability path; context/device recovery and unsupported states behave as
designed; settled scene has no unnecessary loop/draw; no unbounded resource
growth across route changes.

### 4. Application, content, accessibility, and production behavior — `active`

Audit router/views, `src/core/i18n.ts`, content/blog generation, builder/admin,
navigation and overlays, styles, and all shipped HTML paths.

**Work**

- Trace each route and content path through source, generation, and deployment;
  remove duplicate content/configuration only after establishing the canonical
  source and generated-output contract.
- Verify EN/RU route/content parity, direct deep links, browser history, title
  and metadata, not-found behavior, and generated sitemap/robots/canonical URL
  correctness.
- Check keyboard operation, semantic markup, focus return/trapping, reduced
  motion, readable contrast, touch scrolling, and screen-reader names for
  navigation, menus, project overlays, and canvas-adjacent controls.
- Check loading/error states, no-scene mode, WebGPU unsupported mode, and
  partial feature failure. The portfolio's essential information must remain
  available without successful GPU initialization.
- Audit responsive layout, resize, DPR changes, low-end/mobile capability,
  asset loading and broken links.

**Acceptance**: automated route/build checks plus browser walkthrough at
desktop and mobile sizes in Chrome/Chromium, Firefox, and Safari/WebKit; EN/RU
navigation works; key controls are keyboard accessible; content remains usable
when the scene is disabled or unsupported.

### 5. Performance, dead-code removal, and release gates — `queued`

**Work**

- Build a source-to-output map for scripts, content generators, public assets,
  generated files, and routes. Search imports/dynamic imports, HTML references,
  CSS URLs, and script inputs before deleting a candidate.
- Remove unreferenced files, duplicate implementations, obsolete compatibility
  code, stale generated output, and misleading comments in reviewable batches.
- Revisit bundle budgets and route-level chunking against actual user impact;
  make budgets stable and tied to intentional outputs. Record analyzer reports
  outside the repository unless a report is explicitly a maintained artifact.
- Check image/texture formats and dimensions, font subsets, lazy loading,
  shader compile cost, post-processing resolution, GPU resource lifetime, and
  CPU frame cost.
- Verify deployment build from a clean checkout and inspect generated HTML,
  sitemap, asset paths, and cache behavior.

**Release acceptance**: type-check, unit suite, lint, stdlib audit, clean
production build and budgets pass; browser smoke covers routes, locale,
responsive behavior, accessibility essentials, rendering fallback, and recovery
across Chrome/Chromium, Firefox, and Safari/WebKit (with WebGPU checks scoped to
capable environments); hardware-specific performance results are recorded for
the actual test device.
No known dead active source path, orphaned output, uncaught lifecycle error, or
unowned persistent GPU resource remains.

## Current checkpoint

- **Active phase**: 0–4; phase 5 queued. Runtime ownership mapping
  and the first async release race fix are recorded above; no new module
  boundary was justified by the audit.
- **Next action**: complete repeat-shutdown coverage across Experience, route
  stages, and host; then continue keyboard routes beyond the menu/modal,
  orientation/resize and
  touch-target states; verify WebKit in CI and scene-failure behavior on
  capable GPU hardware. Chromium and Playwright
  Firefox projects now run locally. A WebKit production smoke was attempted;
  browser launch is blocked by missing system libraries, with CI configured to
  install them. `dist/` remains pending identification of its external deploy
  consumer, so keep its tracked state intact.
- **Verification for this checkpoint**: failed renderer-init cleanup and
  cancellation now have six focused renderer tests; `bun run test:unit` passed
  (24 files / 72 tests), `bun run type-check:vue` passed, and full ESLint now
  reports 0 errors and 0 warnings. Prettier and
  `git diff --check` passed. `bun install --frozen-lockfile --dry-run` and
  `bun run check:stdlib` passed; the dependency audit found no unused direct
  package. Current production gates: `JLZ_CHROMIUM_PATH=/usr/bin/chromium bun
run test:serial` passed after a production build (14 tests, 2 opt-in renderer
  scenarios skipped); Playwright Firefox passed its production suite (13
  passed, 3 Chromium-only scenarios skipped). The separate
  `JLZ_RENDERER_INIT_FAILURE_CHROME=1` run passed in production Chromium with
  WebGPU and WebGL disabled. Reduced motion covers boot, CSS transition state, dynamic Lab
  controls and scene-free entrance; mobile/desktop overflow checks passed at
  390px and 1280px. Updated Works and Contact checks each performed three route mount/release
  cycles, retained one canvas, and reported no browser errors. Current full
  lint reports 0 errors and 0 warnings. `git diff --check` passed.
  The repository ESLint config ignores `.vue` files and `vue-tsc` checks their
  types. Browser checks covered Works' Vue-declared carousel and particle
  children, Contact typography/ink and Cyprus GLB load, Lab route/canvas, and
  two Showreel portal open/close cycles; all project textures and the GLB
  returned HTTP 200. Browser used software Chromium with `WebGLBackend`, not
  physical-GPU WebGPU. `SceneNodeDisposal.test.ts` verifies
  the installed Tres disposer releases boot cursor/burst geometry and material
  exactly once;
  bundle breakdown completed for Three and lab controls. Build reports 17.7 MB
  total public media, including a 16.35 MB `coming-soon.mp4`; phase 5 should
  verify whether that asset and its delivery size are intentional.
- **Browser/recovery gap**: the opt-in real-renderer WebGL context-recovery
  scenario did not recover under this host's software Chromium/SwiftShader
  setup and surfaced Three's unsupported state. This does not establish
  whether the cause is the software driver or application recovery ordering;
  keep recovery acceptance open and reproduce on hardware. The
  Playwright-managed Firefox 155 full suite now passes. User also confirms
  Firefox works in their environment. Playwright WebKit is installed but the
  production smoke cannot launch until the host has its required system
  libraries; CI is configured to install them. Do not mark the cross-browser
  matrix complete until WebKit has actually passed.
- Actual SceneHost unmount ordering is now browser-observable: `bun run
test:host-teardown` passed in Chromium, and `bun run build` passed with the
  dev-only trace hooks absent from `dist/`. The CI browser job now executes this
  teardown check after the production matrix.
- Teardown test now destroys Experience and unmounts Vue, then confirms
  EnvSphere, EnvSky, cursor placeholder, and Showreel quad cleanup precede the
  final active backend disposal; navigation events are no longer intercepted.
  Replacement WebGPU/WebGL renderer candidates share the SceneHost deferred
  disposal boundary. `bun run type-check:vue`, `bun run lint`, nine focused
  renderer unit tests, 72 unit tests overall, the system-Chromium teardown
  test, `bun run build`, and the production Chromium serial suite passed (14
  passed, 3 expected skips). The startup renderer may be disposed earlier when
  capability policy replaces it with the final backend; the teardown assertion
  intentionally checks the final active renderer disposal.
- Development workflow now has two explicit Vite modes: `bun run dev` keeps
  the no-client proxy-safe path; `bun run dev:hmr` uses Vite's built-in client
  and default WebSocket for direct local/LAN access. HTTP checks confirmed the
  default mode omits the active client and serves the stub, while HMR mode
  serves Vite's real `/@vite/client`. A live WebSocket update cycle through
  the chosen development route still needs verification.
- **Environment gap**: this host did not expose a working NVIDIA driver to
  `nvidia-smi`; native WebGPU and real GPU recovery/performance acceptance is
  not yet evidenced. Do not mark phase 3 or release hardware gates complete
  from unit/build checks alone.

## Authorized follow-on after release acceptance

Once every release-acceptance item above is evidenced, perform a fresh,
independent repository audit across application code, generated content,
build/deploy inputs, assets, dependencies, tests, and runtime behavior. Read and
install only the skills needed for findings that require deeper domain review
(for example Three.js/TresJS/WebGPU, accessibility, web performance, or the
actual deploy platform); retain the evidence and tool versions used. From that
audit, replace this completed work queue with one detailed, evidence-based
phased plan, create a new long-running goal for its highest-priority findings,
and continue the audit → plan → implementation → verification cycle until the
project meets production-quality architecture and performance gates. Keep one
canonical queue and do not create the follow-on goal before this plan's release
acceptance is complete.

## Update protocol

At the end of a substantive slice, edit the affected phase's status and
completed/remaining bullets, then refresh **Current checkpoint** with the next
small action and actual check results. Remove completed bullets from the
remaining list, but retain concise completed milestones as architectural
history. If a requirement changes, amend the objective/phase and record the
reason here. `AGENTS.md` points to this file; no second plan, roadmap, or
session-log document should be created.
