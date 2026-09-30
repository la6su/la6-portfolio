// src/core/brandTokens.ts — Phase 3 pure brand/runtime token manifest.
//
// The canonical design tokens live in `src/assets/_import.less` §1
// ("DESIGN TOKENS (@jlz-* Less variables)") — the single source of truth for
// the Less + CSS custom properties that the console shell consumes. This
// manifest mirrors that block as a typed, framework-neutral record so that:
//
//   - the token set has one machine-readable, unit-tested name (parallel to
//     `worldSlots.ts` and `routeManifest.ts`);
//   - the Phase 5 "generated adapters" target owner (per the traceability
//     ledger: `typed manifest + generated adapters`) can be built without
//     re-declaring values by hand;
//   - scene code (Phase 3 typed ports) can reference brand values without
//     importing Less.
//
// Direction of truth is NOT flipped in this slice: the Less file remains the
// single source of truth and stays in sync by a unit test that parses §1 and
// compares it against this manifest key-for-key and value-for-value. The
// manifest is inert until consumed; no runtime or Less behavior changes here.
//
// Alias note: six tokens in §1 are Less variable references (e.g.
// `@jlz-color-signal-teal: @jlz-color-signal-cool;`). The emitted CSS custom
// properties resolve them to the referenced value at compile time, so this
// manifest stores the RESOLVED value and records the alias relation in
// `BRAND_TOKEN_ALIASES`. That keeps the editorial fact (teal is an alias of
// cool) explicit instead of silently duplicated.
//
// Scope note: `src/assets/builder/theme.generated.less` re-declares a subset
// of these tokens with authored values (the Style Builder's generated
// override layer). It is a build artifact of the dev-only builder, not part
// of the canonical set, and is intentionally outside this manifest.

type Token = string

// ── Color (dark console polarity — Neuro Console identity, ADR 0007) ──
const COLOR: Record<string, Token> = {
  'color-bg': '#0b0e14',
  'color-bg-elevated': '#11151e',
  'color-surface': '#161b26',
  'color-surface-hover': '#1d2432',
  'color-border': 'rgba(230, 237, 243, 0.08)',
  'color-border-strong': 'rgba(230, 237, 243, 0.16)',
  'color-text': '#e6edf3',
  'color-text-muted': 'rgba(230, 237, 243, 0.62)',
  'color-text-subtle': 'rgba(230, 237, 243, 0.38)',
  'color-text-inverse': '#0a0c10',
  'color-accent': '#ffd60a',
  'color-accent-hover': '#ffe85c',
  // Secondary action accent (see BRAND_TOKEN_ALIASES).
  'color-accent-secondary': '#58e6a9',
  'color-accent-glow': 'rgba(255, 214, 10, 0.35)',
  // Phosphor is the interface voice of the TUI chrome; yellow stays the
  // brand/display funk accent.
  'color-signal-phosphor': '#58e6a9',
  'color-signal-phosphor-muted': 'rgba(88, 230, 169, 0.1)',
  'color-signal-cool': '#79c0ff',
  'color-signal-cool-muted': 'rgba(121, 192, 255, 0.22)',
  // Alias of signal-phosphor (see BRAND_TOKEN_ALIASES).
  'color-signal-teal': '#58e6a9',
  'color-signal-teal-muted': 'rgba(88, 230, 169, 0.1)',
  'color-signal-ember': '#ff7b72',
  // Semantic status — the only success/warning/danger source.
  // Alias of signal-phosphor (see BRAND_TOKEN_ALIASES).
  'color-status-success': '#58e6a9',
  'color-status-warning': '#f0883e',
  // Alias of signal-ember (see BRAND_TOKEN_ALIASES).
  'color-status-danger': '#ff7b72',
  // Inverse (cool paper) polarity — authored independently by the builder.
  'inverse-bg': '#e9eef5',
  'inverse-surface': '#f5f8fc',
  'inverse-text': '#0b0e13',
  'inverse-text-muted': '#46505c',
  'inverse-accent': '#7a5c00',
}

// ── Typography ──
const TYPOGRAPHY: Record<string, Token> = {
  'font-display':
    "'Commissioner', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  'font-body': "'Commissioner', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  'font-mono': "'JetBrains Mono', 'SFMono-Regular', 'Cascadia Code', 'Consolas', monospace",
  'weight-light': '300',
  'weight-regular': '400',
  'weight-medium': '500',
  'weight-semibold': '600',
  'weight-bold': '700',
  // One tracking value across the application; hierarchy uses weight/scale.
  'letter-spacing': '0',
}

// ── Spacing (4px base, rem-based) ──
const SPACING: Record<string, Token> = {
  'space-0': '0',
  'space-1': '0.25rem',
  'space-2': '0.5rem',
  'space-3': '0.75rem',
  'space-4': '1rem',
  'space-5': '1.25rem',
  'space-6': '1.5rem',
  'space-8': '2rem',
  'space-10': '2.5rem',
  'space-12': '3rem',
  'space-16': '4rem',
  'space-20': '5rem',
  'space-24': '6rem',
  'space-32': '8rem',
}

// ── Radius + derived surfaces ──
const RADIUS: Record<string, Token> = {
  'radius-none': '0',
  'radius-sm': '0',
  'radius-md': '0',
  'radius-lg': '0',
  'radius-xl': '0',
  'radius-fluid': '0',
  'radius-full': '0.125rem',
  // Derived aliases (see BRAND_TOKEN_ALIASES).
  'button-radius': '0',
  'card-radius': '0',
  'card-shadow': 'none',
  'form-border': 'rgba(230, 237, 243, 0.08)',
  'navbar-surface': '#0b0e14',
}

// ── Console interface surfaces ──
const SURFACE: Record<string, Token> = {
  'color-fluid-surface': '#11151e',
  'color-fluid-surface-strong': '#161b26',
  'color-fluid-border': 'rgba(230, 237, 243, 0.12)',
  'color-fluid-highlight': 'rgba(88, 230, 169, 0.1)',
  'color-fluid-warm': '#ffd60a',
  'color-telegram': '#2aabee',
}

// ── Z-index ──
const Z: Record<string, Token> = {
  'z-canvas': '1',
  'z-content': '10',
  'z-nav': '100',
  'z-overlay': '1000',
  'z-modal': '2000',
  'z-toast': '3000',
}

// ── Motion ──
const MOTION: Record<string, Token> = {
  'duration-instant': '80ms',
  'duration-fast': '160ms',
  'duration-normal': '240ms',
  'duration-slow': '400ms',
  'duration-cinematic': '800ms',
  'duration-epic': '1400ms',
  'ease-entrance': 'cubic-bezier(0.16, 1, 0.3, 1)',
  'ease-exit': 'cubic-bezier(0.7, 0, 0.84, 0)',
  'ease-emphasis': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  'ease-state': 'cubic-bezier(0.4, 0, 0.2, 1)',
  'ease-cinematic': 'cubic-bezier(0.65, 0, 0.35, 1)',
}

// ── Type scale: golden-ratio (φ = 1.618) modular chain ──
const TYPE: Record<string, Token> = {
  'type-step-1': '0.875rem',
  'type-step-2': '1.414rem',
  'type-step-3': '2.288rem',
  'type-step-4': '3.702rem',
  'type-step-5': '6rem',
  'type-step-6': '9.708rem',
  'type-step-7': '15.707rem',
}

// ── Layout ──
const LAYOUT: Record<string, Token> = {
  'page-max-width': '90rem',
  'page-gutter': '5rem',
  'section-min-height': '100vh',
}

/** The prefix shared by every token name (Less `@` / CSS `--`). */
export const BRAND_TOKEN_PREFIX = 'jlz'

/**
 * Tokens that are aliases of another token in the canonical block. The
 * manifest stores the resolved value; this record preserves the alias
 * relation so it is a documented fact, not a silent duplicate.
 */
export const BRAND_TOKEN_ALIASES: Readonly<Record<string, string>> = {
  'color-accent-secondary': 'color-signal-phosphor',
  'color-signal-teal': 'color-signal-phosphor',
  'color-signal-teal-muted': 'color-signal-phosphor-muted',
  'color-status-success': 'color-signal-phosphor',
  'color-status-danger': 'color-signal-ember',
  'color-fluid-warm': 'color-accent',
  'button-radius': 'radius-md',
  'card-radius': 'radius-lg',
  'form-border': 'color-border',
  'navbar-surface': 'color-bg',
}

/** All canonical tokens, flattened: `jlz-<name>` → value. */
export const BRAND_TOKENS: Readonly<Record<string, Token>> = {
  ...Object.fromEntries(Object.entries(COLOR).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(
    Object.entries(TYPOGRAPHY).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v]),
  ),
  ...Object.fromEntries(Object.entries(SPACING).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(Object.entries(RADIUS).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(Object.entries(SURFACE).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(Object.entries(Z).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(Object.entries(MOTION).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(Object.entries(TYPE).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
  ...Object.fromEntries(Object.entries(LAYOUT).map(([k, v]) => [`${BRAND_TOKEN_PREFIX}-${k}`, v])),
}

/**
 * The token value for a canonical name. Strict lookup: an unknown name is a
 * caller bug — this never falls back to a default (the routePage lesson).
 */
export function brandToken(name: string): string | undefined {
  return BRAND_TOKENS[name]
}

/** True when `name` is a canonical token name. */
export function isBrandToken(name: string): boolean {
  return name in BRAND_TOKENS
}
