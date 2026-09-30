import { PROJECTS } from '../Data/Projects'
import { localizedProp, type BuilderLocale } from './localization'

export const BUILDER_SOURCE_IDS = ['projects'] as const

export const BUILDER_SOURCE_FIELDS = ['title', 'description', 'year', 'category'] as const
type BuilderSourceField = (typeof BUILDER_SOURCE_FIELDS)[number]

interface BuilderSourceItem {
  id: string
  title: string
  description: string
  year: string
  category: string
}

const PROJECT_SOURCE: readonly BuilderSourceItem[] = PROJECTS.map((project) => ({
  id: project.id,
  title: project.title,
  description: project.description,
  year: project.year ?? '',
  category: project.category ?? '',
}))

function getBuilderSourceItems(source: string | undefined): readonly BuilderSourceItem[] {
  return source === 'projects' ? PROJECT_SOURCE : []
}

/** Resolve list content without network access or user-authored code. */
export function resolveBuilderListItems(
  props: Record<string, string>,
  locale: BuilderLocale = 'EN',
): string[] {
  const source = props.source
  if (!source) {
    return localizedProp(props, 'items', locale)
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  }

  const field = BUILDER_SOURCE_FIELDS.includes(props.sourceField as BuilderSourceField)
    ? (props.sourceField as BuilderSourceField)
    : 'title'
  const requestedLimit = Number(props.sourceLimit)
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit >= 1 && requestedLimit <= 12
      ? requestedLimit
      : 12
  return getBuilderSourceItems(source)
    .slice(0, limit)
    .map((item) => item[field].trim())
    .filter((item) => item.length > 0)
}
