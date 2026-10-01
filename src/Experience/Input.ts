// src/Experience/Input.ts
import * as THREE from 'three'

// Module-private input owner. The module exports one instance; consumers
// cannot construct another one.
class Input {
  mouse: THREE.Vector2 = new THREE.Vector2()
  private started = false

  // Bound handler ref so removeEventListener works in destroy().
  private readonly _onMouseMove = (event: MouseEvent) => {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
  }

  /** Reattach the singleton listener after an explicit runtime teardown. */
  start(): void {
    if (this.started) return
    window.addEventListener('mousemove', this._onMouseMove, { passive: true })
    this.started = true
  }

  /** Remove window listeners. Call from Experience.destroy(). */
  destroy(): void {
    if (!this.started) return
    window.removeEventListener('mousemove', this._onMouseMove)
    this.started = false
  }

  getMouse() {
    return this.mouse
  }
}

export const input = new Input()
