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
6. Treat a passing build or test as evidence for a behavior, never as evidence
   that its architecture should be retained. Before preserving an abstraction,
   state the distinct responsibility and the direct caller that needs it.

## Current audit decisions

- Admin and Builder were removed in commit `07cc2a2`: no editor, document
  schema/storage, compile/save API, `/admin` UI, `/p` publishing pipeline, or
  generated builder content remains. Portfolio copy and project data stay
  source-controlled in app/content files; publishing is a normal repository
  build. Do not recreate these systems unless the product goal changes.

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
- `SceneFramePass` was a one-use forwarding class owned only by
  `SceneCoordinator`; it had no independent disposal lifecycle. Moved its
  per-frame owner updates and Works chapter state into the coordinator and
  removed the class. `SceneTransformPass` remains separate for the pooled
  scroll-to-world algorithm and its transform caches.
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
- In `Experience.update()`, `_bakuCarouselActive` duplicated the live
  `carousel.isAnimating` value and was immediately read only into a local.
  Removed the field and its stale-field explanation; current frame gating uses
  the local snapshot. Navigation keeps the threshold-crossing frame open, and
  the following frames stay active through the carousel morph.
- DevPanel's force-render toggle only assigned Experience's private demand
  flag. It neither invalidated a settled Tres loop nor kept that loop alive,
  so the control could not force continuous rendering. It now calls an
  explicit dev-only Experience control; the scheduler remains active while
  enabled and settles after it is disabled. The panel reads a public
  `needsRender` snapshot instead of casting into that private field.
- The coordinator's camera setter only forwarded a stable camera object each
  frame. The coordinator now retains the persistent Tres camera for its own
  frame updates; the per-frame setter and its forwarding API are removed.
- SceneHost's SwiftShader-to-WebGL fallback awaited renderer initialization
  without cancelling on host unmount, and explicit teardown could dispose that
  candidate while `init()` was still pending. The host now aborts the helper
  and waits for init settlement before its terminal disposal; the helper's
  existing late-abort test verifies that it releases the candidate after init.
- `inspectUnifiedBackend` retained a constructor-name fallback despite both
  pinned Three backend classes exposing `isWebGPUBackend` / `isWebGLBackend`.
  Removed the guess and added tests for both markers and an unknown backend.
- The route page singleton duplicated the active Vue Router location: route
  SFCs wrote `PageId` through `setCurrentPage()`, while Experience/Camera read
  it from a mutable module variable. Removed that mirror and `routePage.ts`;
  consumers now resolve `window.location.pathname` through the canonical
  route manifest. Moved case-study-to-Works resolution into that manifest too,
  removing the second path resolver from `app/routes.ts`. `jlz:route-change`
  remains because it triggers actual route side effects (content theme,
  navigation rebinding and stage reconciliation); its payload/consumers remain
  in the next event-boundary audit.
- A forced `bun install --force --frozen-lockfile` removed stale local install
  state that had changed Vite/Rolldown's module graph (357 modules versus 355
  in a clean archive despite the same direct package versions). The current
  install now builds at 354 modules after the route-state removal. Tracked
  `dist/` has been regenerated from that lockfile install; this was dependency
  residue and artifact drift, not a source architecture defect.
- Removed the shell-written `data-reduced-motion` mirror. Nothing in app or
  CSS consumed it; only E2E asserted the attribute. The browser test now checks
  the actual media preference and resulting transition/input behavior instead.
- Removed `bootstrapStates.ts` and the startup state transition layer: bootstrap
  runs once per page, callers ignored `tryTransition()` failures, and the
  failure-to-continue-without-scene path was absent from the transition table.
  The shell still reports real `INITIALIZING`, `PREPARING SCENE`, `READY`, and
  `SIGNAL LOST` UI states. A pre-SceneHost failure now rejects to the static
  shell fallback; a later failure is shown by the mounted app.
- Keep `RenderScheduler`: Tres 5.9.2 on-demand gates renderer calls but retains
  its RAF loop; this project also requires zero idle ticks, settled activity
  windows, and hidden-tab pause/resume. Reconsider only if equivalent behavior
  is verified against installed Tres source and browser evidence. The installed
  `useLoop` source starts its RAF loop at ready and on-demand only suppresses
  the renderer call when its pending frame count reaches zero. Scene-frame
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

## Full source audit — findings and work queue (2026-10-02)

This is the current source-to-runtime audit, not a claim that production
acceptance is complete. Findings below are grounded in inspected call sites,
plugin wiring, package scripts, and current module ownership. Items marked
`verify` need runtime/deployment evidence before changing architecture.

### Architecture pressure points requiring a simplification pass

The earlier lifecycle and scene ownership audit established useful safety
facts, but it over-weighted preserving the resulting structure. The project is
not yet accepted as cleanly architected. These are concrete hotspots for the
next refactor slices:

| Surface | Current evidence | Refactor direction |
| --- | --- | --- |
| App startup and shell | `index.html`/`entry-shell.ts`/`entry-app.ts`/`app/index.ts` divide splash controls, dynamic imports, Vue mount, router events, readiness timers, HMR teardown, and fallback continuation. Removed the unused reduced-motion DOM mirror and a seven-state transition table that did not govern the one-shot bootstrap and rejected the no-scene continuation. | Draw one startup sequence and assign each transition one owner. Keep the static shell only for work needed before Vue; move the remaining app-owned state into Vue/app startup. Delete forwarding state and events after callers move. |
| Navigation state | Vue Router is authoritative for URL/view selection. Removed `routePage.ts` mutable mirror and the duplicate case-study path resolver; `resolvePagePath()` in `routeManifest.ts` now maps current pathname to `PageId`. `jlz:route-change` still triggers content theme, navigation rebinding and stage reconciliation. | Trace subscribers and replace the broad event only where a direct router/composable subscription is simpler. Keep scene section navigation as a distinct product contract. |
| Runtime composition | `Experience.ts` is ~55 KB and creates renderer-side policy, scene composition, UI, route stages, readiness, diagnostics, recovery integration, and the render-demand loop. `SceneCoordinator`, `SceneTransformPass`, `ExperienceUI`, and `StageRegistry` still form an orchestration graph; removed its one-use `SceneFramePass` forwarding class. | Trace every public method and context field. Collapse pass-through classes and one-use bags into the owning composition module. Retain a boundary only for a distinct algorithm/resource lifecycle or a separately testable contract. Prefer product-level slices over generic manager/registry/pass infrastructure. |
| Renderer ownership | `SceneHost.vue` owns the Tres canvas/context and initial renderer init; `Experience/Renderer.ts` adopts it but also owns backend recovery, a second pipeline wrapper, capability policy and unsupported UI; `core/unifiedRenderer.ts` owns construction/init/disposal primitives. This spans three files and two async lifecycle owners. | Produce a state/ownership diagram for initial creation, fallback, recovery and teardown. Reduce to one renderer lifecycle owner and one narrow adapter where Tres requires it. Remove recovery branches/policies that are not supportable on the target browser matrix; keep WebGL2 fallback as explicit product behavior. |
| Post effects | `Renderer.ts` → `PostProcessingManager` → `RenderPipeline` → `WebGPUPostPipeline` splits policy, crossfade, renderer routing, TSL graph construction and resource accounting. WebGLBackend skips the graph. | Audit each public method and parameter for actual cross-boundary need. Keep TSL graph code isolated from WebGL compatibility; flatten the extra wrapper/manager where it only forwards parameters or duplicates state. Make expensive post effects an explicit measured quality choice. |
| Route stage lifecycle | Six controller contracts live in `StageRegistry.ts` (336 lines); generic stale-create/attach/release flow plus owner state is in `LazyStage.ts` (271 lines). Vue owns a second set of shallow refs in `useSceneStages.ts`/`stageSlot.ts` so `<primitive>` mounts/unmounts before controller disposal. This may be justified by async imports, `nextTick`, and teardown ordering, but the two ownership layers and per-stage contract repetition need a caller map. | Trace each ensure/dispose route path, every async boundary and what becomes invalid on unmount. Remove unused slot APIs or duplicated stage state; preserve only race cases required by observed call sites. Compare Vue async components/props and Tres lifecycle behavior before replacing custom lazy ownership. |
| Content model | Project cards live in `Data/Projects.ts`; case page prose/media/proof live in `Data/CaseStudies.ts`; `core/caseStudies.ts` and `core/types.ts` define adjacent contracts; route, sitemap and blog metadata have separate derived registries. | Decide one source record per project and derive card/case/sitemap views from it where fields overlap. Preserve separate authored content only where its meaning differs. Add closed-set checks only at real content boundaries. |
| Performance and DX | `SceneHost.vue` and `Experience.ts` are large mixed-responsibility modules. `entry-app.ts` statically imports reveal and shell utilities before the app graph is lazy. Scene feature ownership is declarative in many places but controller adoption and disposal conventions vary by owner. | Measure startup and route chunk boundaries. Move expensive scene/feature modules behind the route/feature that needs them; standardize a small SFC + controller convention. Remove hand-built utility behavior when Vue/Tres/Three already provides the same contract. |

### Cross-cutting simplification evidence

The audit must treat active code as a candidate too: for each behavior, identify
whether Vue, Tres, Three, or an installed utility already owns the same state,
rendering, lifecycle, scheduling, or DOM contract. Prefer deleting the project
copy and adapting at the actual framework boundary; preserve custom code only
for portfolio-specific behavior or a demonstrated compatibility gap. Track the
before/after source size, dependency graph, and route/startup bundle when a
change affects architecture or performance.

The Works stage exposed a concrete mismatch: `StageRegistry` used dynamic import,
but Vite's broad `World/` manual chunk rule folded `WorksPlaneStage` back into
the shared world bundle, and `SceneHost.onReady()` waited for a Works root on
every route. `WorksStageOwner` is now a Vue async component mounted on the first
Works visit, then retained for the persistent canvas lifetime so its one-shot
root readiness promise cannot point at an unmounted root after route re-entry.
Stage instances and GPU leaves still follow route lifecycle. Specific Vite
groups put the Works controller/installation behind that route. The production
build confirms separate `WorksStageOwner` (2.78 kB) and `chunk-works-stage`
(10.17 kB) outputs; initial app code now references the owner through a dynamic
import. Shared Three remains a larger startup cost and is still under audit.

The same stage path also marked values raw before assigning them to Vue
`shallowRef`s. Vue's installed `RefImpl` stores shallow values directly; the
marker was redundant. Removed that call and its unnecessary TypeScript cast.
Works installation crossed two SFC boundaries through `computed(toRaw(...))`
and `markRaw(...)`, although the source and props are already shallow. Both
wrappers are removed; the child now watches the prop it owns. The existing
scene-slot unit coverage still passes (3/3), and the production build compiles
the templates and TypeScript successfully.

The lazy lifecycle had one more representational layer: each owner's three
mutable fields were exposed through paired getter/setter functions and then
wrapped again as `slot.owner`. `LazyStageOwner` now stores `stage`, `promise`,
and `request` directly; idempotent release and pending-cleanup tracking remain
because route leave can race import, Tres mount, and asset loading. The focused
lazy-stage/registry cases pass 7/7, and the production build remains green.

These findings are audit targets, not instructions to mechanically merge files.
The intended reference from TvT is its practical `src/` organization around
app entry, common code, components, pages, plugins, and stores, and its use of
Vue/Tres declarations for reusable scene behavior. This portfolio does not
need TvT's editor, plugin marketplace, multi-platform publishing or framework
scaffolding. The target is a much smaller portfolio-specific implementation.
TresJS 5.9.2 documentation describes Vue components/composables as its
declarative scene model; local dependencies are Tres 5.9.2 / Three 0.186.1.
Do not claim API compatibility beyond this installed matrix without checking
the installed declarations/source and current upstream docs.

| Area | Audited evidence and finding | Next action | Priority / acceptance |
| --- | --- | --- | --- |
| Vue/Tres scene graph | `SceneHost.vue`, `sceneHost.ts`, `useSceneStages.ts`, stage owner SFCs, `Experience.buildScene()`, and scene owner controllers show Vue/Tres owning persistent roots. Experience adopts those roots. No demonstrated duplicate stable scene hierarchy remains. | Keep this as baseline; change an owner only when a concrete duplicate or cleanup defect is demonstrated. | Guardrail: no runtime `scene.add/remove` for stable app nodes; one disposal owner per GPU resource. |
| Scene coordination | `SceneCoordinator` owns route/story policy and the per-frame owner fan-out. Removed `SceneFramePass`, which was only constructed and forwarded to by the coordinator and had no separate disposal. `SceneTransformPass` remains for its pooled scroll-to-world algorithm/cache. Scene-stage getters for typography/halo/manifesto and the internal section-group getter have no external readers and are private. UI interactions previously fetched Baku, burst, carousel, and Works stage through coordinator getters; moved those reads to `ExperienceUIHost`, backed by Experience and StageRegistry, and deleted the forwarding getters. Experience frame policy reads its carousel owner directly. Replaced repeated Intro/Works/Contact slot literals with constants derived by `worldSlots.ts`; slot roots remain Vue-owned. Removed the coordinator camera setter that Experience called with the same persistent camera. `prewarmHomeMedia` uses Three's `WebGPURenderer.compileAsync()` directly; it remains optional. | Continue tracing every Experience/ExperienceUI coordinator call and `SceneTransformPass` context field; remove only proven pass-through state. | P1: every surviving class has a direct responsibility and a caller that benefits from its boundary. |
| Experience composition root | `Experience.ts` initializes renderer, scene, feature UI, theme, motion, recovery, diagnostics and frame policy. Lifecycle-generation guards stop awaited mounts and the dev-only DevPanel import from creating owners after destroy. Teardown was synchronous at the app boundary even though `StageRegistry.dispose()` waits on Vue `nextTick`; app unmount could therefore dispose the backend before stage controllers released resources. `Experience.destroy()` returns an idempotent completion promise, publishes that promise before teardown callbacks can re-enter, and the app awaits it before Vue unmount. Completion covers route-stage + showreel teardown. The dev host test direct-loads Contact, waits for all three lazy stages and opens the showreel; their release traces precede backend/renderer disposal. The development runtime teardown hook is published before `Experience.init()`, and teardown stops callbacks immediately but waits for active `WebGPURenderer.compileAsync()` home prewarm before releasing scene owners and renderer pipeline. Five deterministic stale-continuation tests cover carousel mount, particle mount, coordinator init, home carousel texture initialization, and GPU prewarm disposal ordering. SceneHost now aborts software-adapter fallback init on unmount and awaits its completion before final renderer disposal; helper coverage proves late-aborted init releases only after settlement. | Continue the method-by-method error/teardown map, including recovery candidates and Tres's own pre-ready initialization; exercise the browser lifecycle boundary on supported hardware when available. Keep coordination here only where it is the single natural owner. | P1: each listener, timer, observer, renderer candidate and async continuation has one owner and terminal cleanup. |
| Lazy route stages | `LazyStage.ts` centralizes real stale-import, mount, in-flight release and idempotent cleanup races; `StageRegistry.ts` supplies route-specific contracts. Experience awaits registry disposal before its caller unmounts SceneHost, so asynchronous stage release finishes while the backend remains alive. Vue `shallowRef` already preserves Three objects without proxies; removed an extra `markRaw`, duplicate `toRaw`/`markRaw` prop wrappers, and an unnecessary ref cast from the slot layer. Owner state is now a direct `stage`/`promise`/`request` object instead of accessor pairs nested under `.owner`; the release set/WeakMap still covers tested overlapping stale releases. The dev host gate observes Contact typography, Cyprus GLTF and halo stages reaching ready, then proves each reports release before backend disposal. | Complete the stage contract caller map, then collapse the registry/slot layers only where Vue async ownership can replace them without losing stale-import and release-order safety. | P1: route leave during create/mount/load releases exactly once and before backend disposal; no duplicate Vue reactivity wrappers. |
| Route hash dispatch | `app/index.ts` had both `createSingleFrameOwner` generation/cancel state and `hashNavigationGeneration`; afterEach cancels the owned frame before starting the next poll, so the second stale token duplicated cancellation. Removed the redundant counter; direct and lazy-route hash flows pass in Firefox production browser. New Vitest coverage proves superseded frame callbacks and callbacks cancelled before execution are no-ops; deferred initial hashes dispatch only the newest request and stop after invalidation. Router error and Vue unmount both call the same cancellation owner. | Keep the cancellation helper tests aligned with those two integration cleanup call sites; assess the route hash flow during the full accessibility/navigation browser pass. | P1: no stale hash dispatch; no duplicate generation state. |
| Bootstrap status | Removed false percentages/delay, the unconsumed reduced-motion dataset, and the ineffective state machine. Splash announces actual `INITIALIZING`, `PREPARING SCENE`, `READY`, and `SIGNAL LOST` states. The no-scene continuation no longer attempts an illegal state transition. | Continue startup ownership audit; keep phase labels tied to actual boot transitions. | No estimated completion percentage without measurable work progress. |
| Build/dependency integration | Vite 8/Rolldown code-splitting rules and Three/Tres/Cientos compatibility aliases are pinned to observed ecosystem behavior; the stdlib checker guards its imported module set. Unified renderer initialization calls pinned `WebGPURenderer.init()` directly. Both `RenderPipeline` and `inspectUnifiedBackend` use Three's explicit backend markers, with tests asserting that unmarked backends stay unknown. Three's installed Tres teardown closes over its initial renderer instance; SceneHost separately owns and disposes the current recovery replacement after scene unmount, so recovery does not need an extra deferral wrapper. Direct dependency usage was traced; no unused package was proven. | Keep compatibility seams small; on upgrades verify peer compatibility, bundle duplication, lazy chunk placement and checker output. Do not delete shims based on apparent complexity. | P1: lockfile install, type check, stdlib check, build and budgets agree after upgrades. |
| Static content and routes | Blog sources are consumed by the prerender script and multi-page Vite inputs; they are live build inputs even when not browser-imported. Runtime route manifest is separate from static blog routes by design. Origin normalization is shared by blog metadata and sitemap generation. The latest full build emits 11 sitemap URLs and no editor-generated routes. | Keep the source/output map current and confirm deployment consumes tracked `dist/` or runs the same build. | P1: each generated artifact has one source and deterministic build owner. |
| CSS and UIkit | `_console-language.less`, `_import.less`, and component sheets contain large authored styling surfaces. LESS entry points compile; emitted selector overlap still needs classification. The former editor-only field rule and generated theme overrides are gone with the editor. A first reachability scan found `.uk-light .uk-heading-2xlarge` unused in app, static blog and content markup; removed that selector. Mixins and classes emitted from `entry-app.ts` or controller code were false positives and retained. | Continue selector reachability against authored HTML, Vue templates and blog markup; account for runtime-generated state classes before deleting. Review declaration overlap separately from responsive/keyframe variants. Check responsive, reduced-motion, focus and EN/RU variants after each slice. | P2: no selector removal without closed markup/input search and browser verification. |
| Public media and budgets | Source-name reachability found `public/assets/projects/ebb-vibes/cover.webp` had no consumers; the project uses `cover-studio-v2.jpg` and `detail.webp`. Removed the unreachable file. `coming-soon.mp4` dominates transfer size (~5.27 MB); `ffprobe`: H.264 1920×1080 30 fps, AAC, 9.87 s, ~4.28 Mbit/s. Build budget reports media total/largest but does not fail on aggregate media size. | Inspect video delivery/use and quality target; compare a re-encode and browser support before replacing. Then choose per-file/aggregate budgets from measurements. | P2: savings retain visual/audio quality and browser support; budget failures are actionable. |
| Release/deployment | CI checks and browser-tests; no deploy workflow or host config exists in repository. `dist/` remains tracked pending identification of its consumer. | Identify host, rewrite/history behavior, cache headers and whether host consumes committed `dist/` or builds source. Reproduce from a clean checkout. | P0 verify: documented release path matches deployment. |
| Render loop and animation | Tres is the only scene render-loop driver; `RenderScheduler` controls its open/close window. Other RAF users are DOM text reveal, UIkit content refresh, route-hash polling and route announcement. | Keep the one scene loop. Inspect per-call cleanup and whether each DOM animation has an independent cancellation owner during unmount. | P1: no second scene loop or uncanceled callback after owner teardown. |
| Cross-browser/GPU | Current combined production run passed 33 tests across system Chromium and Firefox (40 total; 7 opt-in renderer skips) after the backend-marker change. The focused dev Chromium host-teardown gate also passed. Earlier independent full suites passed Chromium and Firefox. WebKit cannot launch locally: cached MiniBrowser is missing ICU 74, libxml2.so.2, Flite, WebKitGTK/JSC and libjxl libraries. `nvidia-smi` cannot communicate with a driver in this environment. | Run WebKit in CI/host with declared dependencies, then actual WebGPU/WebGL and context recovery on a machine where the NVIDIA driver is available. | P0 release evidence; software render results do not prove physical-GPU behavior. |

### Audit execution order

1. **Architecture map and cuts:** write the startup/router/scene/renderer
   ownership maps from actual call sites. Identify every state mirror,
   one-use adapter, registry, manager and event; mark keep/remove with caller
   evidence. Do not implement more wrappers to produce the maps.
2. **Collapse app and route state:** make Vue Router the page source; simplify
   app bootstrap and the shell-to-app handshake; keep only the static no-JS /
   pre-Vue responsibilities that are needed for useful content and splash.
3. **Flatten runtime orchestration:** reduce `Experience` and the coordination
   graph into a small composition root plus feature owners. Remove only proven
   pass-through classes and duplicated route/activity/readiness state.
4. **Unify renderer lifecycle:** assign canvas, renderer init, fallback,
   recovery, device listeners and disposal to one owner. Keep Tres responsible
   for its own sizing, camera registry and declarative scene integration.
5. **Simplify post and feature code:** preserve TSL for WebGPU-specific effects;
   remove overlapping parameter/capability/resource layers when their policy
   can live at the renderer/feature owner. Audit per-frame allocations and
   quality/DPR decisions using measurements.
6. **Content and styling cleanup:** establish canonical project/blog sources,
   remove duplicate declarations, dead CSS/assets and obsolete compatibility
   code, then recheck route and generated-output inputs.
7. **Release acceptance:** after structural work, verify production build,
   Chromium/Firefox/WebKit, WebGPU and forced WebGL2 on available hardware,
   keyboard/reduced-motion/accessibility, resource teardown and measured
   startup/frame budgets. Update the plan with evidence and unresolved limits.

### Immediate next slice

Continue the broad simplification audit with active code, not just unused
symbols. Complete a per-stage caller/resource map, then compare the custom
`LazyStage` and duplicated Vue slot state against Vue async component lifecycle
and Tres ownership; collapse layers where one framework boundary can own the
same job without weakening late-load cleanup. In parallel, trace `Experience`,
renderer recovery, and post-processing call/data flows, deleting pass-through
policy and repeated state where Tres/Three already provides the behavior.
Prioritize measurable route startup and WebGPU render-path costs. Keep this plan
updated with findings, removed code, bundle evidence, and unresolved hardware
acceptance rather than treating passing existing checks as architecture proof.

## Phases

Status: `active`, `queued`, or `done`. Mark a phase `done` only when its stated
acceptance evidence exists.

### 0. Repository and production baseline — active

**Established:** repository/package identity matches `la6su/la6-portfolio`;
installed matrix is Vue 3.5.43, Vue Router 5.3.1, Tres core/Cientos 5.9.2,
Three 0.186.1, Vite 8.3.2, plugin-vue 6.0.9, TypeScript 6.0.3; installed
dependencies are not tracked; generated blog inputs have known
sources and build consumers; scripts/dependencies and Node/Bun boundaries were
audited with no proven unused direct dependency. Package identity and links
match the new repository. README describes the Vue/Tres, WebGPU and WebGL stack.
CI now runs the production build explicitly and fails when tracked generated
outputs drift from their sources; unit, type, lint, repo and browser checks
remain enabled. TypeScript 7.0.2 is released, but the installed
`typescript-eslint` peer range ends below 6.1.0, so a TypeScript 7 upgrade is
not currently compatible with the lint matrix.

The stable Vue release remains 3.5.43 (Vue 3.6 is still prerelease); Three r186
and TresJS docs 5.9.2 match the installed matrix as checked on 2026-10-01.
Do not perform blanket version bumps: verify Tres/Cientos/Three peer and API
compatibility together, with the WebGPU/WebGL behavior matrix.

**Remaining:** identify the deploy consumer for tracked `dist/` (84 tracked
files in the last audit) before changing its tracking policy; prove clean
checkout install/build and deployed static routing/cache behavior. The only
local GitHub workflow, `.github/workflows/quality.yml`, runs quality and browser
checks but has no deployment step. `public/` headers do not establish whether
Cloudflare Pages, Netlify, or another consumer publishes the output.
The artifact was tracked from the repository's initial commit and was stale;
it has now been regenerated from the current source during the brand-asset
cleanup and again from a forced frozen install after eliminating local install
residue. Keep tracking it while the host is unknown, and inspect clean-build
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
global. Five deterministic lifecycle tests cover cancellation during carousel
mount/init, particle mount, coordinator init and GPU prewarm. The additional
DevPanel force-render regression tests cover loop wake, continuous activity,
settling and post-destroy no-op behavior.

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

**Established:** SPA routes, EN/RU metadata, standalone blog pages,
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
LESS selector reachability across Vue, static HTML and blog output;
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
the app or blog output. `favicon.svg` and `logo.svg` were identical;
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
blog and sitemap output. Route hash dispatch uses the RAF owner's
cancellation instead of a second stale token. Experience checks its lifecycle
generation after Vue mount awaits and after the dev-only DevPanel import.

The repo is `la6-portfolio`; `dist/` remains tracked because the deployment
consumer is unknown. `quality.yml` runs checks and browser tests but does not
deploy. Do not change release artifact policy until the actual host contract is
identified.

**Verified before the latest removal:** 99 unit tests, Vue type-check, ESLint, stdlib check,
production build and budgets pass. Current limits remain 3.03 kB startup gzip,
310.95 kB shared Three gzip and 53.84 kB UIkit gzip. An override-origin build
confirmed the generated blog and sitemap use the staging
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
lazy hash navigation. The broad audit mapped runtime, app, build, styling and public media; the risks and remaining source audits are
recorded in the matrix above. Renderer recovery/init failure ownership and the
remaining audit phases are still active.

**Next actions:**

1. Complete the source audit for CSS reachability, public media and generated artifacts.
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

**Verified after Admin/Builder removal, CSS reachability cleanup and runtime simplification:** 94 unit tests, Vue type-check, ESLint,
stdlib check, production build and bundle budgets pass. The sitemap contains
11 URLs; Vite builds 357 modules and emits no `/p` pages or editor chunks. The
Chromium/Firefox production run passed 33/40 tests; 7 renderer tests were
skipped by their existing opt-in guards. Route, blog, keyboard/focus, touch,
responsive overflow and scene teardown checks passed.
The dev Chromium gate passed the force-render loop test and the SceneHost
owner-before-renderer teardown test. Production output contains no Tweakpane
or DevPanel UI strings; startup gzip is 3.02 kB.

## Follow-on goal policy

Only after this plan's full release acceptance is evidenced, perform a fresh
independent audit across application code, generated content, dependencies,
assets, deployment, and runtime. Use/install additional skills only when a
finding needs that domain review. Derive a new phased plan and autonomous goal
from evidence, then repeat audit → plan → implementation → verification until
production-quality architecture and performance gates pass. Do not create that
follow-on goal before release acceptance; keep one canonical work queue.
