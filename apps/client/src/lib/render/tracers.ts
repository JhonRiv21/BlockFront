import {
  AdditiveBlending,
  BoxGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three'

const MAX = 32
const LENGTH = 2.5
const LIFE = 0.08
const SPEED = 60
const HIDDEN = new Matrix4().makeScale(0, 0, 0)
const FORWARD = new Vector3(0, 0, 1)

interface Tracer {
  index: number
  origin: Vector3
  dir: Vector3
  age: number
}

// Additive stretched boxes that fly down the shot for 80 ms (docs §6.3).
export class Tracers {
  private readonly mesh: InstancedMesh
  private readonly live: Tracer[] = []
  private readonly matrix = new Matrix4()
  private readonly quaternion = new Quaternion()
  private readonly position = new Vector3()
  private readonly scale = new Vector3(0.025, 0.025, LENGTH)
  private next = 0

  constructor(private readonly scene: Scene) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({
        color: '#ffd9a0',
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
      MAX,
    )
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, HIDDEN)
    scene.add(this.mesh)
  }

  spawn(origin: [number, number, number], dir: [number, number, number]): void {
    const index = this.next
    this.next = (this.next + 1) % MAX
    this.live.push({
      index,
      origin: new Vector3(origin[0], origin[1] - 0.15, origin[2]),
      dir: new Vector3(dir[0], dir[1], dir[2]).normalize(),
      age: 0,
    })
  }

  update(dt: number): void {
    let write = 0
    for (const t of this.live) {
      t.age += dt
      if (t.age >= LIFE) {
        this.mesh.setMatrixAt(t.index, HIDDEN)
        continue
      }
      this.position
        .copy(t.dir)
        .multiplyScalar(1 + t.age * SPEED + LENGTH / 2)
        .add(t.origin)
      this.quaternion.setFromUnitVectors(FORWARD, t.dir)
      this.matrix.compose(this.position, this.quaternion, this.scale)
      this.mesh.setMatrixAt(t.index, this.matrix)
      this.live[write++] = t
    }
    this.live.length = write
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
  }
}
