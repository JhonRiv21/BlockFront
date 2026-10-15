import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Scene,
} from 'three'

const MAX_MARKS = 256
const SIZE = 0.12
const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const FORWARD = new Vector3(0, 0, 1)

// Bullet marks on voxel faces (docs §6.2): a ring buffer of 256 small quads pushed onto the
// face with polygon offset, one draw call. Marks on a block that changes are hidden.
export class ImpactMarks {
  private readonly mesh: InstancedMesh
  private readonly blockOf = new Int32Array(MAX_MARKS).fill(-1)
  private readonly matrix = new Matrix4()
  private readonly quaternion = new Quaternion()
  private readonly position = new Vector3()
  private readonly scale = new Vector3(SIZE, SIZE, 1)
  private next = 0

  constructor(private readonly scene: Scene) {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: '#17191c',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
      MAX_MARKS,
    )
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    for (let i = 0; i < MAX_MARKS; i++) this.mesh.setMatrixAt(i, HIDDEN)
    scene.add(this.mesh)
  }

  // Mark on block (x, y, z) at the hit point, facing along the face normal.
  add(
    x: number,
    y: number,
    z: number,
    normal: [number, number, number],
    hitX: number,
    hitY: number,
    hitZ: number,
  ): void {
    const i = this.next
    this.next = (this.next + 1) % MAX_MARKS
    this.blockOf[i] = x + y * 128 + z * 128 * 64
    this.position.set(hitX + normal[0] * 0.003, hitY + normal[1] * 0.003, hitZ + normal[2] * 0.003)
    this.quaternion.setFromUnitVectors(FORWARD, new Vector3(normal[0], normal[1], normal[2]))
    this.matrix.compose(this.position, this.quaternion, this.scale)
    this.mesh.setMatrixAt(i, this.matrix)
    this.mesh.instanceMatrix.needsUpdate = true
  }

  clearBlock(x: number, y: number, z: number): void {
    const key = x + y * 128 + z * 128 * 64
    let changed = false
    for (let i = 0; i < MAX_MARKS; i++) {
      if (this.blockOf[i] !== key) continue
      this.blockOf[i] = -1
      this.mesh.setMatrixAt(i, HIDDEN)
      changed = true
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
  }
}
