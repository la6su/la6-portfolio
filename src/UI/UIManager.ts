import UIkit from 'uikit'
import { FullscreenOverlay } from './FullscreenOverlay'
import { ShowreelConsole } from './ShowreelConsole'
import { registerProductIcons } from '../assets/product-icons'

export class UIManager {
  public overlay: FullscreenOverlay | null = null
  public showreel: ShowreelConsole | null = null

  constructor() {
    registerProductIcons()
    if (!window.UIkit) {
      window.UIkit = UIkit
    }
  }

  /** Initialize UI components (call after DOM ready). */
  init(): void {
    this.overlay = new FullscreenOverlay()
    // The showreel trigger + theater chrome live on their own console owner;
    // the GPU-side theater is Experience's lazy ShowreelTheater stage.
    this.showreel = new ShowreelConsole()
    this.showreel.wireTrigger()
  }

  /** Clean up UI components. */
  dispose(): void {
    this.showreel?.dispose()
    this.showreel = null
    this.overlay?.dispose()
    this.overlay = null
  }
}
