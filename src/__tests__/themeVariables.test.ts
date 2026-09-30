import { describe, it, expect } from 'vitest'
import { CARD_SHADOW_PRESETS, cardShadowValue, themeToCssVars } from '../builder/themeVariables'
import { DEFAULT_BUILDER_THEME, type BuilderTheme } from '../builder/style'

const ALL_VARS = [
  '--builder-accent',
  '--builder-accent-hover',
  '--builder-accent-secondary',
  '--builder-background',
  '--builder-background-elevated',
  '--builder-surface',
  '--builder-surface-hover',
  '--builder-text',
  '--builder-text-muted',
  '--builder-border',
  '--builder-signal-cool',
  '--builder-signal-ember',
  '--builder-radius',
  '--builder-font-size',
  '--builder-line-height',
  '--builder-heading-weight',
  '--builder-heading-transform',
  '--builder-heading-line-height',
  '--builder-text-line-height',
  '--builder-spacing',
  '--builder-grid-gutter',
  '--builder-link-color',
  '--builder-link-muted-color',
  '--builder-icon-color',
  '--builder-list-gap',
  '--builder-divider-color',
  '--builder-divider-spacing',
  '--builder-inverse-background',
  '--builder-inverse-surface',
  '--builder-inverse-text',
  '--builder-inverse-text-muted',
  '--builder-inverse-accent',
  '--builder-button-height',
  '--builder-button-radius',
  '--builder-button-weight',
  '--builder-button-transform',
  '--builder-card-radius',
  '--builder-card-padding',
  '--builder-card-shadow',
  '--builder-section-muted',
  '--builder-section-primary',
  '--builder-section-secondary',
  '--builder-control-height',
  '--builder-form-surface',
  '--builder-form-border',
  '--builder-navbar-height',
  '--builder-navbar-surface',
]

describe('themeToCssVars', () => {
  it('emits exactly the 47 preview variables (no more, no less)', () => {
    const vars = themeToCssVars(DEFAULT_BUILDER_THEME)
    expect(Object.keys(vars).sort()).toEqual([...ALL_VARS].sort())
    expect(Object.keys(vars)).toHaveLength(47)
  })

  it('maps each theme fact to its legacy variable name', () => {
    const theme: BuilderTheme = {
      ...DEFAULT_BUILDER_THEME,
      accent: '#111213',
      accentHover: '#222324',
      accentSecondary: '#343536',
      background: '#333435',
      backgroundElevated: '#444546',
      surface: '#555657',
      surfaceHover: '#666768',
      text: '#777879',
      textMuted: '#88898a',
      border: '#999a9b',
      signalCool: '#aabbcc',
      signalEmber: '#ddeeff',
      radius: '9px',
      fontSize: '15px',
      lineHeight: '1.5',
      headingWeight: '700',
      headingTransform: 'uppercase',
      headingLineHeight: '1.25',
      textLineHeight: '1.7',
      spacing: '24px',
      gridGutter: '28px',
      linkColor: '#404142',
      linkMutedColor: '#505152',
      iconColor: '#606162',
      listGap: '12px',
      dividerColor: '#707172',
      dividerSpacing: '40px',
      inverseBackground: '#1a1b1c',
      inverseSurface: '#2a2b2c',
      inverseText: '#fafafa',
      inverseTextMuted: '#b0b0b0',
      inverseAccent: '#ff00ff',
      buttonHeight: '40px',
      buttonRadius: '8px',
      buttonWeight: '600',
      buttonTransform: 'none',
      cardRadius: '12px',
      cardPadding: '28px',
      sectionMuted: '#101010',
      sectionPrimary: '#202020',
      sectionSecondary: '#303030',
      controlHeight: '36px',
      formSurface: '#404040',
      formBorder: '#505050',
      navbarHeight: '60px',
      navbarSurface: '#606060',
    }
    const vars = themeToCssVars(theme)
    expect(vars['--builder-accent']).toBe('#111213')
    expect(vars['--builder-accent-hover']).toBe('#222324')
    expect(vars['--builder-accent-secondary']).toBe('#343536')
    expect(vars['--builder-background']).toBe('#333435')
    expect(vars['--builder-background-elevated']).toBe('#444546')
    expect(vars['--builder-surface']).toBe('#555657')
    expect(vars['--builder-surface-hover']).toBe('#666768')
    expect(vars['--builder-text']).toBe('#777879')
    expect(vars['--builder-text-muted']).toBe('#88898a')
    expect(vars['--builder-border']).toBe('#999a9b')
    expect(vars['--builder-signal-cool']).toBe('#aabbcc')
    expect(vars['--builder-signal-ember']).toBe('#ddeeff')
    expect(vars['--builder-radius']).toBe('9px')
    expect(vars['--builder-font-size']).toBe('15px')
    expect(vars['--builder-line-height']).toBe('1.5')
    expect(vars['--builder-heading-weight']).toBe('700')
    expect(vars['--builder-heading-transform']).toBe('uppercase')
    expect(vars['--builder-heading-line-height']).toBe('1.25')
    expect(vars['--builder-text-line-height']).toBe('1.7')
    expect(vars['--builder-spacing']).toBe('24px')
    expect(vars['--builder-grid-gutter']).toBe('28px')
    expect(vars['--builder-link-color']).toBe('#404142')
    expect(vars['--builder-link-muted-color']).toBe('#505152')
    expect(vars['--builder-icon-color']).toBe('#606162')
    expect(vars['--builder-list-gap']).toBe('12px')
    expect(vars['--builder-divider-color']).toBe('#707172')
    expect(vars['--builder-divider-spacing']).toBe('40px')
    expect(vars['--builder-inverse-background']).toBe('#1a1b1c')
    expect(vars['--builder-inverse-surface']).toBe('#2a2b2c')
    expect(vars['--builder-inverse-text']).toBe('#fafafa')
    expect(vars['--builder-inverse-text-muted']).toBe('#b0b0b0')
    expect(vars['--builder-inverse-accent']).toBe('#ff00ff')
    expect(vars['--builder-button-height']).toBe('40px')
    expect(vars['--builder-button-radius']).toBe('8px')
    expect(vars['--builder-button-weight']).toBe('600')
    expect(vars['--builder-button-transform']).toBe('none')
    expect(vars['--builder-card-radius']).toBe('12px')
    expect(vars['--builder-card-padding']).toBe('28px')
    expect(vars['--builder-section-muted']).toBe('#101010')
    expect(vars['--builder-section-primary']).toBe('#202020')
    expect(vars['--builder-section-secondary']).toBe('#303030')
    expect(vars['--builder-control-height']).toBe('36px')
    expect(vars['--builder-form-surface']).toBe('#404040')
    expect(vars['--builder-form-border']).toBe('#505050')
    expect(vars['--builder-navbar-height']).toBe('60px')
    expect(vars['--builder-navbar-surface']).toBe('#606060')
  })

  it('is pure: repeated calls return equal maps and never mutate the theme', () => {
    const theme = structuredClone(DEFAULT_BUILDER_THEME)
    const frozen = structuredClone(theme)
    const first = themeToCssVars(theme)
    const second = themeToCssVars(theme)
    expect(first).toEqual(second)
    expect(theme).toEqual(frozen)
  })
})

describe('cardShadowValue', () => {
  it('locks the legacy shadow presets', () => {
    expect(CARD_SHADOW_PRESETS.none).toBe('none')
    expect(CARD_SHADOW_PRESETS.soft).toBe('0 8px 24px rgba(0, 0, 0, 0.22)')
    expect(CARD_SHADOW_PRESETS.deep).toBe('0 20px 56px rgba(0, 0, 0, 0.42)')
  })

  it('resolves none/soft/deep and falls back to deep for anything else', () => {
    expect(cardShadowValue('none')).toBe('none')
    expect(cardShadowValue('soft')).toBe('0 8px 24px rgba(0, 0, 0, 0.22)')
    expect(cardShadowValue('deep')).toBe('0 20px 56px rgba(0, 0, 0, 0.42)')
    expect(cardShadowValue('weird')).toBe('0 20px 56px rgba(0, 0, 0, 0.42)')
    expect(cardShadowValue('')).toBe('0 20px 56px rgba(0, 0, 0, 0.42)')
  })

  it('feeds the --builder-card-shadow variable', () => {
    expect(
      themeToCssVars({ ...DEFAULT_BUILDER_THEME, cardShadow: 'soft' })['--builder-card-shadow'],
    ).toBe('0 8px 24px rgba(0, 0, 0, 0.22)')
  })
})
