import { predictArc, type GrenadeEntity } from '@blockfront/sim/combat/grenade'
import { GRENADE } from '@blockfront/sim/combat/weapons'
import type { SolidTest } from '@blockfront/sim/physics/sweep'
import {
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three'

const POINTS = 40
const MAX_STEPS = 180
const HIDDEN = new Matrix4().makeScale(0, 0, 0)

// Predicted grenade arc (docs/f2-6-feel.md §4): the sim's own step, drawn as fading dots and a
// ring with the damage radius at the end, red if the fuse runs out in the air.
export class GrenadeArc {
  private readonly dots: InstancedMesh
  private readonly ring: Mesh
  private readonly matrix = new Matrix4()
  private readonly scale = new Vector3()
  private readonly ringMaterial: MeshBasicMaterial

  constructor(
    private readonly scene: Scene,
    private readonly isSolid: SolidTest,
  ) {
    this.dots = new InstancedMesh(
      new SphereGeometry(0.07, 6, 4),
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
      POINTS,
    )
    this.dots.instanceMatrix.setUsage(DynamicDrawUsage)
    this.dots.frustumCulled = false
    this.dots.visible = false
    this.ringMaterial = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: 2,
    })
    this.ring = new Mesh(
      new RingGeometry(GRENADE.damageRadius - 0.15, GRENADE.damageRadius, 32),
      this.ringMaterial,
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.visible = false
    scene.add(this.dots, this.ring)
  }

  // grenade: where and how it would fly if released now, with the fuse left.
  show(grenade: GrenadeEntity): void {
    const arc = predictArc(grenade, this.isSolid, MAX_STEPS)
    const stride = Math.max(1, Math.floor(arc.points.length / POINTS))
    let i = 0
    for (let p = 0; p < arc.points.length && i < POINTS; p += stride, i++) {
      const point = arc.points[p]!
      const fade = 1 - p / arc.points.length
      this.scale.setScalar(0.6 + 0.6 * fade)
      this.matrix
        .makeScale(this.scale.x, this.scale.y, this.scale.z)
        .setPosition(point[0], point[1], point[2])
      this.dots.setMatrixAt(i, this.matrix)
    }
    for (; i < POINTS; i++) this.dots.setMatrixAt(i, HIDDEN)
    this.dots.instanceMatrix.needsUpdate = true
    this.dots.visible = true
    const last = arc.points[arc.points.length - 1]
    if (last) {
      this.ring.position.set(last[0], last[1] - GRENADE.size / 2 + 0.02, last[2])
      this.ringMaterial.color.set(arc.inAir ? '#ff3b3b' : '#ffffff')
      this.ring.visible = true
    }
  }

  hide(): void {
    this.dots.visible = false
    this.ring.visible = false
  }

  dispose(): void {
    this.scene.remove(this.dots, this.ring)
    this.dots.geometry.dispose()
    ;(this.dots.material as MeshBasicMaterial).dispose()
    this.ring.geometry.dispose()
    this.ringMaterial.dispose()
  }
}
