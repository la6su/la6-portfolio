import { BlurFade } from './Experience/BlurFade'
import { NoiseText } from './Experience/NoiseText'
import { eventBus } from './core/EventBus'
import { contentRoot } from './core/contentRoot'
import { getSoundMuted, setSoundMutedPreference } from './core/SfxSystem'
import { prefersReducedMotion } from './core/motionPolicy'
import { getCurrentPage } from './core/routePage'
// LANG_KEY handled by i18n.ts
import { INITIAL_BOOTSTRAP_STATE, tryTransition, type BootstrapState } from './core/bootstrapStates'

// ── Config: sound toggle (splash overlay) ──
function initSoundToggle(): void {
  const btn = document.getElementById('cfg-sound') as HTMLButtonElement | null
  if (!btn) return
  if (btn.dataset.jlzToggleBound === 'sound') return
  btn.dataset.jlzToggleBound = 'sound'
  let soundOn = !getSoundMuted()
  const update = () => {
    btn.setAttribute('aria-pressed', String(soundOn))
    btn.classList.toggle('is-off', !soundOn)
    btn.title = soundOn ? 'Sound: On (click to mute)' : 'Sound: Off (click to enable)'
  }
  update()
  // Plain listeners: the bootstrap runs exactly once per page (the only retry
  // is a full page reload) and the splash chrome is never torn down in-page,
  // so there is no abort controller to bind — one that fired before these
  // registrations would silently disable the toggles (DOM spec drops
  // listeners added on an already-aborted signal).
  btn.addEventListener('click', () => {
    soundOn = !soundOn
    setSoundMutedPreference(!soundOn)
    update()
  })
}

// ── Config: language toggle EN/RU ──
import { initI18n, toggleLang, getLang } from './core/i18n'

// ── window.__jlzEmit — typed `jlz:*` port facade for non-module producers ──
// The Phase 10 raw window `jlz:*` bridge was removed — the app only receives
// those ports through the typed `eventBus`. Two non-module sites still need to
// emit a port without importing the TS graph:
//   • the index.html splash Enter script (classic, kept outside the initial
//     Vue/Tres/Three/UIkit dependency graph) emits `jlz:splash-entered`;
//   • the e2e suite (production preview) and the Phase 10 soak (dev) trigger
//     `jlz:navigate` etc. from outside the app.
// Both call this facade instead of `window.dispatchEvent`. It is a thin alias
// over the public, typed `eventBus.emit` and adds no new capability surface
// (the equivalent raw dispatch existed in production pre-migration).
// Installed at module scope — the moment entry-app.ts loads, which is before
// the Vue router mounts and before the splash Enter button
// is ever enabled (`jlz:webgl-ready`) — so it is always present for the splash
// and for navigation tests regardless of whether `experience.init()` succeeds.
;(window as unknown as { __jlzEmit?: (event: string, detail?: unknown) => void }).__jlzEmit = (
  event,
  detail,
) => {
  ;(eventBus.emit as (name: string, detail?: unknown) => void).call(eventBus, event, detail)
}

function initLangToggle(): void {
  const btn = document.getElementById('cfg-lang') as HTMLButtonElement | null
  if (!btn) return
  if (btn.dataset.jlzToggleBound === 'lang') return
  const value = btn.querySelector<HTMLElement>('[data-jlz-lang-value], span')
  if (!value) return
  btn.dataset.jlzToggleBound = 'lang'
  initI18n()
  const update = () => {
    const lang = getLang()
    value.textContent = lang
    btn.setAttribute('aria-pressed', String(lang === 'RU'))
    btn.title = `Language: ${lang} (click to switch)`
  }
  update()
  btn.addEventListener('click', () => {
    toggleLang()
    update()
  })
}

/**
 * Wire both splash config toggles. Exported for the splash-toggles lifecycle
 * test; the bootstrap calls it before any async work so the toggles work
 * while the 3D scene is still loading.
 */
export function initSplashToggles(): void {
  initSoundToggle()
  initLangToggle()
}

// ── Enter button click is wired by inline script in index.html ──
// (initEnterButton removed — was empty no-op. Click handler is in inline
//  <script> in index.html. Was called in startApp but did nothing.)

// ── Show Enter button when 3D is ready ──
function showEnterButton(): void {
  const enterBtn = document.getElementById('jlz-splash-enter') as HTMLButtonElement | null
  if (!enterBtn) return
  // Pin the meta row at 100% / READY, then show Enter. Flip aria-disabled so
  // AT users (and Playwright actionability) see the button as activatable.
  updateLoaderProgress(100)
  enterBtn.classList.add('is-ready')
  enterBtn.setAttribute('aria-disabled', 'false')
}

// ── Show a load error when 3D fails to initialize ──
// Replaces the Enter button with an error message + retry link and flips the
// splash status row to SIGNAL LOST. This runs if Experience.init() throws
// (jlz:webgl-failed) or if jlz:webgl-ready doesn't fire within 60s (init
// hung; the watchdog below owns the 60s budget). The Enter button must NEVER appear when 3D isn't ready — clicking it
// would fade the splash to reveal an
// uninitialized scene (no carousel, no baku, broken camera).
function showLoadError(): void {
  const enterBtn = document.getElementById('jlz-splash-enter')
  const loader = document.getElementById('jlz-app-loader')
  if (!loader) return
  const status = document.querySelector(SPLASH_STATUS_SELECTOR)
  if (status) status.textContent = 'SIGNAL LOST'
  // Replace the Enter button area with the console boot gate (styles live in
  // _console-language.less — the persistent chrome owner).
  if (enterBtn) {
    const parent = enterBtn.parentElement
    if (parent) {
      parent.innerHTML = `
        <div class="jlz-boot-gate" role="alert">
          <p class="jlz-boot-gate__head">Signal lost</p>
          <p class="jlz-boot-gate__text">
            The 3D experience couldn't load. Your browser may not support
            WebGL2, or the GPU is unavailable.
          </p>
          <span class="jlz-boot-gate__code">ERR:GPU — WEBGL2 ADAPTER NOT REACHABLE</span>
          <a class="jlz-boot-gate__action" href="/">Retry</a>
        </div>
      `
    }
  }
}

// ── Seamless splash loader ──
// index.html has #jlz-app-loader with the spiral/portal SVG + a percent/status
// meta row. Three.js loads lazily from this bootstrap — it does not block FCP.
// We update that row as Experience.init() boots (00% → 100%, INITIALIZING →
// READY), then the Enter button unlocks when jlz:webgl-ready fires. Config
// buttons (sound + language) are inside the loader — they fade out with the
// splash. Fade-out is triggered by Enter button click (inline script in
// index.html), NOT auto.
const SPLASH_PERCENT_SELECTOR = '[data-jlz-splash="progress"]'
const SPLASH_STATUS_SELECTOR = '[data-jlz-splash="state"]'

// Exported for the splash meta-row contract test only (exported-for-testing
// pattern); production callers are the boot flow below.
export function updateLoaderProgress(pct: number): void {
  const value = Math.min(100, Math.max(0, Math.round(pct)))
  const percent = document.querySelector(SPLASH_PERCENT_SELECTOR)
  if (percent) percent.textContent = `${String(value).padStart(2, '0')}%`
  const status = document.querySelector(SPLASH_STATUS_SELECTOR)
  if (status) status.textContent = value >= 100 ? 'READY' : 'INITIALIZING'
}

let _bootstrapState: BootstrapState = INITIAL_BOOTSTRAP_STATE
let _readyWatchdog: ReturnType<typeof setTimeout> | null = null
let _bootstrapUnsubs: Array<() => void> = []

export function createStyleOwner(): {
  set: (css: string) => void
  clear: () => void
} {
  let style: HTMLStyleElement | null = null
  const clear = (): void => {
    style?.remove()
    style = null
  }
  return {
    set: (css) => {
      clear()
      style = document.createElement('style')
      style.textContent = css
      document.head.appendChild(style)
    },
    clear,
  }
}

const bootstrapStyleOwner = createStyleOwner()

function clearBootstrapStyle(): void {
  bootstrapStyleOwner.clear()
}

function clearHostProbe(): void {
  delete window.__jlzHost
}

function resetBootstrapBindings(): void {
  // Idempotence guard for the exactly-once bootstrap (the only retry is a
  // full page reload — a fresh module graph with fresh module state). The
  // bus subscriptions are re-registered by the next startAppOnce call, so
  // they must be dropped here; the splash toggle listeners intentionally
  // stay plain (see initSoundToggle).
  _bootstrapUnsubs.forEach((unsubscribe) => unsubscribe())
  _bootstrapUnsubs = []
  clearReadyWatchdog()
  clearReadyEventTimer()
  clearBootstrapStyle()
  clearHostProbe()
  _titleObserver?.disconnect()
  _titleObserver = null
}

function clearReadyWatchdog(): void {
  if (_readyWatchdog !== null) {
    clearTimeout(_readyWatchdog)
    _readyWatchdog = null
  }
}

/** Own the delayed readiness event so a failed/replaced attempt cannot emit it. */
export function createReadyEventTimer(onReady: () => void): {
  schedule: (delayMs: number) => void
  clear: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return {
    schedule: (delayMs) => {
      clear()
      timer = setTimeout(() => {
        timer = null
        onReady()
      }, delayMs)
    },
    clear,
  }
}

const readyEventTimer = createReadyEventTimer(() => {
  eventBus.emit('jlz:webgl-ready')
})

function clearReadyEventTimer(): void {
  readyEventTimer.clear()
}

function transitionBootstrap(next: BootstrapState): boolean {
  const result = tryTransition(_bootstrapState, next)
  if (!result) {
    console.warn(`[entry-app] invalid bootstrap transition: ${_bootstrapState} -> ${next}`)
    return false
  }
  _bootstrapState = result
  return true
}

function disposeBootstrapAttempt(
  experience: import('./Experience/Experience').Experience | null,
  ui: import('./UI/UIManager').UIManager | null,
): void {
  try {
    experience?.destroy()
  } catch (error) {
    console.error('[entry-app] Experience cleanup failed:', error)
  }
  try {
    ui?.dispose()
  } catch (error) {
    console.error('[entry-app] UI cleanup failed:', error)
  }
}

interface BootResult {
  retryable: boolean
}

async function boot(): Promise<BootResult> {
  if (_bootstrapState === 'ready' || _bootstrapState === 'entered') {
    return { retryable: false }
  }
  if (_bootstrapState === 'failed') transitionBootstrap('app-loading')
  else if (_bootstrapState === 'shell-painted') transitionBootstrap('app-loading')
  const progress = (pct: number) => updateLoaderProgress(Math.min(100, pct))

  // ?no-scene=1 — Phase 5 prerender contract: boot the route shell and the
  // semantic route content WITHOUT the scene runtime (the Three/Experience
  // dynamic imports below never run, no canvas is created). The loader ring
  // completes and `jlz:webgl-ready` fires synchronously so the Enter flow
  // and every scene-ready consumer proceed on a DOM-only world. This is the
  // evidence path for the Phase 5 candidate gate: routes + navigation work
  // with zero renderer, and a route can never (re)create one.
  if (new URLSearchParams(window.location.search).has('no-scene')) {
    try {
      transitionBootstrap('renderer-initializing')
      progress(100)
      const { UIManager } = await import('./UI/UIManager')
      const ui = new UIManager()
      try {
        ui.init()
      } catch (error) {
        ui.dispose()
        throw error
      }
      transitionBootstrap('scene-prewarming')
      transitionBootstrap('ready')
      eventBus.emit('jlz:webgl-ready')
      return { retryable: false }
    } catch (e) {
      console.error('[entry-app] no-scene bootstrap failed:', e)
      transitionBootstrap('failed')
      eventBus.emit('jlz:webgl-failed')
      return { retryable: true }
    }
  }

  // A failed initialization may retry only before the one-shot SceneHost has
  // settled. Once it owns a renderer/canvas, a second attempt is unsafe.
  let ui: import('./UI/UIManager').UIManager | null = null
  let experience: import('./Experience/Experience').Experience | null = null
  let sceneHostSettled = false
  try {
    const { ErrorTracker } = await import('./core/ErrorTracker')
    ErrorTracker.init()
    transitionBootstrap('renderer-initializing')
    // entry-shell.ts set the reduced-motion dataset synchronously at shell
    // load (legacy E2E/CSS hook); the preference itself is read on demand
    // through motionPolicy.prefersReducedMotion().

    const bootStart = performance.now()
    progress(15)

    const { UIManager } = await import('./UI/UIManager')
    ui = new UIManager()
    ui.init()
    progress(40)

    // ── Phase 7: the persistent SceneHost (Vue) is the readiness handshake ──
    // AppShell mounts SceneHost (startApp above); it owns the one canvas, the
    // custom renderer factory and the camera. `sceneHost.ready` settles only
    // AFTER renderer init + actual-backend inspection + the software-adapter
    // policy decision + the Tres context mount. Experience adopts those
    // instances and awaits the scene's first successful render
    // (Experience.init → firstRender), so `jlz:webgl-ready` below can only
    // fire after that — the renderer factory return alone never satisfies
    // readiness. The `?no-scene` DOM-only rollback above returns earlier and
    // never reaches this handshake.
    const { sceneHost } = await import('./app/sceneHost')
    sceneHostSettled = true
    const host = await sceneHost.ready
    transitionBootstrap('scene-prewarming')
    const { Experience } = await import('./Experience/Experience')
    progress(55)

    const runtime = new Experience(
      ui,
      {
        scene: host.scene,
        camera: host.camera,
        renderer: host.renderer,
        canvas: host.canvas,
        mode: host.mode,
        lights: host.lights,
        ground: host.ground,
        sectionRoots: host.sectionRoots,
        servicesStage: host.servicesStage,
        envSphere: host.envSphere,
        baku: host.baku,
        introFrames: host.introFrames,
        cursorTrail: host.cursorTrail,
        replaceRenderer: (renderer) => sceneHost.replaceRenderer(renderer),
        loop: host.loop,
        stages: host.stages,
      },
      getCurrentPage,
    )
    experience = runtime
    const hostProbe: JlzHostProbe = {
      mode: host.mode,
      backend: host.backend.backendName,
      isFallbackAdapter: host.backend.isFallbackAdapter,
      recovered: false,
    }
    window.__jlzHost = hostProbe
    _bootstrapUnsubs.push(
      eventBus.on('jlz:renderer-recovered', () => {
        if (window.__jlzHost === hostProbe) hostProbe.recovered = true
      }),
    )
    await runtime.init()
    if (import.meta.env.DEV) {
      ;(window as unknown as { __jlzRuntimeDestroy?: () => void }).__jlzRuntimeDestroy = () =>
        runtime.destroy()
    }
    // Phase 6 evidence (fixed 2026-08-22): the unified `WebGPURenderer` on
    // `WebGLBackend` keeps the direct-WebGL path (no TSL post) by design; TSL
    // post runs only on `WebGPUBackend` (`WebGPUPostPipeline`). No
    // TSL-post-on-WebGLBackend claim is made. (The dev-forced classic
    // `?renderer=webgl` parity QA owner that compared the two paths was
    // removed in Phase 10; the automatic software-adapter fallback remains.)
    if (import.meta.env.DEV) {
      console.info(
        `[entry-app] Phase 7 host ready: mode=${host.mode} backend=${host.backend.backendName ?? '?'} isFallbackAdapter=${host.backend.isFallbackAdapter}`,
      )
    }
    progress(95)
    // Small delay at 95% so user sees 'Ready' status before 100% + curtain split
    await new Promise((resolve) => setTimeout(resolve, 150))
    progress(100)

    // ── Fire jlz:webgl-ready → fades out #jlz-app-loader + animates titles ──
    const INTRO_MS = 600
    const elapsed = performance.now() - bootStart
    const readyAt = Math.max(0, INTRO_MS - elapsed)

    transitionBootstrap('ready')
    readyEventTimer.schedule(prefersReducedMotion() ? 0 : readyAt)
    return { retryable: false }
  } catch (e) {
    console.error('[entry-app] bootstrap failed:', e)
    disposeBootstrapAttempt(experience, ui)
    clearHostProbe()
    clearReadyWatchdog()
    clearReadyEventTimer()
    transitionBootstrap('failed')
    eventBus.emit('jlz:webgl-failed')
    const retryable = !sceneHostSettled
    if (retryable) {
      const { ErrorTracker } = await import('./core/ErrorTracker')
      ErrorTracker.dispose()
    }
    return { retryable }
  }
}

async function startAppOnce(): Promise<void> {
  resetBootstrapBindings()
  // Init splash config toggles FIRST — instant, no dependencies.
  // These work during loading, before three.js finishes.
  initSplashToggles()
  // (initEnterButton call removed — was a no-op.)

  // Use ?inline to prevent Vite from injecting @vite/client (updateStyle/
  // removeStyle) into the CSS module — through the reverse proxy, /@vite/client
  // resolves to the Next.js app which returns HTML instead of JS, breaking
  // the entire module loading chain. ?inline returns raw CSS string without
  // HMR injection.
  const cssModule = await import('./assets/main.less?inline')
  // Manually inject the CSS into the document
  bootstrapStyleOwner.set((cssModule as unknown as { default: string }).default || '')
  // Register console-themed SVG icons — replaces UIKit's default icon set
  // (76KB) with our custom pixel/console-style icons. No uikit-icons import.
  // UIKit's icon component is built into the core; we just register our SVGs.
  import('./assets/console-icons')
    .then(({ registerConsoleIcons }) => {
      registerConsoleIcons()
    })
    .catch(() => {
      /* icons are enhancement, not critical */
    })

  // Phase 5 (cleanup): Vue Router (src/app) owns navigation. The dynamic
  // import below is the only edge into the Vue graph, so the router + route
  // SFCs stay in a separate lazy `app` chunk and the initial entry bundle
  // remains lean. The scene runtime boots exactly once regardless of the
  // route.
  void import('./app')
    .then((m) => m.mountVueApp())
    .catch((error) => {
      console.error('[entry-app] Vue mount failed:', error)
      eventBus.emit('jlz:webgl-failed')
      void import('./app/sceneHost')
        .then(({ sceneHost }) => sceneHost.reject(error))
        .catch(() => {
          /* sceneHost rejection is best-effort; the visible failure state remains */
        })
    })

  // jlz:webgl-ready fires when Experience.init() completes — show Enter button.
  // Animations (BlurFade + NoiseText) are DELAYED until jlz:splash-entered
  // (Enter click) so user sees them as 3D scene reveals, not behind splash.
  _bootstrapUnsubs.push(
    eventBus.on('jlz:webgl-ready', () => {
      clearReadyWatchdog()
      showEnterButton()
    }),
  )

  // jlz:webgl-failed fires if Experience.init() throws — show an error message
  // instead of the Enter button, so the user knows the 3D failed (not just slow).
  _bootstrapUnsubs.push(
    eventBus.on('jlz:webgl-failed', () => {
      clearReadyWatchdog()
      if (_bootstrapState !== 'failed') transitionBootstrap('failed')
      showLoadError()
    }),
  )

  // jlz:splash-entered fires when user clicks Enter — splash starts fading.
  // Let the active title answer the opening curtain, rather than animating
  // every title in the document behind the splash.
  // ── Splash entered → reveal the first visible home content ──
  // Keep this deliberately simple: Vue owns #spa-content, so we wait until
  // the DOM actually contains the route content, then start the first reveal.
  //
  // Do NOT make the first animation depend on section-change, page-section-change,
  // IntersectionObserver or a second bootstrap event. Those are for subsequent
  // navigation/scroll transitions.

  _bootstrapUnsubs.push(
    eventBus.on('jlz:splash-entered', () => {
      transitionBootstrap('entered')

      const reveal = () => {
        const root = contentRoot()

        const title = root.querySelector<HTMLElement>('.studio-title:not([data-blur-fade="off"])')

        const eyebrow = root.querySelector<HTMLElement>('[data-eyebrow]')

        // First title
        if (title) {
          const text = title.textContent?.trim() ?? ''
          if (text) {
            splashRevealedTitles.add(title)
            BlurFade.reveal(title, 0.55, text)
          }
        }

        // First eyebrow
        if (eyebrow) NoiseText.revealEyebrow(eyebrow)

        // Start normal viewport-based title animation after the first reveal.
        setupTitleObserver()
      }

      // Vue may still be finishing the route DOM when splash-entered fires.
      // Two animation frames are enough and avoid another arbitrary 90ms timer.
      requestAnimationFrame(() => {
        requestAnimationFrame(reveal)
      })
    }),
  )

  // Fallback: if jlz:webgl-ready doesn't fire within 60s (Experience.init
  // crashed or hung), show a load error. The Enter button stays DISABLED
  // (greyed, non-clickable) the entire time — it never activates until 3D
  // is truly ready. Under CPU/network throttling, init() can take 10-20s;
  // that's expected and the progress ring keeps the user informed.
  _readyWatchdog = setTimeout(() => {
    _readyWatchdog = null
    const enterBtn = document.getElementById('jlz-splash-enter')
    if (enterBtn && !enterBtn.classList.contains('is-ready')) {
      console.error('[entry-app] jlz:webgl-ready did not fire within 60s — showing load error')
      showLoadError()
    }
  }, 60000)

  // The post-splash section title reveal contract, shared by both section
  // events: one `.studio-title` per section container, 1.5 s BlurFade. (The
  // splash first-reveal above is intentionally different: 0.55 s, the title
  // text, and the splashRevealedTitles registry.)
  function revealStudioTitle(container: ParentNode | null): void {
    const title = container?.querySelector<HTMLElement>('.studio-title')
    if (title) BlurFade.reveal(title, 1.5)
  }

  // ── Animate titles on section change (home: data-section) ──
  _bootstrapUnsubs.push(
    eventBus.on('jlz:section-change', (payload) => {
      if (!payload?.sectionId) return
      if (prefersReducedMotion()) return
      const section = contentRoot().querySelector(`[data-section="${payload.sectionId}"]`)
      if (!section) return
      revealStudioTitle(section)
    }),
  )

  // ── Animate titles on page section change (content: data-page-section) ──
  _bootstrapUnsubs.push(
    eventBus.on('jlz:page-section-change', ({ index }) => {
      if (prefersReducedMotion()) return
      const sections = contentRoot().querySelectorAll<HTMLElement>('[data-page-section]')
      const el = sections[index]
      if (!el) return
      revealStudioTitle(el)
      const eyebrow = el.querySelector<HTMLElement>('[data-eyebrow]')
      if (eyebrow) NoiseText.revealEyebrow(eyebrow)
    }),
  )

  const result = await boot()
  if (_bootstrapState === 'failed' && result.retryable) {
    throw new Error('Application bootstrap failed')
  }
}

// The shell entry calls startApp() exactly once; boot() itself is idempotent
// through the bootstrap state machine, and the only retry is a full page
// reload handled by the shell's fallback.
export function startApp(): Promise<void> {
  return startAppOnce()
}

/**
 * IntersectionObserver that fires BlurFade when a .studio-title enters the
 * viewport — synchronized with UIkit scrollspy's viewport entry.
 */
let _titleObserver: IntersectionObserver | null = null
const splashRevealedTitles = new WeakSet<HTMLElement>()

function setupTitleObserver(): void {
  // Disconnect previous observer if any (HMR re-init guard)
  _titleObserver?.disconnect()
  if (prefersReducedMotion()) return

  const titles = contentRoot().querySelectorAll<HTMLElement>(
    '.studio-title:not([data-blur-fade="off"])',
  )
  if (titles.length === 0) return
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement
          // The splash owns the first reveal of the visible title. Skipping
          // this one observer entry prevents its slower default reveal from
          // restarting over the splash-specific animation.
          if (splashRevealedTitles.delete(el)) continue
          BlurFade.reveal(el, 1.2)
        }
      }
    },
    { threshold: 0.15 },
  )
  titles.forEach((t) => observer.observe(t))
  _titleObserver = observer
}
