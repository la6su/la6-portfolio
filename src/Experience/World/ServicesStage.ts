import * as THREE from 'three'
import { MeshBasicNodeMaterial, MeshPhysicalNodeMaterial } from 'three/webgpu'

const RIBBON_SEGMENTS = 192
const RIBBON_WIDTH_SEGMENTS = 28
const RIBBON_RADIUS = 0.92
const RIBBON_HALF_WIDTH = 0.18

function ribbonPoint(angle: number, across: number, target = new THREE.Vector3()): THREE.Vector3 {
  const twist = angle
  const radial = RIBBON_RADIUS + 0.12 * Math.cos(angle * 2 + 0.42) + across * Math.cos(twist)
  return target.set(
    radial * Math.cos(angle),
    radial * Math.sin(angle),
    0.29 * Math.sin(angle * 2 + 0.42) + across * Math.sin(twist),
  )
}

function createRibbonGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const rowSize = RIBBON_WIDTH_SEGMENTS + 1
  const positions = new Float32Array(RIBBON_SEGMENTS * rowSize * 3)
  const indices: number[] = []
  const point = new THREE.Vector3()

  for (let i = 0; i < RIBBON_SEGMENTS; i++) {
    const angle = (i / RIBBON_SEGMENTS) * Math.PI * 2
    for (let j = 0; j <= RIBBON_WIDTH_SEGMENTS; j++) {
      const across = (j / RIBBON_WIDTH_SEGMENTS) * RIBBON_HALF_WIDTH * 2 - RIBBON_HALF_WIDTH
      ribbonPoint(angle, across, point)
      const offset = (i * rowSize + j) * 3
      positions[offset] = point.x
      positions[offset + 1] = point.y
      positions[offset + 2] = point.z
    }
  }

  for (let i = 0; i < RIBBON_SEGMENTS; i++) {
    const nextI = (i + 1) % RIBBON_SEGMENTS
    for (let j = 0; j < RIBBON_WIDTH_SEGMENTS; j++) {
      const a = i * rowSize + j
      const b = nextI * rowSize + j
      const c = nextI * rowSize + j + 1
      const d = i * rowSize + j + 1
      indices.push(a, b, d, b, c, d)
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function createSignalSeamGeometry(): THREE.TubeGeometry {
  const points: THREE.Vector3[] = []
  const start = Math.PI * 0.48
  const end = Math.PI * 0.88
  for (let i = 0; i <= 56; i++) {
    const angle = THREE.MathUtils.lerp(start, end, i / 56)
    points.push(ribbonPoint(angle, 0, new THREE.Vector3()).add(new THREE.Vector3(0, 0, -0.012)))
  }
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
  return new THREE.TubeGeometry(curve, 96, 0.009, 6, false)
}

/** A single reflective signal ribbon; chapter changes move its pose, never its idle clock. */
export class ServicesStage {
  readonly ribbonGeometry = createRibbonGeometry()
  readonly seamGeometry = createSignalSeamGeometry()

  private disposed = false
  private _visible = false
  private root: THREE.Group | null = null
  private sculpture: THREE.Group | null = null
  private readonly ribbonMaterial = new MeshPhysicalNodeMaterial({
    color: 0x9eaaa5,
    metalness: 0.72,
    roughness: 0.2,
    clearcoat: 0.92,
    clearcoatRoughness: 0.14,
    iridescence: 0.12,
    iridescenceIOR: 1.28,
    iridescenceThicknessRange: [150, 280],
    envMapIntensity: 1.35,
    side: THREE.DoubleSide,
    fog: false,
  })
  private readonly seamMaterial = new MeshBasicNodeMaterial({
    color: 0x75f2bd,
    toneMapped: false,
    fog: false,
  })
  private readonly targetPosition = new THREE.Vector3()
  private readonly worldPosition = new THREE.Vector3()
  private readonly offset = new THREE.Vector3()
  private readonly targetPose = new THREE.Quaternion()
  private readonly poseEuler = new THREE.Euler()
  private chapter = -1
  private settled = true

  get visible(): boolean {
    return this._visible
  }
  set visible(value: boolean) {
    this._visible = value
    if (this.root) this.root.visible = value
  }
  get sculptureMaterial(): MeshPhysicalNodeMaterial {
    return this.ribbonMaterial
  }
  get seamSignalMaterial(): MeshBasicNodeMaterial {
    return this.seamMaterial
  }

  adopt(nodes: { root: THREE.Group; sculpture: THREE.Group }): void {
    this.root = nodes.root
    this.sculpture = nodes.sculpture
    this.root.visible = this._visible
  }

  bindEnvironment(texture: THREE.Texture): void {
    if (this.disposed) return
    this.ribbonMaterial.envMap = texture
    this.ribbonMaterial.needsUpdate = true
  }

  get isAnimating(): boolean {
    return this.visible && !this.settled
  }

  updateState(
    camera: THREE.PerspectiveCamera,
    chapter: number,
    dt: number,
    reduced: boolean,
  ): void {
    if (this.disposed || !this.root || !this.sculpture) return
    camera.getWorldPosition(this.worldPosition)
    this.root.position.copy(this.worldPosition)
    this.root.quaternion.copy(camera.quaternion)

    const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 5
    const mobile = camera.aspect < 1.2
    const scale = Math.min(
      height * (mobile ? 0.19 : 0.32),
      height * camera.aspect * (mobile ? 0.4 : 0.32),
    )

    if (chapter !== this.chapter) {
      this.chapter = chapter
      const poses = [
        [0.34, -0.42, 0.12],
        [-0.2, 0.34, 0.58],
        [0.54, 0.82, -0.3],
        [-0.42, 1.16, 0.24],
      ] as const
      const pose = poses[THREE.MathUtils.clamp(chapter, 0, poses.length - 1)]!
      this.poseEuler.set(pose[0], pose[1], pose[2])
      this.targetPose.setFromEuler(this.poseEuler)
    }

    const alpha = reduced ? 1 : 1 - Math.exp(-Math.max(dt, 0) * 5.5)
    this.sculpture.quaternion.slerp(this.targetPose, alpha)
    this.settled = this.sculpture.quaternion.angleTo(this.targetPose) <= 0.001
    if (this.settled) this.sculpture.quaternion.copy(this.targetPose)

    this.root.scale.setScalar(scale)
    this.targetPosition.set(
      mobile ? 0 : height * camera.aspect * 0.22,
      height * (mobile ? 0.045 : 0.1),
      -5,
    )
    this.offset.copy(this.targetPosition).applyQuaternion(camera.quaternion)
    this.root.position.add(this.offset)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.ribbonMaterial.dispose()
    this.seamMaterial.dispose()
    this.ribbonGeometry.dispose()
    this.seamGeometry.dispose()
    this.root = null
    this.sculpture = null
  }
}
