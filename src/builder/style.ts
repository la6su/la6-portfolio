export type BuilderThemeKey = keyof BuilderTheme
export type StyleGroupId =
  | 'global'
  | 'theme'
  | 'inverse'
  | 'base'
  | 'heading'
  | 'text'
  | 'grid'
  | 'button'
  | 'card'
  | 'section'
  | 'link'
  | 'icon'
  | 'list'
  | 'divider'
  | 'image'
  | 'video'
  | 'form'
  | 'navbar'

export interface BuilderTheme {
  accent: string
  accentHover: string
  accentSecondary: string
  background: string
  backgroundElevated: string
  surface: string
  surfaceHover: string
  text: string
  textMuted: string
  border: string
  signalCool: string
  signalEmber: string
  radius: string
  fontSize: string
  lineHeight: string
  headingWeight: string
  headingTransform: string
  headingLineHeight: string
  textLineHeight: string
  spacing: string
  gridGutter: string
  linkColor: string
  linkMutedColor: string
  iconColor: string
  listGap: string
  dividerColor: string
  dividerSpacing: string
  inverseBackground: string
  inverseSurface: string
  inverseText: string
  inverseTextMuted: string
  inverseAccent: string
  buttonHeight: string
  buttonRadius: string
  buttonWeight: string
  buttonTransform: string
  cardRadius: string
  cardPadding: string
  cardShadow: string
  sectionMuted: string
  sectionPrimary: string
  sectionSecondary: string
  controlHeight: string
  formSurface: string
  formBorder: string
  navbarHeight: string
  navbarSurface: string
}

interface StyleFieldDefinition {
  key: BuilderThemeKey
  label: string
  description: string
  type: 'color' | 'select'
  options?: ReadonlyArray<{ label: string; value: string }>
}

interface StyleGroupDefinition {
  id: StyleGroupId
  label: string
  category: 'general' | 'component'
  description: string
  icon: string
  fields: readonly StyleFieldDefinition[]
}

const options = (...values: string[]) => values.map((value) => ({ label: value, value }))

// Default document theme: the Neuro Console brand (ADR 0007). The Style
// Builder can author any other palette, but this is what new documents start
// from.
export const DEFAULT_BUILDER_THEME: BuilderTheme = {
  accent: '#ffd60a',
  accentHover: '#ffe85c',
  accentSecondary: '#58e6a9',
  background: '#0b0e14',
  backgroundElevated: '#11151e',
  surface: '#161b26',
  surfaceHover: '#1d2432',
  text: '#e6edf3',
  textMuted: '#8b949e',
  border: '#2a313c',
  signalCool: '#79c0ff',
  signalEmber: '#ff7b72',
  radius: '0px',
  fontSize: '16px',
  lineHeight: '1.5',
  headingWeight: '600',
  headingTransform: 'none',
  headingLineHeight: '1.15',
  textLineHeight: '1.6',
  spacing: '20px',
  gridGutter: '20px',
  linkColor: '#58e6a9',
  linkMutedColor: '#8b949e',
  iconColor: '#e6edf3',
  listGap: '8px',
  dividerColor: '#2a313c',
  dividerSpacing: '32px',
  inverseBackground: '#e9eef5',
  inverseSurface: '#f5f8fc',
  inverseText: '#0b0e13',
  inverseTextMuted: '#46505c',
  inverseAccent: '#7a5c00',
  buttonHeight: '44px',
  buttonRadius: '0px',
  buttonWeight: '600',
  buttonTransform: 'none',
  cardRadius: '0px',
  cardPadding: '32px',
  cardShadow: 'none',
  sectionMuted: '#161b26',
  sectionPrimary: '#ffd60a',
  sectionSecondary: '#11151e',
  controlHeight: '44px',
  formSurface: '#161b26',
  formBorder: '#2a313c',
  navbarHeight: '64px',
  navbarSurface: '#0b0e14',
}

export const STYLE_GROUPS: readonly StyleGroupDefinition[] = [
  {
    id: 'global',
    label: 'Global',
    category: 'general',
    icon: 'paint-bucket',
    description: 'Core color, surface and spacing tokens shared by every UIkit component.',
    fields: [
      {
        key: 'accent',
        label: 'Primary',
        description: 'Primary action and focus color.',
        type: 'color',
      },
      {
        key: 'accentHover',
        label: 'Primary hover',
        description: 'Hover and active accent color.',
        type: 'color',
      },
      {
        key: 'accentSecondary',
        label: 'Secondary accent',
        description: 'Secondary action and emphasis accent (cool mineral counterweight).',
        type: 'color',
      },
      { key: 'background', label: 'Background', description: 'Page background.', type: 'color' },
      {
        key: 'backgroundElevated',
        label: 'Elevated background',
        description: 'Raised panels and secondary surfaces.',
        type: 'color',
      },
      {
        key: 'surface',
        label: 'Surface',
        description: 'Default component surface.',
        type: 'color',
      },
      {
        key: 'surfaceHover',
        label: 'Surface hover',
        description: 'Interactive surface hover state.',
        type: 'color',
      },
      { key: 'text', label: 'Text', description: 'Default readable text.', type: 'color' },
      { key: 'textMuted', label: 'Muted text', description: 'Secondary copy.', type: 'color' },
      {
        key: 'border',
        label: 'Border',
        description: 'Default rule and control border.',
        type: 'color',
      },
      {
        key: 'spacing',
        label: 'Base spacing',
        description: 'Global margin and compact gutter rhythm.',
        type: 'select',
        options: options('16px', '20px', '24px', '28px', '32px'),
      },
    ],
  },
  {
    id: 'theme',
    label: 'Theme',
    category: 'general',
    icon: 'signal',
    description: 'JUSTLOVEJAZZ-specific signals and shared corner language.',
    fields: [
      {
        key: 'signalCool',
        label: 'Cool signal',
        description: 'Secondary brand signal.',
        type: 'color',
      },
      {
        key: 'signalEmber',
        label: 'Ember signal',
        description: 'Warning and emphasis signal.',
        type: 'color',
      },
      {
        key: 'radius',
        label: 'Global radius',
        description: 'Fallback corner radius for project surfaces.',
        type: 'select',
        options: options('0px', '2px', '4px', '8px', '12px', '16px'),
      },
    ],
  },
  {
    id: 'inverse',
    label: 'Inverse',
    category: 'general',
    icon: 'eye',
    description: 'The light paper polarity used by html.uk-light and inverse sections.',
    fields: [
      {
        key: 'inverseBackground',
        label: 'Background',
        description: 'Inverse page background.',
        type: 'color',
      },
      {
        key: 'inverseSurface',
        label: 'Surface',
        description: 'Inverse raised surface.',
        type: 'color',
      },
      { key: 'inverseText', label: 'Text', description: 'Inverse readable text.', type: 'color' },
      {
        key: 'inverseTextMuted',
        label: 'Muted text',
        description: 'Inverse secondary copy.',
        type: 'color',
      },
      {
        key: 'inverseAccent',
        label: 'Accent',
        description: 'Accessible accent on light paper.',
        type: 'color',
      },
    ],
  },
  {
    id: 'base',
    label: 'Base',
    category: 'component',
    icon: 'italic',
    description: 'Body typography: the global UIkit base font size and line height.',
    fields: [
      {
        key: 'fontSize',
        label: 'Font size',
        description: 'Global UIkit base font size.',
        type: 'select',
        options: options('14px', '15px', '16px', '17px', '18px'),
      },
      {
        key: 'lineHeight',
        label: 'Line height',
        description: 'Body text line height.',
        type: 'select',
        options: options('1.35', '1.4', '1.5', '1.6', '1.7'),
      },
    ],
  },
  {
    id: 'heading',
    label: 'Heading',
    category: 'component',
    icon: 'bold',
    description: 'Display and heading typography across all levels.',
    fields: [
      {
        key: 'headingWeight',
        label: 'Weight',
        description: 'Primary heading weight.',
        type: 'select',
        options: options('500', '600', '700', '800'),
      },
      {
        key: 'headingTransform',
        label: 'Transform',
        description: 'Heading capitalization policy.',
        type: 'select',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Uppercase', value: 'uppercase' },
        ],
      },
      {
        key: 'headingLineHeight',
        label: 'Line height',
        description: 'Heading line height.',
        type: 'select',
        options: options('1.1', '1.15', '1.2', '1.3', '1.4'),
      },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    category: 'component',
    icon: 'file-text',
    description: 'Body copy and lead paragraphs.',
    fields: [
      {
        key: 'textLineHeight',
        label: 'Line height',
        description: 'Body copy line height.',
        type: 'select',
        options: options('1.5', '1.6', '1.7', '1.8'),
      },
    ],
  },
  {
    id: 'grid',
    label: 'Grid',
    category: 'component',
    icon: 'grid',
    description: 'Column gutter rhythm for grid layouts.',
    fields: [
      {
        key: 'gridGutter',
        label: 'Gutter',
        description: 'Default grid gutter (small uses 75%).',
        type: 'select',
        options: options('16px', '20px', '24px', '28px', '32px'),
      },
    ],
  },
  {
    id: 'button',
    label: 'Button',
    category: 'component',
    icon: 'crosshairs',
    description: 'Default, primary, secondary and text actions.',
    fields: [
      {
        key: 'buttonHeight',
        label: 'Height',
        description: 'Default control height.',
        type: 'select',
        options: options('36px', '40px', '44px', '48px', '52px'),
      },
      {
        key: 'buttonRadius',
        label: 'Radius',
        description: 'Button corner radius.',
        type: 'select',
        options: options('0px', '2px', '4px', '8px', '12px', '16px'),
      },
      {
        key: 'buttonWeight',
        label: 'Weight',
        description: 'Button label font weight.',
        type: 'select',
        options: options('400', '500', '600', '700'),
      },
      {
        key: 'buttonTransform',
        label: 'Transform',
        description: 'Button label capitalization.',
        type: 'select',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Uppercase', value: 'uppercase' },
        ],
      },
    ],
  },
  {
    id: 'card',
    label: 'Card',
    category: 'component',
    icon: 'table',
    description: 'Card surfaces, padding and elevation.',
    fields: [
      {
        key: 'cardRadius',
        label: 'Radius',
        description: 'Card corner radius.',
        type: 'select',
        options: options('0px', '2px', '4px', '8px', '12px', '16px'),
      },
      {
        key: 'cardPadding',
        label: 'Padding',
        description: 'Default card body padding.',
        type: 'select',
        options: options('16px', '20px', '24px', '32px', '40px', '48px'),
      },
      {
        key: 'cardShadow',
        label: 'Shadow',
        description: 'Card elevation preset.',
        type: 'select',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Soft', value: 'soft' },
          { label: 'Deep', value: 'deep' },
        ],
      },
    ],
  },
  {
    id: 'section',
    label: 'Section',
    category: 'component',
    icon: 'thumbnails',
    description: 'Muted, primary and secondary section surfaces.',
    fields: [
      {
        key: 'sectionMuted',
        label: 'Muted',
        description: 'Muted section background.',
        type: 'color',
      },
      {
        key: 'sectionPrimary',
        label: 'Primary',
        description: 'Primary section background.',
        type: 'color',
      },
      {
        key: 'sectionSecondary',
        label: 'Secondary',
        description: 'Secondary section background.',
        type: 'color',
      },
    ],
  },
  {
    id: 'link',
    label: 'Link',
    category: 'component',
    icon: 'link',
    description: 'Inline and muted text links.',
    fields: [
      {
        key: 'linkColor',
        label: 'Link color',
        description: 'Inline link color.',
        type: 'color',
      },
      {
        key: 'linkMutedColor',
        label: 'Muted link',
        description: 'Muted text-link color.',
        type: 'color',
      },
    ],
  },
  {
    id: 'icon',
    label: 'Icon',
    category: 'component',
    icon: 'tag',
    description: 'Icon color in the content flow.',
    fields: [
      {
        key: 'iconColor',
        label: 'Color',
        description: 'Default icon color.',
        type: 'color',
      },
    ],
  },
  {
    id: 'list',
    label: 'List',
    category: 'component',
    icon: 'list',
    description: 'List item rhythm.',
    fields: [
      {
        key: 'listGap',
        label: 'Item gap',
        description: 'Space between list items.',
        type: 'select',
        options: options('4px', '8px', '12px', '16px', '20px'),
      },
    ],
  },
  {
    id: 'divider',
    label: 'Divider',
    category: 'component',
    icon: 'minus',
    description: 'Hairline divider color and rhythm.',
    fields: [
      {
        key: 'dividerColor',
        label: 'Color',
        description: 'Divider line color.',
        type: 'color',
      },
      {
        key: 'dividerSpacing',
        label: 'Spacing',
        description: 'Vertical rhythm around dividers.',
        type: 'select',
        options: options('16px', '24px', '32px', '48px', '64px'),
      },
    ],
  },
  {
    id: 'image',
    label: 'Image',
    category: 'component',
    icon: 'image',
    description: 'Image corner radius in the content flow.',
    fields: [
      {
        key: 'radius',
        label: 'Corner radius',
        description: 'Shared content corner radius.',
        type: 'select',
        options: options('0px', '4px', '8px', '12px', '16px'),
      },
    ],
  },
  {
    id: 'video',
    label: 'Video',
    category: 'component',
    icon: 'play-circle',
    description: 'Video frame radius and background.',
    fields: [
      {
        key: 'radius',
        label: 'Corner radius',
        description: 'Shared media corner radius.',
        type: 'select',
        options: options('0px', '4px', '8px', '12px', '16px'),
      },
    ],
  },
  {
    id: 'form',
    label: 'Form',
    category: 'component',
    icon: 'check',
    description: 'Input height, surface and border.',
    fields: [
      {
        key: 'controlHeight',
        label: 'Control height',
        description: 'Input and select height.',
        type: 'select',
        options: options('36px', '40px', '44px', '48px', '52px'),
      },
      { key: 'formSurface', label: 'Surface', description: 'Input background.', type: 'color' },
      { key: 'formBorder', label: 'Border', description: 'Input border.', type: 'color' },
    ],
  },
  {
    id: 'navbar',
    label: 'Navbar',
    category: 'component',
    icon: 'menu',
    description: 'Navigation bar height and surface.',
    fields: [
      {
        key: 'navbarHeight',
        label: 'Height',
        description: 'Navigation item height.',
        type: 'select',
        options: options('52px', '56px', '64px', '72px', '80px'),
      },
      { key: 'navbarSurface', label: 'Surface', description: 'Navbar background.', type: 'color' },
    ],
  },
]

const COLOR_KEYS = new Set<BuilderThemeKey>(
  STYLE_GROUPS.flatMap((group) =>
    group.fields.filter((field) => field.type === 'color').map((field) => field.key),
  ),
)
const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function validateBuilderTheme(value: unknown, errors: string[]): value is BuilderTheme {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push('theme must be an object')
    return false
  }

  const theme = value as Record<string, unknown>
  for (const group of STYLE_GROUPS) {
    for (const field of group.fields) {
      const candidate = theme[field.key]
      if (typeof candidate !== 'string') {
        errors.push(`theme.${field.key} must be a string`)
        continue
      }
      if (COLOR_KEYS.has(field.key) && !HEX_COLOR.test(candidate)) {
        errors.push(`theme.${field.key} must be a six-digit hex color`)
      }
      if (field.type === 'select' && !field.options?.some((option) => option.value === candidate)) {
        errors.push(`theme.${field.key} has an unsupported value`)
      }
    }
  }

  return errors.length === 0
}
