import type { WeaponId } from '@blockfront/sim/combat/weapons'
import { TICK_SECONDS } from '@blockfront/sim/config'
import type { GameEvent, PlayerSnapshot, Snapshot } from '@blockfront/sim/game'
import type { Vec3 } from '@blockfront/sim/physics/sweep'
import { BLOCK } from '@blockfront/sim/world/blocks'
import type { World } from '@blockfront/sim/world/world'
import { Vector3, type PerspectiveCamera, type PointLight } from 'three'
import type { GunAudio } from '../audio/gun-audio.ts'
import type { SoundBank } from '../audio/sound-bank.ts'
import type { InputState } from '../input/input-state.ts'
import type { SkylightTexture } from '../light/skylight-texture.ts'
import type { DamageIndicator, KillFeedEntry } from '../ui/hud-state.svelte.ts'
import type { BlockCracks } from './block-cracks.ts'
import type { BlockParticles } from './block-particles.ts'
import type { CameraEffects } from './camera-effects.ts'
import type { ExplosionFx } from './explosion-fx.ts'
import type { ImpactMarks } from './impact-marks.ts'
import type { MuzzleFlashes } from './muzzle-flash.ts'
import type { ShellCasings } from './shell-casings.ts'
import type { SnapshotBuffer } from './snapshot-buffer.ts'
import type { Tracers } from './tracers.ts'
import type { Viewmodel } from './viewmodel.ts'
import type { WorldView } from './world-view.ts'

const KILL_FEED_MS = 6000
const DAMAGE_INDICATOR_MS = 1200
const BLAST_FLASH_RANGE = 12
const FOOTSTEP_STRIDE = 2.8
const EXPLOSION_SHAKE_RANGE = 16

export interface FeedbackDeps {
  localId: number
  camera: PerspectiveCamera
  input: InputState
  buffer: SnapshotBuffer
  world: World
  worldView: WorldView
  skylight: SkylightTexture
  sounds: SoundBank
  guns: GunAudio
  viewmodel: Viewmodel
  effects: CameraEffects
  tracers: Tracers
  casings: ShellCasings
  worldFlashes: MuzzleFlashes
  worldFlashLight: PointLight
  particles: BlockParticles
  explosions: ExplosionFx
  cracks: BlockCracks
  marks: ImpactMarks
  currentSlot: () => number
  onDryFire: () => void
  onBlast: (strength: number) => void
}

function distance(a: Vec3, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z)
}

// Everything the client does in response to a sim event: sounds, tracers, casings, particles,
// camera kicks, the kill feed and the damage indicators. No game state is touched here.
export class EventFeedback {
  killFeed: KillFeedEntry[] = []
  damageIndicators: DamageIndicator[] = []
  private pendingHitmarker: { head: boolean } | null = null
  private nextFeedId = 1
  private lastShovelSwingAt = -1
  private autoShots = 0
  private wasReloading = false
  private readonly strideByPlayer = new Map<number, number>()
  private readonly viewDirection = new Vector3()
  private readonly right = new Vector3()
  private readonly upVector = new Vector3()

  constructor(private readonly deps: FeedbackDeps) {}

  // Hitmarker since the last HUD update, consumed once.
  takeHitmarker(): { head: boolean } | null {
    const pending = this.pendingHitmarker
    this.pendingHitmarker = null
    return pending
  }

  // Per snapshot: footsteps, feed expiry and the reload sound on the local gun.
  afterSnapshot(snapshot: Snapshot, me: PlayerSnapshot | null): void {
    this.playFootsteps(snapshot)
    const now = performance.now()
    this.killFeed = this.killFeed.filter((entry) => entry.until > now)
    this.damageIndicators = this.damageIndicators.filter((entry) => entry.until > now)
    if (!me) return
    const reloading = me.slot === 2 ? me.pistolReloading : me.reloading
    if (reloading && !this.wasReloading)
      this.deps.guns.mech(me.slot === 2 ? 'pistol' : me.weapon, this.deps.localId)
    this.wasReloading = reloading
  }

  reset(): void {
    this.killFeed = []
    this.damageIndicators = []
    this.pendingHitmarker = null
    this.lastShovelSwingAt = -1
    this.wasReloading = false
    this.strideByPlayer.clear()
  }

  handle(snapshot: Snapshot, event: GameEvent): void {
    const d = this.deps
    const local = d.localId
    const eye: Vec3 = [d.camera.position.x, d.camera.position.y, d.camera.position.z]
    switch (event.type) {
      case 'shot': {
        const mine = event.player === local
        if (event.tool === 'shovel') {
          if (mine) {
            d.sounds.play('shovel', { volume: 0.6 })
            d.viewmodel.onShot('shovel')
            this.lastShovelSwingAt = performance.now()
          } else d.sounds.playAt('shovel', ...event.origin, { volume: 0.6 })
          break
        }
        if (event.tool === 'blocks' || event.tool === 'grenade') break
        // Tracers on every shot, one in three for the automatics.
        const automatic = event.tool === 'smg' || event.tool === 'carbine'
        this.autoShots++
        if (!automatic || this.autoShots % 3 === 0) d.tracers.spawn(event.origin, event.dir)
        if (mine) {
          d.guns.shotOwn(event.tool)
          this.scheduleMech(event.tool, local, null, 0)
          const stays = d.effects.kick(
            event.tool,
            performance.now() / 1000,
            d.buffer.player(local)?.ads ?? 0,
          )
          d.input.pitch = Math.min(Math.PI / 2 - 0.01, d.input.pitch + stays.pitch)
          d.input.yaw += stays.yaw
          d.viewmodel.onShot(event.tool)
          this.ejectCasing(d.camera.position, 0.35)
          d.guns.casing(eye[0], eye[1] - 1.4, eye[2], 0, local)
        } else {
          const [ox, oy, oz] = event.origin
          const shooterDistance = distance(eye, { x: ox, y: oy, z: oz })
          d.guns.shotAt(event.tool, event.player, ox, oy, oz, shooterDistance)
          this.scheduleMech(event.tool, event.player, event.origin, shooterDistance)
          d.guns.casing(ox, oy - 1.4, oz, shooterDistance, event.player)
          this.whizIfClose(event.origin, event.dir)
          d.worldFlashLight.position.set(
            ox + event.dir[0],
            oy + event.dir[1] - 0.2,
            oz + event.dir[2],
          )
          d.worldFlashLight.intensity = 10
          this.ejectCasing(new Vector3(ox, oy, oz), 0.2)
          const [dx, dy, dz] = event.dir
          d.worldFlashes.spawn(ox + dx * 0.9, oy + dy * 0.9 - 0.25, oz + dz * 0.9, 0.5)
        }
        break
      }
      case 'hit':
        if (event.attacker === local && event.victim !== local) {
          this.pendingHitmarker = { head: event.zone === 'head' }
          d.guns.hitmarker(event.zone === 'head')
        }
        // Drowning only shows the red frame: no grunt, no indicator, no camera jolt.
        if (event.victim === local && event.tool !== 'drowning') {
          d.sounds.play('hurt', { volume: 0.7 })
          this.pushDamageIndicator(snapshot, event.attacker)
          d.effects.hurtFrom(this.attackerSide(snapshot, event.attacker))
        }
        break
      case 'landed': {
        if (event.player === local) {
          d.effects.land(event.height)
          if (event.height >= 8) d.sounds.play('land-crunch', { volume: 0.8 })
          else if (event.height >= 4) d.sounds.play('land-thud', { volume: 0.6 })
        } else {
          const who = snapshot.players.find((p) => p.id === event.player)
          if (who && event.height >= 4)
            d.sounds.playAt(event.height >= 8 ? 'land-crunch' : 'land-thud', ...who.pos, {
              volume: 0.7,
            })
        }
        break
      }
      case 'death': {
        this.pushKillFeed(snapshot, event.attacker, event.victim, event.tool)
        const victim = snapshot.players.find((p) => p.id === event.victim)
        if (event.victim === local) d.sounds.play('death')
        else if (victim) d.sounds.playAt('death', ...victim.pos, { volume: 0.8 })
        break
      }
      case 'block': {
        const previousId = d.world.getBlock(event.x, event.y, event.z)
        d.worldView.setBlock(event.x, event.y, event.z, event.id)
        d.skylight.onBlockChanged(event.x, event.y, event.z)
        d.cracks.clear(event.x, event.y, event.z)
        d.marks.clearBlock(event.x, event.y, event.z)
        if (event.id !== BLOCK.air && d.currentSlot() === 4 && previousId === BLOCK.air) {
          d.viewmodel.onBlockPlaced()
        }
        if (event.id === BLOCK.air) {
          d.particles.burst(event.x, event.y, event.z, previousId, 14)
          d.sounds.playVariantAt('block-break', 3, event.x + 0.5, event.y + 0.5, event.z + 0.5)
        } else {
          d.sounds.playAt('block-place', event.x + 0.5, event.y + 0.5, event.z + 0.5, {
            volume: 0.7,
          })
        }
        break
      }
      case 'blockDamaged': {
        d.particles.burst(event.x, event.y, event.z, d.world.getBlock(event.x, event.y, event.z), 4)
        d.sounds.playAt('block-hit', event.x + 0.5, event.y + 0.5, event.z + 0.5, { volume: 0.5 })
        d.cracks.damage(event.x, event.y, event.z, event.hp)
        const [nx, ny, nz] = event.normal
        // Mark somewhere on the face that was hit (the sim does not send the exact point).
        const jx = nx === 0 ? (Math.random() - 0.5) * 0.6 : 0
        const jy = ny === 0 ? (Math.random() - 0.5) * 0.6 : 0
        const jz = nz === 0 ? (Math.random() - 0.5) * 0.6 : 0
        d.marks.add(
          event.x,
          event.y,
          event.z,
          event.normal,
          event.x + 0.5 + nx * 0.5 + jx,
          event.y + 0.5 + ny * 0.5 + jy,
          event.z + 0.5 + nz * 0.5 + jz,
        )
        if (performance.now() - this.lastShovelSwingAt < 300) {
          d.viewmodel.onShovelHit()
          d.effects.jolt((0.5 * Math.PI) / 180)
          this.lastShovelSwingAt = -1
        }
        break
      }
      case 'grenade': {
        const thrower = snapshot.players.find((p) => p.id === event.player)
        if (thrower) d.sounds.playAt('grenade-throw', ...thrower.pos, { volume: 0.6 })
        break
      }
      case 'dryfire':
        if (event.player === local) {
          d.guns.dryFire()
          d.onDryFire()
        }
        break
      case 'explosion': {
        const away = distance(eye, event)
        d.explosions.burst(event.x, event.y, event.z)
        d.guns.explosion(-3, event.x, event.y, event.z, away)
        d.effects.shakeFrom(away, EXPLOSION_SHAKE_RANGE)
        // Close blasts whiten the screen for a moment.
        if (away < BLAST_FLASH_RANGE) d.onBlast(1 - away / BLAST_FLASH_RANGE)
        break
      }
    }
  }

  // One step every FOOTSTEP_STRIDE blocks walked on the ground, for every player.
  private playFootsteps(snapshot: Snapshot): void {
    const d = this.deps
    for (const player of snapshot.players) {
      const speed = d.buffer.speedOf(player.id)
      if (!player.alive || !player.onGround || speed < 1) continue
      const stride = (this.strideByPlayer.get(player.id) ?? 0) + speed * TICK_SECONDS
      if (stride < FOOTSTEP_STRIDE) {
        this.strideByPlayer.set(player.id, stride)
        continue
      }
      this.strideByPlayer.set(player.id, 0)
      // Own steps stay well under everything else; they annoyed in the playtest.
      if (player.id === d.localId) d.sounds.playVariant('footstep', 4, { volume: 0.08, rate: 0.9 })
      else d.sounds.playVariantAt('footstep', 4, ...player.pos, { volume: 0.35 })
    }
  }

  private pushKillFeed(snapshot: Snapshot, attacker: number, victim: number, tool: string): void {
    const name = (id: number) => snapshot.players.find((p) => p.id === id)?.name ?? `#${id}`
    // Own deaths (drowning, fall, cooked grenade) name only the victim and the cause.
    this.killFeed.push({
      id: this.nextFeedId++,
      attacker: attacker === victim ? '' : name(attacker),
      victim: name(victim),
      tool,
      until: performance.now() + KILL_FEED_MS,
    })
    if (this.killFeed.length > 5) this.killFeed.shift()
  }

  // Pump after a shotgun shot (~300 ms) and bolt after a sniper shot (~600 ms), own or at the
  // shooter; other guns only click on reload.
  private scheduleMech(
    weapon: WeaponId,
    entity: number,
    origin: Vec3 | null,
    shooterDistance: number,
  ): void {
    const delay = weapon === 'shotgun' ? 300 : weapon === 'sniper' ? 600 : 0
    if (delay === 0) return
    setTimeout(() => {
      if (entity === this.deps.localId) this.deps.guns.mech(weapon, this.deps.localId)
      else if (origin) this.deps.guns.mech(weapon, entity, origin, shooterDistance)
    }, delay)
  }

  // An enemy bullet passing within 2 blocks of the eye, in front of the muzzle: a flyby.
  private whizIfClose(origin: Vec3, dir: Vec3): void {
    const { x, y, z } = this.deps.camera.position
    const rx = x - origin[0]
    const ry = y - origin[1]
    const rz = z - origin[2]
    const t = rx * dir[0] + ry * dir[1] + rz * dir[2]
    if (t <= 1) return
    const cx = origin[0] + dir[0] * t
    const cy = origin[1] + dir[1] * t
    const cz = origin[2] + dir[2] * t
    const miss = Math.hypot(cx - x, cy - y, cz - z)
    if (miss > 2 || miss < 0.3) return
    this.deps.guns.whiz(cx, cy, cz, miss)
  }

  // Brass leaves to the shooter's right and up from a point near the receiver.
  private ejectCasing(eye: Vector3, forwardOffset: number): void {
    const { camera, casings } = this.deps
    camera.getWorldDirection(this.viewDirection)
    this.right.crossVectors(this.viewDirection, camera.up).normalize()
    this.upVector.copy(camera.up)
    const origin = eye
      .clone()
      .addScaledVector(this.viewDirection, forwardOffset)
      .addScaledVector(this.right, 0.2)
      .addScaledVector(this.upVector, -0.15)
    casings.eject(origin, this.right, this.upVector)
  }

  // Negative when the attacker is to the left of the view, positive to the right, 0 if unknown.
  private attackerSide(snapshot: Snapshot, attackerId: number): number {
    const me = snapshot.players.find((p) => p.id === this.deps.localId)
    const attacker = snapshot.players.find((p) => p.id === attackerId)
    if (!me || !attacker || attacker.id === me.id) return 0
    const dx = attacker.pos[0] - me.pos[0]
    const dz = attacker.pos[2] - me.pos[2]
    const rightX = Math.cos(this.deps.input.yaw)
    const rightZ = -Math.sin(this.deps.input.yaw)
    return dx * rightX + dz * rightZ
  }

  private pushDamageIndicator(snapshot: Snapshot, attackerId: number): void {
    const me = snapshot.players.find((p) => p.id === this.deps.localId)
    const attacker = snapshot.players.find((p) => p.id === attackerId)
    if (!me || !attacker || attacker.id === me.id) return
    const dx = attacker.pos[0] - me.pos[0]
    const dz = attacker.pos[2] - me.pos[2]
    // Yaw that would face the attacker; the HUD subtracts the current view yaw.
    this.damageIndicators.push({
      id: this.nextFeedId++,
      angle: Math.atan2(-dx, -dz),
      until: performance.now() + DAMAGE_INDICATOR_MS,
    })
  }
}
