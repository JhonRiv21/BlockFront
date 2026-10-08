import type { WeaponId } from '@blockfront/sim/combat/weapons'
import type { Team } from '@blockfront/sim/game'
import { PALETTE, BLOCK } from '@blockfront/sim/world/palette'
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  Scene,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import type { AssetStore } from '../assets/asset-store.ts'
import { MuzzleFlashes } from './muzzle-flash.ts'
import { buildWeapon, MUZZLE_Y, MUZZLE_Z } from './weapon-models.ts'

const REST = new Vector3(0.3, -0.27, -0.55)
const AIM = new Vector3(0, -0.14, -0.45)
const KICK_BACK: Record<WeaponId, number> = { rifle: 0.09, smg: 0.05, shotgun: 0.16, sniper: 0.2 }
const KICK_RECOVERY = 12
const BOB_AMOUNT = 0.012
const WEAPON_SCALE = 0.85

// First-person weapon rendered in its own scene on top of the world: the held tool follows
// the camera, bobs with movement, kicks on every shot and centers while aiming.
export class Viewmodel {
  readonly scene = new Scene()
  private readonly rig = new Group()
  private readonly holder = new Group()
  private readonly tools = new Map<string, Group>()
  private readonly muzzles = new Map<string, Vector3>()
  private readonly flashes: MuzzleFlashes
  private readonly blockMaterial = new MeshLambertMaterial({ color: '#ffffff' })
  private current: string | null = null
  private kick = 0
  private bobPhase = 0
  private aimBlend = 0

  constructor(
    private readonly assets: AssetStore,
    team: Team,
  ) {
    this.scene.add(new HemisphereLight('#cfe3ff', '#5b4a36', 1.2))
    const sun = new DirectionalLight('#fff1d6', 1.2)
    sun.position.set(1, 2, 1)
    this.scene.add(sun)
    this.rig.add(this.holder)
    this.scene.add(this.rig)
    this.blockMaterial.color = new Color(
      PALETTE[team === 'blue' ? BLOCK.blue : BLOCK.red] ?? 0xffffff,
    )
    this.flashes = new MuzzleFlashes(this.holder)
    for (const weapon of ['rifle', 'smg', 'shotgun', 'sniper'] as const) {
      const model = buildWeapon(weapon)
      model.scale.setScalar(WEAPON_SCALE)
      this.tools.set(weapon, model)
      this.muzzles.set(
        weapon,
        new Vector3(0, MUZZLE_Y[weapon] * WEAPON_SCALE, MUZZLE_Z[weapon] * WEAPON_SCALE),
      )
    }
    this.tools.set('shovel', buildShovel())
    this.tools.set('blocks', buildBlock(this.blockMaterial))
    void assets.ready.then(() => this.buildModels())
  }

  onShot(weapon: WeaponId | 'shovel'): void {
    this.kick = Math.min(0.3, this.kick + (weapon === 'shovel' ? 0.12 : KICK_BACK[weapon]))
    const muzzle = this.muzzles.get(weapon)
    if (muzzle) this.flashes.spawn(muzzle.x, muzzle.y, muzzle.z, weapon === 'smg' ? 0.14 : 0.22)
  }

  update(
    camera: PerspectiveCamera,
    tool: WeaponId | 'shovel' | 'blocks' | 'grenade',
    speed: number,
    onGround: boolean,
    aiming: boolean,
    dt: number,
  ): void {
    this.show(tool)
    this.rig.position.copy(camera.position)
    this.rig.quaternion.copy(camera.quaternion)

    this.kick *= Math.exp(-KICK_RECOVERY * dt)
    this.flashes.update(dt)
    this.aimBlend += ((aiming ? 1 : 0) - this.aimBlend) * Math.min(1, dt * 14)
    if (onGround && speed > 0.5) this.bobPhase += dt * speed * 1.6
    const bob = speed > 0.5 && onGround ? BOB_AMOUNT * Math.min(1, speed / 4) : 0

    this.holder.position.lerpVectors(REST, AIM, this.aimBlend)
    this.holder.position.x += Math.sin(this.bobPhase) * bob
    this.holder.position.y += Math.abs(Math.cos(this.bobPhase)) * bob - this.kick * 0.25
    this.holder.position.z += this.kick
    this.holder.rotation.x = this.kick * 1.4
    this.holder.rotation.z = Math.sin(this.bobPhase) * bob * 0.5
  }

  dispose(): void {
    this.flashes.dispose()
    this.blockMaterial.dispose()
    for (const tool of this.tools.values()) {
      tool.traverse((child) => {
        if (child instanceof Mesh) child.geometry.dispose()
      })
    }
  }

  private buildModels(): void {
    const grenade = this.assets.model('grenade')
    if (grenade) {
      const group = new Group()
      const clone = grenade.scene.clone(true)
      clone.scale.setScalar(0.8)
      group.add(clone)
      this.tools.set('grenade', group)
    }
    if (this.current) {
      const name = this.current
      this.current = null
      this.show(name)
    }
  }

  private show(name: string): void {
    if (this.current === name) return
    for (const child of [...this.holder.children]) this.holder.remove(child)
    const tool = this.tools.get(name)
    if (tool) this.holder.add(tool)
    this.current = name
  }
}

function buildShovel(): Group {
  const group = new Group()
  const wood = new MeshLambertMaterial({ color: '#8a5a2b' })
  const steel = new MeshLambertMaterial({ color: '#b8bec6' })
  const handle = new Mesh(new BoxGeometry(0.05, 0.05, 0.75), wood)
  handle.position.z = -0.1
  const blade = new Mesh(new BoxGeometry(0.2, 0.03, 0.26), steel)
  blade.position.set(0, 0, -0.58)
  group.add(handle, blade)
  group.rotation.x = -0.35
  return group
}

function buildBlock(material: MeshLambertMaterial): Group {
  const group = new Group()
  const cube = new Mesh(new BoxGeometry(0.28, 0.28, 0.28), material)
  cube.rotation.y = 0.5
  group.add(cube)
  return group
}
