import { PALETTE } from '@blockfront/sim/world/palette'
import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three'

const MAX_PARTICLES = 512
const GRAVITY = 22
const LIFETIME = 0.9

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  color: Color
  size: number
  axis: Vector3
}

// Small cubes thrown out of a block when it is hit or broken, coloured from the palette.
export class BlockParticles {
  private readonly mesh: InstancedMesh
  private readonly particles: Particle[] = []
  private readonly matrix = new Matrix4()
  private readonly position = new Vector3()
  private readonly quaternion = new Quaternion()
  private readonly scale = new Vector3()

  constructor(private readonly scene: Scene) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshLambertMaterial({ color: '#ffffff' }),
      MAX_PARTICLES,
    )
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  burst(x: number, y: number, z: number, blockId: number, count: number): void {
    const base = new Color(PALETTE[blockId] ?? 0x888888)
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
      const color = base.clone().multiplyScalar(0.8 + Math.random() * 0.4)
      this.particles.push({
        x: x + 0.5 + (Math.random() - 0.5) * 0.8,
        y: y + 0.5 + (Math.random() - 0.5) * 0.8,
        z: z + 0.5 + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 5,
        vy: 2 + Math.random() * 5,
        vz: (Math.random() - 0.5) * 5,
        age: 0,
        color,
        size: 0.1 + Math.random() * 0.1,
        axis: new Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).normalize(),
      })
    }
  }

  update(dt: number): void {
    let write = 0
    for (const p of this.particles) {
      p.age += dt
      if (p.age >= LIFETIME) continue
      p.vy -= GRAVITY * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      this.particles[write++] = p
    }
    this.particles.length = write

    this.particles.forEach((p, i) => {
      const fade = 1 - p.age / LIFETIME
      this.position.set(p.x, p.y, p.z)
      this.quaternion.setFromAxisAngle(p.axis, p.age * 4)
      this.scale.setScalar(p.size * (0.4 + 0.6 * fade))
      this.matrix.compose(this.position, this.quaternion, this.scale)
      this.mesh.setMatrixAt(i, this.matrix)
      this.mesh.setColorAt(i, p.color)
    })
    this.mesh.count = this.particles.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.scene.remove(this.mesh)
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshLambertMaterial).dispose()
  }
}
