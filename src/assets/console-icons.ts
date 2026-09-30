// Original console glyphs: one 20-unit grid, angular 1.5px strokes.
import UIkit from 'uikit'

const paths: Record<string, string> = {
  'arrow-up': 'M10 16V4M5 9l5-5 5 5',
  'arrow-up-right': 'M4 16 16 4M6 4h10v10',
  play: 'M6 3 17 10 6 17Z',
  close: 'M5 5l10 10M15 5 5 15',
  'slidenav-previous-large': 'M14 3 7 10l7 7',
  'slidenav-next-large': 'M6 3l7 7-7 7',
  mail: 'M3 4h14v12H3ZM3 5l7 6 7-6',
  commenting: 'M3 3h14v11h-6l-4 3v-3H3ZM6 7h8M6 10h5',
  telegram: 'M18 3 13 17l-4-6-6-3ZM9 11l5-4',
  github: 'M6 7v7h8M8 5h4l2 2v5M4 3h4v4H4ZM12 12h4v4h-4Z',
  push: 'M10 13V3M6 7l4-4 4 4M3 10v7h14v-7',
  // Compact topbar audio states: one speaker body, one unambiguous signal.
  muted: 'M3 7h3l5-4v14l-5-4H3ZM14 8l4 4M18 8l-4 4',
  sound: 'M3 7h3l5-4v14l-5-4H3ZM14 7v6M17 5v10',
  // Minimal analog toggle: housing + lever. Auto is OFF (lever left),
  // inverse is ON (lever right); the same silhouette reads at 16px.
  'theme-auto': 'M3 6h14v8H3ZM5 8h4v4H5Z',
  'theme-inverse': 'M3 6h14v8H3ZM11 8h4v4h-4Z',
  menu: 'M3 5h14M7 10h10M3 15h14',
  'chevron-down': 'M4 7l6 6 6-6',
  'chevron-up': 'M4 13l6-6 6 6',
  'arrow-left': 'M16 10H4M9 5l-5 5 5 5',
  'arrow-right': 'M4 10h12M11 5l5 5-5 5',
  search: 'M3 3h8l3 3v5l-3 3H6l-3-3ZM13 13l4 4',
}

const CONSOLE_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(paths).map(([name, path]) => [
    name,
    `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" d="${path}"/></svg>`,
  ]),
)

export function registerConsoleIcons(): void {
  const iconComponent = (
    UIkit as unknown as { icon?: { add?: (icons: Record<string, string>) => void } }
  ).icon
  iconComponent?.add?.(CONSOLE_ICONS)
}
