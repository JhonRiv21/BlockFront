import type { SolidTest } from '@blockfront/sim/physics/sweep'
import {
  BoxGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three'

const MAX = 48
const LIFE = 1.3
const GRAVITY = 18
const HIDDEN = new Matrix4().makeScale(0, 0, 0)

interface Casing {
  index: number
  pos: Vector3
  vel: Vector3
  spin: Vector3
  rot: Vector3
  age: number
  resting: boolean
}

// Brass that ejects to the right and up, lands on the voxel floor and fades (docs §6.4).
export class ShellCasings {
  private readonly mesh: InstancedMesh
  private readonly live: Casing[] = []
  private readonly matrix = new Matrix4()
  private readonly quaternion = new Quaternion()
  private readonly euler = new Vector3()
  private readonly scale = new Vector3(0.02, 0.02, 0.05)
  private next = 0

  constructor(
    private readonly scene: Scene,
    private readonly isSolid: SolidTest,
  ) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshLambertMaterial({ color: '#c9a04a' }),
      MAX,
    )
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.frustumCulled = false
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, HIDDEN)
    scene.add(this.mesh)
  }

  // right and up are the shooter's axes in world space.
  eject(origin: Vector3, right: Vector3, up: Vector3): void {
    const index = this.next
    this.next = (this.next + 1) % MAX
    const vel = new Vector3()
      .addScaledVector(right, 1.5 + Math.random())
      .addScaledVector(up, 1 + Math.random())
    this.live.push({
      index,
      pos: origin.clone(),
      vel,
      spin: new Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
      rot: new Vector3(),
      age: 0,
      resting: false,
    })
  }

  update(dt: number): void {
    let write = 0
    for (const c of this.live) {
      c.age += dt
      if (c.age >= LIFE) {
        this.mesh.setMatrixAt(c.index, HIDDEN)
        continue
      }
      if (!c.resting) {
        c.vel.y -= GRAVITY * dt
        c.pos.addScaledVector(c.vel, dt)
        c.rot.addScaledVector(c.spin, dt)
        // Only the floor stops it: a solid voxel under the casing.
        if (
          c.vel.y < 0 &&
          this.isSolid(Math.floor(c.pos.x), Math.floor(c.pos.y - 0.02), Math.floor(c.pos.z))
        ) {
          c.pos.y = Math.floor(c.pos.y - 0.02) + 1.02
          c.resting = true
        }
      }
      this.euler.copy(c.rot)
      this.quaternion
        .setFromAxisAngle(new Vector3(0, 1, 0), c.rot.y)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), c.rot.x))
      this.matrix.compose(c.pos, this.quaternion, this.scale)
      this.mesh.setMatrixAt(c.index, this.matrix)
      this.live[write++] = c
    }
    this.live.length = write
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshLambertMaterial).dispose()
  }
}
