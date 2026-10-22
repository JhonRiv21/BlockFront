import type { Snapshot } from '@blockfront/sim/game'
import { Mesh, type Material, type Scene } from 'three'
import type { AssetStore } from '../assets/asset-store.ts'
import { SCOPE_THRESHOLD } from './ads-view.ts'
import type { MuzzleFlashes } from './muzzle-flash.ts'
import { PlayerView } from './player-view.ts'
import type { SnapshotBuffer } from './snapshot-buffer.ts'
import { useSphericalFog } from './spherical-fog.ts'
import { FlagsView } from './flags-view.ts'

const GLINT_ANGLE = (12 * Math.PI) / 180

// Everything from the snapshot that is not me: other players, grenades in flight and the lens
// glint of an enemy sniper looking my way.
export class EntitiesView {
  private readonly players = new Map<number, PlayerView>()
  private readonly grenadeMeshes = new Map<number, Mesh>()
  private readonly glints = new Map<number, number>()
  private readonly flags: FlagsView

  constructor(
    private readonly scene: Scene,
    private readonly assets: AssetStore,
    private readonly worldFlashes: MuzzleFlashes,
    private readonly buffer: SnapshotBuffer,
    private readonly localId: number,
    // Display name for a snapshot name (the config carries ids, not localized text).
    private readonly displayName: (name: string) => string,
  ) {
    this.flags = new FlagsView(scene, localId)
  }

  update(alpha: number, dt: number, showHitboxes: boolean, time: number): void {
    const latest = this.buffer.latest
    if (!latest) {
      this.flags.update([], time)
      return
    }
    this.flags.update(latest.flags, time)
    const me = latest.players.find((p) => p.id === this.localId)
    for (const player of latest.players) {
      if (player.id === this.localId) continue
      let view = this.players.get(player.id)
      if (!view) {
        view = new PlayerView(this.scene, player.team, this.assets)
        this.players.set(player.id, view)
      }
      const ally = me !== undefined && player.team === me.team
      view.setAlly(ally ? this.displayName(player.name) : null, ally && player.carrying)
      const data = this.buffer.interpolated(player.id, alpha)
      if (data) {
        view.update(
          player,
          data[1][0],
          data[1][1],
          data[1][2],
          this.buffer.speedOf(player.id),
          dt,
          showHitboxes,
        )
      }
    }

    const seen = new Set<number>()
    const grenadeModel = this.assets.model('grenade')
    for (const grenade of latest.grenades) {
      seen.add(grenade.id)
      let mesh = this.grenadeMeshes.get(grenade.id)
      if (!mesh && grenadeModel) {
        const clone = grenadeModel.scene.clone(true)
        clone.traverse((child) => {
          if (child instanceof Mesh) useSphericalFog(child.material as Material)
        })
        mesh = new Mesh()
        mesh.add(clone)
        this.scene.add(mesh)
        this.grenadeMeshes.set(grenade.id, mesh)
      }
      if (mesh) {
        mesh.position.set(grenade.pos[0], grenade.pos[1] - 0.12, grenade.pos[2])
        mesh.rotation.y += dt * 6
      }
    }
    for (const [id, mesh] of this.grenadeMeshes) {
      if (seen.has(id)) continue
      this.scene.remove(mesh)
      this.grenadeMeshes.delete(id)
    }
  }

  // Lens glint on an enemy sniper that is scoped and pointing within 12° of me.
  updateGlints(snapshot: Snapshot): void {
    const me = snapshot.players.find((p) => p.id === this.localId)
    for (const other of snapshot.players) {
      if (!me || other.id === me.id || other.team === me.team || !other.alive) continue
      const scoped = other.slot === 1 && other.weapon === 'sniper' && other.ads >= SCOPE_THRESHOLD
      if (!scoped) continue
      const dx = me.pos[0] - other.pos[0]
      const dy = me.pos[1] + me.eyeHeight - (other.pos[1] + other.eyeHeight)
      const dz = me.pos[2] - other.pos[2]
      const len = Math.hypot(dx, dy, dz)
      const cp = Math.cos(other.pitch)
      const aim = [-Math.sin(other.yaw) * cp, Math.sin(other.pitch), -Math.cos(other.yaw) * cp]
      const cos = (dx * aim[0]! + dy * aim[1]! + dz * aim[2]!) / len
      if (cos < Math.cos(GLINT_ANGLE)) continue
      const last = this.glints.get(other.id) ?? 0
      if (performance.now() - last < 120) continue
      this.glints.set(other.id, performance.now())
      const size = Math.min(2.5, 0.4 + len * 0.03)
      this.worldFlashes.spawn(other.pos[0], other.pos[1] + other.eyeHeight, other.pos[2], size)
    }
  }

  // Drop every view, for a new match on the same renderer.
  clear(): void {
    for (const view of this.players.values()) view.dispose()
    this.players.clear()
    for (const mesh of this.grenadeMeshes.values()) this.scene.remove(mesh)
    this.grenadeMeshes.clear()
    this.glints.clear()
  }

  dispose(): void {
    this.clear()
  }
}
