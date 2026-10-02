import UIkit from 'uikit'

/** UIkit's runtime method is callable; @types/uikit declares it as `object`. */
type UIkitWithUpdate = typeof UIkit & { update(element: Element): void }

export default UIkit as UIkitWithUpdate
