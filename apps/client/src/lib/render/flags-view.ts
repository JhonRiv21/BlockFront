import type { FlagSnapshot, Team } from '@blockfront/sim/game'
import { PLAYER } from '@blockfront/sim/physics/player-controller'
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Scene } from 'three'
import { useSphericalFog } from './spherical-fog.ts'

const TEAM_CLOTH: Record<Team, string> = { blue: '#2f6fe4', red: '#e03a3a' }
const POLE_HEIGHT = 1.6

// Each team's flag: a pole with a cloth that waves. On a carrier it rides on their back; the
// local carrier's own flag is hidden (the HUD says they have it).
export class FlagsView {
  private readonly flags = new Map<Team, { group: Group; cloth: Mesh }>()

  constructor(
    private readonly scene: Scene,
    private readonly localId: number,
  ) {
    for (const team of ['blue', 'red'] as const) {
      const group = new Group()
      const poleMaterial = new MeshLambertMaterial({ color: '#d8d2c4' })
      useSphericalFog(poleMaterial)
      const pole = new Mesh(new BoxGeometry(0.1, POLE_HEIGHT, 0.1), poleMaterial)
      pole.position.y = POLE_HEIGHT / 2
      const clothMaterial = new MeshLambertMaterial({ color: TEAM_CLOTH[team] })
      useSphericalFog(clothMaterial)
      const cloth = new Mesh(new BoxGeometry(0.7, 0.45, 0.06), clothMaterial)
      cloth.position.set(0.4, POLE_HEIGHT - 0.3, 0)
      group.add(pole, cloth)
      scene.add(group)
      this.flags.set(team, { group, cloth })
    }
  }

  update(flags: FlagSnapshot[], time: number): void {
    for (const flag of flags) {
      const view = this.flags.get(flag.team)
      if (!view) continue
      if (flag.state === 'carried') {
        view.group.visible = flag.carrier !== this.localId
        // Carried on the back, above the shoulders.
        view.group.position.set(flag.pos[0], flag.pos[1] + PLAYER.height - 0.9, flag.pos[2])
      } else {
        view.group.visible = true
        view.group.position.set(flag.pos[0], flag.pos[1], flag.pos[2])
      }
      view.cloth.rotation.y = Math.sin(time / 400 + (flag.team === 'red' ? 1 : 0)) * 0.35
      view.group.rotation.y = flag.state === 'carried' ? 0 : time / 2500
    }
  }

  dispose(): void {
    for (const { group, cloth } of this.flags.values()) {
      this.scene.remove(group)
      cloth.geometry.dispose()
      ;(cloth.material as MeshLambertMaterial).dispose()
    }
    this.flags.clear()
  }
}
