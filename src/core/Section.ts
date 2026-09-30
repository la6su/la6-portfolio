// src/core/Section.ts — Per-section state machine (ready → viewing → passed)

import * as THREE from 'three'
import { type PhaseConfig, type CameraTransform, type BakuTransform } from './WorldConfig'

export enum SectionState {
  READY = 'ready',
  VIEWING = 'viewing',
  PASSED = 'passed',
}

export type { CameraTransform, BakuTransform }

/** Light data used by Section (subset of LightTransform). */
interface LightData {
  ambientColor: THREE.Color
  intensity: number
}

/** Route transition state only; renderable section content lives in SectionGroups.
 *
 *  The state flip is a plain deadline, not a sampled animation: the eased
 *  float the former StateBus animated was never read mid-flight — consumers
 *  only gate on the discrete `state` and the flip timing (the former bus
 *  re-armed its animation on every scroll frame, which asymptotically
 *  DELAYED the documented 0.8 s flip; the deadline keeps the first-call
 *  deadline instead, so the flip lands exactly `duration` after the first
 *  switchState toward a target). `update(dt)` advances the deadline from the
 *  frame path (SceneCoordinator.updateSections). */
export class Section {
  private _disposed = false
  public phaseConfig: PhaseConfig
  public readonly name: string

  // Transform holders read from PhaseConfig at construction
  public cameraTransform: CameraTransform
  public bakuTransform: BakuTransform
  public lightData: LightData

  // Viewing state machinery (ready/viewing/passed)
  private _state: SectionState = SectionState.READY
  /** Pending delayed flip; null when no transition is in flight. */
  private _pendingState: { target: SectionState; remaining: number } | null = null
  public get state(): SectionState {
    return this._state
  }

  constructor(
    config: PhaseConfig,
    public phaseIndex: number,
  ) {
    this.name = `section-${config.id}`
    this.phaseConfig = config

    // Extract transforms from PhaseConfig
    this.cameraTransform = {
      position: config.camera.position.clone(),
      target: config.camera.target.clone(),
      fov: config.camera.fov,
    }

    this.bakuTransform = {
      position: config.baku.position.clone(),
      rotation: config.baku.rotation.clone(),
      scale: config.baku.scale.clone(),
      opacity: config.baku.opacity,
      role: config.baku.role,
      material: {
        color: config.baku.material.color.clone(),
        emissive: config.baku.material.emissive.clone(),
        roughness: config.baku.material.roughness,
        metalness: config.baku.material.metalness,
      },
    }

    this.lightData = {
      ambientColor: config.lighting.ambientColor.clone(),
      intensity: config.lighting.intensity,
    }
  }

  /** Advance the pending state flip; called from the frame path. */
  public update(dt: number): void {
    if (this._disposed || !this._pendingState) return
    if (!Number.isFinite(dt) || dt <= 0) return
    this._pendingState.remaining -= dt
    if (this._pendingState.remaining <= 0) {
      this._state = this._pendingState.target
      this._pendingState = null
    }
  }

  public switchState(target: SectionState, duration: number = 1.0, reduced: boolean = false): void {
    if (this._disposed) return
    if (reduced) {
      this._pendingState = null
      this._state = target
      return
    }
    // Keep the first deadline toward a target (scroll calls this every frame
    // while the state still reads READY — restarting per frame would defer
    // the flip indefinitely, the exact artifact this replaced).
    if (this._pendingState?.target === target) return
    if (target === this._state && !this._pendingState) return
    this._pendingState = { target, remaining: duration }
  }

  public forceState(state: SectionState): void {
    if (this._disposed) return
    this._pendingState = null
    this._state = state
  }

  public dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._pendingState = null
  }
}
