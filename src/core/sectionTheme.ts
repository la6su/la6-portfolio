// src/core/sectionTheme.ts — Phase 3 typed effective-theme port (pure
// contract).
//
// The scene input port that carries the *effective theme* into the scene.
// Every story section has a base polarity (light/dark) owned by its
// WorldConfig phase (`PhaseConfig.theme`), and the user's theme mode
// (ThemeManager: auto/inverse) decides whether the base polarity is honored
// or flipped. The effective polarity is what the scene receives:
//
//   auto    → effective = base polarity       (light stays light, dark stays
//                                                dark)
//   inverse → effective = flipped base polarity (light becomes dark, dark
//                                                becomes light)
//
// This XOR decision was inlined in `ContentReveal.applyTheme()` (the DOM
// owner) and the `jlz:theme-applied` payload was an ad-hoc untyped CustomEvent
// detail. This contract extracts the decision as a pure function and types
// the port shape (`ThemeAppliedPort`) the scene reads.
//
// Pure by design: no DOM, no localStorage, no globals — unit-testable
// without a browser. Consumed immediately: `ContentReveal` reads
// `resolveEffectiveTheme` at the exact point where it inlined the ternary
// before and builds the event detail as `ThemeAppliedPort` — a 1:1
// source-of-fact swap with unchanged timing (the event is still dispatched
// at the same moment, with the same values).
//
// Ownership stays split, deliberately:
//   - the per-section base polarity → WorldConfig phase configs;
//   - the user's theme mode (auto/inverse, persisted) → ThemeManager;
//   - the decision + the port shape → this contract;
//   - the DOM `uk-light` application and the event dispatch → ContentReveal.

import type { ThemeMode } from './ThemeManager'

/** The effective polarity the scene receives. */
export interface ThemeAppliedPort {
  /** Effective light/dark polarity (base XOR mode). */
  readonly isLight: boolean
  /** The active story section index (canonical slot index). */
  readonly sectionIndex: number
  /** The active section's DOM anchor id. */
  readonly sectionId: string
  /**
   * Whether the effective polarity changed. Consumers use it to skip
   * theme-only work (ground, baku, typography, particle blending) on a
   * same-polarity section step. The emitter currently always sends `true`
   * (cheap, prevents desync on route change).
   */
  readonly themeChanged: boolean
  /** The theme mode that produced `isLight`. */
  readonly mode: ThemeMode
  /**
   * `true` when the polarity change came from a user theme toggle and the
   * scene must snap instantly (no lerp); `false` for a scroll-driven
   * section step (lerp).
   */
  readonly snap: boolean
}

/**
 * The effective polarity for a section base polarity and a theme mode.
 * The single source of the auto/inverse rule:
 *
 * - `auto`    → the base polarity is honored;
 * - `inverse` → the base polarity is flipped.
 *
 * `sectionIsLight` is the section's base polarity (`PhaseConfig.theme ===
 * 'light'`); the caller resolves the `cfg`-less fallback to light before
 * calling, exactly as the legacy inline expression did.
 */
export function resolveEffectiveTheme(sectionIsLight: boolean, mode: ThemeMode): boolean {
  return mode === 'inverse' ? !sectionIsLight : sectionIsLight
}
