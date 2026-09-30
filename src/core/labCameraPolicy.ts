// src/core/labCameraPolicy.ts — Lab interactive camera exploration port.
//
// ADR 0005's first Cientos adoption: the Lab route hands the camera over to
// the ecosystem `CameraControls` for orbit exploration. SceneHost owns the
// decision (lab route AND a fine pointer AND no reduced-motion preference)
// and publishes it here once; the consumers read the same typed state:
//
// - the cinematic camera writer (`Experience/Camera`) yields position/lookAt
//   while the controls own the pose and eases back from the orbit pose on
//   hand-back;
// - SceneHost's template mounts/unmounts the declarative `<CameraControls>`
//   and flips the `body[data-lab-camera]` CSS port the pass-through
//   choreography (section layers) reacts to.
//
// A plain module boolean — not a DOM read — because the camera writer checks
// it on every rendered frame. Tests drive both sides through this module.

let active = false

/** Publish the Lab camera-exploration state (SceneHost is the only writer). */
export function setLabCameraActive(next: boolean): void {
  active = next
}

/** True while the Lab `CameraControls` own the camera pose. */
export function isLabCameraActive(): boolean {
  return active
}
