import { TextReveal } from './UI/TextReveal'
import { eventBus } from './core/EventBus'
import { noSceneRequested } from './core/sceneMode'
import { getSoundMuted, setSoundMutedPreference } from './core/SfxSystem'
import { prefersReducedMotion } from './core/motionPolicy'
// LANG_KEY handled by i18n.ts

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
    const muted = !soundOn
    setSoundMutedPreference(muted)
    eventBus.emit('jlz:sound-toggle', { muted })
    update()
  })
}

// ── Config: language toggle EN/RU ──
import { initI18n, toggleLang, getLang } from './core/i18n'

// Typed event facade for the classic splash script and browser automation,
// which cannot import the application module graph.
// Installed at module scope — the moment entry-app.ts loads, which is before
// the Vue router mounts and before the splash Enter button
// is ever enabled (`jlz:webgl-ready`) — so it is always present for the splash
// and for navigation tests regardless of whether `experience.init()` succeeds.
;(window as unknown as { __jlzEmit?: (event: string, detail?: unknown) => void }).__jlzEmit = (event, detail) => {
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

// ── Show Enter button when 3D is ready ──
function showEnterButton(): void {
  const enterBtn = document.getElementById('jlz-splash-enter') as HTMLButtonElement | null
  if (!enterBtn) return
  // Flip aria-disabled so assistive technology sees Enter as activatable.
  enterBtn.classList.add('is-ready')
  enterBtn.setAttribute('aria-disabled', 'false')
}

// ── Show a load error when 3D fails to initialize ──
// Replaces the Enter button with an error message + scene-free continuation and flips the
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
            The interactive scene could not start. Continue to the portfolio without 3D,
            or reload the page to try again.
          </p>
          <span class="jlz-boot-gate__code">ERR:SCENE — INITIALIZATION FAILED</span>
          <button class="jlz-boot-gate__action" type="button" data-jlz-continue-without-scene>
            Continue without 3D
          </button>
          <a class="jlz-boot-gate__action" href="/">Retry</a>
        </div>
      `
      parent.querySelector<HTMLButtonElement>('[data-jlz-continue-without-scene]')?.addEventListener(
        'click',
        () => {
          const loader = document.getElementById('jlz-app-loader')
          if (!loader) return
          loader.setAttribute('aria-busy', 'false')
          loader.classList.add('is-exiting')
          eventBus.emit('jlz:splash-entered')
          let fallbackTimer = 0
          const removeLoader = (event?: AnimationEvent): void => {
            if (event && (event.target !== loader || event.animationName !== 'loader-exit')) return
            if (!loader.isConnected) return
            window.clearTimeout(fallbackTimer)
            loader.removeEventListener('animationend', removeLoader)
            loader.remove()
            const main = document.querySelector<HTMLElement>('#spa-content')
            if (main) {
              main.tabIndex = -1
              main.focus({ preventScroll: true })
            }
          }
          loader.addEventListener('animationend', removeLoader)
          fallbackTimer = window.setTimeout(() => removeLoader(), 1300)
        },
        { once: true },
      )
    }
  }
}

// ── Seamless splash loader ──
// index.html has #jlz-app-loader with the spiral/portal SVG + a status row.
// Three.js loads lazily from this bootstrap — it does not block FCP. We update
// the row when boot enters scene preparation and becomes ready. Config
// buttons (sound + language) are inside the loader — they fade out with the
// splash. Fade-out is triggered by Enter button click (inline script in
// index.html), NOT auto.
const SPLASH_STATUS_SELECTOR = '[data-jlz-splash="state"]'

function updateLoaderStatus(value: string): void {
  const status = document.querySelector(SPLASH_STATUS_SELECTOR)
  if (status) status.textContent = value
}

let _readyWatchdog: ReturnType<typeof setTimeout> | null = null
let _readyEventTimer: ReturnType<typeof setTimeout> | null = null
let _bootstrapUnsubs: Array<() => void> = []
let bootstrapStyle: HTMLStyleElement | null = null
let bootStartedAt = 0

function clearBootstrapStyle(): void {
  bootstrapStyle?.remove()
  bootstrapStyle = null
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
  TextReveal.disposeAll()
  clearReadyWatchdog()
  clearReadyEventTimer()
  clearBootstrapStyle()
  clearHostProbe()
}

function clearReadyWatchdog(): void {
  if (_readyWatchdog !== null) {
    clearTimeout(_readyWatchdog)
    _readyWatchdog = null
  }
}

function clearReadyEventTimer(): void {
  if (_readyEventTimer !== null) {
    clearTimeout(_readyEventTimer)
    _readyEventTimer = null
  }
}

/** Delay readiness for the curtain intro; cancel on bootstrap failure. */
function scheduleReadyEvent(delayMs: number): void {
  clearReadyEventTimer()
  _readyEventTimer = setTimeout(() => {
    _readyEventTimer = null
    eventBus.emit('jlz:webgl-ready')
  }, delayMs)
}

async function startAppOnce(): Promise<void> {
  resetBootstrapBindings()
  // Init splash config toggles FIRST — instant, no dependencies.
  // These work during loading, before three.js finishes.
  initSplashToggles()
  // Use ?inline to prevent Vite from injecting @vite/client (updateStyle/
  // removeStyle) into the CSS module — through the reverse proxy, /@vite/client
  // resolves to the Next.js app which returns HTML instead of JS, breaking
  // the entire module loading chain. ?inline returns raw CSS string without
  // HMR injection.
  const cssModule = await import('./assets/main.less?inline')
  // Manually inject the CSS into the document
  clearBootstrapStyle()
  bootstrapStyle = document.createElement('style')
  bootstrapStyle.textContent = (cssModule as unknown as { default: string }).default || ''
  document.head.appendChild(bootstrapStyle)
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

  // Keep the router and route components in a lazy app chunk. The shared
  // scene runtime is booted once, regardless of the current route.
  const appMount = import('./app').then((m) => m.mountVueApp())

  // jlz:webgl-ready fires when Experience.init() completes — show Enter button.
  // Vue shell text reveals are delayed until jlz:splash-entered
  // (Enter click) so user sees them as 3D scene reveals, not behind splash.
  _bootstrapUnsubs.push(
    eventBus.on('jlz:experience-starting', () => updateLoaderStatus('PREPARING SCENE')),
    eventBus.on('jlz:experience-ready', () => {
      updateLoaderStatus('READY')
      const introMs = 600
      const remaining = Math.max(0, introMs - (performance.now() - bootStartedAt))
      scheduleReadyEvent(prefersReducedMotion() ? 0 : remaining)
    }),
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
      showLoadError()
    }),
  )

  // Fallback: if jlz:webgl-ready doesn't fire within 60s (Experience.init
  // crashed or hung), show a load error. The Enter button stays DISABLED
  // (greyed, non-clickable) the entire time — it never activates until 3D
  // is truly ready. Under CPU/network throttling, initialization can take
  // several seconds; the status row reports its phase without inventing a
  // completion percentage.
  _readyWatchdog = setTimeout(() => {
    _readyWatchdog = null
    const enterBtn = document.getElementById('jlz-splash-enter')
    if (enterBtn && !enterBtn.classList.contains('is-ready')) {
      console.error('[entry-app] jlz:webgl-ready did not fire within 60s — showing load error')
      showLoadError()
    }
  }, 60000)

  // DOM-only mode keeps routes and navigation available without creating a
  // scene renderer or canvas. Otherwise Vue's ExperienceRuntime starts after
  // SceneHost has selected and published its renderer.
  if (noSceneRequested) {
    try {
      // Do not enable Enter until the route owner and its splash listener are
      // mounted; otherwise an immediate click can emit splash-entered first.
      await appMount
      updateLoaderStatus('READY')
      eventBus.emit('jlz:webgl-ready')
    } catch (error) {
      console.error('[entry-app] no-scene bootstrap failed:', error)
      throw new Error('DOM-only application bootstrap failed', { cause: error })
    }
  } else {
    void appMount.catch((error) => {
      console.error('[entry-app] Vue mount failed:', error)
      eventBus.emit('jlz:webgl-failed')
    })
    bootStartedAt = performance.now()
    updateLoaderStatus('INITIALIZING')
  }
}

// The shell entry calls startApp() exactly once; retry is a full page reload
// handled by the shell's fallback.
export function startApp(): Promise<void> {
  return startAppOnce()
}
