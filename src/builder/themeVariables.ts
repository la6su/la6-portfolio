// src/builder/themeVariables.ts — the preview theme contract.
//
// The builder preview paints its content with a fixed set of `--builder-*`
// CSS custom properties. Before this module those 47 properties were written
// one by one inside the admin editor's `applyPreviewTheme` DOM function (and
// the card-shadow presets were literals only). This module is their single
// framework-neutral source: a pure `themeToCssVars` mapping from the typed
// `BuilderTheme` to the CSS variable map the preview consumes.
//
// It is pure (no DOM, no Vue) and is consumed by the Vue admin editor, which
// assigns the returned map onto the preview element after every render.

import type { BuilderTheme } from './style'

/** Card-shadow presets consumed by the preview (legacy literals). */
export const CARD_SHADOW_PRESETS = {
  none: 'none',
  soft: '0 8px 24px rgba(0, 0, 0, 0.22)',
  deep: '0 20px 56px rgba(0, 0, 0, 0.42)',
} as const

/** Resolve the card-shadow preset; any unrecognized value falls back to deep,
 *  exactly like the legacy preview did. */
export function cardShadowValue(cardShadow: string): string {
  if (cardShadow === 'none') return CARD_SHADOW_PRESETS.none
  if (cardShadow === 'soft') return CARD_SHADOW_PRESETS.soft
  return CARD_SHADOW_PRESETS.deep
}

/** The complete `--builder-*` variable map for a theme (47 entries). */
export function themeToCssVars(theme: BuilderTheme): Record<string, string> {
  return {
    '--builder-accent': theme.accent,
    '--builder-accent-hover': theme.accentHover,
    '--builder-accent-secondary': theme.accentSecondary,
    '--builder-background': theme.background,
    '--builder-background-elevated': theme.backgroundElevated,
    '--builder-surface': theme.surface,
    '--builder-surface-hover': theme.surfaceHover,
    '--builder-text': theme.text,
    '--builder-text-muted': theme.textMuted,
    '--builder-border': theme.border,
    '--builder-signal-cool': theme.signalCool,
    '--builder-signal-ember': theme.signalEmber,
    '--builder-radius': theme.radius,
    '--builder-font-size': theme.fontSize,
    '--builder-line-height': theme.lineHeight,
    '--builder-heading-weight': theme.headingWeight,
    '--builder-heading-transform': theme.headingTransform,
    '--builder-heading-line-height': theme.headingLineHeight,
    '--builder-text-line-height': theme.textLineHeight,
    '--builder-spacing': theme.spacing,
    '--builder-grid-gutter': theme.gridGutter,
    '--builder-link-color': theme.linkColor,
    '--builder-link-muted-color': theme.linkMutedColor,
    '--builder-icon-color': theme.iconColor,
    '--builder-list-gap': theme.listGap,
    '--builder-divider-color': theme.dividerColor,
    '--builder-divider-spacing': theme.dividerSpacing,
    '--builder-inverse-background': theme.inverseBackground,
    '--builder-inverse-surface': theme.inverseSurface,
    '--builder-inverse-text': theme.inverseText,
    '--builder-inverse-text-muted': theme.inverseTextMuted,
    '--builder-inverse-accent': theme.inverseAccent,
    '--builder-button-height': theme.buttonHeight,
    '--builder-button-radius': theme.buttonRadius,
    '--builder-button-weight': theme.buttonWeight,
    '--builder-button-transform': theme.buttonTransform,
    '--builder-card-radius': theme.cardRadius,
    '--builder-card-padding': theme.cardPadding,
    '--builder-card-shadow': cardShadowValue(theme.cardShadow),
    '--builder-section-muted': theme.sectionMuted,
    '--builder-section-primary': theme.sectionPrimary,
    '--builder-section-secondary': theme.sectionSecondary,
    '--builder-control-height': theme.controlHeight,
    '--builder-form-surface': theme.formSurface,
    '--builder-form-border': theme.formBorder,
    '--builder-navbar-height': theme.navbarHeight,
    '--builder-navbar-surface': theme.navbarSurface,
  }
}
