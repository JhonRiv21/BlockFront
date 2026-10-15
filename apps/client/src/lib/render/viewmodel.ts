import { ADS } from '@blockfront/sim/combat/ads'
import { WEAPONS, type WeaponId } from '@blockfront/sim/combat/weapons'
import type { Team } from '@blockfront/sim/game'
import { PALETTE, BLOCK } from '@blockfront/sim/world/blocks'
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Vector3,
} from 'three'
import type { AssetStore } from '../assets/asset-store.ts'
import { BlockArm, easeOutBack, reloadPose, swingPose, WeaponMotion } from './first-person.ts'
import { MuzzleFlashes } from './muzzle-flash.ts'
import { buildWeapon, GRIPS, MUZZLE_Y, MUZZLE_Z, SIGHT } from './weapon-models.ts'
import { GRENADE_ART, SHOVEL_ART } from './sprite-geometry.ts'
import { SpriteItem } from './sprite-item.ts'

const REST = new Vector3(0.3, -0.27, -0.55)
const TOOL_REST = new Vector3(0.36, -0.3, -0.5)
// Minecraft hand anchor for sprite items, camera space (docs §1).
const HAND_ANCHOR = new Vector3(0.56, -0.52, -0.72)
const WEAPON_SCALE = 0.85
// Distance from the eye to the sight while aiming (docs §4.1: 0.25–0.35).
const ADS_DISTANCE = 0.3
export const VIEWMODEL_FOV = 70
export const VIEWMODEL_FOV_ADS = 60
const HOLSTER_SECONDS = 0.2
const DRAW_SECONDS = 0.45
const SWING_SECONDS = 0.35
const PLACE_SECONDS = 0.2
const HITSTOP_SECONDS = 0.045
const SHOULDER_RIGHT = new Vector3(0.28, -0.38, 0.05)
const SHOULDER_LEFT = new Vector3(-0.28, -0.38, 0.05)
const SLEEVE = 0.45
const SHOVEL_GRIP = new Vector3(0, 0, 0.2)
const BLOCK_GRIP = new Vector3(0, -0.14, 0.02)
const TEAM_CUFF: Record<Team, string> = { blue: '#2f6fe4', red: '#e03a3a' }

export type Tool = WeaponId | 'shovel' | 'blocks' | 'grenade'

export interface ViewmodelState {
  tool: Tool
  speed: number
  lateral: number
  onGround: boolean
  landingSpeed: number
  sprinting: boolean
  ads: number
  reloading: boolean
  magEmpty: boolean
  // Grenade charge 0..1: the hand pulls back and up the longer it is held.
  windup: number
  mouseDx: number
  mouseDy: number
}

// First-person weapon rendered in its own scene with its own camera (fixed vertical FOV, near
// 0.01) on top of the world. Layers in order: ADS pose, recoil, sway and bob; reload, switch and
// swing animations on top; two block arms that follow the weapon's grips.
export class Viewmodel {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera(VIEWMODEL_FOV, 1, 0.01, 10)
  readonly flashLight = new PointLight('#ffb366', 0, 3, 2)
  private readonly rig = new Group()
  private readonly holder = new Group()
  private readonly tools = new Map<string, Group>()
  private readonly muzzles = new Map<string, Vector3>()
  private readonly adsPoses = new Map<string, Vector3>()
  private readonly flashes: MuzzleFlashes
  private readonly motion = new WeaponMotion()
  private readonly blockMaterial = new MeshLambertMaterial({ color: '#ffffff' })
  readonly rightArm: BlockArm
  readonly leftArm: BlockArm
  private readonly pose = new Vector3()
  private readonly handTarget = new Vector3()
  private readonly handWorld = new Vector3()
  private current: string | null = null
  private pending: string | null = null
  private switchPhase: 'none' | 'holster' | 'draw' = 'none'
  private switchT = 0
  private reloadT = 0
  private reloadStartedEmpty = false
  private swingT = -1
  private swingAmplitude = 1
  private swingSeconds = SWING_SECONDS
  private hitstop = 0
  private slapDone = false
  private boltDone = false

  constructor(
    private readonly assets: AssetStore,
    team: Team,
  ) {
    this.scene.add(new HemisphereLight('#cfe3ff', '#5b4a36', 1.2))
    const sun = new DirectionalLight('#fff1d6', 1.2)
    sun.position.set(1, 2, 1)
    this.scene.add(sun)
    this.rig.add(this.holder, this.flashLight)
    this.flashLight.position.set(0.3, -0.2, -1)
    this.scene.add(this.rig)
    this.setBlockColor(team === 'blue' ? BLOCK.blue : BLOCK.red)
    this.flashes = new MuzzleFlashes(this.holder)
    for (const weapon of ['rifle', 'carbine', 'smg', 'shotgun', 'sniper', 'pistol'] as const) {
      const model = buildWeapon(weapon)
      model.scale.setScalar(WEAPON_SCALE)
      this.tools.set(weapon, model)
      this.muzzles.set(
        weapon,
        new Vector3(0, MUZZLE_Y[weapon] * WEAPON_SCALE, MUZZLE_Z[weapon] * WEAPON_SCALE),
      )
      // Camera-space pose that puts the sight on the view axis, ADS_DISTANCE ahead.
      const sight = SIGHT[weapon].clone().multiplyScalar(WEAPON_SCALE)
      this.adsPoses.set(weapon, new Vector3(-sight.x, -sight.y, -ADS_DISTANCE - sight.z))
    }
    // Hand-held sprites (docs/f2-6-feel.md §1): Minecraft's handheld.json firstperson_righthand
    // transform, rotation [0, -90, 25], translation [1.13, 3.2, 1.13] px, scale 0.68.
    this.tools.set('shovel', handheld(new SpriteItem(SHOVEL_ART)))
    this.tools.set('grenade', handheld(new SpriteItem(GRENADE_ART)))
    this.tools.set('blocks', buildBlock(this.blockMaterial))
    this.rightArm = this.buildArm(SHOULDER_RIGHT, team)
    this.leftArm = this.buildArm(SHOULDER_LEFT, team)
    this.rig.add(this.rightArm.object, this.leftArm.object)
    void assets.ready.then(() => this.buildModels())
  }

  setBlockColor(id: number): void {
    this.blockMaterial.color = new Color(PALETTE[id] ?? 0xffffff)
  }

  onShot(weapon: WeaponId | 'shovel'): void {
    if (weapon === 'shovel') {
      this.swingT = 0
      this.swingAmplitude = 1
      this.swingSeconds = SWING_SECONDS
      return
    }
    this.motion.shot(weapon)
    this.flashLight.intensity = 6
    const muzzle = this.muzzles.get(weapon)
    if (muzzle) this.flashes.spawn(muzzle.x, muzzle.y, muzzle.z, weapon === 'smg' ? 0.14 : 0.22)
  }

  // The shovel connected: freeze the swing for a moment.
  onShovelHit(): void {
    this.hitstop = HITSTOP_SECONDS
  }

  onBlockPlaced(): void {
    this.swingT = 0
    this.swingAmplitude = 0.6
    this.swingSeconds = PLACE_SECONDS
  }

  update(camera: PerspectiveCamera, state: ViewmodelState, dt: number): void {
    this.requestTool(state.tool)
    this.advanceSwitch(dt)
    this.rig.position.copy(camera.position)
    this.rig.quaternion.copy(camera.quaternion)
    this.camera.position.copy(camera.position)
    this.camera.quaternion.copy(camera.quaternion)
    this.camera.aspect = camera.aspect
    const s = state.ads * state.ads * (3 - 2 * state.ads)
    this.camera.fov = VIEWMODEL_FOV + (VIEWMODEL_FOV_ADS - VIEWMODEL_FOV) * s
    this.camera.updateProjectionMatrix()
    this.flashLight.intensity *= Math.exp(-40 * dt)

    const frozen = this.hitstop > 0
    this.hitstop = Math.max(0, this.hitstop - dt)
    const motionDt = frozen ? 0 : dt
    this.motion.update({
      dt: motionDt,
      speed: state.speed,
      lateral: state.lateral,
      onGround: state.onGround,
      landingSpeed: state.landingSpeed,
      sprinting: state.sprinting,
      ads: state.ads,
      mouseDx: state.mouseDx,
      mouseDy: state.mouseDy,
    })
    this.flashes.update(dt)

    const gun = this.current && this.current in ADS ? (this.current as WeaponId) : null
    const sprite = this.current === 'shovel' || this.current === 'grenade'
    const adsPose = gun ? this.adsPoses.get(gun) : undefined
    const rest = gun ? REST : sprite ? HAND_ANCHOR : TOOL_REST
    if (adsPose) this.pose.lerpVectors(rest, adsPose, s)
    else this.pose.copy(rest)

    const { position, rotation } = this.motion.out
    this.holder.position.copy(this.pose).add(position)
    this.holder.rotation.set(rotation.x, rotation.y, rotation.z)

    if (this.current === 'grenade' && state.windup > 0) this.windUp(state.windup)
    this.animateReload(gun, state, motionDt)
    this.animateSwing(motionDt, sprite)
    this.animateSwitch()
    this.placeArms(gun, state.tool, sprite)
  }

  setVisible(visible: boolean): void {
    this.holder.visible = visible
    this.rightArm.object.visible = visible
    this.leftArm.object.visible = visible
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

  private buildArm(shoulder: Vector3, team: Team): BlockArm {
    const arm = new BlockArm(shoulder, SLEEVE)
    const sleeve = new Mesh(
      new BoxGeometry(0.1, 0.1, SLEEVE),
      new MeshLambertMaterial({ color: '#3b4a6b' }),
    )
    sleeve.position.z = SLEEVE / 2
    const cuff = new Mesh(
      new BoxGeometry(0.11, 0.11, 0.06),
      new MeshLambertMaterial({ color: TEAM_CUFF[team] }),
    )
    cuff.position.z = SLEEVE - 0.06
    const hand = new Mesh(
      new BoxGeometry(0.1, 0.1, 0.1),
      new MeshLambertMaterial({ color: '#e0b48a' }),
    )
    hand.position.z = SLEEVE + 0.03
    arm.object.add(sleeve, cuff, hand)
    return arm
  }

  // Hands ride on the weapon: right on the grip, left on the fore grip. Sprite items are held
  // "on their own" in the corner, as in Minecraft, so they get no arms.
  private placeArms(gun: WeaponId | null, tool: Tool, sprite: boolean): void {
    const model = this.current ? this.tools.get(this.current) : undefined
    if (!model || !this.holder.visible || sprite) {
      this.rightArm.object.visible = false
      this.leftArm.object.visible = false
      return
    }
    this.rig.updateMatrixWorld(true)
    const aim = (arm: BlockArm, point: Vector3) => {
      this.handTarget.copy(point).multiplyScalar(gun ? WEAPON_SCALE : 1)
      model.localToWorld(this.handTarget)
      this.handWorld.copy(this.handTarget)
      this.rig.worldToLocal(this.handTarget)
      arm.aim(this.handTarget, this.handWorld)
    }
    if (gun) {
      aim(this.rightArm, GRIPS[gun].right)
      aim(this.leftArm, GRIPS[gun].left)
      this.rightArm.object.visible = true
      this.leftArm.object.visible = true
    } else {
      aim(this.rightArm, tool === 'shovel' ? SHOVEL_GRIP : BLOCK_GRIP)
      this.rightArm.object.visible = true
      this.leftArm.object.visible = false
    }
  }

  private animateReload(gun: WeaponId | null, state: ViewmodelState, dt: number): void {
    const model = gun ? this.tools.get(gun) : undefined
    const magazine = model?.getObjectByName('magazine')
    if (!gun || !model || !state.reloading) {
      this.reloadT = 0
      this.slapDone = false
      this.boltDone = false
      if (magazine) {
        magazine.visible = true
        magazine.position.y = magazine.userData.restY ?? magazine.position.y
      }
      return
    }
    if (this.reloadT === 0) this.reloadStartedEmpty = state.magEmpty
    const spec = WEAPONS[gun]
    this.reloadT += dt / spec.reloadSeconds
    const pose = reloadPose(this.reloadT, this.reloadStartedEmpty, spec.reloadPerShell)
    this.holder.position.y -= pose.drop
    this.holder.rotation.z += pose.roll
    if (magazine) {
      if (magazine.userData.restY === undefined) magazine.userData.restY = magazine.position.y
      magazine.position.y = magazine.userData.restY + pose.magazineY
      magazine.visible = pose.magazineVisible
    }
    if (pose.slap && !this.slapDone) {
      this.motion.impulse(0.03, (2 * Math.PI) / 180)
      this.slapDone = true
    }
    if (!pose.slap && this.slapDone && spec.reloadPerShell) this.slapDone = false
    if (pose.bolt && !this.boltDone) {
      this.motion.impulse(0.05, (-3 * Math.PI) / 180)
      this.boltDone = true
    }
  }

  // Minecraft's renderer swing for hand-held items: rotY = 45 + sin(√s·π)·(−20),
  // rotZ = sin(√s·π)·(−20), rotX = sin(s·π)·(−80) (docs §1). Guns keep the F2.5 curve.
  // Charging a throw: the grenade comes back towards the shoulder, rises and tilts back, with
  // an ease-out so most of the travel shows in the first half of the charge.
  private windUp(charge: number): void {
    const t = 1 - (1 - charge) * (1 - charge)
    this.holder.position.x += 0.1 * t
    this.holder.position.y += 0.12 * t
    this.holder.position.z += 0.22 * t
    this.holder.rotation.x += ((-35 * Math.PI) / 180) * t
    this.holder.rotation.z += ((18 * Math.PI) / 180) * t
  }

  private animateSwing(dt: number, sprite: boolean): void {
    if (this.swingT < 0) return
    this.swingT += dt / this.swingSeconds
    if (this.swingT >= 1) {
      this.swingT = -1
      return
    }
    const s = this.swingT
    const a = this.swingAmplitude
    if (sprite) {
      const f = Math.sin(Math.sqrt(s) * Math.PI)
      this.holder.rotation.y += (((45 + f * -20) * Math.PI) / 180) * a
      this.holder.rotation.z += ((f * -20 * Math.PI) / 180) * a
      this.holder.rotation.x += ((Math.sin(s * Math.PI) * -80 * Math.PI) / 180) * a
      return
    }
    const pose = swingPose(s, a)
    this.holder.rotation.x += pose.rotX
    this.holder.position.x += pose.x
    this.holder.position.y += pose.y
  }

  // Holster the current tool (down and tilted), then draw the next from below with easeOutBack.
  private requestTool(tool: Tool): void {
    if (tool === this.current || tool === this.pending) return
    if (this.current === null) {
      this.show(tool)
      this.switchPhase = 'draw'
      this.switchT = 0
      return
    }
    this.pending = tool
    this.switchPhase = 'holster'
    this.switchT = 0
  }

  private advanceSwitch(dt: number): void {
    if (this.switchPhase === 'none') return
    if (this.switchPhase === 'holster') {
      this.switchT += dt / HOLSTER_SECONDS
      if (this.switchT >= 1) {
        if (this.pending) this.show(this.pending)
        this.pending = null
        this.switchPhase = 'draw'
        this.switchT = 0
      }
      return
    }
    this.switchT += dt / DRAW_SECONDS
    if (this.switchT >= 1) this.switchPhase = 'none'
  }

  private animateSwitch(): void {
    if (this.switchPhase === 'holster') {
      const t = Math.min(1, this.switchT)
      this.holder.position.y -= 0.3 * t
      this.holder.rotation.x -= ((40 * Math.PI) / 180) * t
    } else if (this.switchPhase === 'draw') {
      const t = 1 - easeOutBack(Math.min(1, this.switchT))
      this.holder.position.y -= 0.3 * t
      this.holder.rotation.x -= ((40 * Math.PI) / 180) * t
    }
  }

  private buildModels(): void {
    // Weapons and sprites are procedural; nothing to wait for any more.
    void this.assets
  }

  private show(name: string): void {
    if (this.current === name) return
    for (const child of [...this.holder.children]) this.holder.remove(child)
    const tool = this.tools.get(name)
    if (tool) this.holder.add(tool)
    this.current = name
  }
}

export function isGun(tool: Tool): tool is WeaponId {
  return tool in ADS
}

// handheld.json firstperson_righthand: rotation [0, -90, 25] (XYZ), translation in sixteenths,
// scale 0.68. The sprite spans 0..1 in its own plane before the transform.
function handheld(item: SpriteItem): Group {
  const group = new Group()
  const inner = item.object
  inner.position.set(-0.5, -0.5, 0)
  const holder = new Group()
  holder.add(inner)
  holder.rotation.set(0, (-90 * Math.PI) / 180, (25 * Math.PI) / 180, 'XYZ')
  holder.position.set(1.13 / 16, 3.2 / 16, 1.13 / 16)
  holder.scale.setScalar(0.68)
  group.add(holder)
  return group
}

function buildBlock(material: MeshLambertMaterial): Group {
  const group = new Group()
  const cube = new Mesh(new BoxGeometry(0.28, 0.28, 0.28), material)
  // Minecraft pose: the block sits low right, turned about 45°.
  cube.rotation.y = Math.PI / 4
  cube.position.set(0.05, -0.08, 0.05)
  group.add(cube)
  return group
}
