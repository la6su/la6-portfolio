// admin/main.ts — Phase 4: the admin entry is now the Vue mount point.
//
// All editor behavior lives in the `useAdminEditor` composable (bound by
// `AdminApp.vue`); this entry only injects the admin stylesheet, registers the
// icon sets the preview and the Style rail need, and mounts the app.

import { createApp } from 'vue'
import adminCss from './admin.less?inline'

// The builder preview must render the exact console icon set the product
// composes with `uk-icon` — register the same SVG overrides before the
// preview is painted so the icon element is WYSIWYG of the built page.
import { registerConsoleIcons } from '../src/assets/console-icons'
import { registerStyleNavIcons } from './style-icons'
import AdminApp from '../src/admin/AdminApp.vue'

const adminStyle = document.createElement('style')
adminStyle.dataset.jlzAdmin = 'true'
adminStyle.textContent = adminCss
document.head.append(adminStyle)
registerConsoleIcons()
// The Style rail references official UIKit set names the shell does not
// bundle by default — register the official set before the nav is painted.
registerStyleNavIcons()

const rootElement = document.getElementById('jlz-admin')
if (!rootElement) throw new Error('Missing admin element #jlz-admin')
createApp(AdminApp).mount(rootElement)
