import type { BuilderElementType, BuilderNode } from './schema'

type BuilderFieldType = 'text' | 'textarea' | 'select' | 'url'

interface BuilderField {
  key: string
  label: string
  type: BuilderFieldType
  options?: ReadonlyArray<{ label: string; value: string }>
}

interface BuilderFieldGroup {
  label: string
  fields: readonly BuilderField[]
}

interface BuilderElementDefinition {
  type: BuilderElementType
  label: string
  description: string
  container: boolean
  icon: string
  uikitComponents: readonly string[]
  fieldGroups: readonly BuilderFieldGroup[]
  create(id: string): BuilderNode
}

interface BuilderCatalogGroup {
  label: string
  types: readonly BuilderElementType[]
}

const makeNode = (
  id: string,
  type: BuilderElementType,
  props: Record<string, string>,
): BuilderNode => ({ id, type, props, children: [] })

// The icon choices mirror the exact console icon set registered with UIkit
// in `src/assets/console-icons.ts` (the set the product composes with
// `uk-icon`). New icons enter through a console-icons change first, then
// this whitelist.
export const BUILDER_ICON_NAMES = [
  'arrow-up',
  'arrow-up-right',
  'close',
  'commenting',
  'github',
  'mail',
  'muted',
  'play',
  'push',
  'slidenav-next-large',
  'slidenav-previous-large',
  'sound',
  'telegram',
  'theme-auto',
  'theme-inverse',
] as const

export const BUILDER_CATALOG: Record<BuilderElementType, BuilderElementDefinition> = {
  section: {
    type: 'section',
    label: 'Section',
    description: 'Full-width page region with a UIkit container.',
    container: true,
    icon: 'thumbnails',
    uikitComponents: ['section', 'container'],
    fieldGroups: [
      {
        label: 'Layout',
        fields: [
          {
            key: 'size',
            label: 'Vertical spacing',
            type: 'select',
            options: [
              { label: 'Small', value: 'small' },
              { label: 'Default', value: 'default' },
              { label: 'Large', value: 'large' },
              { label: 'X-Large', value: 'xlarge' },
            ],
          },
          {
            key: 'container',
            label: 'Container',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Small', value: 'small' },
              { label: 'Large', value: 'large' },
              { label: 'Expand', value: 'expand' },
            ],
          },
        ],
      },
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Background',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Muted', value: 'muted' },
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        ],
      },
    ],
    create: (id) =>
      makeNode(id, 'section', { style: 'default', size: 'default', container: 'default' }),
  },
  grid: {
    type: 'grid',
    label: 'Grid',
    description: 'Responsive UIkit grid for child elements.',
    container: true,
    icon: 'grid',
    uikitComponents: ['grid', 'width'],
    fieldGroups: [
      {
        label: 'Layout',
        fields: [
          {
            key: 'columns',
            label: 'Columns',
            type: 'select',
            options: [
              { label: '1', value: '1' },
              { label: '2', value: '2' },
              { label: '3', value: '3' },
              { label: '4', value: '4' },
            ],
          },
          {
            key: 'gap',
            label: 'Gap',
            type: 'select',
            options: [
              { label: 'Small', value: 'small' },
              { label: 'Default', value: 'default' },
              { label: 'Large', value: 'large' },
              { label: 'Collapse', value: 'collapse' },
            ],
          },
        ],
      },
    ],
    create: (id) => makeNode(id, 'grid', { columns: '2', gap: 'default' }),
  },
  card: {
    type: 'card',
    label: 'Card',
    description: 'UIkit card that can contain headings, text and actions.',
    container: true,
    icon: 'table',
    uikitComponents: ['card'],
    fieldGroups: [
      {
        label: 'Layout',
        fields: [
          {
            key: 'size',
            label: 'Padding',
            type: 'select',
            options: [
              { label: 'Small', value: 'small' },
              { label: 'Default', value: 'default' },
              { label: 'Large', value: 'large' },
            ],
          },
        ],
      },
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Background',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
            ],
          },
        ],
      },
    ],
    create: (id) => makeNode(id, 'card', { style: 'default', size: 'default' }),
  },
  divider: {
    type: 'divider',
    label: 'Divider',
    description: '1px hairline break, the console-minimal section separator.',
    container: false,
    icon: 'minus',
    uikitComponents: ['divider'],
    fieldGroups: [
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Scale',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Small', value: 'small' },
            ],
          },
        ],
      },
    ],
    create: (id) => makeNode(id, 'divider', { style: 'default' }),
  },
  heading: {
    type: 'heading',
    label: 'Heading',
    description: 'Semantic heading with UIkit display sizing on the φ scale.',
    container: false,
    icon: 'bold',
    uikitComponents: ['heading'],
    fieldGroups: [
      {
        label: 'Content',
        fields: [
          { key: 'content', label: 'English text', type: 'text' },
          { key: 'contentRu', label: 'Russian text', type: 'text' },
        ],
      },
      {
        label: 'Typography',
        fields: [
          {
            key: 'level',
            label: 'HTML level',
            type: 'select',
            options: ['h1', 'h2', 'h3', 'h4'].map((value) => ({
              label: value.toUpperCase(),
              value,
            })),
          },
          {
            key: 'size',
            label: 'Visual size',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Small', value: 'small' },
              { label: 'Medium', value: 'medium' },
              { label: 'Large', value: 'large' },
              { label: 'X-Large', value: 'xlarge' },
              { label: '2X-Large', value: '2xlarge' },
            ],
          },
        ],
      },
    ],
    create: (id) =>
      makeNode(id, 'heading', { content: 'New heading', level: 'h2', size: 'medium' }),
  },
  text: {
    type: 'text',
    label: 'Text',
    description: 'Plain semantic copy. HTML is intentionally not accepted.',
    container: false,
    icon: 'file-text',
    uikitComponents: ['text'],
    fieldGroups: [
      {
        label: 'Content',
        fields: [
          { key: 'content', label: 'English text', type: 'textarea' },
          { key: 'contentRu', label: 'Russian text', type: 'textarea' },
        ],
      },
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Role',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Lead', value: 'lead' },
              { label: 'Meta', value: 'meta' },
              { label: 'Muted', value: 'muted' },
            ],
          },
        ],
      },
    ],
    create: (id) =>
      makeNode(id, 'text', {
        content: 'Write clear, useful copy for this section.',
        style: 'default',
      }),
  },
  list: {
    type: 'list',
    label: 'List',
    description: 'UIkit list from authored lines or a trusted project source.',
    container: false,
    icon: 'list',
    uikitComponents: ['list'],
    fieldGroups: [
      {
        label: 'Content',
        fields: [
          { key: 'items', label: 'English items', type: 'textarea' },
          { key: 'itemsRu', label: 'Russian items', type: 'textarea' },
          {
            key: 'source',
            label: 'Dynamic source',
            type: 'select',
            options: [
              { label: 'Authored items', value: '' },
              { label: 'Projects', value: 'projects' },
            ],
          },
          {
            key: 'sourceField',
            label: 'Source field',
            type: 'select',
            options: [
              { label: 'Title', value: 'title' },
              { label: 'Description', value: 'description' },
              { label: 'Year', value: 'year' },
              { label: 'Category', value: 'category' },
            ],
          },
          {
            key: 'sourceLimit',
            label: 'Maximum items',
            type: 'select',
            options: [
              { label: '3', value: '3' },
              { label: '6', value: '6' },
              { label: '9', value: '9' },
              { label: '12', value: '12' },
            ],
          },
        ],
      },
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Marker',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Hyphen', value: 'hyphen' },
              { label: 'Divider', value: 'divider' },
              { label: 'Ordered', value: 'ordered' },
            ],
          },
        ],
      },
    ],
    create: (id) =>
      makeNode(id, 'list', {
        items: 'First point\nSecond point\nThird point',
        style: 'default',
        source: '',
        sourceField: 'title',
        sourceLimit: '6',
      }),
  },
  button: {
    type: 'button',
    label: 'Button',
    description: 'Accessible UIkit action link.',
    container: false,
    icon: 'crosshairs',
    uikitComponents: ['button'],
    fieldGroups: [
      {
        label: 'Content',
        fields: [
          { key: 'label', label: 'English label', type: 'text' },
          { key: 'labelRu', label: 'Russian label', type: 'text' },
        ],
      },
      { label: 'Link', fields: [{ key: 'href', label: 'URL', type: 'url' }] },
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Variant',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
              { label: 'Text', value: 'text' },
            ],
          },
        ],
      },
    ],
    create: (id) => makeNode(id, 'button', { label: 'Learn more', href: '#', style: 'primary' }),
  },
  link: {
    type: 'link',
    label: 'Link',
    description: 'Inline text link on the product link styles.',
    container: false,
    icon: 'link',
    uikitComponents: ['link'],
    fieldGroups: [
      {
        label: 'Content',
        fields: [
          { key: 'label', label: 'English text', type: 'text' },
          { key: 'labelRu', label: 'Russian text', type: 'text' },
        ],
      },
      { label: 'Link', fields: [{ key: 'href', label: 'URL', type: 'url' }] },
      {
        label: 'Style',
        fields: [
          {
            key: 'style',
            label: 'Variant',
            type: 'select',
            options: [
              { label: 'Default', value: 'default' },
              { label: 'Muted', value: 'muted' },
              { label: 'Reset', value: 'reset' },
            ],
          },
        ],
      },
    ],
    create: (id) => makeNode(id, 'link', { label: 'Read more', href: '#', style: 'default' }),
  },
  icon: {
    type: 'icon',
    label: 'Icon',
    description: 'UIkit icon from the product icon set.',
    container: false,
    icon: 'tag',
    uikitComponents: ['icon'],
    fieldGroups: [
      {
        label: 'Content',
        fields: [
          {
            key: 'name',
            label: 'Icon',
            type: 'select',
            options: BUILDER_ICON_NAMES.map((value) => ({ label: value, value })),
          },
        ],
      },
      {
        label: 'Layout',
        fields: [
          {
            key: 'ratio',
            label: 'Scale',
            type: 'select',
            options: [
              { label: 'Small', value: '0.7' },
              { label: 'Default', value: '1' },
              { label: 'Large', value: '1.2' },
              { label: 'X-Large', value: '1.4' },
            ],
          },
        ],
      },
    ],
    create: (id) => makeNode(id, 'icon', { name: 'arrow-up-right', ratio: '1' }),
  },
  image: {
    type: 'image',
    label: 'Image',
    description: 'Responsive image from a local asset or HTTPS source.',
    container: false,
    icon: 'image',
    uikitComponents: [],
    fieldGroups: [
      {
        label: 'Media',
        fields: [
          { key: 'src', label: 'Source URL', type: 'url' },
          { key: 'alt', label: 'English alt text', type: 'text' },
          { key: 'altRu', label: 'Russian alt text', type: 'text' },
        ],
      },
      {
        label: 'Loading',
        fields: [
          {
            key: 'loading',
            label: 'Strategy',
            type: 'select',
            options: [
              { label: 'Lazy', value: 'lazy' },
              { label: 'Eager', value: 'eager' },
            ],
          },
        ],
      },
    ],
    create: (id) =>
      makeNode(id, 'image', {
        src: '/assets/projects/ebb-vibes/cover.webp',
        alt: 'Project cover placeholder',
        loading: 'lazy',
      }),
  },
  video: {
    type: 'video',
    label: 'Video',
    description: 'Accessible video with conservative metadata preloading.',
    container: false,
    icon: 'play-circle',
    uikitComponents: [],
    fieldGroups: [
      {
        label: 'Media',
        fields: [
          { key: 'src', label: 'Source URL', type: 'url' },
          { key: 'poster', label: 'Poster URL', type: 'url' },
          { key: 'ariaLabel', label: 'English accessible label', type: 'text' },
          { key: 'ariaLabelRu', label: 'Russian accessible label', type: 'text' },
        ],
      },
      {
        label: 'Loading',
        fields: [
          {
            key: 'preload',
            label: 'Preload',
            type: 'select',
            options: [
              { label: 'Metadata', value: 'metadata' },
              { label: 'None', value: 'none' },
            ],
          },
        ],
      },
    ],
    create: (id) =>
      makeNode(id, 'video', {
        src: '/assets/video/coming-soon.mp4',
        poster: '/assets/video/coming-soon-cover.jpg',
        ariaLabel: 'Project preview video',
        preload: 'metadata',
      }),
  },
}

// Left-panel catalog order, Figma-style: layout scaffolding first, then
// typography, then inline elements. Every element type appears exactly once.
export const BUILDER_CATALOG_GROUPS: readonly BuilderCatalogGroup[] = [
  { label: 'Layout', types: ['section', 'grid', 'card', 'divider'] },
  { label: 'Typography', types: ['heading', 'text', 'list'] },
  { label: 'Elements', types: ['button', 'link', 'icon', 'image', 'video'] },
]
