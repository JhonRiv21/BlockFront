import { playerHitboxes } from '@blockfront/sim/combat/hitboxes'
import type { WeaponId } from '@blockfront/sim/combat/weapons'
import type { PlayerSnapshot, Team } from '@blockfront/sim/game'
import { PLAYER } from '@blockfront/sim/physics/player-controller'
import {
  AnimationMixer,
  BoxGeometry,
  Color,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  LoopOnce,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Sprite,
  SpriteMaterial,
  type AnimationAction,
  type Scene,
} from 'three'
import type { AssetStore } from '../assets/asset-store.ts'
import { buildRifle } from './rifle-model.ts'

const TEAM_TINT: Record<Team, string> = { blue: '#9db9ff', red: '#ff9a8c' }
const TEAM_COLOR: Record<Team, string> = { blue: '#2f6fe4', red: '#e03a3a' }
// Kenney's characters are 2.7 units tall and face +Z.
const MODEL_SCALE = PLAYER.height / 2.7
const WALK_SPEED = 0.6
const SPRINT_SPEED = 5.2
const BAR_WIDTH = 0.9
const BAR_HEIGHT = 0.1

type Clip = 'idle' | 'walk' | 'sprint' | 'die'

// Another player: Kenney Blocky Character tinted by team, with idle / walk / sprint / die clips
// and the held weapon in the right hand. A plain box stands in until the assets arrive.
export class PlayerView {
  readonly object = new Group()
  private readonly body = new Group()
  private readonly hitboxes = new Group()
  private readonly hitboxMaterial = new LineBasicMaterial({ color: '#ffe066' })
  private readonly barBackground: Sprite
  private readonly barFill: Sprite
  private placeholder: Mesh | null
  private mixer: AnimationMixer | null = null
  private actions: Partial<Record<Clip, AnimationAction>> = {}
  private current: Clip | null = null
  private hand: Object3D | null = null
  private heldWeapon: WeaponId | null = null
  private wasAlive = true

  constructor(
    private readonly scene: Scene,
    private readonly team: Team,
    private readonly assets: AssetStore,
  ) {
    this.placeholder = new Mesh(
      new BoxGeometry(PLAYER.width, PLAYER.height, PLAYER.width),
      new MeshLambertMaterial({ color: TEAM_COLOR[team] }),
    )
    this.placeholder.position.y = PLAYER.height / 2
    // Health bar: camera-facing sprites, the fill anchored on its left edge so it shrinks inward.
    this.barBackground = new Sprite(
      new SpriteMaterial({ color: '#10131c', transparent: true, opacity: 0.7, depthTest: false }),
    )
    this.barBackground.scale.set(BAR_WIDTH + 0.04, BAR_HEIGHT + 0.04, 1)
    this.barFill = new Sprite(new SpriteMaterial({ color: '#4ade80', depthTest: false }))
    this.barFill.center.set(0, 0.5)
    this.barFill.scale.set(BAR_WIDTH, BAR_HEIGHT, 1)
    this.barBackground.renderOrder = 10
    this.barFill.renderOrder = 11
    this.object.add(this.body, this.hitboxes, this.placeholder, this.barBackground, this.barFill)
    scene.add(this.object)
    void assets.ready.then(() => this.buildModel())
  }

  update(
    snapshot: PlayerSnapshot,
    x: number,
    y: number,
    z: number,
    speed: number,
    dt: number,
    showHitboxes: boolean,
  ): void {
    this.object.position.set(x, y, z)
    this.object.rotation.y = snapshot.yaw + Math.PI
    const scale = (snapshot.crouching ? PLAYER.crouchHeight : PLAYER.height) / PLAYER.height
    this.body.scale.set(MODEL_SCALE, MODEL_SCALE * scale, MODEL_SCALE)

    if (snapshot.alive && !this.wasAlive) this.object.visible = true
    if (!snapshot.alive && this.wasAlive) this.playClip('die')
    this.wasAlive = snapshot.alive
    if (!snapshot.alive && this.current !== 'die') this.object.visible = false

    if (snapshot.alive) {
      this.playClip(speed > SPRINT_SPEED ? 'sprint' : speed > WALK_SPEED ? 'walk' : 'idle')
      this.holdWeapon(snapshot.slot === 1 ? snapshot.weapon : null)
    }
    this.updateHealthBar(snapshot)
    this.mixer?.update(dt)

    this.hitboxes.visible = showHitboxes
    if (showHitboxes) this.rebuildHitboxes(snapshot)
  }

  dispose(): void {
    this.scene.remove(this.object)
    this.placeholder?.geometry.dispose()
    this.clearHitboxes()
    this.hitboxMaterial.dispose()
    this.barBackground.material.dispose()
    this.barFill.material.dispose()
    this.body.traverse((child) => {
      if (child instanceof Mesh) (child.material as MeshBasicMaterial).dispose()
    })
  }

  private updateHealthBar(snapshot: PlayerSnapshot): void {
    const visible = snapshot.alive && snapshot.hp < 100
    this.barBackground.visible = visible
    this.barFill.visible = visible
    if (!visible) return
    const height = snapshot.crouching ? PLAYER.crouchHeight : PLAYER.height
    const y = height + 0.35
    const fraction = Math.max(0, snapshot.hp) / 100
    // The sprites hang off the rotated object, but sprites always face the camera.
    this.barBackground.position.set(0, y, 0)
    this.barFill.position.set(-BAR_WIDTH / 2, y, 0)
    this.barFill.scale.set(BAR_WIDTH * fraction, BAR_HEIGHT, 1)
    this.barFill.material.color.setHSL(0.33 * fraction, 0.75, 0.5)
  }

  private buildModel(): void {
    const model = this.assets.model('character')
    if (!model) return
    const root = model.scene.clone(true)
    const tint = new Color(TEAM_TINT[this.team])
    root.traverse((child) => {
      if (child instanceof Mesh) {
        const material = (child.material as MeshBasicMaterial).clone()
        material.color.multiply(tint)
        child.material = material
      }
    })
    this.body.add(root)
    this.hand = root.getObjectByName('arm-right') ?? null

    this.mixer = new AnimationMixer(root)
    for (const name of ['idle', 'walk', 'sprint', 'die'] as const) {
      const clip = model.animations.find((animation) => animation.name === name)
      if (!clip) continue
      const action = this.mixer.clipAction(clip)
      if (name === 'die') {
        action.setLoop(LoopOnce, 1)
        action.clampWhenFinished = true
      }
      this.actions[name] = action
    }
    if (this.placeholder) {
      this.object.remove(this.placeholder)
      this.placeholder.geometry.dispose()
      this.placeholder = null
    }
    this.playClip('idle')
  }

  private playClip(name: Clip): void {
    if (this.current === name || !this.mixer) return
    const next = this.actions[name]
    if (!next) return
    const previous = this.current ? this.actions[this.current] : undefined
    next.reset().fadeIn(0.15).play()
    previous?.fadeOut(0.15)
    this.current = name
  }

  private holdWeapon(weapon: WeaponId | null): void {
    if (weapon === this.heldWeapon || !this.hand) return
    for (const child of [...this.hand.children]) this.hand.remove(child)
    this.heldWeapon = weapon
    if (!weapon) return
    let held: Object3D
    if (weapon === 'rifle') {
      held = buildRifle()
      // The rifle points down -Z; the character faces +Z.
      held.rotation.y = Math.PI
      held.scale.setScalar(1.3)
    } else {
      const model = this.assets.model(weapon)
      if (!model) return
      held = model.scene.clone(true)
    }
    // The arm pivot sits at the shoulder and the arm hangs about one unit; the muzzle is +Z,
    // the same way the character faces.
    held.position.set(0.05, -0.95, 0.55)
    held.rotation.x = -0.15
    this.hand.add(held)
  }

  private rebuildHitboxes(snapshot: PlayerSnapshot): void {
    this.clearHitboxes()
    // Hitboxes are axis-aligned in world space, so they ignore the body rotation.
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
