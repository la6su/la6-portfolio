// Product-only UIKit icons.
//
// The full `uikit-icons` plugin is kept in the dev-only admin entry. The
// production graph needs only this built-in icon in addition to JLZ's custom
// console set, so the boot-time bundle does not retain 161 unused SVGs.

import UIkit from 'uikit'

const PRODUCT_ICONS = {
  twitter:
    '<svg width="20" height="20" viewBox="0 0 20 20"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" d="M3 3h4l10 14h-4ZM17 3l-6 7M9 11l-6 6"/></svg>',
}

export function registerProductIcons(): void {
  const iconComponent = (
    UIkit as unknown as { icon?: { add?: (icons: typeof PRODUCT_ICONS) => void } }
  ).icon
  iconComponent?.add?.(PRODUCT_ICONS)
}
