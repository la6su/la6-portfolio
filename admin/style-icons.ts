// admin/style-icons.ts — official UIKit glyphs for the Style rail.
//
// The `uikit` entry the admin shell imports carries only the internal icon
// set (spinner, totop, marker). The official set ships in
// `uikit/dist/js/uikit-icons.js` as a plugin that registers every glyph with
// the Icon component; this module applies it once. The product build never
// imports the admin shell, so the set stays out of the shipped bundle.

import UIkit from 'uikit'
import UIKitIcons from 'uikit/dist/js/uikit-icons.js'

/** Register the official UIKit icon set with the shell's UIkit instance. */
export function registerStyleNavIcons(): void {
  ;(UIKitIcons as (uk: unknown) => void)(UIkit)
}
