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
  Build/lint validation is pending; no-scene browser interaction remains an
  open check.

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
state.

Readiness trace update: the renderer is constructed synchronously by the
`TresCanvas` factory, initialized by Tres, then inspected in `onReady`. The
host publishes only after its declared Vue/Tres nodes report ready; Experience
then adopts those nodes and starts its own init pipeline. On host teardown,
stage slots clear before Tres children unmount and the renderer disposal is
flushed afterward. A host unmount or renderer error during the readiness wait
previously left `onReady` suspended on unresolved slots; the wait now races a
host-owned cancellation signal, with a lifecycle generation check before
publishing. No browser evidence was available for exercising that race.

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

Accessibility source review found `/contact`, `/services`, `/manifesto`, and
`/lab` had no level-one heading; they now have visually hidden localized H1s
while the authored visible sections remain unchanged. Showreel was also missing
dialog semantics and sent focus to its now-inert launcher while leaving the page
content available behind the modal. It now has a labelled modal dialog, a
localized close button, a one-control focus trap, inert/hidden background
content with prior-state restoration, and focus return. Lint and the production
build pass; browser keyboard/screen-reader verification remains open.
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
Chromium was used for inverse-theme interaction instead. Keyboard/focus,
reduced-motion, client takeover, and route transitions still need focused
browser review. WebGPU/TSL and WebGL2 backend/recovery need a supported browser
and GPU runtime; source/build success does not close those gates.
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
