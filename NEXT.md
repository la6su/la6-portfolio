# Refactor plan

This file is the live work queue for agents. Keep decisions and current
evidence here; put no session diary or repeated implementation history in it.
Update the relevant phase when code or evidence changes.

## Goal and constraints

Deliver a production ready EN/RU portfolio on Vue 3, TresJS 5, Three.js
WebGPU/TSL, and WebGL2 where Three selects that backend. Keep the codebase
small and easy to change. Vue owns UI and declared scene composition; Tres
owns Vue/Three integration and its render host; Three owns GPU primitives and
TSL; Cientos owns controls it already provides. Project code should implement
portfolio behavior, bespoke visuals, and only the browser policy the libraries
do not provide.

Use [TvT.js v5](https://github.com/hawk86104/three-vue-tres) as a reference
for focused declarative composition and framework delegation. Do not copy its
editor or product-specific systems. Prefer deletion or library APIs over new
wrappers. Keep imperative Three code for generated geometry, GPU algorithms,
and behavior with no declarative library equivalent. Do not split files solely
to reduce line counts, preserve abstractions for tests, or optimize without
measured evidence.

The product is an EN/RU portfolio for distinctive business solutions through
data-informed creative direction, automation, speed, performance, and style.
The 3D layer supports the work and content; it must not block semantic access,
route navigation, or the no-scene continuation path. The intended deployment
uses the existing static output and reverse-proxy setup; preserve its public
routes and generated release inputs unless source evidence proves a change is
needed.

## Autonomous execution contract

- Treat this file as the only work queue. Continue the active phase after each
  coherent slice; do not wait for a new prompt between phases.
- Make reversible source, config, documentation, and generated-output changes
  directly when callers and product intent establish the right behavior.
- Ask only when product behavior cannot be inferred, an external account or
  physical machine must be operated, or a destructive/irreversible action is
  required. Keep independent audit work moving while such a question is open.
- Preserve pre-existing user changes. Before every slice, inspect `git status`
  and diff; after it, inspect the complete resulting diff, including tracked
  build artifacts.
- Keep evidence proportional and factual. Do not add or run test suites unless
  explicitly requested. Use lint, type-check, static inspection, and the
  production build release gate; use browser/hardware checks only where those
  environments are available. Never claim a check that did not run.
- Before closing any phase, record decisions, removed seams, evidence, and
  remaining engine/hardware limits here. Commit coherent verified slices using
  a message that describes the simplification, as required by repository
  instructions.

## Production acceptance criteria

1. A direct load of every public route works in EN and RU, including case-study
   and blog routes; canonical metadata and generated sitemap agree with routes.
2. Keyboard, screen-reader, reduced-motion, responsive, and no-scene behavior
   remain usable without WebGPU or a working 3D renderer.
3. Tres owns one persistent canvas, Three owns one unified WebGPU renderer with
   automatic WebGL2 backend selection, and there is one RAF host and one
   demand scheduler. Startup, device loss, route changes, HMR and teardown have
   explicit owners and bounded failure paths.
4. Every scene node, listener, timer, observer, media element, texture,
   material, geometry, render target, and GPU owner has a deterministic release
   path. Repeated route/host lifetimes return owned resources to baseline.
5. Vue/Tres owns stable declared hierarchy and transforms; imperative code is
   limited to generated assets, animation, GPU algorithms, and browser policy
   with no equivalent library feature. No helper or compatibility seam lacks
   a current consumer and documented reason.
6. `bun run build` passes, including type-check, stdlib shim verification,
   prerender, sitemap generation, and bundle/media budgets; tracked release
   artifacts match sources. Lint passes. Tests are run only on explicit user
   request.
7. WebGPU/TSL, WebGL2 backend selection, visual parity, context/device recovery,
   idle rendering, reduced motion, and lifecycle behavior have evidence in
   available engines/hardware. Anything unavailable is listed as an open gate,
   not represented as proven.

## Current architecture and evidence

The app has a persistent Vue shell and Tres canvas. Route views own semantic
content and section state. `SceneHost` declares stable scene owners and lazy
route stages; `Experience` coordinates bespoke story behavior, renderer
pipeline, and demand scheduling; `SceneCoordinator` and
`SceneTransformPass` hold scene update policy and scroll transforms;
`StageRegistry`/`LazyStage` manage route-scoped async scene lifetimes. Unit
tests are under `tests/unit`; browser specs remain under `tests`.

The lazy showreel still waits for the first open before assigning its video
source. On terminal teardown it now clears the source and calls `load()` after
pausing, aborting an active media fetch before removing the element and
disposing its textures.

Current known facts:

- TvT v5 architecture audit on 2026-10-03 compared every custom subsystem
  with the installed library APIs (`@tresjs/core` 5.9.2, `@tresjs/cientos`
  5.9.2, `three` 0.186.1) and the TvT v5 reference. Ownership is single-owner
  per resource: Tres owns the canvas, the one RAF host, and the renderer
  manager; `RenderScheduler` owns frame demand through the SceneHost loop
  port; Vue/Tres declares the scene graph and the 22 `src/app/scene` owners
  adopt nodes instead of building them. The World controllers are legitimate
  imperative owners of generated geometry, TSL graphs, and loader lifecycles;
  a whole-tree consumer scan found no dead module in `src`. Cientos adoption
  is bounded by the single WebGPU/TSL render path: Lab `OrbitControls` is the
  one adopted component, while Environment/useEnvironment and the
  GLSL-ShaderMaterial family (Stars, Sparkles, Sky, transmission, FBO, and
  reflector components) would import classic WebGL symbols that
  `three-webgpu-compat` stubs, so they stay non-candidates until that
  constraint changes. Verified keep verdicts (do not re-litigate without new
  library evidence): the custom render-demand seam (Tres 5.9.2 on-demand
  keeps ticking its RAF and cannot express settle-based demand),
  `Experience/Camera` (Cientos CameraShake/MouseParallax do not map onto
  WorldConfig section targets or the Lab yield handoff), the
  caseTexture/ShowreelTheater/ContactCyprusStage loaders (the Cientos
  loaders lack refcount leases, abort, prewarm, and deferred disposal), and
  the authored TextReveal/NoiseText/BlurFade effects. The
  EventBus↔ThemeManager import edge is type-only and erased at runtime; it
  needs no fix. The remaining pre-migration surface is the imperative UI
  layer over Vue-rendered DOM, planned in the phase-1 route-UI migration
  plan below.
- Deep audit found a shared inverse-theme defect on content routes, including
  Works and Manifesto: `ContentReveal` matched the route DOM section ID against
  `WorldConfig.domSection`, but content configs use `content-0..5` while the
  pages publish names such as `works-01` and `manifesto-purpose`. The fallback
  treated every unmatched section as light, so inverse mode had the wrong
  baseline polarity and wrong world-slot index. It now maps content section
  indices onto shared world slots (slot 0 remains the Contact footer). Initial
  route state is resolved from the active DOM section. Later navigation
  already reports canonical world slots, so its payload now names that value
  `worldIndex`; route stages convert it to their local index with
  `INTRO_SLOT_INDEX`. A manual headless Chromium interaction confirmed the
  toggle state on both routes. Works now has a light shell background with
  dark heading text when inverse is active. Manifesto's shell tokens compute
  correctly too, but its screenshot is inconclusive because the headless
  WebGPU device fails while creating a buffer; physical-GPU parity remains
  open.
- Baseline audit checks on 2026-10-02: `bun run lint` and
  `bun run type-check:vue` both pass. No test suite was run.
- After the route-theme fix, `bun run build` passed end to end: Vue type check,
  Cientos/Three compatibility-shim liveness, all prerender steps, sitemap
  generation, Vite production output, and configured gzip/media budgets.
  Tracked hashed `dist` assets were regenerated with the source change. The
  largest public asset remains `coming-soon.mp4` at about 5.3 MB; it fits the
  current media budget. Manual browser evidence and its GPU limitation are
  recorded below.
- Phase 1 trace found two worthwhile seam fixes. The page-section event used a
  vague `index` name for the canonical world slot, while Experience separately
  subtracted a literal `1` for route-stage indices; the payload is now
  `worldIndex` and conversion uses `INTRO_SLOT_INDEX`. Tres 5.9.2's
  `loop.onBeforeLoop()` returns `{ off }`; SceneHost now owns and releases that
  subscription on reconfiguration and unmount. A first type-check caught the
  actual object return shape (not a callback); the corrected full production
  build passes. The ownership map and remaining boundary review are below.
- Inspection of Tres 5.9.2's installed `useRendererManager` found that its
  size and pixel-ratio effects close over the renderer constructed at setup.
  Updating `renderer.instance` after device recovery does not retarget those
  effects. `Experience` now observes Tres width, height, and pixel ratio;
  `Renderer` mirrors changes only after a recovery replacement, leaving Tres
  as the sole size writer for the normal renderer. The first recovery writes
  the current viewport immediately. `bun run build`, `bun run lint`, and
  `git diff --check` pass after this fix. Device-loss/resize runtime evidence
  remains an open hardware check.
- Lifecycle trace against installed Tres 5.9.2 source confirms one primary
  renderer `init()` before Tres sizes it and publishes `ready`; SceneHost then
  binds and stops Tres's loop, awaits static node slots, inspects the explicit
  backend marker, and only then hands the host to Experience. Experience builds
  the scene and environment, raises one scheduler invalidation, and its
  successful `RenderPipeline` draw resolves the 20-second readiness gate.
  `ExperienceRuntime` publishes `experience-ready`; the shell delays
  `webgl-ready` for the splash intro. Normal teardown stops the scheduler,
  releases route and Vue-declared owners, then SceneHost flushes deferred
  renderer disposal after Tres subtree unmount. This trace found an init-error
  ordering defect: `SceneHost.onError` disposed the renderer while its declared
  owners remained mounted, and Experience startup failure left the host mounted
  after tearing down its controllers. Startup failure now unmounts SceneHost,
  so Vue/Tres owners release before deferred renderer disposal. Lint/build
  pass; failure-order runtime evidence remains unavailable.
- The SceneHost sizing review confirms there are no direct `setSize` or
  `setPixelRatio` calls in the host path. Installed Tres source applies both
  values to its captured renderer during initialization and tracks the live
  `dpr` prop. The app's direct writes remain limited to the recovered
  replacement, because Tres's captured instance cannot follow that swap.
  Event subscription review found the `onBeforeLoop` subscription already has
  an `{ off }` owner; the renderer-manager `invalidate` wrapper now also
  restores the original method before reconfiguration or teardown, preventing
  nested wrappers and duplicate scheduler demand. `bun run build`, lint, and
  `git diff --check` pass. Recovery/resize behavior still requires runtime
  evidence on a supported GPU/browser.
- The world-slot trace found one remaining theme bridge gap on content pages:
  theme toggles while the Contact footer or Menu sheet was active could not
  resolve `page-lab` / `page-menu` through the main-section list and sent
  scene index `-1`. `ContentReveal` now maps those semantic sheet IDs to the
  canonical Lab/footer slot 0 and Menu slot 5; normal story sections continue
  to map from local section index to canonical slots 1–4. Verify sheet theme
  changes visually in browser when that environment is available.
- Route-stage contract trace: Works dynamically imports the controller, mounts
  its root, loads textures, waits for Vue cards, mounts the nested installation,
  then configures visibility/camera; teardown detaches child then root before
  disposing controller resources. Contact typography, halo, and Manifesto ink
  import and attach their Vue-declared nodes before configuration, and detach
  before disposing generated geometry/TSL resources. Cyprus attaches a hidden
  root, loads the Draco GLTF, configures camera/visibility and prewarms, then
  detaches and disposes. Lab checks request currency after import before it
  constructs the experiment, then mounts, toggles visibility and releases it.
  `LazyStage` memoizes requests, checks generations after awaits, releases late
  results, and contains failed creation/load/configuration. Cyprus now owns a
  dedicated Three `LoadingManager` and aborts its fetches on disposal; if the
  browser lacks `AbortSignal.any()`, the loaded/failed late result still follows
  the disposed-stage cleanup path. Stage order is source-reviewed; route-churn
  runtime evidence remains open.
- Per-node and GPU-resource lifecycle trace (Phase 2 item 4) against the
  current source; every Three object with a GPU allocation resolves to one
  disposer:

  Lazy / route-owned resources. `caseTexture.ts` is the only refcounted
  texture cache: in-flight drops after the last release discard late
  results, failed loads drop their entry, and a late dispose is covered by
  both `WorksPlaneStage.dispose()` and the disposed-init continuation
  (`init` releases every acquired texture on failure). `CasePlane` leases
  the shared plane geometry (module refcount) and owns one per-instance
  NodeMaterial; `CasePlaneNode.vue` declares `:dispose="null"` and disposes
  controller-or-raw resources on unmount. `WireframeTypography` disposes
  its glyph TextGeometry set and the shared MeshPhysicalMaterial after the
  Vue unbind (`ContactTypographyStageOwner.vue` →
  `WireframeTypographyOwner.vue`). Halo and Manifesto ink lease per-size
  shared geometries and own one material each
  (`PointerInkStageOwner.vue` declares `:dispose="null"`).
  `ContactCyprusStage` owns a dedicated `LoadingManager`/DRACO pair
  (disposed in `finally`), aborts fetches on dispose, disposes late-loaded
  models, and releases route-owned per-mesh `MeshPhysicalMaterial` through
  `disposeObject3DResources` (textures before materials). `LabGamepad`
  resources (8 geometries, 4 materials) dispose through the idempotent
  resource object. `BakuCarousel` refcounts its 8 unique card URLs (12
  cards); `dispose()` clears the window pointerdown/move/up/cancel/click
  listeners and the snap timer.

  Persistent scene owners. `BakuCarousel` and `JunniParticles` are created
  in `createWorksSection`; `SectionGroups.dispose()` disposes the carousel,
  then the particles, then the section-owned particle sprite texture.
  `JunniParticles.setCount` disposes the swapped-out geometry and `dispose`
  covers the current geometry/material pair. The showreel video element,
  `VideoTexture`, and poster `Texture` dispose through abort +
  `removeAttribute('src')` + `load()` + element removal
  (`ShowreelTheater`); the portal quad and material are Tres-owned through
  default disposal. The `ServicesStage` SFC root declares `:dispose="null"`;
  the SFC disposes the declared geometries and the controller disposes its
  five NodeMaterials. `WorksInstallation.vue` disposes arc/trace/tick
  geometries on unmount and `WorksInstallation.dispose()` disposes the two
  shared NodeMaterials after the Vue unmount. `EnvSphereOwner.vue` owns the
  six pavilion materials and five RoundedBox geometries; `EnvSky.vue`
  disposes only its own plane geometry (`:dispose="null"`) and borrows
  `skyMaterial`. `SplashCube` geometry/material, the `DrawTrail` ribbon
  geometry and TSL material, and `ParticleBurst` resources are assigned to
  Tres-declared leaves whose default disposal releases them; the SFCs retire
  displaced placeholder geometries. The Ground, CinematicCamera, and
  CinematicLights controllers hold no GPU resources. `SceneEnvironment`
  disposes the PMREM texture on apply failure (preserving the previous
  environment) and at `disposeCurrent` on final teardown.
  `TSLPostPipeline.dispose()` releases the full-screen pipeline, the bloom
  pass, and the scene pass.

  Host and app lifetime. `SceneHost` releases the `onBeforeLoop`
  subscription on reconfiguration and unmount, restores the `invalidate`
  wrapper, and flushes deferred renderer disposal after Vue unmount;
  disposal is idempotent through `makeRendererDisposeIdempotent`, so
  Experience's concurrent stage/renderer teardowns converge on one
  disposal. `Experience.destroy()` stops the scheduler and cancels timers
  first, awaits the showreel/stage/renderer teardowns (post-renderer GPU
  resource disposal is a no-op), then sweeps the case textures.
  `useJlzPage` removes its no-scene scroll listener and cancels its
  animation-frame and idle callbacks on unmount; `CinematicNav`,
  `FullscreenOverlay`, `ExperienceUI`, `Cursor`, `ContentReveal`, and
  `SfxSystem` release their listeners, timers, and audio context.

  No unaddressed source-level gap remains in late asset results, shared
  material/geometry leases, callback/listener cleanup, failure paths, or
  disposal order. The remaining gates are runtime-only: route-churn
  baseline, device-loss/recovery + resize on a supported GPU/browser,
  init-failure ordering (unavailable), physical-GPU/WebGPU parity, and
  attribution of the two isolated idle wake frames.

- Continuous-activity trace (Phase 2 item 5) against the current source;
  every demand source resolves to visible motion or a deliberate
  user/environment event, so no source change is made. The scheduler is
  one-shot demand: `invalidate` opens one frame window, `isSettled` stops it
  after the settled frame, and `_isLoopSettled` requires no pending demand,
  no active flag, and a converged cursor spring.

  The 13 `anyActivity` flags. Transient, each bounded by a release: `nav`
  (scroll/story morph; CinematicNav interaction settles after
  `INTERACTION_SETTLE_MS` = 220 ms), `carousel` (morph/scroll reach targets,
  drag ends, cards settle), `worksPlane` (reveal/wobble/installation settle),
  `contactCyprus` (fade ≥ duration, prewarm done), `drawTrail` (energy decays
  below 0.008 via `exp(-5.5 t)`), `opener` (phase done/idle), `burst`
  (elapsed ≥ trace duration), `camShaking`/`camPulsing` (decay; the phase-2
  timer only retargets the pulse, the flag carries the loop), `cubeRotating`
  (`_faceLerp` ≥ 1), `particles` (intentional continuous: GPU uTime drift
  while the Works group and particles are visible; released by section fade
  `g.visible = false`, `particles.visible = false` on Contact Agros, or
  reduced motion). Intentional continuous `ambientScene` sub-owners, each
  released by a section/route/visibility transition: EnvSphere weight lerp
  (transient), Baku jelly decay (transient), Contact typography glyph bob,
  Contact halo and Manifesto ink breathing (the halo's former standalone
  `contactHalo` flag is removed: ContactHaloStage extends PointerInkStage,
  where `setActive` keeps `active` and `visible` together and `isAnimating`
  is `active` with reduced motion off, so its visible motion is exactly what
  `hasVisibleAmbientMotion` reports into `ambientScene` — both
  reduced-motion values follow Experience synchronously — and the flag
  duplicated that state; Contact typography and halo both stop on the final
  Contact section or route change), Manifesto ink breathing (released on
  route exit), Services part convergence (`settled` re-true at targets), Lab
  gamepad hover clock (route visibility off). `showreel` (phase enter/exit or
  video playing; released by
  close/pause). No `isAnimating` predicate can stay true without a visible
  animator or an explicit release transition.

  Non-flag demand. Cursor spring (pointer move/hover/click; converges to
  `isSettled`). Ambient breath (wall-clock 2.5 s timer): its real animator is
  the volumetric light's wall-clock orbit in `Lights.update` (sin/cos of
  `performance.now() * 0.0004`, ~15.7 s period, orbit frozen and breath
  suppressed under reduced motion), so the breath steps a visible light
  position instead of redrawing identical pixels. One-shot events:
  first-frame, nav, resize, recovery, motion-preference, theme-applied,
  visibility-resume. Ecosystem `external`: Lab OrbitControls (continuous only
  while the user drives the camera, via the controls' own update→invalidate
  path) and DevPanel force-render. `SfxSystem` is audio-only and raises no
  frame demand; the DevPanel 500 ms interval reads stats only; `_renderDisabled`
  is set only by terminal `jlz:webgl-failed`. The breath timer is cancelled on
  `destroy()` and self-cleans on hidden-tab fire, so no late timer outlives
  the runtime.

  Source-level verification is complete: no flag without a real animator and
  no stuck owner were found. The settled-runtime evidence (loopActive=false,
  two isolated wake frames) is consistent with this trace: the first wake,
  around 2.5 s after settling, matches the ambient-breath timer and visible
  orbit but was not directly attributed; the second wake 0.5 s later does
  not match that cadence and may be a one-shot user-environment event (tab
  focus/blur → visibility-resume, or pointer move → cursor). Remaining manual
  checks: attribute the two isolated idle wake frames by sampling
  `scheduler.diagnostics.lastInvalidation` around the idle window in a
  supported browser, and re-verify idle settle on a physical GPU/WebGPU. No
  performance claim is recorded (no new measurement).

- DOM-only startup no longer enables splash Enter while the Vue route owner is
  still loading. `entry-app` now awaits `mountVueApp()` before publishing
  `webgl-ready` when `?no-scene` is active, so an immediate Enter click cannot
  outrun AppShell's `splash-entered` listener. Renderer startup remains
  asynchronous and reports its own mount failures through `webgl-failed`.
  Production-preview checks found that native scrolling in `?no-scene` left
  content-route and home active sections stuck because `CinematicNav` is not
  mounted. `useJlzPage` now observes each route's native scroll track, applies
  the shared clamped midpoint mapping, and emits the matching section event
  (`jlz:section-change` on home and `jlz:page-section-change` on content
  routes). Route replacement and unmount cancel listeners and pending animation
  frames. Chromium verified Works advances Porsche 911 Spider → Alise → 19 Lab
  → Pro193 at 320×640. Home advances intro → Services → Works → Manifesto at
  320×640, 390×844, and 640×360. No horizontal overflow or page errors appeared.
  `bun run lint` and the full production build pass; GPU-backed runtime behavior
  is still an open acceptance gate.
  `bun run lint` and the full `bun run build` pass, including prerender,
  generated sitemap/robots, and configured bundle/media budgets. The rebuild
  regenerated tracked `dist` assets and prerendered route documents.
  Headless Chromium manually exercised
  `/works?no-scene` at 320×640: after splash Enter, the route fallback exposed
  seven navigation links; language switched to RU; navigation to Manifesto
  rendered the localized title with no page errors or horizontal overflow
  (`scrollWidth` 320). This verifies the no-scene route and locale path only;
  full-console controls and GPU behavior remain separate gates.
- Case-study route review found that RU chapter labels wrapped around English
  project copy, captions, and metadata. The last chapter also forced `lang=en`
  while surrounding route metadata could already be Russian. Case study records
  now carry Russian copy alongside English, and the view selects the matching
  copy for chapter text, constraints, proof, media alt/captions, and metadata;
  each narrative block declares its actual language. The unavailable-case
  title and description now follow the selected locale too. Production
  Chromium manually opened all four case-study routes, switched to RU in the
  no-scene route fallback, and confirmed Russian copy/descriptions,
  `html[lang=ru]`, chapter `lang=ru`, correct canonical paths, no horizontal
  overflow, and no page errors. Static prerenders retain English default copy,
  `lang=en`, and canonical URLs for each case route. Lint and the full build
  pass.

- Accessibility source review found that the fullscreen showreel exposed a
  modal with only a Close button; playback toggling depended on clicking the
  backdrop, while Tab was forced back to Close. It now provides a localized
  Play/Pause button with pressed state and cycles keyboard focus between both
  controls. Lint and the full production build pass, and tracked `dist` output
  was regenerated. A follow-up narrow-viewport geometry review increased the
  separation between the two top controls to prevent their minimum-size boxes
  from overlapping. Headless Chromium at 320×640 confirmed the mounted dialog
  updates its accessible name from EN to RU on the language event, exposes the
  pressed state, cycles Tab Close → Playback → Close, and keeps a 15.6 px gap
  between controls with no page errors. The open state was supplied through the
  existing event bridge for this UI check; actual video/GPU playback and
  screen-reader behavior remain open.

- Deployment inventory found no Caddy, HAProxy, Nginx, container, hosting, or
  publish configuration in this repository. `package.json` provides Vite
  build and local preview commands, and CI has only the quality workflow. The
  checked-in `_headers` files therefore remain hosting-platform inputs; route
  rewrites, MIME types, cache policy translation, and production artifact
  delivery still need verification against the actual ingress configuration.
  The available web inspector could not open `justlovejazz.dev` and returned no
  indexed pages, so this attempt provides no evidence about live route health.

- Tres 5.9.2's on-demand mode still runs loop ticks. The app's custom scheduler
  opens and closes Tres's loop because its WebGPU/TSL pipeline and scene
  animations require it. Keep this seam until render ownership moves back to
  Tres's callback.
- SceneHost adopts one Tres scene, camera, and renderer. Tres selects
  WebGPU/WebGL2 through Three's `WebGPURenderer`; the same TSL post graph works
  on both backends. Low tier skips full-screen post as a quality policy.
- Stage lifetimes differ by route: Works waits for mounted assets; Cyprus
  prewarms and follows Contact activation; Lab remains mounted after leaving
  `/lab`; other stages release on route exit. Keep these behaviors while
  reducing their implementation.
- Resource disposal waits for Vue/Tres to detach declared nodes before GPU
  release. Host renderer disposal is deferred until scene owners unmount.
- Generated `dist/`, blog HTML, home prerender, sitemap, and robots.txt are
  tracked release inputs; CI rebuilds them and verifies they match sources.
- CI previously repeated Vue type-check and stdlib compatibility checks after
  `bun run build`, which already runs both; the duplicate workflow steps are
  removed.
- The unit suite was moved out of `src`; no test run is claimed by this plan.
- `SceneTransformPass` returns its active/from/to configs and section index;
  Experience no longer re-reads route sections or looks phase ids up in a
  duplicate config Map.
- Tres 5.9.2 propagates a parent's disposal policy during subtree removal.
  Resource-owned static subtrees now set `dispose: null` once at their root;
  per-node overrides remain where a child is removed independently.
- Package metadata and TSL article now describe Three's automatic backend
  selection and one app-authored TSL graph. Removed claims of bit-identical
  output and a future percentage-based fallback removal; neither had evidence.
- Story scroll normalization now shares the canonical main-position clamp;
  DOM navigation and frame-driven scene arrival keep their separate clocks.
- `CinematicNav` now reads the canonical world-slot count directly. The
  unused `count` field was removed from the page-section event, and
  ExperienceUI derives project-control readiness from its live overlay instead
  of mirroring it in a boolean.
- `DeviceCapability` no longer creates a temporary WebGL2 context to predict
  Three's renderer result; Three initializes WebGPU or its WebGL2 backend, then
  the app records that actual backend. Unknown markers remain unknown and fail
  visibly instead of being classified as WebGL. After this change, headless
  Firefox initialized `WebGLBackend` on `/lab`, loaded one Three core, and only
  logged Three's expected automatic WebGL2 selection warning.
- The scene host contract now exposes only Tres's reactive size values needed
  by Experience instead of leaking the full `TresContext` across the runtime
  boundary. SceneHost remains the owner of Tres integration.
- Declarative node readiness now awaits each slot's Promise directly; the
  sync-or-Promise `readyNode()` helper added no fast path inside `Promise.all`
  and has been removed.
- The theme event no longer carries unread `mode`/`sectionId` fields or a
  `themeChanged` flag that was always `true`; consumers synchronize directly.
- Removed the one-use theme rule wrapper. Also fixed the missing-config case:
  it now uses the documented light base polarity before applying inverse mode.
- Blog publication time now has one source in the article index; sitemap
  `lastmod`, Open Graph, and JSON-LD derive from it.
- The single-use route-continuation predicate is now local to the async route
  handler instead of being a one-function core module.
- Blog metadata keys and index/article shapes are now constrained by the
  article slug literals and discriminated TypeScript types; the duplicate
  runtime closed-set validator was removed from the prerender script.
- Text reveal teardown now belongs to the shared `TextReveal` owner; the two
  concrete classes no longer expose redundant type-filtering dispose methods.
- Section title reveals now follow Vue shell lifetime and existing section
  events. Removed the one-time observer tied to the initial route DOM; the
  initial splash reveal also respects reduced motion.
- Section reveal targets now resolve from the event's canonical `sectionId`;
  the previous global-list index could target the preceding ContactFooter.
- Reduced-motion CSS now covers navigation controls, blog footer links,
  fullscreen poster fading, and persistent-shell fullscreen opacity. The blog's
  interactive journal and footer color transitions use the shared duration
  tokens, which collapse to zero under the system preference.
- Splash sound changes now publish the existing sound event after persisting,
  keeping the mounted Vue control and Experience SFX state synchronized.
- Startup and device-loss error messages no longer claim a WebGL2 adapter
  failure or prescribe hardware acceleration for unrelated renderer errors.
- Vue Router teardown is now owned by the mount that created it. Concurrent
  unmount calls share one promise, and shell disposal failure still runs Vue
  and listener cleanup; a stale mount failure cannot tear down its successor.
- Router guards now cancel navigation when teardown starts; post-navigation
  callbacks cannot reveal an exiting route or dispatch a stale section hash.
- Removed an ineffective `window.scrollTo()` after route pushes. CinematicNav
  owns and resets the actual scroll container when the new route mounts.
- Ordinary fragment links now use browser scrolling and UIkit controls keep
  their own click handling; the app intercepts only `#section-*` links that
  must also drive the 3D story. Removed duplicate `scrollIntoView()` logic.
- Removed stale migration comments that described old route composition and a
  synchronous ready-slot path that no longer exists.
- Theme synchronization now uses the same `contentRoot()` lookup as Vue shell
  reveal handling instead of keeping a second DOM-root fallback in
  `ContentReveal`.
- Source comments no longer depend on missing sprint/ticket ids, commit hashes,
  `SPEC.md`, or ADRs; retained notes describe the current runtime behavior.
- Renderer update no longer hides a missing render pipeline by drawing directly
  through WebGPURenderer. Recovery already closes the frame window while the
  pipeline is absent; normal frames now require the owned pipeline. Low-tier
  direct rendering remains an explicit policy inside `RenderPipeline`.
- Production build and bundle budgets passed after the latest renderer
  simplification (`fd13967`). The user confirmed physical Firefox WebGPU and
  TSL post-processing. Firefox's compatibility feature-level notice comes
  from Three/browser support. Playwright Firefox exercised WebGL2; WebKit
  remains unverified.
- Three's WebGPU entry and the app's Three imports are aliased to one dev core.
  After clearing stale Vite optimizer state, a fresh headless Firefox dev run
  loaded `/lab` and lazy `@tresjs/cientos`; it requested one `three.core` URL
  and did not emit `Multiple instances of Three.js`. The backend was
  `WebGLBackend` because headless Firefox had no WebGPU. The user's earlier
  physical Firefox log did report the duplicate, so repeat the check there
  after a full reload before treating that report as resolved.
- This workspace had 738 abandoned `.vite/deps_temp_*` directories (14 GB)
  and no running Vite process. The temporary optimizer caches were removed.
  The two isolated SSR prerender servers now disable Vite's browser dependency
  optimizer; a full production build leaves zero `deps_temp_*` directories.
  The fresh browser run above is the evidence for the duplicate-core check;
  the cache cleanup alone did not establish that result.
- A cold `dev:hmr` load of `/contact` discovered TextGeometry, DRACO,
  FontLoader, and GLTFLoader only after Three was live. Vite changed its
  optimizer hash mid-session; Chromium observed 504 outdated-dependency
  responses and ContactCyprusStage failed to import until reload. Those lazy
  addon entry points are now included in the initial `optimizeDeps` scan. A
  forced fresh scan followed by a direct `/contact` load initialized all three
  Contact stages on `WebGLBackend`, kept one scene canvas, reported no page
  errors, and did not trigger a second optimizer-change reload.
- Current direct runtime pins match the latest releases checked on
  2026-10-02: Vue 3.5.43, Tres/Cientos 5.9.2, Three 0.186.1, Vue Router 5.3.1,
  Vite 8.3.2 and UIkit 3.25.25. TypeScript 7 support through the current
  `vue-tsc` path is not established; keep the verified TypeScript 6 toolchain
  until upstream support is confirmed. `bun outdated` could not reach npm due
  to DNS, so transitive dependency freshness is still unverified.
- Runtime-evidence session on 2026-10-04 (headless Chromium via the
  agent-browser CLI, dev server + `?force-webgl-backend` and `dev:hmr` mode;
  software WebGL2/SwiftShader backend — the same environment class as the
  earlier manual Chromium runs, not physical GPU). All sampling used the
  dev-only `__jlzRuntimeSnapshot()` probe; the production preview smoke
  (direct `/` and `/works` load, splash Enter, automatic WebGL2 fallback)
  ran without the probe and with zero page/console errors. Evidence gathered:

  - Idle wake-frame attribution: a 21-second settled window sampled at
    100 ms recorded 10 wake frames, every one carrying
    `lastInvalidation: 'breath'` at a steady 2.4–2.6 s cadence, with
    `loopActive=false` between wakes, `settledFrames` advancing 1:1 with
    frames, and zero activity flags. All idle wake demand is the deliberate
    ambient-breath timer stepping the volumetric-light orbit; no stuck
    animator and no stray one-shot source appeared. This closes the
    attribution question on software WebGL2; a physical-GPU repeat stays
    open.
  - Route-churn plateau: 15 stops across 3 full home→works→manifesto→
    contact→lab cycles held `rendererCanvasCount=1` and
    `documentCanvasCount=2` at every stop and returned route-identical
    scene counts from cycle 2 onward (the cycle-1→2 delta of +8
    geometries/+4 materials is the documented Lab-stays-mounted contract).
    A follow-up contact probe with a 12 s settle converged to exactly
    37/35 scene geometries/materials and 27/12 renderer geometries/textures
    on three consecutive visits (an earlier 6 s settle had sampled mid
    Cyprus prewarm — timing, not a leak). No route-churn resource leak on
    software WebGL2.
  - Driven synthetic device loss: `WEBGL_lose_context.loseContext()` plus an
    externally driven `restoreContext()` 300 ms later produced the recorded
    loss(prevented)→restore→disposal-loss→helper-restore sequence,
    `__jlzHost.recovered=true`, resumed frame advancement, one renderer
    canvas, and no failure overlay — matching the earlier production
    evidence, now also on the dev path. An undriven synthetic loss
    (no external restore) correctly terminates in the failure overlay after
    the 5 s restore wait: the first wait deliberately does not call
    `restoreContext()` because natural browser loss restores itself.
  - Post-recovery resize: after recovery, viewport changes to 390×844 and
    1600×900 each mirrored exactly into the canvas drawing buffer with
    frames advancing — the recovered-renderer viewport ownership path
    works.
  - Ready-state SceneHost HMR replacement (script-block comment edit via an
    in-place write): vue:reload → old runtime retired → full re-init
    sequence in console → resources back at the home baseline (22/28/5),
    one canvas, no overlay, no page errors.
  - HMR during active prewarm: a page-side watcher fired the SceneHost
    script edit at the exact window where `__jlzHost` was published but
    `__jlzRuntimeSnapshot` did not yet exist (Experience mid-init,
    `compileAsync` prewarm active; edit landed at t≈5.9 s of boot). The
    replacement retired the mid-init runtime and the new runtime completed
    init at t≈9.3 s with baseline resources, one canvas, Enter enabled, no
    errors. The teardown barrier + generation guard hold during startup,
    closing the HMR-during-prewarm gate on software WebGL2.
  - Environment note for reading future logs: `sed -i` (temp-file rename)
    edits are invisible to the Vite watcher in this sandbox — in-place
    writes (`printf >>`/`writeFileSync`) are required to trigger HMR.
    Vite 8 mirrors browser console lines into the server terminal tagged
    `(client)`.

  Slices executed after the evidence session (all zero-reader deletions
  verified by rg across src/tests/scripts/prerender/content, then
  type-check, lint, format, the 103/103 unit suite, and full production
  builds): the envColor dataflow (config → Section.lightData → per-frame
  lerp → no reader) including LightTransform/lighting/lightColor/
  lightIntensity and dead Section.name/phaseIndex; unread WorldConfig
  fields (sectionLights, ui.showGallery, bgColor, unreachable domSection
  fallback); dead controller accessors (WorksPlaneStage.handleTap,
  BakuCarousel.getTargetCardIndex/sceneRoot, JunniParticles.mesh);
  DeviceCapability.isTouch plus a provably-redundant guard; stale
  spec-reference comments; EnvSphere's six pass-through color fields;
  the never-applied 5.5 KB uikit form-range CSS plus nine unused console
  icons, two never-invoked accordion hook mixins, and one dead blog CSS
  rule; eight dead works.sectionN.title i18n keys in both dictionaries;
  the consumer-less `src/types/less.d.ts` ambient module, a phantom eslint
  ignore, the stale `.renderer-unsupported` e2e locator (now
  `.jlz-renderer-failure`), and 22 internal-only type export keywords.

  2026-10-04 styling-layer audit (LESS/CSS whole-assembly pass). Facts
  established: the SPA's compiled theme ships inside the entry JS chunk
  (`main-*.js` is 225,152 bytes of CSS string under a 225,183-byte chunk —
  the `?inline` import in entry-app.ts); the blog ships the same
  `_import.less` assembly as a real stylesheet (159,495 bytes minified).
  The `?inline` seam is a verified port, not debt: the inline comment
  documents that dev-mode CSS HMR through the reverse proxy breaks
  `/@vite/client` injection, and the runtime cost in production is hidden
  behind the splash gate — keep. Project-owned CSS is clean: all 99
  `.jlz-*` classes and all 97 `--jlz-*` custom properties in the shipped
  CSS have live references (zero dead). The uikit import list was re-walked
  against every markup/JS consumer: one import was dead — `form.less`
  (no `<form>`/`<input>`/`<select>`/`<textarea>` anywhere, no `uk-form-*`
  or `uk-input`-family class usage, no programmatic form usage) — and is
  now commented out with its `.hook-form()`/`.hook-form-focus()` hooks and
  `@form-focus-*` vars removed from the console theme. Measured with
  esbuild-minified compiles of both roots: SPA CSS 226,900 → 205,150
  bytes (−9.6%), blog 159,495 → 139,209 bytes (−12.7%). Every other
  active uikit import has at least one live consumer (`uk-tooltip` drives
  PersistentConsole, `uk-modal` drives FullscreenOverlay, `uk-scrollspy`
  drives Contact/Services reveals, `uk-accordion`/`uk-card`/`uk-navbar`
  families drive the views). Known dead weight left in place deliberately:
  ~380 unused `uk-*` variant selectors inside live component families
  (card color-variants, inverse color-mode blocks, width/margin/position
  utility variants) — removing them needs either hand-trimmed copies of
  uikit sources (upgrade hazard) or a purge tool with a runtime-class
  safelist (build complexity); neither clears the anti-overengineering
  bar while CSS sits behind the splash gate. Same for the UIkit JS side:
  the package ships no per-component ESM entry, so `import UIkit from
'uikit'` bundles all JS components (vendor-ui 153 KB, async) — swapping
  to deep `src/js` imports is brittle and not worth it now. Lint and the
  103/103 unit suite green after the slice.

## Work queue

### 1. Reduce runtime ownership overlap — complete

Trace callers and state before changing boundaries. For each method in
`Experience`, `SceneCoordinator`, `SceneTransformPass`, `StageRegistry`,
`LazyStage`, `ExperienceUI`, and `SceneHost`, record its distinct behavior and
owner. Then remove forwarding, mirrored state, and wrappers that duplicate
Vue/Tres/Three/Cientos. Preserve the actual route lifecycle differences and
detach-before-dispose ordering.

Audit these seams specifically:

- SceneHost readiness slots, renderer sizing/DPR, loop/invalidate bridge, and
  deferred renderer disposal against Tres's public API.
- Vite dev dependency optimization and every lazy Three/Cientos entry against
  the reported Firefox duplicate-core warning; distinguish optimizer restarts
  from simultaneously loaded core modules.
- Experience versus SceneCoordinator ownership of route policy, frame fan-out,
  and render demand.
- StageRegistry versus LazyStage versus `useSceneStages`; retain only shared
  async lifecycle mechanics used by distinct stage contracts.
- ExperienceUI versus route views for duplicate navigation/section state.
- Startup cancellation, renderer recovery, init failure, no-scene mode, and
  teardown completion.

Exit when each retained boundary has one owner, callers are explicit, and
startup/failure/route-change/teardown paths preserve behavior without duplicate
route or renderer authority.

Current trace: `Experience` owns top-level lifecycle, frame demand/activity,
and wiring between route events and the scene. `SceneCoordinator` owns section
configuration, route visibility, scene-owner frame fan-out and reduced-motion
fan-out. `SceneTransformPass` owns scroll-to-world interpolation and its
reusable result. `StageRegistry` owns route stage contracts; `LazyStage` owns
their shared async cancellation/release mechanics; `useSceneStages` owns the
Vue-declared mount points. `ExperienceUI` owns navigation and project-overlay
behavior. The reduced-motion fan-out is split by domain and currently has no
mirrored value; keep it until a specific duplicate owner is demonstrated.
The complete source trace found one owner for renderer/RAF/scheduling,
route-stage creation, scroll state, and UI orchestration. Lifecycle and teardown
paths were rechecked; remaining items are external runtime acceptance gates.

Route-UI controller checkpoint: the lifecycle error/teardown source pass found
no additional source gap (its open items are runtime-evidence gates), and the
route-UI controller pass removed the dead per-frame `CinematicNav.update()`
no-op and its sole `Experience._updateInner` callsite — behavior unchanged;
lint, type-check, and the full production build pass with regenerated tracked
dist assets.

ExperienceUI ownership checkpoint: every `ExperienceUI` method and caller was
traced against the Vue route views. `init()` wires CinematicNav, sound,
project-open, overlay preload, route-close, wobble, and hash events from their
single emitters; `triggerSplashOpener()` has one caller (`jlz:splash-entered`
in Experience); `ensureProjectControls()` is called by Experience after
`buildScene()` and by the three internal event paths; `navigateProject()` is
reached only through `jlz:project-navigate` (plus the dev-only DevPanel
buttons); `onProjectSelect()` is the one overlay writer. `activeProjectIndex`
remains the single canonical index — `BakuCarousel` keeps a continuous scroll
target, not a mirrored project index, and the route views carry no active
project state. This trace found one dead seam: `FullscreenOverlay.onPrev` /
`onNext` were public callback fields never assigned anywhere (repo-wide
source scan; the Vue view only emits `jlz:fullscreen-overlay-unmounted`),
while `navigate()` no-op-dispatched them before emitting
`jlz:project-navigate`, whose sole real consumer is
`ExperienceUI.navigateProject`. The fields and the no-op dispatch were
removed; the buttons and arrow keys now reach the handler through the event
only. Behavior is unchanged. `bun run lint`, `bun run type-check:vue`, the
full production build, and `git diff --check` pass; the build regenerated
tracked dist assets (one app-chunk hash change cascading to the lazy view
chunks and prerendered route HTML). A baseline rebuild of the unmodified
source reproduced the committed dist with zero diff, confirming the churn is
the chunk-rename cascade of this edit.

Route-UI Vue migration plan (from the 2026-10-03 TvT v5 audit): the remaining
old-world surface is imperative UI classes writing into DOM that Vue already
renders. Four slices, smallest first:

1. Remove verified-dead exports: `tslVec3` in `types/tsl-helpers.ts` (no
   consumer), the exported `unmountVueApp` wrapper in `app/index.ts` (the
   host-teardown spec uses the dev hook; the internal teardown mechanism
   stays), the `export` on `initSplashToggles` (`entry-app.ts` calls it
   internally and the referenced lifecycle test does not exist), and nine
   `export` keywords with no importer (`normalizeSiteOrigin`,
   `supportsPostProcessing`, `resolvePage`, `isCaseStudyPath`, `escapeXml`,
   `stripSsrComments`, `BLOG_SITE_ORIGIN`, `blogMetaPath`, `labExperiments` —
   all still used inside their own modules). Correct the stale
   `src/__tests__/i18n.test.ts` claim in the `core/i18n.ts` header; no i18n
   unit test exists. [Completed below: every named symbol was re-verified
   against `src`, `tests`, and `scripts` before removal; all twelve dead
   exports are gone, the `i18n.ts` header now states the real coverage, and
   lint, type-check, the full production build, and `git diff --check` pass
   with regenerated tracked dist assets.]
2. Fold `UI/RouteTransition` into the app layer: the class only sequences
   `data-state` on the AppShell-declared overlay; an app-owned function pair
   keeps the same cover/reveal/cancel contract for the router guards.
   [Completed below: `src/UI/RouteTransition.ts` is deleted and the sequence
   (cover/reveal/cancel/dispose, COVER_MS/REVEAL_MS timings, reduced-motion
   no-ops, and the missing-overlay error) now lives in
   `createRouteTransitionCover()` inside `src/app/index.ts`, beside the other
   router-owned local factories; the `_shell.less` comment names the new
   owner. Behavior is unchanged; lint, type-check, the full production build,
   and `git diff --check` pass with regenerated tracked dist assets.]
3. Move fullscreen overlay content into Vue: `FullscreenOverlayView.vue`
   binds title, category, description, tags, counter, poster, and arrow
   visibility from a small reactive store; the UIkit modal, keyboard, and
   focus-trap behavior stay with the controller class;
   `ExperienceUI.onProjectSelect` writes the store instead of the class
   filling DOM text nodes. [Completed below: content now flows through the
   typed `jlz:project-content` port — `ExperienceUI.onProjectSelect`
   publishes one payload and the view owns the reactive state, the poster
   decode (request-id guarded), the tag list, `v-show` arrow visibility, and
   the authored title reveal (BlurFade after the title change, plain text
   plus aria-label under reduced motion). `UI/FullscreenOverlay` keeps only
   the UIkit modal lifecycle, Escape/arrow/Tab keyboard layer, focus trap,
   and fullscreen-change events; its `open()`/`preload()` content arguments,
   the per-open `onClose` callback (never supplied by any caller), the
   never-read `is-image-mode`/`is-poster-ready` container classes, and the
   poster/title DOM filling are gone. Preload is now publish-only. The
   overlay is not part of the prerendered route documents, so SSR output is
   unchanged. Lint, type-check, the full production build, and
   `git diff --check` pass with regenerated tracked dist assets.]
4. Share the story scroll track mapping: one helper owns scroller/section
   discovery (page-mode selector plus excluded sheet sections) and the
   rAF-throttled scroll-to-section mapping; `CinematicNav` (scene mode) and
   the `useJlzPage` no-scene branch both consume it while keeping their own
   side-state, labels, and activity behavior. [Completed below:
   `core/storyTrack.ts` now owns `resolveStoryTrack` (scroller + main-section
   discovery + sheet exclusion), `storyPositionFromScroll` (the clamped
   position and 0-based section index), and `observeStoryScroll` (one
   rAF-throttled frame per scroll burst, passive listener, dispose/sync).
   `CinematicNav._bindTrack` resolves the shared track and keeps only its
   side-state/label/focus/activity behavior; the no-scene branch of
   `useJlzPage` publishes sections through the same contract. Both owners'
   notify payloads and timing are unchanged; lint, type-check, the full
   production build, and `git diff --check` pass with regenerated tracked
   dist assets.]
5. Restore the unit suite's broken mock wiring: the 2026-10-02 test-tree
   move (`45941ce1`) rewrote the module-under-test imports but left the
   `vi.mock()` specifiers relative to the OLD `src/Experience/` location, so
   the mocks silently stopped matching and 11 tests in 5 files failed on a
   false baseline. [Completed below: every `vi.mock()` path in the five
   affected files (`ExperienceLifecycle`, `ShowreelController`,
   `Scene/SectionGroups`, `World/WorksPlaneStage`, plus the latently broken
   `Lab/manifest` mock that passed for the wrong reason) now points at the
   real `src/` modules; `ContactCyprusStage`'s stale `root.name` assertion
   was updated to the current contract (the name is declared in
   `ContactCyprusStageOwner.vue`, and the stage must not rename the
   Vue-owned root — `b00bfb8c`). No new tests, no harness code: the suite is
   103/103 green on Bun + vitest 4.1.11 + jsdom 29 on Linux. The earlier
   "pre-existing baseline failures" note in Status is superseded.]
6. Deduplicate the DRACO decoder delivery: three 0.186's DRACOLoader module
   eagerly resolves BOTH decoder sets it ships — the standalone
   `libs/draco/` trio (719 KB draco_decoder.js + 286 KB wasm + 59 KB
   wrapper) as constructor defaults, and the exported `DRACO_GLTF_CONFIG`
   (`libs/draco/gltf/` wrapper + wasm pair) — so the bundler emitted both
   into dist while the runtime (ContactCyprusStage passes
   `DRACO_GLTF_CONFIG` to `setDecoderPath`) only ever fetches the gltf
   pair. This closes the previously open "dual DRACO decoder sets" gate
   statically: the fetched set is provable from
   `ContactCyprusStage.load()`, no network trace needed.
   [Completed below: a build-only `strip-unused-draco-decoder-defaults`
   Vite plugin (vite.config.ts) rewrites the three standalone
   `new URL(..., import.meta.url)` default initializers to plain
   page-relative names so nothing is emitted — it warns and no-ops if three
   changes the shape. The stdlib shim's `DRACOLoader`/`GLTFLoader`
   re-exports now point at three's own addons modules (one loader
   implementation in the graph by construction; the three-stdlib copies
   were already tree-shaken — `vendor-lab-controls` is byte-identical), and
   `check-stdlib-modules.mjs` resolves package specifiers through the
   installed exports maps. dist drops the 1.06 MB never-fetched standalone
   set and keeps only the gltf pair; lint, type-check, `check:stdlib`, the
   full production build, budgets (three 310.95 kB gzip, unchanged), the
   103/103 unit suite, and `git diff --check` pass with regenerated tracked
   dist assets.]

WebGPU→WebGL2 fallback verification (2026-10-03, three 0.186.1 source): the
fallback IS automatic and the app already relies on it correctly.
`WebGPURenderer`'s constructor picks `WebGPUBackend` unless `forceWebGL` is
set, and registers `parameters.getFallback = () => new WebGLBackend(...)` —
when WebGPU is unavailable (no `navigator.gpu`, adapter/device request
failure) three falls back to the WebGL2 backend itself and TSL node
materials compile for either backend. The app's single construction path
(`createUnifiedWebGPUInstance`) passes `forceWebGL` only for the dev-only
`?force-webgl-backend` recovery seam and to keep a recovered renderer on
the backend it had already settled on; `DeviceCapability`'s
`navigator.gpu` check is an initial DPR/tier HINT only (corrected after
init via `setFinalRendererMode` + `inspectUnifiedBackend`'s explicit
backend markers), and it deliberately does not probe with a second
canvas/context. No app-side fallback duplication exists to remove.

Route-UI controller slices (TvT v5 direction — all eight slices are now
complete; slices 1–4 and 5–6 above, 7–8 below):

7. `CinematicNav` is the last large imperative UI controller (~448 LOC)
   writing into Vue-rendered DOM (nav rail, section labels, keyboard
   navigation, scroll sync via the shared storyTrack). Incremental
   Vue-ification in the same pattern as slices 2–4: move the DOM
   structure and label state into a Vue view bound to the storyTrack
   position, keep the keyboard/focus/behavior controller slim. Slice only
   after re-reading its consumers (`ExperienceUI.init`, SceneHost activity
   flags); verify with the same gates as above.
   [Completed below: the rail DOM structure was already Vue-declared in
   `PersistentConsole.vue`, so the slice targeted the remaining imperative
   writes into it. The heading-derived storyline labels now travel over a
   typed `jlz:story-labels` event (published on track bind and language
   change — i18n patches the `data-i18n` headings synchronously before
   `jlz:lang-change` fires) and the Vue `:aria-label` binding is the single
   writer, deleting the dual-writer race where Vue's async re-render could
   clobber the imperative label write after a language switch. Rail inert
   while a cinematic sheet is open became a Vue binding from the already-
   published active index. The `data-sheet` attribute on `#cinematic-nav`
   had no consumer in CSS, JS, or tests, and the `[data-story-label]` span
   sat permanently `uk-hidden` (display:none !important) with no CSS
   rules — both dead paths are deleted together with the `_navButtons`
   query and the constructor's rail lookup, so `CinematicNav` keeps
   behavior only: scroll sync via the shared storyTrack, side sheets,
   keyboard navigation, focus handling, and the scroll-rate per-section
   story CSS variables (a deliberate non-React write; the CSS-var writes
   are consumed by `[data-story-state]` rules in main.less). The storyline
   hint span stays: it is static Vue-owned content with no imperative
   writer, so touching it is out of scope. Lint, type-check, the full
   production build, budgets (three 310.95 kB gzip, unchanged), the
   103/103 unit suite, and `git diff --check` pass with regenerated
   tracked dist assets.]
8. `ExperienceUI` orchestration audit: after slice 7 the remaining event
   wiring may collapse further into the owning views; re-trace before
   writing code. [Re-traced 2026-10-04, verdict: no collapse is justified.
   Every remaining `ExperienceUI.init` wire is either a Vue↔runtime
   semantic port (`jlz:story-navigate` and `jlz:goto-section-by-hash` →
   storyNav; `jlz:open-project`/`jlz:project-navigate` → overlay; the sfx
   init and `jlz:sound-toggle` wiring; `jlz:fullscreen-overlay-unmounted` →
   overlay and carousel release, a Vue-lifecycle → runtime teardown bridge)
   or 3D behavior that needs Experience-owned resources (`jlz:wobble-pulse`
   → BakuCube, the window pointerup works-plane raycast via
   `worksPlaneStage.hitTest`, the sec_works poster preload). Moving any of
   these into Vue views would make the Vue layer reach into sfx/stage/baku
   resources — exactly the ownership violation this architecture avoids.
   The route-change → `overlay.close()` wire stays here rather than being
   re-expressed as `jlz:close-media-layer` (which the overlay controller
   already listens to): the direct call is the shorter path through the
   owner. `TextReveal`/`BlurFade`/`NoiseText` were re-checked under the
   same lens: they replace element children with per-character spans and
   interpolate styles per rAF frame — declarative equivalents would pay a
   vdom diff per frame and reimplement the same math, so they are
   legitimate no-equivalent imperative code per the working rules.]

Readiness trace update: the renderer is constructed synchronously by the
`TresCanvas` factory, initialized by Tres, then inspected in `onReady`. The
host publishes only after its declared Vue/Tres nodes report ready; Experience
then adopts those nodes and starts its own init pipeline. On host teardown,
stage slots clear before Tres children unmount and the renderer disposal is
flushed afterward. A host unmount or renderer error during the readiness wait
previously left `onReady` suspended on unresolved slots; the wait now races a
host-owned cancellation signal, with a lifecycle generation check before
publishing. No browser evidence was available for exercising that race.

Async teardown source trace: the supported app-level unmount path (the dev
`__jlzTestUnmountVueApp` hook backed by the internal teardown owner)
awaits `AppShell.destroyExperience()` (which awaits `Experience.destroy()`) and
only then calls `app.unmount()`. Experience stops the scheduler and listeners
synchronously, awaits an active `compileAsync` prewarm, then awaits lazy-stage
and showreel release before the root host is unmounted and flushes deferred
renderer disposal. The dedicated host-teardown spec encodes release-before-
backend assertions, but it was not run under the repository no-test-suite
rule. Vue's `onBeforeUnmount` fallback in `ExperienceRuntime` starts that same
async teardown without awaiting it; it is safe for cleanup initiation, not a
barrier to child unmount. Vite documents `import.meta.hot.dispose` with a
synchronous callback signature, so it cannot directly provide an async wait
([HMR API](https://vite.dev/guide/api-hmr.html)). HMR replacement while GPU
prewarm is active remains an open lifecycle gate. A manual HMR replacement of
`SceneHost.vue` on a ready `/contact` route reproduced a dead-runtime defect:
the backend disposed while one canvas remained, with no new route stages and
no console error. `SceneHost` now awaits a parent runtime teardown barrier
before deferred backend disposal; `ExperienceRuntime` retires the old runtime
and starts a new one for the replacement host, with a generation guard against
stale startup. Repeating the same HMR edit released the old owners/backend and
reinitialized all three Contact stages; the scene canvas stayed at one, the
resource snapshot returned to 28 scene geometries / 19 materials / 1 texture
and 15 renderer geometries / 17 textures, and no page errors appeared. This is
software WebGL2 evidence with a settled runtime, not HMR during active prewarm
or physical-GPU lifecycle evidence. The dedicated host-teardown spec encodes
additional release-before-backend assertions but remains unrun under the
repository no-test-suite rule.
The remaining source teardown review found that one synchronous disposer
throwing could skip every later release, and that the shared teardown promise
was published only after readiness cancellation and other callbacks. `destroy()`
now publishes the promise first, stops each synchronous owner independently,
then awaits prewarm and all async owner releases before the final texture sweep.
`ExperienceUI.destroy()` now releases each subscription, listener, overlay and
navigation owner independently too. Failures are reported after sibling
cleanup; an unexpected failure in the top-level coordinator still rejects the
shared promise. `bun run lint` and the full production build pass, and tracked
prerender/build assets were regenerated. Manual Chromium on the dev
`?force-webgl-backend` path observed `WebGLBackend`, one scene canvas, and a
resource snapshot of 22 scene geometries / 28 materials / 5 textures and 12
renderer geometries / 24 textures. Calling the exposed runtime destroy hook
settled `experience:async-scene-teardown-complete` and removed its diagnostics;
reloading recreated one canvas with the same resource counts and no page
errors. This confirms the ordinary destroy/restart path only. Fault-injection
of a throwing disposer and HMR during active prewarm remain open lifecycle
gates.

SceneHost bridge audit: `loopPort` is the sole adapter from RenderScheduler to
Tres's RAF (`onBeforeLoop` supplies delta; start/stop control the Tres loop).
The renderer manager's `replaceRenderFunction` consumes Tres's pending-frame
notification without drawing, since `RenderPipeline` owns the actual draw.
`invalidate()` is wrapped only to forward Tres/Cientos wake events into the
same scheduler; Lab OrbitControls currently needs this path. `onReady`
restores any previous wrapper/subscription before reconfiguration, and host
teardown releases both. Recovery swaps `context.renderer.instance` and transfers
deferred disposal ownership to the replacement; the old instance is explicitly
disposed by Renderer during recovery. These are distinct Tres integration
responsibilities, not a second RAF or render scheduler. Tres 5.9.2 installed
source was used for the size-manager and loop behavior; the current official
Tres docs identify the same installed release. No bridge removal is justified
without replacing the custom TSL render path or the current Cientos wake path.

Route-policy audit checkpoint: `Experience.installSceneEventHandlers` owns
semantic event timing, scroll-section dispatch, and first-frame demand;
`StageRegistry.reconcileRoute` owns per-route lazy-stage creation/disposal;
`SceneCoordinator` owns section visibility/configuration and scene updates.
Works carousel initialization is a persistent home-scene concern and remains
in Experience/SectionGroups, while the Works plane and Contact/Manifesto/Lab
lazy owners remain in StageRegistry. Contact Cyprus section activation also
remains with StageRegistry because it gates that lazy asset's lifetime. The
remaining review is to inspect lifecycle error handling through host teardown
and look for scene behavior in `ExperienceUI` that belongs in Vue. No source
move is warranted from this checkpoint alone.

Navigation ownership trace: in scene mode, `CinematicNav` is the sole scroll
observer and emits canonical section/world-slot events. `useJlzPage` consumes
those events only to update Vue's active-section classes, while AppShell
consumes them for title reveals; neither installs another scroll observer.
When `?no-scene` is active, SceneHost/ExperienceUI are absent, so `useJlzPage`
installs the native observer and emits the same event contract for both home
and content routes. PersistentConsole's active navigation index is a display
projection of `jlz:story-index-change`, not a second route position owner.
Route views own their semantic section DOM and current CSS state; route-level
transition, menu, and route-view selection remain Vue Router/Vue lifetimes.
This confirms the observer split is mode-specific rather than duplicated.
`ExperienceUI` remains the owner of scene-attached navigation behavior and
project overlays; route Vue views remain the semantic markup/state owners.
Project selection crosses that boundary through typed events, with no mirrored
active project index found in the current views.

Route SEO source trace: canonical manifest entries, per-page metadata, blog
entries, sitemap, and prerender inputs share their data sources. Case-study
metadata carries its own canonical detail path and is reapplied on project and
locale changes. Unknown paths render the home fallback and use the home
canonical. Direct-route behavior was confirmed against Vite production preview;
production-host resolution and crawler delivery remain deployment gates.
Unavailable dynamic Works slugs now use the Works canonical and `noindex,follow`
instead of advertising an unavailable placeholder as an article; normal route
metadata removes that robots override again.

The build now prerenders every known SPA page and published case study into
its own static HTML entry using the route manifest, page metadata/i18n tables,
and case-study records. Each generated entry is checked for its expected route
marker, exactly one H1, canonical and Open Graph URL. Root metadata now matches
the home metadata table; route HTML cache rules cover every generated page.
The nine generated route documents pass artifact inspection. Vite production
preview also returned HTTP 200 for `/`, each SPA route, one case study, blog
index/article and an unknown path; returned title/canonical values matched
their route (unknown path used home metadata). This verifies the local Vite
static resolver, not the production host, which still must map extensionless
routes to the emitted `.html` files.
SEO configuration audit found that `JLZ_SITE_ORIGIN` was consumed by route
metadata and sitemap generation but `public/robots.txt` retained the production
origin. Sitemap generation now writes robots.txt from the same normalized
origin, keeping staging builds internally consistent. The static root document
also held a hard-coded production canonical and social image URLs: route
prerendering now applies the home metadata table to `/` and uses the configured
origin for Open Graph and Twitter preview images on every SPA entry.
The generated-artifact CI check previously omitted `public/robots.txt`, even
though sitemap generation rewrites it with the configured origin. The workflow
now checks robots.txt alongside sitemap.xml, preventing a stale crawler sitemap
reference from passing the release artifact check.
The same route parity check found four published Works case-study URLs missing
from the sitemap despite having prerendered HTML and canonical metadata. The
sitemap now includes those case-study records from `CASE_STUDIES`.
The case-study content contract also had an unused CTA string duplicated by the
view's localized label, a media kind discriminator whose only renderer is an
image, and a proof source string with no presentation or processing consumer.
These unused fields were removed from the records and type; new content fields
will be added with their actual view or data use.
Contact's apparent form step is currently a mailto CTA, not an HTML form: it
opens a project-brief draft in the visitor's mail client, and the site neither
sends nor stores messages. README now documents that behavior; connecting a
server-side endpoint remains a product/service decision, not a hidden failure
in the current link.

The production prerenderer renders several fresh SSR apps through one Vite SSR
module graph. `useJlzPage` previously subscribed to the module-singleton
`eventBus` during `setup()`, while Vue does not call `onBeforeUnmount` during
SSR; those handlers therefore survived later route renders in the same build
process. The subscriptions now start on client `onMounted`, before that hook's
`postRender()` route announcement, and are released on client unmount. Lint and
the full production build pass; no test suite was run.
The same SSR review found `CaseStudyView` subscribed to `jlz:lang-change` at
setup and published its Works project intent into a module-global singleton
during SSR. The locale listener now starts on mount, while the project intent
is published only when `import.meta.env.SSR` is false; client setup still sets
it before the route-ready announcement. The full production build successfully
prerendered all four case studies after this change. No test suite was run.

Accessibility source review found `/contact`, `/services`, `/manifesto`, and
`/lab` had no level-one heading; they now have visually hidden localized H1s
while the authored visible sections remain unchanged. Showreel was also missing
dialog semantics and sent focus to its now-inert launcher while leaving the page
content available behind the modal. It now has a labelled modal dialog, a
localized close button, a one-control focus trap, inert/hidden background
content with prior-state restoration, and focus return. Lint and the production
build pass; browser keyboard/screen-reader verification remains open.
`CinematicNav` also closed sheets through native scroll synchronization or a
programmatic story target without returning focus; the focused close button
could then remain inside an `aria-hidden` sheet. Those exit paths now share the
saved-focus restoration used by Escape and the sheet close button. Lint and the
production build pass; browser focus verification remains open.
The renderer-failure boot gate was created after the initial document
translation pass and kept English copy in saved-RU sessions. It now carries
normal i18n markers and applies the active locale immediately after insertion;
the splash status uses the same translated signal-loss label.
The separate terminal renderer-recovery notice had no matching stylesheet,
so its appended message could fall outside the fixed-height viewport. It is now
a localized live alert pinned above the safe-area inset; its nonblocking layout
keeps the renderer-free route navigation usable.
The pre-CSS module-load fallback is independent of that app shell. It now uses
alert-dialog semantics, exposes a labelled description, moves focus to its
reload action, and keeps Tab within the only available action when the main
module cannot start. Its reload action is bound through `addEventListener`,
so the emergency fallback no longer depends on an inline event handler.
The persistent full-screen project dialog also had hard-coded English labels
for its dialog name and close/previous/next controls. Those labels now have EN
and RU entries. The shared translator applies marked `aria-label` attributes
alongside text and placeholders, so persistent console, menu, contact and home
carousel controls follow the active locale without per-component listeners.
The Works archive and Services' two SVG illustrations use the same localized
attribute path; Works project apertures expose their visually hidden project
title directly as the button name instead of overriding it with an English
prefix. A source scan of all 40 Vue SFCs confirmed that every marked
`data-i18n-aria-label` key resolves in the EN/RU dictionaries.
The runtime CinematicNav label refresh also uses translated section wording
and a localized fallback for headings that are absent from a route.
The splash sound/language controls previously wrote English `title` text at
runtime and exposed unlocalized static aria labels. The translator now handles
`data-i18n-title`, and both controls use existing EN/RU names and localized
sound-state hints.
Production Chromium at 390×844 confirmed the showreel dialog in EN and RU:
`role=dialog`, `aria-modal=true`, its named heading, and inert background;
opening focuses Close, Tab and Shift+Tab cycle only the playback and close
controls, Escape closes and returns focus to the trigger, then restores the
background and body scroll state. After selecting RU with the dialog closed,
the close and playback labels rendered in Russian. No page errors appeared.
This closes the showreel keyboard/focus and locale gate; other menu/route
keyboard paths and screen-reader behavior remain open.
Production Chromium at 390×844 with reduced motion enabled reported splash
spiral animation `none`, final opacity `1`, SVG transition `0s`, and
`loader-exit` duration `0.001s`; an actual DOM click removed the splash in
205 ms. The `/services` in-app navigation completed with the transition overlay
idle and scroll behavior `auto`, with no page errors. On `/lab` with a fine
pointer, `data-lab-camera` stayed absent under reduce, appeared when the
preference changed to no-preference, then disappeared when reduce was restored;
canvas pointer input followed that policy. This verifies the shell and Lab
control gates in the production browser path; visual reduced-motion parity of
the scene animation owners on supported GPU hardware remains open.
The persistent console's aria labels use its reactive locale state directly:
its full renderer chrome can mount after `useJlzPage`'s initial document
translation pass, so relying on static translation markers there could leave a
saved RU session with EN control names before the next language event.

Chromium visual QA reproduced the inverse-theme contrast issue on `/works` and
`/manifesto`: polarity classes and foreground tokens changed, but the HTML
shell kept its hard-coded dark background. The shell now uses the shared theme
background token with a startup fallback. Manual Chromium after rebuild
confirmed `/works` paints light (`rgb(233, 238, 245)`) with dark heading text
when inverse is active. On `/manifesto`, the toggle and computed shell colors
also changed as expected, but the screenshot remained dark while the console
reported `createBuffer` failure and repeated WebGPU `popErrorScope` errors.
The orchestration shell for that attempt could not access an NVIDIA driver
(`nvidia-smi` failed), so it could not verify Manifesto's physical-GPU visual
parity. The user has separately confirmed successful physical Firefox/WebGPU
checks in this project; those earlier results remain valid evidence.

The default sandbox cannot bind `127.0.0.1:4173`; an approved loopback-only
preview session enabled the HTTP checks above and was stopped afterward. The
CUA browser kernel could not start (`bwrap` bad descriptor for `.aws`); the
project-root `.aws` path is a protected empty mountpoint and must not be altered
as a workaround. This is a browser-tool sandbox failure, not browser
unavailability. Manual Chromium was used for inverse-theme interaction instead.
Showreel keyboard/
focus and EN/RU labels, shell reduced-motion transitions, and the Lab camera
preference gate are confirmed on production preview. Client takeover, remaining
route keyboard/focus, and other route transitions still need focused browser
review. WebGPU/TSL and WebGL2 backend/recovery need a supported browser and GPU
runtime; source/build success does not close those gates.
On 2026-10-02, the cached headless Firefox process launched but returned
`NS_ERROR_OUT_OF_MEMORY` while navigating to the production preview, so the
current no-scene/manual interaction check could not run. The loopback preview
was stopped; no browser behavior is inferred from that failed attempt.
Another manual attempt on 2026-10-02 used the approved loopback production
preview, but Chromium exited before navigation (`crashpad setsockopt:
Operation not permitted`) and system Firefox exited with code 139 before
writing a screenshot. The preview was stopped; this adds no visual/runtime
evidence.
The cached Playwright WebKit binary also cannot launch on this host because
`libicu74`, `libxml2`, and `libflite1` are missing. The preview was stopped;
system browser dependencies were not installed.

On 2026-10-03, the global OMP and `web` profile were confirmed to configure
Firefox DevTools MCP with different launch modes; the `jlj-worker` profile had
no per-profile MCP registry. A worker-local registry was added for its
dedicated automation profile, but resetting the worker session did not expose
Firefox-specific tools. A fresh CUA session exited with
`trusted Node process exited unexpectedly` before browser inventory. No browser
was launched or profile touched, so this provides no current Firefox app or
physical-GPU evidence; those gates remain open. The source lifecycle pass
found no redundant ownership seam in `ExperienceRuntime`/`SceneHost` teardown
or the `StageRegistry`/`LazyStage`/Vue stage-slot boundary. On the same date,
`bun run format:check`, `bun run lint`, and the full `bun run build` all passed;
the build regenerated no tracked artifact differences and stayed within the
configured budgets (Three 310.94/350 kB gzip; UIkit 53.84/56 kB; public media
5,390.23 kB total, largest asset 4,160.18 kB). No test suite was run.

The 2026-10-02 production build and lint pass after the cache-rule fix.
Bundle gates report Three at 310.94/350 kB gzip and UIkit at 53.84/56 kB. The
1080p 30 fps showreel
`coming-soon.mp4` was re-encoded with H.264 CRF 26 after a full-clip SSIM
comparison (0.9929) and frame inspection; its size fell from 5.27 MB to
4.16 MB with the AAC audio stream copied unchanged. Recheck the complete media
budget in the build below. The Contact-only Three `DRACOLoader` module still
emits both standard and glTF decoder asset sets because the addon declares
both URL families. `ContactCyprusStage` selects the glTF WASM wrapper and
binary and clears the standalone `dep_js` path; only a browser network trace
can confirm requests on the deploy target. Do not delete copied decoder files
without a supported-browser check.

Deployment cache audit found that `/assets/*` incorrectly marked all public
media as immutable even though `/assets/projects/*`, `/assets/gltf/*`, and
`/assets/video/*` use stable, unhashed paths. `public/_headers` now gives those
three public asset groups immediate revalidation and limits one-year immutable
caching to Vite's hashed root JS/CSS/WASM outputs. The current emitted Vite
asset set is flat under `/assets/`, while public media is nested under the
three explicit directories, so these patterns do not overlap for this build.
The rebuilt `dist/_headers` matches its source. This configuration still needs
deployment-server verification; Caddy/HAProxy do not consume `_headers`
automatically.
The route-cache review found the HTML rules matched emitted `.html` filenames,
while the public URLs in the sitemap are extensionless. Cloudflare Pages serves
matching HTML files at extensionless paths and applies `_headers` rules against
URL patterns ([routing](https://developers.cloudflare.com/pages/configuration/serving-pages/),
[headers](https://developers.cloudflare.com/pages/configuration/headers/));
Netlify likewise defines rules by request URL path ([headers](https://docs.netlify.com/manage/routing/headers/)).
Added extensionless EN and RU route patterns, including blog and case-study
paths, while retaining `.html` coverage for hosts that permit those URLs. A
local pattern audit matched all 30 sitemap URLs; the production build copied
the rules into `dist/_headers`. This validates artifact coverage, not the
active HAProxy/static-server response headers, which still need ingress
verification.

Execution order:

1. Source lifecycle trace is recorded above. Still verify first-frame and
   teardown ordering in browser, and trace device-recovery replacement and
   abort behavior on WebGPU/WebGL2 hardware.
2. SceneHost size/DPR ownership was compared against installed Tres source;
   only replacement-renderer synchronization stays app-owned. Verify it after
   device recovery and viewport changes on supported hardware.
3. Source ownership pass found stored disposers for the inspected loop hooks,
   route callbacks, and recovery subscriptions. The SceneHost invalidate
   wrapper now restores its predecessor on reconfiguration/teardown. Continue
   with loop quiescence and recovery evidence on an actual browser.
4. Route IDs, local chapter indices, and canonical world-slot indices were
   traced across `CinematicNav`, `EventBus`, `ContentReveal`, `Experience`,
   and stage owners; a footer/menu polarity bridge defect was fixed. Review
   case-study and unavailable-route states next, then confirm visual parity.
5. StageRegistry contracts and late-result cleanup are traced above; Cyprus
   GLTF network requests now abort on stage release where the platform supports
   Three's LoadingManager contract. Verify repeated route churn and resource
   plateau in browser before closing the stage lifecycle gate.
6. Source review/fix now covers startup cancellation, scene-init failure
   unmount order, and the DOM-only Enter/mount race. Continue with route exit,
   renderer loss, and concurrent teardown, then verify these paths in browser.
   Recovery replacement initialization now races host abort and a 30-second
   timeout because installed Three awaits non-abortable adapter/device requests;
   a late-settling replacement is disposed after its init Promise settles.
7. Recheck the dev optimizer and lazy Cientos/Three chunks after renderer-boundary
   edits. A Vite optimizer restart is not evidence of duplicate runtimes; count
   evaluated Three core URLs and inspect the actual backend when browser access
   is available.

### 2. Make scene composition declarative where it helps — complete

Inventory scene owners as stable declared nodes, loaded assets, generated
geometry/TSL, or route-lazy behavior. Stable transforms and hierarchy belong
in Vue/Tres props. Keep imperative code for live animation and algorithms.
Compare custom control, loader, material, disposal, easing, and capability
helpers with the APIs already installed; delete duplicates when parity is
clear. Remove dead exports, dependencies, compatibility shims, and build
configuration only after checking their real consumers.

Reviewed static transforms in five owners now use Tres props. Lab uses
Cientos OrbitControls. TSL remains one shared graph across WebGPU and WebGL2;
graph errors reach the normal failure path instead of silently switching
render modes. Three's `RenderPipeline.render()` temporarily disables tone
mapping only after updating its captured output transform, so the narrow
project guard around graph rendering is still required to keep that transform
at `NoToneMapping`.

Manual Chromium on the dev WebGL2-backend path exposed an idle-loop regression:
after all scene activity settled, the scheduler remained active at about 6
frames per second. Tres call-stack inspection traced repeat invalidations to
Vue patching `ground.rotation` and Services ring `scale` with newly allocated
but value-identical arrays on each canvas update. Those transforms now reuse
stable arrays. After the splash and scene settle, Chromium reports
`loopActive=false`, `needsRender=false`, and `cursorSettled=true`; frame count
stayed fixed for one second, then advanced by one frame over the next 2.5
seconds and another over the following 0.5 seconds. The scheduler remained
stopped in every sample; the two isolated wake frames were not individually
attributed. The page had no errors. This rules out the recurring idle loop on
the software WebGL2 backend; physical GPU/browser coverage remains open.

The 21 declared owners under `src/app/scene` have now been inventoried. Stable
camera/light/ground/sky and assembly transforms are declared in Tres; the
Cyprus GLTF, route-loaded case planes, and TSL/material algorithms stay with
their route/controller owners. Scene-object refs use shallow storage, with
`toRaw` at the controller boundary where a Vue proxy could otherwise cross.
Resource release follows the distinct owners: Vue releases its Works geometry,
the Contact stage owns the GLTF subtree, and controllers retain shared
materials/geometry leases. No safe cross-owner consolidation emerged from this
pass. The previous `Window.UIkit: any` declaration now uses the existing typed
`src/core/uikit` export (which includes the project's `update` typing); lint
and the production build pass.
The symmetric cubic easing formula is no longer private to ShowreelTheater;
it now sits beside the shared project easing curves and clamps normalized
progress at the helper boundary.

Exit when every scene node and GPU resource has an explicit owner, no helper
duplicates a library feature, and continuous frames are requested only by
visible motion or user activity. Record performance claims only with actual
measurements.

Execution order:

1. Inventory every `src/app/scene/*.vue` owner as stable declaration, generated
   geometry/material, loaded asset, animated behavior, or route-lazy boundary.
   Check its Three object crossing into Vue state uses shallow/raw storage.
2. Compare SFCs against their controller classes. Move only fixed transforms,
   hierarchy, visibility defaults, and other static facts into Tres props;
   retain dynamic layout and per-frame algorithms in their existing owner.
3. Compare app controls/loaders/disposal/easing/capability code with the
   installed Tres/Cientos/Three APIs. Remove redundant helpers or dependencies
   only after checking direct and transitive consumers plus build aliases.
4. For each node and GPU resource, trace creator → attachment → live mutator →
   detach → disposal. Preserve Vue/Tres detach-before-dispose and shared asset
   reference counts. Record route-specific exceptions rather than imposing a
   generic lifetime.
5. Verify every continuous activity flag corresponds to visible motion or a
   deliberate user interaction. Do not claim FPS, memory, startup, or bundle
   improvement without a reproducible measurement or the configured budgets.

Dependency scan: every direct runtime package participates in the application
graph, and the development packages have explicit consumers in config, build
scripts, bundle analysis, lint or the existing quality suite. No dependency was
removed from name matching alone. The Contact GLTF `DRACOLoader` path emits
both standard and glTF decoder asset sets because the Three addon declares
both URL families. Source trace confirms `ContactCyprusStage` selects
`DRACO_GLTF_CONFIG`; Three's `setDecoderPath(config)` assigns the glTF WASM
wrapper and binary and clears `dep_js`, so this route does not use the
standalone JS decoder path. The additional standard files are emitted from
the shared loader module's default URL constants, not from an observed network
request. Keep them until a production network trace or a supported build-time
elimination proves they are unrequested across the required browser set;
deleting outputs alone could leave runtime URLs broken. The active glTF path
remains route-lazy.
Source-map bundle profiling at `e7bc5bf` attributed the shared Three vendor
chunk primarily to Three's WebGPU/core modules; the WebGPU compatibility entry
maps to about 0.2 kB. The lazy Lab-controls output was 80.7 kB raw / 21.9 kB
gzip across Cientos, OrbitControls, stats-gl and required helpers. The release
build remains within the recorded 310.95/350 kB Three and 21.85 kB lazy Lab
gzip sizes; this profile does not justify replacing the installed control API.
The post-recovery-timeout `bun run analyze:bundle` profile at `88291e8` reports
the Three vendor at 310.98 kB gzip and lazy Lab controls at 21.90 kB. The
shared core chunk is 7.73 kB gzip (up from the prior 7.50 kB); the recovery
timeout is a small addition and all configured release budgets still pass.
Item-3 tone-mapping guard trace against installed Three 0.186.1: Three's
`RenderPipeline` constructor captures `renderer.toneMapping` into its output
transform (`_update()` re-captures only on change), and its `render()`
disables tone mapping only around the full-screen quad draw, after that
capture. The draw-site guard in `src/core/RenderPipeline.render` is therefore
the owner of the `NoToneMapping` invariant for the graph's captured
transform; the second `withNoToneMapping` wrap around
`new TSLRenderPipeline(...)` in `TSLPostPipeline._buildPipeline` ran nested
inside that same guard on the single lazy construction path (including the
Showreel's borrowed-scene draws and the post-recovery pipeline rebuild) and
captured a value already `NoToneMapping`. The redundant wrap and its import
are removed; the construction itself is unchanged and `toneMappingGuard`
keeps one live consumer. `bun run lint`, `bun run type-check:vue`,
`bun run build`, and `git diff --check` pass; tracked `dist` assets were
regenerated.
Item-3 `src/Utils/dispose` audit against installed Three 0.186.1 and
Tres 5.9.2 found no redundant seam: both helpers carry their own policy.
Three core and its addons expose per-resource `dispose()` only, with no
subtree or material-graph utility. Tres exports `disposeObject3D as
dispose`, but it releases shared geometry/materials once per referencing
node without deduplication, disposes only the `map` slot, and detaches
each node while deleting `__tres` bookkeeping, which would entangle
Vue/Tres detach ownership with the stage's GPU release.
`disposeMaterialsDeep` dedups materials and textures across its nineteen
slots and disposes textures before materials; `disposeObject3DResources`
traverses meshes only and dedups geometries. `ContactCyprusStage` is the
sole production consumer (source-material release in `load()`, route-owned
release in `disposeModel`); the primitive's `:dispose="null"` keeps Tres
from touching those resources, and `releaseLazyStage` provides the
error isolation. `tests/unit/Utils/dispose.test.ts` pins the exactly-once
contract. `cyprus_3d.glb` uses only `KHR_draco_mesh_compression` with one
untextured material, so the installed loader's KHR clearcoat/anisotropy
texture slots stay unreachable for the current consumer; the slot table
remains scoped to what callers use. Keep both helpers.
Item-3 `webglContextRestore` audit against installed Three 0.186.1:
`WebGLBackend.init` registers the only canvas `webglcontextlost` listener
(`preventDefault()` + `onDeviceLost({api:'WebGL'})`) and removes it in
`dispose()`; the installed webgl-fallback and webgpu trees contain no
`webglcontextrestored` listener, and the only `restoreContext()` call in
`three/src` is the legacy `WebGLRenderer.forceContextRestore()` test
helper, which the app does not use. `WebGLBackend.dispose()` intentionally
calls `WEBGL_lose_context.loseContext()` and never restores, so after
`disposeUnifiedRendererNow` neither the library nor the browser guarantees
a usable context on that canvas. The WebGPU path reports loss through the
`device.lost` promise (`onDeviceLost({api:'WebGPU'})`) with no DOM event
and no browser restore, so the two `waitForWebGLContextRestore` call sites
in `Renderer.recoverFromDeviceLost` stay guarded by `info?.api ===
'WebGL'`: the first waits for the browser's automatic restore before
disposal; the second is constructed with the extension before the old
backend's dispose, catches the dispose-triggered loss event, re-marks the
context restorable, and restores it explicitly through the deferred
`restoreContext()` (Chromium ignores the call while the loss event is
still dispatching). The helper therefore fills the missing library
obligation of the same-canvas replacement policy rather than duplicating
an installed API. The pre-dispose wait is the only removable-seam
candidate: the post-dispose wait plus `isWebGLContextUsable` already gate
the replacement init, so removal converges on the same terminal state,
but it would run `WebGLBackend.dispose()` — including its
`gl.getExtension('WEBGL_lose_context')` cache miss, since `init()` does
not pre-fetch that extension — on a still-lost context in Chromium, which
is the class of behavior the device-loss runtime evidence gate already
covers; the forced-loss Playwright spec drives its own
`restoreContext()` and so cannot disambiguate the pre-dispose wait either.
Keep both call sites; open gate: confirm or falsify the pre-dispose
wait's necessity with forced- and natural-loss runtime evidence on a
supported GPU/browser before removal. Then item 4's per-node and
GPU-resource traces where recorded evidence leaves gaps.
The `CasePlane` constructor no longer re-sets `name`, `frustumCulled`, and
`renderOrder` on the mesh: `CasePlaneNode.vue` already declares all three as
Tres props, and no runtime path mutates them. Both `BakuCarousel` and
`WorksPlaneStage` construct `CasePlane` through that single component, so the
removal covers every consumer. Behavior is unchanged.
`ContactCyprusStage.bindRoot` no longer re-sets `root.name`:
`ContactCyprusStageOwner.vue` already declares `name="contact-cyprus-stage"`
on the `TresGroup`, and Tres 5.9.2's `patchProp` applies the prop directly to
the object at element creation. No code reads or writes that name otherwise,
and the controller's visibility ref remains the live source for the SFC's
`:visible` binding. Behavior is unchanged.
`ShowreelTheater.bindQuad` no longer re-sets `quad.name` or
`quad.frustumCulled`: `ShowreelTheaterOwner.vue` declares
`name="showreel-theater-quad"` and `:frustum-culled="false"` on the
`TresMesh`, Tres 5.9.2's `patchProp` applies both at element creation (props
are patched before the element is inserted into the portal scene, so no frame
can render the quad with the default `frustumCulled`), and no runtime path
mutates either. Behavior is unchanged.
`WireframeTypography.bindMeshes` no longer re-sets `frustumCulled`,
`position`, and `scale` on each glyph mesh: `WireframeTypographyOwner.vue`
already declares `:position="[glyph.x, 0, 0]"` (the same `x` served by the
`renderGlyphs` getter), `:scale="[0, 0, 0]"`, and `:frustum-culled="false"`
per mesh, and Tres 5.9.2's `patchProp` applies them at element creation.
`update()` and `settleReducedMotion()` remain the live owners of the reveal
motion and reduced-motion settle; the `setActive(false)` reset already
returns scale to the declared zero. The stage is disposed on every route
exit and recreated on the next visit, so a re-bind can never run against a
mid-reveal owner state. Behavior is unchanged.
`DrawTrail`'s constructor no longer sets `nodes.root.visible = false`:
`CursorTrailOwner.vue` now declares `:visible="false"` on the `draw-trail`
group, and Tres 5.9.2's `patchProp` applies it at element creation before the
group is inserted into the scene tree, so no frame can ever see the Three
default `visible = true`. SceneHost stops the Tres loop and replaces its
render function before the node slots resolve, and Experience's first drawn
frame runs only after `buildScene` constructs the trail (the scheduler frame
path is gated on the coordinator created there), so the initial hidden state
is identical; `SceneTransformPass.setVisible` remains the sole dynamic
writer. Behavior is unchanged.
`ParticleBurst`'s constructor no longer sets `nodes.mesh.visible = false`:
`IntroLightFramesOwner.vue` now declares `:visible="false"` on the instanced
mesh, and Tres 5.9.2's `patchProp` applies it at element creation before the
mesh is inserted into the scene tree, so no frame can ever see the Three
default `visible = true`. SceneHost stops the Tres loop and replaces its
render function before the node slots resolve, and Experience's first drawn
frame runs only after `buildScene` constructs the burst (the scheduler frame
path is gated on the coordinator created there), so the initial hidden state
is identical; the burst lifecycle (`trigger`, `update` completion,
`setReducedMotion`, the `SceneCoordinator` prewarm toggle, `dispose`)
remains the dynamic visibility owner. Behavior is unchanged.

`WorksPlaneStage.mount` no longer sets `root.renderOrder = 3`:
`WorksStageOwner.vue` now declares `:render-order="3"` on the stage-root
`TresGroup`, and Tres 5.9.2's `patchProp` camel-cases the prop and applies
it directly to the Group at element creation, before the group is inserted
into the scene tree. Three 0.186.1's WebGLRenderer and common Renderer both
pass a Group's `renderOrder` as `groupOrder` to descendant render items, so
the declared value is the same sort key the imperative write produced; the
child case planes' own `render-order="2"` remains a separate key. The
controller wrote the value in `mountStage` while the stage's `visible` was
still its declared `false`, so no frame could ever render with the default
`renderOrder = 0`. Behavior is unchanged.

Remaining controller-vs-SFC inventory (fixed facts already moved; the rest
triaged):

- Dynamic values (route, scroll, or per-frame) stay in their controllers:
  `SceneCoordinator` section-slot and route visibility fan-out
  (intro slot, prewarm toggles, Agros particles, Services, Baku, Lab),
  `SceneTransformPass` scroll-fade group/carousel visibility,
  `StageRegistry` Lab `visible = page === 'lab'`, `LabGamepad` pointer-tilt
  rotation plus `resetMotion` on route entry (the Lab stage stays mounted
  after `/lab`, so SFC props are not re-applied by a remount),
  `WorksInstallation` mode-dependent trace/ticks/assembly transforms,
  `CinematicCamera` and `Lights` smoothing, `BakuCarousel` per-frame card
  layout, `CasePlane` reveal visibility, `ContactCyprusStage` camera-follow
  root transform and loaded-GLTF mesh culling/shadow, `ServicesStage`
  camera-follow root and ring spin, and `SplashCube` reaction rotation.

Execution-order item 4 (per-node and GPU-resource traces) is closed:
every creator → attachment → live mutator → detach → disposal chain is
traced in source, no source-level gap remained, and no source change was
required. The owner chains and the remaining runtime-only gates are
recorded in Current architecture and evidence.
Execution-order item 5's source trace is complete: every activity flag and
non-flag demand has an animator or user/environment event with a bounded
settle/release path. Attribution of the two idle wake frames and a repeat
idle check on physical WebGPU remain runtime gates; no performance claim is
made without new measurements.

### 3. Production and whole-tree audit — implementation complete; deployment gated

Review direct route entry, accessibility, reduced motion, locale switching,
responsive behavior, renderer failure, content generation, asset paths,
deployment output, scripts, and dependencies. Remove obsolete components,
styles, docs, and shims once their consumers are verified. Re-scan the complete
tree for parallel old/new implementations, dead code, stale claims, and
unnecessary abstractions. Update this plan from findings and stop when each
remaining complexity has a concrete product or platform reason.

The initial `.prettierignore` excluded build output, prerenders, one generated
blog glob, and the sitemap, but did not protect the other generated locale
pages, editorial HTML, or vendored assets. The ignore list now covers those
generated/vendor outputs while retaining authored source and tests. Added a
repository Prettier contract matching the established TypeScript style:
single quotes, no semicolons, 100-column width, and trailing commas. On
2026-10-03, Prettier identified 79 authored files to format; they are now
formatted. `bun run format:check`, `bun run lint`, and the full production build
pass, including regenerated tracked HTML/assets. No tests were run; test files
were only formatted. This establishes a deterministic formatting gate without
rewriting generated/editorial/vendor inputs. The quality workflow now runs
`format:check` before the build, so CI enforces the same contract.

Exit with a clean production build, browser/lifecycle evidence in the engines
available, WebGPU/TSL evidence on supported hardware, automatic WebGL2 backend
selection where WebGPU is unavailable, and no unexplained compatibility seam.
State any engine or hardware coverage that could not be verified.

Current production-output scan checked the 15 emitted SPA, case-study, and blog
documents: each has English default `html[lang]`, a title, canonical URL, one
`main`, and one `h1`; all images have `alt`, and no unnamed standard links or
buttons, duplicate IDs, or broken `aria-labelledby` / `aria-describedby`
references were found. The standalone blog has no locale switch, and at that
scan its article sources were English-only, so the bilingual public-route
criterion needed an explicit locale-path policy; the URL-based `/ru/...`
policy and separate Russian editorial sources recorded below implemented it.
Production Chromium directly loaded `/`, `/services`, `/works`, `/manifesto`,
`/lab`, and `/contact` in EN then RU. All six updated title, description, and
`html[lang]`; canonical URLs remained at each route, with no page errors or
horizontal overflow at 390×844. All four case-study routes were also checked
in RU, including their chapter copy, meta description, language attributes,
and canonical paths.
After the compact-layout change, a current production Chromium pass loaded all
15 sitemap URLs directly with HTTP 200, one `h1`, expected titles/canonicals,
and no failed local requests. That pass exposed a Prism exception on every
article: the configured GLSL grammar extends C, but the page omitted Prism's
C dependency ([Prism component metadata](https://github.com/PrismJS/prism/blob/v1.30.0/components.json)).
Added the upstream C component before GLSL and included Prism's MIT license.
All four article URLs now load the JavaScript, TypeScript, C, GLSL, and CSS
grammars without page errors or failed requests; code blocks contain
highlighted tokens. A GLSL shader snippet also produces Prism tokens. The blog
index intentionally does not load Prism.
The current authored URL inventory scanned 189 source/content/public files and
found 30 fixed root-path references under assets, fonts, vendor, and brand
files; every referenced file exists in both `public/` and `dist/`. Direct
dependency review found a current consumer for each package: source/runtime,
prerender/build tooling, type resolution, lint/format configuration, or the
existing unit/browser suites. The quality workflow rebuilds and diff-checks
tracked generated outputs, then runs unit/lint; its browser job runs the
cross-engine matrix and host-teardown scenario. These configured suites were
not run locally because the repository contract requires an explicit request.
The user confirmed Russian pages must be indexable. Locale policy is now
URL-based: existing bare paths remain English; Russian pages use `/ru/...`,
with `/ru/` as the Russian home canonical. There is no language auto-redirect
from cookies or browser headers. This follows Google's guidance to give each
language a separate URL and annotate alternate pages with reciprocal
`hreflang` links ([multilingual sites](https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites),
[localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)).
The route manifest/router, language switch, app and case-study navigation,
runtime metadata, and no-scene navigation preserve the selected locale. The
static build now emits English and Russian main pages, case studies, blog index,
and all four articles. Blog articles have separate Russian editorial sources
and translated metadata; every pair has a self-canonical and reciprocal
`en`/`ru` alternates plus `x-default`. All 30 generated URLs are listed in the
sitemap.
Manual production-preview inspection with JavaScript disabled returned 200 for
all 30 URLs and the exact `/ru` alias. Each page had the expected `<html lang>`,
localized title and H1, path-specific canonical, and all three alternate
links. On the live app, the switcher changed `/services` to `/ru/services`,
translated the title, H1, and accessible label, and switched back to English;
no page errors occurred. In the `?no-scene` path, after the splash Enter action,
the fallback console switched `/services` to `/ru/services`; its Works and
home links then pointed to `/ru/works` and `/ru/`. Opening Works kept the RU
title and content, with no page errors. Build, lint, and `git diff --check`
pass. The actual reverse-proxy route rewrites and deployed responses still
require validation through the ingress.
On 2026-10-02, the current local `dist/` was checked against every URL in its
generated sitemap: all 30 entries resolved to a generated HTML file with the
expected language, non-empty localized title/description, self-canonical,
`og:locale`, and `en`/`ru`/`x-default` alternates. No RU SEO implementation gap
was found; deployed responses remain an ingress acceptance gate.
Manual production Chromium with SwiftShader produced Three's
`WebGPU is not available, running under WebGL2 backend` fallback warning, then
created a WebGL2 context on `.jlz-scene-canvas`. Across Home → Works →
Manifesto → Contact SPA navigation it kept exactly one scene canvas; the scene
canvas and host stayed `aria-hidden`, with no page errors or failed requests.
This confirms software WebGL2 fallback and persistent canvas ownership; it
does not establish behavior or visual parity on physical GPU hardware.
On that software fallback, a 390×844 Home screenshot showed the Entered page,
its 390×844 scene canvas, readable hero and visible scene after the loader
exited, without browser errors. Works and Manifesto inverse-theme interaction
were also checked: each changed from a dark surface/light heading in Auto to
a light surface/dark heading in Inverse, and the selected mode persisted when
navigating Works → Manifesto. Returning to Auto restored the dark surface and
light heading on Manifesto. This confirms those route theme states on software
WebGL2; physical-GPU rendering remains open.
Manual synthetic WebGL2 context loss exposed a recovery failure after Three's
WebGL backend disposed itself: the context was restored once by the browser,
then remained lost after backend cleanup. The recovery path had requested a
second restore itself, while its event helper also requested restoration
during `webglcontextlost` dispatch. The helper now schedules that request after
event dispatch and the owner waits for that single restore. Repeating the
synthetic loss/restore cycle on production Chromium/SwiftShader yielded the
expected loss → restore → backend-disposal loss → restore sequence, a usable
WebGL2 context, one scene canvas, and no renderer failure overlay. Three emits
its expected device-lost console warning; no app errors or recovery-failure
message appeared. Teardown/timeout also cancels the scheduled restore callback
so an aborted owner does not touch a closing context. This is software-backend
lifecycle evidence, not physical GPU acceptance.
Reduced-motion source review found that the splash still ran 720 ms spiral
scale entrances, a 420 ms SVG settle transition, and a 780 ms scaling exit;
only the central pulse had been disabled. The reduce rule now holds the spirals
at their final transforms/opacities, disables the SVG transition, and completes
the existing `loader-exit` event contract in 1 ms. Chromium emulation confirms
computed spiral animation `none`, SVG transition `0s`, exit duration `0.001s`,
and prompt loader removal. The splash skip link now uses the `main` target,
exits the overlay, and moves focus to that landmark; all SPA mains and the
standalone blog main accept programmatic focus, so their route skip links land
correctly too. Keyboard Chromium verified focus transfer for splash, no-scene
fallback, and blog, with no page errors. Lint and the production build pass.

Execution order:

1. Walk `ROUTE_MANIFEST` plus case-study/blog entries for direct URL load,
   refresh, fallback behavior, canonical URL, localized title/description,
   translations, and sitemap/prerender parity.
2. Review semantic landmarks, heading order, names/pressed states, keyboard
   access, focus movement, decorative canvas hiding, modal/splash failure
   states, reduced motion, and renderer-free continuation. Inspect both
   static prerender and client shell where they differ.
3. Review narrow/short viewports, touch/pointer policy, scroll capture,
   overflow locks, theme sync, and route transitions. Resolve layout or
   behavior defects found in the source; use browser inspection if the runtime
   is reachable.
   Source viewport scan confirms both the cinematic shell and content sections
   use fixed `100dvh` stages with hidden overflow; case-study copy and mobile
   menu provide their own scroll regions. Verify short landscape, small-height
   and enlarged-text layouts before changing this contract, since scene progress
   and DOM section visibility share the route's story position.
   A production Chromium check at 640×360 measured all four case-study copy
   panes at 94 px tall with 127–314 px of content. Each pane responded to its
   own vertical scroll while the story track stayed at the current chapter;
   no horizontal overflow or page errors appeared. A 200% root-font-size
   Chromium emulation exposed clipped content in Services, Manifesto, and Lab
   on a narrow viewport. Scrolling the active section in-page kept the outer
   story track position unchanged. Added section-level vertical overflow for
   compact viewport media queries. Post-build Chromium at 320×640 verified
   Services, Manifesto, and Lab scroll internally after resizing the root font
   to 200%; the outer track stayed put and no horizontal overflow or page
   errors appeared. The same check exposed a menu layout defect: the mobile
   container had a scroll path at 320×640, but short landscape let the grid
   collapse to zero height. Compact-height CSS now makes the menu container
   the scroll owner and lets its grid keep intrinsic height. Chromium verified
   the final Contact link is reachable after scrolling at 320×640 and 640×360
   with 200% root font size, with no horizontal overflow or page errors. Lint
   and the production build pass. Chromium keyboard interaction on both sizes
   focused the close control on open, moved Tab into navigation, returned
   Shift+Tab to close, and restored focus to the launcher on Escape; the menu
   reports expanded state and the hidden story sections become inert. Touch
   emulation scrolled the menu container at 320×640 and 640×360. After exiting
   the no-scene splash, native wheel input scrolled through a 2,253 px Services
   section overflow, advanced the story track, and began scrolling the next
   section without page errors. Other route transitions and the full
   pointer-device matrix remain open.
   Source review found SPA route links could be removed while focused, leaving
   keyboard focus on the document body; the polite title announcer did not
   restore focus. Named route changes now focus the incoming `#spa-content`
   after Vue's next DOM update. A generation guard cancels stale focus if
   another navigation commits first, and language-only URL changes preserve
   focus on the language control. `bun run lint` and the full production build
   pass, including updated tracked prerenders and asset hashes. The user's X11
   suggestion resolved the local Chromium launch failure: elevated Playwright
   with system Chromium 152, `--ozone-platform=x11`, and crashpad disabled
   opened the production preview. At 390×844 in no-scene mode, keyboard
   navigation `/services` → `/works` left focus on the one `#spa-content`; the
   language control then changed `/works` → `/ru/works` while retaining focus
   on itself and setting `html[lang=ru]`. There were no page errors. This
   confirms SPA focus behavior without the renderer; Firefox/WebGPU and
   physical-GPU visual coverage remain separate gates. The user reports that
   Firefox on the workstation starts with WebGPU; that is useful environment
   information, not yet observed app evidence. The CUA runtime still exits
   before browser inventory, and launching `/usr/bin/firefox` through
   Playwright's Juggler adapter exits before creating a session, so browser
   control must use the workstation Firefox surface once it is available.
4. Audit public asset URLs, MIME/deployment paths, static multi-page output,
   Caddy/reverse-proxy development accommodations, scripts, package pins,
   unused dependencies, generated outputs, and workflow duplication.
   The package-pins and unused-dependency slice of this item is complete. All
   27 direct dependencies (6 runtime, 21 dev) have a current consumer in
   source, scripts, or config, and none is unused. Bun registry access
   succeeded with `bun outdated` on 2026-10-03: `@types/three` 0.186.0 and
   `@types/uikit` 3.23.1 are at their latest upstream versions, and the direct
   `source-map-js` 1.2.1 is outdated relative to 1.2.2. `bun outdated` also
   reports updates for other packages; the major TypeScript, jsdom, and Vitest
   upgrades remain unassessed for compatibility and unchanged.
   Four further in-range `bun outdated` updates landed on 2026-10-03:
   `@types/node` 26.6.3 → 26.6.4, `eslint` ^10.11 → ^10.12 (resolved
   10.12.0), `globals` ^17.12 → ^17.13 (resolved 17.13.0), and `vue-tsc`
   3.3.11 → 3.3.12; the lockfile also moves the transitive
   `@vue/language-core` 3.3.11 → 3.3.12 required by `vue-tsc`. The direct
   `source-map-js` 1.2.2 pin is unchanged. `bun run format:check`,
   `bun run lint`, `bun run type-check:vue`, `bun run build`, and
   `git diff --check` all pass; no test suites were run and no major
   upgrades were made.
   The quality workflow's generated-artifact diff gate previously omitted the
   committed RU blog prerender source inputs `ru/blog.html` and `ru/blog/`; it
   now includes both. The direct `source-map-js` devDependency is updated
   1.2.1 → 1.2.2. A frozen Bun install through the OMP worker succeeded and
   confirmed `node_modules/source-map-js` is 1.2.2 after direct-shell DNS
   failures. The frozen lockfile check, `bun run format:check`, `bun run lint`,
   and `bun run build` pass; the build regenerated all locale blog inputs and
   the 30 sitemap URLs. No unit or browser suites were run.
   `scripts/test-browser-matrix.ts` now delegates to the canonical
   `test:serial` package script through `process.execPath` instead of invoking
   `playwright test --workers=1 --reporter=line` directly, while preserving
   `JLZ_CROSS_BROWSER_MATRIX=1`, stdio forwarding, error propagation, and exit
   handling. `bun run lint`, `bun run type-check:vue`, and `bun run build`
   pass; no test suites were run.
   `bun run build` no longer duplicates the budget check inline. Its final
   step previously ran `bun scripts/check-build-budgets.ts` directly, the same
   command defined by `budget:build`; it now ends with `bun run budget:build`,
   so the budget check has one canonical definition. `bun run format:check`,
   `bun run lint`, `bun run type-check:vue`, and `bun run build` (budget check
   routed through `budget:build`) all pass, and `git diff --check` is clean;
   no test suites were run.
5. Formatting contract and generated/editorial/vendor ignores are established
   and enforced by CI. Continue removing obsolete styles, code, docs, and config
   only after checking exact imports/callers.
6. Run lint and the full production build after coherent changes. Do not run
   unit or browser test suites without the user's explicit request; report the
   unverified runtime cases as open acceptance gates.

## Working rules

- Read repo instructions, callers, and installed library APIs before changing
  ownership.
- Make coherent slices that remove the replaced path in the same change.
- Tests exist to guard real user-facing behavior and contracts that can
  plausibly regress — not coverage for its own sake, and never scaffolding
  written just to keep an agent-authored test green. Prefer deleting a brittle
  test over adding harness code, keep the unit suite green instead of growing
  a baseline of known failures, and do not add new test files without a
  concrete regression class to guard. A production build may be used for
  type, compatibility, prerender, bundle, and release validation.
- Do not claim runtime, browser, or performance evidence beyond what ran.
- Keep generated `dist/` and deployment workarounds only after verifying their
  consumers.
- Update this queue when evidence or phase status changes; commit completed
  slices with a message describing the simplification.

The project viewer expands from the current interaction point: pointer opens
use the captured pointer location, keyboard opens use the focused control's
center, and the desktop/mobile scene coordinates are fallbacks for scripted
opens. The plane's existing TSL cloth pulse and DOM clip reveal form one
gesture. Case-study media now uses a larger framed presentation, and case
titles clear the material narrative. Static local
Chromium review at 1440×900 and 390×844 found and fixed two mobile overlaps:
the Works title against the orbit installation, and the fullscreen title
against the persistent media controls. Mobile `/works` has no horizontal
overflow; the viewer poster decodes and the transition settles without console
errors. Pointer-origin computation and focus-origin fallback both resolve to
the trigger location. These screenshots use SwiftShader and are visual
DOM/backend smoke, not physical-GPU visual evidence.

A local Chromium 152 run forced Three's WebGL2 backend over SwiftShader because
this session has no `/dev/dri` or `/dev/nvidia*`, and `nvidia-smi` cannot reach a
driver. On `/works`, the settled snapshot reported one renderer canvas, 27
scene geometries, 22 materials, 5 scene textures, and renderer counters of 14
geometries / 16 textures. Idle ended with `loopActive=false`; 22 startup/idle
frames had total CPU-frame p50 1.5 ms / p95 70.4 ms, with the latest at 1.7 ms.
After warmup, 120 pointer-active frames measured total p50 0.9 ms / p95 1.9 ms
and renderer p50 0.6 ms / p95 1.3 ms. The startup p95 outlier is shader/backend
initialization under software rendering, not a physical-GPU budget result. A
resource-snapshot traversal measured about 0.058 ms per call on this scene.
DevPanel previously performed that scene traversal and refreshed hidden
Tweakpane controls every 500 ms in development; its refresh now returns early
while hidden. The Vite dev dependency transfer (~19.6 MB) is unbundled and is
not used as a production-size metric. The final project films are not present
yet, so the existing static placeholder textures remain until the local renders
are ready; the current Porsche cover is visibly marked “EBB VIBES”.

Type-check, lint, format check and production build/budgets remain the release
checks for this local slice. CUA still exits before initialization, and no
physical GPU is exposed to this shell, so WebGPU hardware performance remains
open.

Home Works ribbon and project theater checkpoint (2026-10-04): the carousel
tiles remain flat image planes while their positions, yaw and small residual
shader deformation sample the same continuous path. A single narrow TSL
substrate follows that path beneath the tiles, so the home display reads as one
spatial timeline ribbon rather than a set of individually bent cards. The
substrate was muted and narrowed after the first local render showed bright,
rectangular patches in the gaps. This ribbon material is enabled only for the
home carousel; `/works` case planes keep their existing material. A follow-up
particle pass found the likely source of persistent glyph flicker: linearly
filtered atlas samples could bleed across tile boundaries. The reference
`Sec3Particle` confirms that atlas selection is static per instance using
`floor(6 * mod(num.x / 4, 1))`; restore that exact distribution rather than
mapping every instance across all six cells. Particles follow the reference's
Y rise and XZ orbit around the field center; a mistaken extra `0.08` multiplier
had almost stopped both motions. Use `speed` as the single time scale (0.35 in
Works), keep each glyph upright (per-sprite spin made the asymmetric triangle
and arrow cells read as tile swaps), remove the abrupt 4× exponential size
pulse and hue cycling, keep glyphs above subpixel size, soften the cyan glow
threshold, and fade particles near the vertical wrap edge. Atlas UVs remain
inset to prevent adjacent-cell sampling. A separate immutable `atlasFrame`
instance attribute now carries the CPU-computed reference frame, so time and
position nodes cannot influence tile identity. Frustum culling is enabled with
a conservative sphere covering the orbit, wrap and visibility-fade expansion.
This source comparison is grounded in
[`Sec3Particle/index.ts`](https://github.com/junni-inc/next.junni.co.jp/blob/master/src/ts/MainScene/World/Sections/Section3/Sec3Particle/index.ts)
and its vertex/fragment shaders; the new adaptation still needs browser visual
review.

Opening a project now presents a full-viewport mobile-first case theater in the
site's graphite, phosphor and technical type system. It features the selected
project's cover, title, description, metadata and tags, a dedicated close
control, and a link to its localized case route; carousel arrows and arrow-key
navigation were removed from the overlay. The overlay keeps its focus trap and
Escape behavior. Desktop SwiftShader review from this change confirmed the
selected-project content and successful navigation to `/works/porsche-911-spider`
with no console errors. The attempted fresh 390×844 review stalled at the
disabled splash-entry control under headless SwiftShader, so this revision does
not claim new mobile-render evidence. Earlier mobile scene evidence remains in
the history above. No physical GPU timing was measured. Type-check, lint and
format checks and the full production build/budget check pass. The refreshed
particle change has not had a new browser render because headless SwiftShader
stalled at splash initialization. No test suites were run.

The fullscreen entrance now uses a trigger-origin circular aperture, with a
short phosphor bloom, a restrained poster settle, then staggered frame and
copy reveals. Keyboard opens fall back to the focused trigger or viewport
center, and reduced-motion mode bypasses the bloom/transitions. This pass has
build evidence and a forced-open 390×844 headless Chromium/SwiftShader layout
review with no horizontal overflow. This checked the settled theater and CSS
origin variables, not the live pointer-trigger lifecycle or physical GPU.

## Status

Phases 1 (runtime ownership) and 2 (declarative scene composition) are
complete. Phase 3's source, quality gates, route output, and static deployment
configuration are implemented. The S1–S9 release audit findings are closed;
the latest recorded verification includes type-check, lint, formatting,
103/103 unit tests, two byte-identical production builds, and e2e results of
18 passed / 6 skipped / 0 failed. This session's `bun run build`,
`bun run type-check:vue`, `bun run lint`, `bun run format:check`,
`bun run check:stdlib`, `bun run test:unit` (103/103), and
`bun run test:serial` (18 passed / 6 opt-in skipped) passed; the Playwright
suite used pinned Chromium 153 installed under `/tmp`. A pinned Firefox 155
run also passed 17 tests with 7 opt-in skips. Compose config validation passed
and a static route check mapped all 30 sitemap URLs to generated HTML files.
The full production build passed with budgets unchanged.

The project now includes a non-root NGINX image and Compose service for the
existing reverse-proxy deployment shape. The image built locally and passed
`nginx -t`; its restricted runtime became healthy as UID 101 with a read-only
root filesystem. HTTP smoke checks passed for all 30 sitemap routes, EN/RU
language markers, security/cache headers, gzip, `/healthz`, missing-asset 404,
and the unknown-route fallback. The first smoke exposed a route/directory
collision on `/works` and `/blog`; ordering `$uri.html` before `$uri/` fixed it.
An isolated local HAProxy 3.2.19 listener (matching the OPNsense binary) then
proxied the restricted origin container over a private Docker bridge. A
temporary self-signed `portfolio.test` certificate verified TLS/SNI locally;
`/healthz` returned 204, all 30 sitemap routes returned 200, security and
HTML cache headers matched policy, gzip was enabled, missing assets returned
404, and unmatched Host returned 404. HAProxy/origin containers, network, and
certificate were removed automatically. This closes the local origin↔HAProxy
integration smoke, but does not stand in for the OPNsense frontend: no
app-specific ACL/action/backend exists there yet, and its existing LE
certificate/public DNS route was not used for the portfolio.

Physical-GPU Chromium evidence is now available. With Chromium 152 on the
RTX 5090 (Blackwell), the production app requested a non-fallback NVIDIA
adapter (`GPUCanvasContext`, `isFallbackAdapter=false`) and rendered the
Home → Services → Works → Porsche 911 Spider → Manifesto → Lab → Contact SPA
sequence on one persistent canvas without page or console errors. A controlled
Works-route comparison on the same GPU confirmed Three's WebGL2 backend as
`WebGL2RenderingContext` via ANGLE/NVIDIA; both screenshots showed matching
scene composition and the runs had no errors. This is visual/runtime evidence,
not pixel-identical output. The workstation also exposes an RTX 4060 Ti.

Firefox app coverage is now confirmed by the pinned Playwright Firefox 155
run (17 passed / 7 opt-in skipped). The system Firefox executable had failed
the Playwright Juggler handshake, but using Playwright's pinned browser resolved
that environment mismatch. WebKit 26.6 installed, but Playwright could not
launch it because the host lacks `libicu74`, `libxml2`, and `libflite1`;
WebKit's 20 launch failures are environment failures, not app assertions. An
attempt to use the matching official Playwright Docker image instead made no
download progress for over four minutes and was stopped; no system packages
were installed.
Natural hardware device-loss evidence remains open. The CUA automation runtime
also exited unexpectedly and was not needed for these Playwright checks.

Ingress recheck on 2026-10-04: system DNS returned no addresses for
`justlovejazz.dev` or `www.justlovejazz.dev`, and HTTPS failed before
connection with `Could not resolve host`; independent DNS-over-HTTPS returned
NXDOMAIN for both. The only Docker context is the local Unix socket.

The user SSH config resolves `pvebase` to `192.168.10.192`; its OPNsense VM
(ID 100, `192.168.10.1`) has an active TLS frontend on port 443 and presents a
Let's Encrypt wildcard certificate for `*.6la.ru` (valid through
2026-12-23). Existing `pvebase.6la.ru` and `opnroute.6la.ru` routes return
200 through this frontend. Read-only config inspection found active ACL/action
routes for other services but none for `justlovejazz.dev`; that SNI gets the
default HAProxy 503. DNS-over-HTTPS independently returns NXDOMAIN for both
`justlovejazz.dev` and `www.justlovejazz.dev`; the public IP path timed out.
No OPNsense configuration was changed, consistent with the user's
clarification that the project is still in development and checks are local.

Follow-up attempt to exercise the OPNsense HAProxy binary itself on a temporary
LAN-only listener (`192.168.10.1:18443`) did not complete. QEMU Guest Agent
timed out while staging the temporary config/certificate; subsequent
`qm agent ping` reports that the guest agent is not running. The OPNsense VM
remains `running`, the existing `pvebase.6la.ru` and `opnroute.6la.ru` routes
still return 200, port 18443 times out, and the temporary origin container was
removed. Persistent `config.xml` and the active `:443` frontend were untouched.
Guest `/tmp` cleanup could not be confirmed after QGA stopped; any remaining
files contain only the generated self-signed test certificate/key and
temporary HAProxy config. Follow-up recovery probes confirm the VM is running,
but `qm agent ping`/`guest-exec` still fail, direct root SSH rejects the
available public key, serial terminal exposes no shell prompt, and unauthenticated
WebGUI requests reach only the login redirect (`/` 200, `/ui/` 302). CUA
automation also cannot start because its sandbox reports `.aws: Bad file
descriptor`; `.aws` was not touched. No non-disruptive guest recovery path is
available from this session. Do not reboot the firewall VM without approval;
QGA recovery requires authenticated local console access or a controlled
restart before this test can be retried.

Production-ready acceptance is not yet complete. Remaining gates are
an app-specific route through the local OPNsense HAProxy using its existing
certificate (including container-origin headers/routes/TLS), WebKit app
coverage, natural hardware device-loss evidence, and recovery of the OPNsense
guest agent before a direct-gateway test. Public DNS/TLS and deployment remain
later release gates; local build and isolated HAProxy smoke do not claim them.

The persistent cinematic CTA is the only visible content action across the 3D
routes. On Home it opens the showreel, Services, the focused Works project, or
the Contact footer according to the active frame. Services, Manifesto, and Lab
use the active section to open its related article; Works opens the case for
the active room; case-study chapters open the focused project's fullscreen
material, with Contact on the final chapter. Labels use short EN/RU copy and a
single fixed-size left icon. Pagination and route navigation remain separate;
Telegram, GitHub, and email channels remain available. Inline CTAs are retained
only in the no-renderer continuation path.

Local visual review used headless Chromium with SwiftShader at 390×844 and
1440×900. The single launcher remained visible in both layouts; its label
changed through Reel, Explore, Explore, Contact. The Works action opened the
focused Porsche project viewer, and the Services action reached its static
article route. This checks DOM/UI flow and responsive placement only; it is not
physical-GPU rendering evidence.

Route-template checkpoint (2026-10-05): Services now uses a capability
instrument layout with a clear editorial heading and a readable proof panel;
Manifesto uses a principles folio with a large principle index and working
protocol; Lab uses a compact experiment readout; case studies use the project's
accent color, chapter marker, discipline chips, and a legible narrative panel.
The same mono index, accent rule, elevated panel, and persistent launcher tie
the pages together without forcing one shared page component. English and
Russian labels were added for the new protocol/run markers. Headless Chromium
visual review covered all four routes at 390×844 and 1440×900; section content
fits its desktop viewport, and mobile copy panels sit clear of the persistent
launcher. The main Works carousel and Home, Contact remain unchanged; the case
study template was included because it was among the unfinished content routes.
The preview used SwiftShader and does not certify physical-GPU rendering.

This local slice passed `bun run type-check:vue`, `bun run lint`, and
`bun run build` with existing bundle budgets. No tests were run, consistent
with the repository's local-work contract.
