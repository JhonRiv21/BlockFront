import { playerHitboxes } from '@blockfront/sim/combat/hitboxes'
import type { PlayerSnapshot, Team } from '@blockfront/sim/game'
import { PLAYER } from '@blockfront/sim/physics/player-controller'
import {
  BoxGeometry,
  Group,
  LineSegments,
  LineBasicMaterial,
  Mesh,
  MeshLambertMaterial,
  EdgesGeometry,
  type Scene,
} from 'three'

const TEAM_COLOR: Record<Team, string> = { blue: '#2f6fe4', red: '#e03a3a' }
const HEAD_COLOR = '#f1d2b6'

// Placeholder body for other players: team-coloured box plus a head, and the sim hitboxes as
// wireframes when debugging.
export class PlayerView {
  readonly object = new Group()
  private readonly body: Mesh
  private readonly head: Mesh
  private readonly hitboxes = new Group()
  private readonly hitboxMaterial = new LineBasicMaterial({ color: '#ffe066' })

  constructor(
    private readonly scene: Scene,
    team: Team,
  ) {
    this.body = new Mesh(
      new BoxGeometry(PLAYER.width, PLAYER.height, PLAYER.width),
      new MeshLambertMaterial({ color: TEAM_COLOR[team] }),
    )
    this.head = new Mesh(
      new BoxGeometry(0.4, 0.35, 0.4),
      new MeshLambertMaterial({ color: HEAD_COLOR }),
    )
    this.object.add(this.body, this.head, this.hitboxes)
    scene.add(this.object)
  }

  update(snapshot: PlayerSnapshot, x: number, y: number, z: number, showHitboxes: boolean): void {
    this.object.visible = snapshot.alive
    if (!snapshot.alive) return
    const height = snapshot.crouching ? PLAYER.crouchHeight : PLAYER.height
    const scale = height / PLAYER.height
    this.object.position.set(x, y, z)
    this.object.rotation.y = snapshot.yaw
    this.body.scale.y = scale
    this.body.position.y = height / 2
    this.head.position.y = (1.45 + 0.175) * scale
    this.head.visible = true
    this.hitboxes.visible = showHitboxes
    if (showHitboxes) this.rebuildHitboxes(snapshot)
  }

  dispose(): void {
    this.scene.remove(this.object)
    this.body.geometry.dispose()
    ;(this.body.material as MeshLambertMaterial).dispose()
    this.head.geometry.dispose()
    ;(this.head.material as MeshLambertMaterial).dispose()
    this.clearHitboxes()
    this.hitboxMaterial.dispose()
  }

  private rebuildHitboxes(snapshot: PlayerSnapshot): void {
    this.clearHitboxes()
    // Hitboxes are axis-aligned in world space, so they live outside the body rotation.
    this.hitboxes.rotation.y = -this.object.rotation.y
    for (const box of playerHitboxes([0, 0, 0], snapshot.crouching)) {
      const size = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]]
      const lines = new LineSegments(
        new EdgesGeometry(new BoxGeometry(size[0], size[1], size[2])),
        this.hitboxMaterial,
      )
      lines.position.set(
        (box.min[0] + box.max[0]) / 2,
        (box.min[1] + box.max[1]) / 2,
        (box.min[2] + box.max[2]) / 2,
      )
      this.hitboxes.add(lines)
    }
  }

  private clearHitboxes(): void {
    for (const child of [...this.hitboxes.children]) {
      this.hitboxes.remove(child)
      if (child instanceof LineSegments) child.geometry.dispose()
    }
  }
}
