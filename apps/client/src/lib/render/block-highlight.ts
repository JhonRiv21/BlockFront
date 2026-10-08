import type { VoxelHit } from '@blockfront/sim/raycast/dda'
import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from 'three'

// Outline of the aimed block plus a translucent quad on the aimed face.
export class BlockHighlight {
  readonly object = new Group()
  private readonly face: Mesh
  private readonly outline: LineSegments
  private readonly target = new Vector3()

  constructor() {
    this.face = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    )
    this.outline = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1.004, 1.004, 1.004)),
      new LineBasicMaterial({ color: '#10131c', transparent: true, opacity: 0.75 }),
    )
    this.object.add(this.face, this.outline)
    this.object.visible = false
  }

  show(hit: VoxelHit): void {
    const [nx, ny, nz] = hit.normal
    this.object.visible = true
    this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
    this.face.visible = nx !== 0 || ny !== 0 || nz !== 0
    if (!this.face.visible) return
    this.face.position.set(
      hit.x + 0.5 + nx * 0.502,
      hit.y + 0.5 + ny * 0.502,
      hit.z + 0.5 + nz * 0.502,
    )
    this.target.copy(this.face.position).add(new Vector3(nx, ny, nz))
    this.face.lookAt(this.target)
  }

  hide(): void {
    this.object.visible = false
  }

  dispose(): void {
    this.face.geometry.dispose()
    ;(this.face.material as MeshBasicMaterial).dispose()
    this.outline.geometry.dispose()
    ;(this.outline.material as LineBasicMaterial).dispose()
  }
}
