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

## Work queue

### 1. Reduce runtime ownership overlap — active

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
Next inspect `SceneHost` readiness/renderer bridge and the split route policy
between `Experience`, `SceneCoordinator`, and `StageRegistry` before moving
state. [Completed below: SceneHost bridge, route policy and navigation observer
ownership were traced; no redundant RAF, scheduler or scroll-state owner was
found. Continue with lifecycle error/teardown paths and inspect route UI
controllers for behavior that can move back into Vue without losing scene
ownership.]

Readiness trace update: the renderer is constructed synchronously by the
`TresCanvas` factory, initialized by Tres, then inspected in `onReady`. The
host publishes only after its declared Vue/Tres nodes report ready; Experience
then adopts those nodes and starts its own init pipeline. On host teardown,
stage slots clear before Tres children unmount and the renderer disposal is
flushed afterward. A host unmount or renderer error during the readiness wait
previously left `onReady` suspended on unresolved slots; the wait now races a
host-owned cancellation signal, with a lifecycle generation check before
publishing. No browser evidence was available for exercising that race.

Async teardown source trace: the supported app-level `unmountVueApp()` path
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
This environment has no usable NVIDIA driver/GPU device, so Manifesto visual
parity and the WebGPU render path remain unverified on supported hardware.

The default sandbox cannot bind `127.0.0.1:4173`; an approved loopback-only
preview session enabled the HTTP checks above and was stopped afterward. The
CUA browser kernel could not start (`bwrap` bad descriptor for `.aws`); manual
Chromium was used for inverse-theme interaction instead. Showreel keyboard/
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

### 2. Make scene composition declarative where it helps — active

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

### 3. Production and whole-tree audit — pending

Review direct route entry, accessibility, reduced motion, locale switching,
responsive behavior, renderer failure, content generation, asset paths,
deployment output, scripts, and dependencies. Remove obsolete components,
styles, docs, and shims once their consumers are verified. Re-scan the complete
tree for parallel old/new implementations, dead code, stale claims, and
unnecessary abstractions. Update this plan from findings and stop when each
remaining complexity has a concrete product or platform reason.

The existing Prettier scripts have no repository config. `.prettierignore`
protects build output, generated prerenders, generated blog route documents,
and the generated sitemap from broad write commands. The blog prerender step
uses its explicit output list and an empty allowlist file to retain its
formatting pass. On 2026-10-02, `bun run format:check` flagged 226 files under
Prettier defaults. A probe using the prevailing TypeScript style (single
quotes, no semicolons, 100-column width, trailing commas) reduced that to 81;
the remaining differences include large Vue/Three files, generated/editorial
HTML and vendored minified assets. Do not run a whole-tree rewrite until a
repository style contract and ownership exclusions are agreed; format touched
files with the existing dominant style meanwhile.

Exit with a clean production build, browser/lifecycle evidence in the engines
available, WebGPU/TSL evidence on supported hardware, automatic WebGL2 backend
selection where WebGPU is unavailable, and no unexplained compatibility seam.
State any engine or hardware coverage that could not be verified.

Current production-output scan checked the 15 emitted SPA, case-study, and blog
documents: each has English default `html[lang]`, a title, canonical URL, one
`main`, and one `h1`; all images have `alt`, and no unnamed standard links or
buttons, duplicate IDs, or broken `aria-labelledby` / `aria-describedby`
references were found. The standalone blog has no locale switch and its
interface and article sources are English-only, so the bilingual public-route
criterion still needs an explicit locale-path policy before implementation.
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
4. Audit public asset URLs, MIME/deployment paths, static multi-page output,
   Caddy/reverse-proxy development accommodations, scripts, package pins,
   unused dependencies, generated outputs, and workflow duplication.
5. Establish a formatting contract: generated-file ignores now exist; define
   authored-file style before applying formatting. Remove obsolete styles,
   code, docs, and config only after checking exact imports/callers.
6. Run lint and the full production build after coherent changes. Do not run
   unit or browser test suites without the user's explicit request; report the
   unverified runtime cases as open acceptance gates.

## Working rules

- Read repo instructions, callers, and installed library APIs before changing
  ownership.
- Make coherent slices that remove the replaced path in the same change.
- Do not add or run tests unless requested. A production build may be used for
  type, compatibility, prerender, bundle, and release validation.
- Do not claim runtime, browser, or performance evidence beyond what ran.
- Keep generated `dist/` and deployment workarounds only after verifying their
  consumers.
- Update this queue when evidence or phase status changes; commit completed
  slices with a message describing the simplification.

## Status

Phases 1, 2, and 3 remain active. Prior work has removed the
app-authored renderer backend recreation, silent TSL render fallback, duplicate
route-mount flag, duplicate route state, repeated frame config lookups, and a
dead particle branch. The host contract now belongs to the Experience runtime;
Three selects the backend; Showreel shares the TSL graph; and static scene
transforms use Tres props in reviewed owners. These are partial reductions,
not proof that the architecture or project is production ready. Continue with
the source ownership audit, then revise status from concrete findings.
