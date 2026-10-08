import { BlockHealth, explodeBlocks } from './combat/blocks.ts'
import { damageFor } from './combat/damage.ts'
import { stepGrenade, type GrenadeEntity } from './combat/grenade.ts'
import { playerHitboxes, rayHitboxes } from './combat/hitboxes.ts'
import {
  createWeaponState,
  currentSpread,
  stepWeapon,
  type WeaponState,
} from './combat/weapon-state.ts'
import {
  BLOCKS,
  GRENADE,
  PLAYER_HP,
  RESPAWN_SECONDS,
  SHOVEL,
  WEAPONS,
  type HitZone,
  type ToolId,
  type WeaponId,
} from './combat/weapons.ts'
import { TICK_RATE, TICK_SECONDS, WORLD_SIZE } from './config.ts'
import { BUTTON, createInputFrame, hasButton, type InputFrame } from './input.ts'
import {
  createPlayer,
  playerAabb,
  stepPlayer,
  PLAYER,
  type MoveInput,
  type PlayerState,
} from './physics/player-controller.ts'
import type { Aabb, SolidTest, Vec3 } from './physics/sweep.ts'
import { raycastVoxels } from './raycast/dda.ts'
import { Rng } from './rng.ts'
import { generateWorld } from './world/generator.ts'
import { BLOCK, type BlockId } from './world/palette.ts'
import type { World } from './world/world.ts'

export type Team = 'blue' | 'red'

export interface PlayerConfig {
  id: number
  team: Team
  name: string
  dummy?: boolean
  primary?: WeaponId
  spawn?: [number, number]
}

export interface GameConfig {
  seed: number
  players: PlayerConfig[]
}

export type GameEvent =
  | { type: 'block'; x: number; y: number; z: number; id: BlockId }
  | { type: 'blockDamaged'; x: number; y: number; z: number; hp: number }
  | { type: 'shot'; player: number; tool: ToolId; origin: Vec3; dir: Vec3 }
  | { type: 'hit'; attacker: number; victim: number; zone: HitZone; damage: number; tool: ToolId }
  | { type: 'death'; victim: number; attacker: number; tool: ToolId }
  | { type: 'respawn'; player: number }
  | { type: 'grenade'; player: number; grenade: number }
  | { type: 'explosion'; x: number; y: number; z: number }

export interface PlayerSnapshot {
  id: number
  team: Team
  name: string
  pos: Vec3
  yaw: number
  pitch: number
  crouching: boolean
  onGround: boolean
  eyeHeight: number
  hp: number
  alive: boolean
  respawnIn: number
  slot: number
  weapon: WeaponId
  mag: number
  reserve: number
  reloading: boolean
  spread: number
  blocks: number
  grenades: number
  cooking: number
}

export interface GrenadeSnapshot {
  id: number
  pos: Vec3
}

export interface Snapshot {
  tick: number
  players: PlayerSnapshot[]
  grenades: GrenadeSnapshot[]
}

interface PlayerEntity {
  config: PlayerConfig
  state: PlayerState
  yaw: number
  pitch: number
  hp: number
  alive: boolean
  respawnTick: number
  slot: number
  weapon: WeaponState
  shovelCooldown: number
  placeCooldown: number
  blocks: number
  grenades: number
  cooking: number
  lastButtons: number
  lastInput: InputFrame
}

export interface SerializedGame {
  config: GameConfig
  tick: number
  rng: number
  nextGrenadeId: number
  players: Omit<PlayerEntity, 'config'>[]
  grenades: GrenadeEntity[]
  blockChanges: [number, number, number, BlockId][]
  blockHealth: [number, number][]
}

const BULLET_RANGE = 200

// Plain-data deep copy; the sim has no DOM, so no structuredClone.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
const RESPAWN_TICKS = RESPAWN_SECONDS * TICK_RATE
const TEAM_BLOCK: Record<Team, BlockId> = { blue: BLOCK.blue, red: BLOCK.red }
const DEFAULT_SPAWN: Record<Team, [number, number]> = {
  blue: [WORLD_SIZE.x / 2, 17],
  red: [WORLD_SIZE.x / 2, WORLD_SIZE.z - 1 - 17],
}

function viewDirection(yaw: number, pitch: number): Vec3 {
  const cos = Math.cos(pitch)
  return [-Math.sin(yaw) * cos, Math.sin(pitch), -Math.cos(yaw) * cos]
}

function eyePosition(player: PlayerEntity): Vec3 {
  const { pos } = player.state
  return [pos[0], pos[1] + player.state.eyeHeight, pos[2]]
}

function bodyCenter(player: PlayerEntity): Vec3 {
  const { pos } = player.state
  const height = player.state.crouching ? PLAYER.crouchHeight : PLAYER.height
  return [pos[0], pos[1] + height / 2, pos[2]]
}

function overlapsBox(box: Aabb, x: number, y: number, z: number): boolean {
  const { min, max } = box
  return (
    min[0] < x + 1 && max[0] > x && min[1] < y + 1 && max[1] > y && min[2] < z + 1 && max[2] > z
  )
}

// Authoritative match state: steps at TICK_RATE from one InputFrame per player and emits events.
export class Game {
  readonly world: World
  tick = 0
  private readonly rng: Rng
  private readonly health: BlockHealth
  private readonly players = new Map<number, PlayerEntity>()
  private grenades: GrenadeEntity[] = []
  private nextGrenadeId = 1
  private readonly blockChanges = new Map<number, [number, number, number, BlockId]>()
  private readonly isSolid: SolidTest
  private events: GameEvent[] = []

  constructor(readonly config: GameConfig) {
    this.world = generateWorld(config.seed)
    this.rng = new Rng(config.seed ^ 0x9e3779b9)
    this.health = new BlockHealth(this.world)
    this.isSolid = (x, y, z) => this.world.getBlock(x, y, z) !== BLOCK.air
    for (const playerConfig of config.players) {
      const entity = this.createEntity(playerConfig)
      this.players.set(playerConfig.id, entity)
    }
  }

  static restore(saved: SerializedGame): Game {
    const game = new Game(saved.config)
    game.tick = saved.tick
    game.rng.state = saved.rng
    game.nextGrenadeId = saved.nextGrenadeId
    for (const [x, y, z, id] of saved.blockChanges) game.setBlock(x, y, z, id, false)
    game.health.restore(saved.blockHealth)
    saved.players.forEach((data, index) => {
      const config = saved.config.players[index]!
      game.players.set(config.id, clone({ ...data, config }))
    })
    game.grenades = clone(saved.grenades)
    return game
  }

  serialize(): SerializedGame {
    return clone({
      config: this.config,
      tick: this.tick,
      rng: this.rng.state,
      nextGrenadeId: this.nextGrenadeId,
      players: [...this.players.values()].map(({ config: _config, ...rest }) => rest),
      grenades: this.grenades,
      blockChanges: [...this.blockChanges.values()],
      blockHealth: this.health.entries(),
    })
  }

  snapshot(): Snapshot {
    return {
      tick: this.tick,
      players: [...this.players.values()].map((player) => ({
        id: player.config.id,
        team: player.config.team,
        name: player.config.name,
        pos: [...player.state.pos] as Vec3,
        yaw: player.yaw,
        pitch: player.pitch,
        crouching: player.state.crouching,
        onGround: player.state.onGround,
        eyeHeight: player.state.eyeHeight,
        hp: player.hp,
        alive: player.alive,
        respawnIn: player.alive ? 0 : Math.max(0, player.respawnTick - this.tick) / TICK_RATE,
        slot: player.slot,
        weapon: player.weapon.weapon,
        mag: player.weapon.mag,
        reserve: player.weapon.reserve,
        reloading: player.weapon.reloading,
        spread: currentSpread(
          player.weapon,
          player.state.crouching,
          hasButton(player.lastInput, BUTTON.alt) && player.slot === 1,
        ),
        blocks: player.blocks,
        grenades: player.grenades,
        cooking: player.cooking,
      })),
      grenades: this.grenades.map((grenade) => ({ id: grenade.id, pos: [...grenade.pos] as Vec3 })),
    }
  }

  step(inputs: Map<number, InputFrame>): GameEvent[] {
    this.events = []
    this.tick++
    for (const player of this.players.values()) {
      const input = player.config.dummy
        ? player.lastInput
        : (inputs.get(player.config.id) ?? player.lastInput)
      if (player.alive) this.stepAlive(player, input)
      else if (this.tick >= player.respawnTick) this.respawn(player)
      player.lastButtons = input.buttons
      player.lastInput = input
    }
    this.stepGrenades()
    return this.events
  }

  private createEntity(config: PlayerConfig): PlayerEntity {
    const entity: PlayerEntity = {
      config,
      state: createPlayer(this.spawnPoint(config)),
      yaw: config.team === 'blue' ? Math.PI : 0,
      pitch: 0,
      hp: PLAYER_HP,
      alive: true,
      respawnTick: 0,
      slot: 1,
      weapon: createWeaponState(config.primary ?? 'rifle'),
      shovelCooldown: 0,
      placeCooldown: 0,
      blocks: BLOCKS.max,
      grenades: GRENADE.perLife,
      cooking: -1,
      lastButtons: 0,
      lastInput: createInputFrame(),
    }
    entity.lastInput.yaw = entity.yaw
    return entity
  }

  private spawnPoint(config: PlayerConfig): Vec3 {
    const [x, z] = config.spawn ?? DEFAULT_SPAWN[config.team]
    for (let y = WORLD_SIZE.y - 1; y >= 0; y--) {
      if (this.world.getBlock(x, y, z) !== BLOCK.air) return [x + 0.5, y + 1, z + 0.5]
    }
    return [x + 0.5, 1, z + 0.5]
  }

  private respawn(player: PlayerEntity): void {
    const fresh = this.createEntity(player.config)
    Object.assign(player, fresh, { lastInput: player.lastInput, lastButtons: player.lastButtons })
    this.events.push({ type: 'respawn', player: player.config.id })
  }

  private stepAlive(player: PlayerEntity, input: InputFrame): void {
    const move: MoveInput = {
      forward: input.forward,
      strafe: input.strafe,
      yaw: input.yaw,
      jump: hasButton(input, BUTTON.jump),
      crouch: hasButton(input, BUTTON.crouch),
      sprint: hasButton(input, BUTTON.sprint),
    }
    stepPlayer(player.state, move, this.isSolid, TICK_SECONDS)
    player.yaw = input.yaw
    player.pitch = input.pitch

    if (input.slot >= 1 && input.slot <= 4 && input.slot !== player.slot && player.cooking < 0) {
      player.slot = input.slot
      player.weapon.reloading = false
    }

    const fire = hasButton(input, BUTTON.fire)
    const firePressed = fire && !(player.lastButtons & BUTTON.fire)
    const alt = hasButton(input, BUTTON.alt)
    const altPressed = alt && !(player.lastButtons & BUTTON.alt)
    player.shovelCooldown = Math.max(0, player.shovelCooldown - TICK_SECONDS)
    player.placeCooldown = Math.max(0, player.placeCooldown - TICK_SECONDS)

    switch (player.slot) {
      case 1: {
        const result = stepWeapon(player.weapon, TICK_SECONDS, {
          fire,
          firePressed,
          reload: hasButton(input, BUTTON.reload),
        })
        if (result === 'fired') this.fireWeapon(player, alt)
        break
      }
      case 2:
        if ((fire || alt) && player.shovelCooldown <= 1e-6) {
          player.shovelCooldown = SHOVEL.interval
          this.swingShovel(player, alt && !fire)
        }
        break
      case 3:
        if (fire && player.placeCooldown <= 1e-6 && this.placeBlock(player)) {
          player.placeCooldown = BLOCKS.placeInterval
        }
        break
      case 4:
        this.handleGrenade(player, fire, firePressed, altPressed)
        break
    }
  }

  private fireWeapon(player: PlayerEntity, aiming: boolean): void {
    const spec = WEAPONS[player.weapon.weapon]
    const spread = currentSpread(player.weapon, player.state.crouching, aiming)
    const origin = eyePosition(player)
    const aim = viewDirection(player.yaw, player.pitch)
    this.events.push({
      type: 'shot',
      player: player.config.id,
      tool: player.weapon.weapon,
      origin,
      dir: aim,
    })
    for (let i = 0; i < spec.pellets; i++) {
      const dir = this.scatter(aim, spread)
      this.traceBullet(player, origin, dir, player.weapon.weapon, BULLET_RANGE, spec.blockDamage)
    }
  }

  // Random direction inside the cone of half-angle `spread` around dir.
  private scatter(dir: Vec3, spread: number): Vec3 {
    if (spread <= 0) return dir
    const angle = this.rng.next() * Math.PI * 2
    const radius = Math.sqrt(this.rng.next()) * Math.tan(spread)
    const up: Vec3 = Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0]
    const right: Vec3 = [
      dir[1] * up[2] - dir[2] * up[1],
      dir[2] * up[0] - dir[0] * up[2],
      dir[0] * up[1] - dir[1] * up[0],
    ]
    const rl = Math.hypot(right[0], right[1], right[2])
    right[0] /= rl
    right[1] /= rl
    right[2] /= rl
    const trueUp: Vec3 = [
      right[1] * dir[2] - right[2] * dir[1],
      right[2] * dir[0] - right[0] * dir[2],
      right[0] * dir[1] - right[1] * dir[0],
    ]
    const ox = Math.cos(angle) * radius
    const oy = Math.sin(angle) * radius
    const out: Vec3 = [
      dir[0] + right[0] * ox + trueUp[0] * oy,
      dir[1] + right[1] * ox + trueUp[1] * oy,
      dir[2] + right[2] * ox + trueUp[2] * oy,
    ]
    const l = Math.hypot(out[0], out[1], out[2])
    return [out[0] / l, out[1] / l, out[2] / l]
  }

  // Hitscan: the nearest of a block or an enemy hitbox along the ray.
  private traceBullet(
    shooter: PlayerEntity,
    origin: Vec3,
    dir: Vec3,
    tool: ToolId,
    range: number,
    blockDamage: number,
  ): void {
    const blockHit = raycastVoxels(this.isSolid, origin, dir, range)
    const limit = blockHit ? blockHit.distance : range
    let victim: PlayerEntity | null = null
    let zone: HitZone = 'torso'
    let distance = limit
    for (const other of this.players.values()) {
      if (other === shooter || !other.alive || other.config.team === shooter.config.team) continue
      const hit = rayHitboxes(
        origin,
        dir,
        distance,
        playerHitboxes(other.state.pos, other.state.crouching),
      )
      if (hit && hit.distance < distance) {
        victim = other
        zone = hit.zone
        distance = hit.distance
      }
    }
    if (victim) {
      this.applyDamage(shooter, victim, damageFor(tool, zone, distance), zone, tool)
    } else if (blockHit && blockDamage > 0) {
      this.damageBlock(blockHit.x, blockHit.y, blockHit.z, blockDamage, null)
    }
  }

  private swingShovel(player: PlayerEntity, column: boolean): void {
    const origin = eyePosition(player)
    const dir = viewDirection(player.yaw, player.pitch)
    this.events.push({ type: 'shot', player: player.config.id, tool: 'shovel', origin, dir })
    if (!column) {
      let victim: PlayerEntity | null = null
      let zone: HitZone = 'torso'
      let distance: number = SHOVEL.meleeRange
      for (const other of this.players.values()) {
        if (other === player || !other.alive || other.config.team === player.config.team) continue
        const hit = rayHitboxes(
          origin,
          dir,
          distance,
          playerHitboxes(other.state.pos, other.state.crouching),
        )
        if (hit && hit.distance < distance) {
          victim = other
          zone = hit.zone
          distance = hit.distance
        }
      }
      if (victim) {
        this.applyDamage(player, victim, damageFor('shovel', zone, distance), zone, 'shovel')
        return
      }
    }
    const blockHit = raycastVoxels(this.isSolid, origin, dir, SHOVEL.blockReach)
    if (!blockHit) return
    const half = Math.floor(SHOVEL.columnSize / 2)
    const rows = column ? [-half, 0, half].filter((o, i, a) => a.indexOf(o) === i) : [0]
    for (const offset of rows) {
      this.damageBlock(blockHit.x, blockHit.y + offset, blockHit.z, SHOVEL.blockDamage, player)
    }
  }

  private damageBlock(
    x: number,
    y: number,
    z: number,
    amount: number,
    digger: PlayerEntity | null,
  ): void {
    if (this.world.getBlock(x, y, z) === BLOCK.air) return
    const broke = this.health.damage(x, y, z, amount)
    if (broke) {
      this.recordBlock(x, y, z, BLOCK.air)
      if (digger) digger.blocks = Math.min(BLOCKS.max, digger.blocks + 1)
    } else {
      this.events.push({ type: 'blockDamaged', x, y, z, hp: this.health.get(x, y, z) })
    }
  }

  private placeBlock(player: PlayerEntity): boolean {
    if (player.blocks <= 0) return false
    const hit = raycastVoxels(
      this.isSolid,
      eyePosition(player),
      viewDirection(player.yaw, player.pitch),
      BLOCKS.reach,
    )
    if (!hit) return false
    const [nx, ny, nz] = hit.normal
    if (nx === 0 && ny === 0 && nz === 0) return false
    const x = hit.x + nx
    const y = hit.y + ny
    const z = hit.z + nz
    if (!this.world.inBounds(x, y, z) || this.isSolid(x, y, z)) return false
    for (const other of this.players.values()) {
      if (other.alive && overlapsBox(playerAabb(other.state), x, y, z)) return false
    }
    player.blocks--
    this.setBlock(x, y, z, TEAM_BLOCK[player.config.team], true)
    return true
  }

  private handleGrenade(
    player: PlayerEntity,
    fire: boolean,
    firePressed: boolean,
    _altPressed: boolean,
  ): void {
    if (player.cooking >= 0) {
      player.cooking -= TICK_SECONDS
      if (player.cooking <= 0) {
        // Cooked too long: it goes off in the hand.
        player.cooking = -1
        player.grenades--
        this.explode(eyePosition(player), player)
        return
      }
      if (!fire) {
        const dir = viewDirection(player.yaw, player.pitch)
        const vel = player.state.vel
        const grenade: GrenadeEntity = {
          id: this.nextGrenadeId++,
          owner: player.config.id,
          pos: eyePosition(player),
          vel: [
            vel[0] + dir[0] * GRENADE.throwSpeed,
            vel[1] + dir[1] * GRENADE.throwSpeed,
            vel[2] + dir[2] * GRENADE.throwSpeed,
          ],
          fuse: player.cooking,
        }
        this.grenades.push(grenade)
        player.cooking = -1
        player.grenades--
        this.events.push({ type: 'grenade', player: player.config.id, grenade: grenade.id })
      }
      return
    }
    if (firePressed && player.grenades > 0) player.cooking = GRENADE.fuse
  }

  private stepGrenades(): void {
    const remaining: GrenadeEntity[] = []
    for (const grenade of this.grenades) {
      if (stepGrenade(grenade, this.isSolid, TICK_SECONDS)) {
        this.explode(grenade.pos, this.players.get(grenade.owner) ?? null)
      } else {
        remaining.push(grenade)
      }
    }
    this.grenades = remaining
  }

  private explode(center: Vec3, owner: PlayerEntity | null): void {
    this.events.push({ type: 'explosion', x: center[0], y: center[1], z: center[2] })
    for (const [x, y, z] of explodeBlocks(this.world, this.health, center, GRENADE.blockRadius)) {
      this.recordBlock(x, y, z, BLOCK.air)
    }
    for (const player of this.players.values()) {
      if (!player.alive) continue
      if (owner && player !== owner && player.config.team === owner.config.team) continue
      const target = bodyCenter(player)
      const dx = target[0] - center[0]
      const dy = target[1] - center[1]
      const dz = target[2] - center[2]
      const distance = Math.hypot(dx, dy, dz)
      if (distance >= GRENADE.damageRadius) continue
      const blocked = raycastVoxels(this.isSolid, center, [dx, dy, dz], distance)
      if (blocked && blocked.distance > 0) continue
      const damage = GRENADE.maxDamage * (1 - distance / GRENADE.damageRadius)
      this.applyDamage(owner ?? player, player, damage, 'torso', 'grenade')
    }
  }

  private applyDamage(
    attacker: PlayerEntity,
    victim: PlayerEntity,
    damage: number,
    zone: HitZone,
    tool: ToolId,
  ): void {
    if (damage <= 0 || !victim.alive) return
    victim.hp = Math.max(0, victim.hp - damage)
    this.events.push({
      type: 'hit',
      attacker: attacker.config.id,
      victim: victim.config.id,
      zone,
      damage,
      tool,
    })
    if (victim.hp > 0) return
    victim.alive = false
    victim.cooking = -1
    victim.respawnTick = this.tick + RESPAWN_TICKS
    this.events.push({
      type: 'death',
      victim: victim.config.id,
      attacker: attacker.config.id,
      tool,
    })
  }

  private recordBlock(x: number, y: number, z: number, id: BlockId): void {
    this.blockChanges.set(x + y * WORLD_SIZE.x + z * WORLD_SIZE.x * WORLD_SIZE.y, [x, y, z, id])
    this.events.push({ type: 'block', x, y, z, id })
  }

  private setBlock(x: number, y: number, z: number, id: BlockId, emit: boolean): void {
    this.world.fillBlock(x, y, z, id)
    this.health.forget(x, y, z)
    if (emit) this.recordBlock(x, y, z, id)
    else
      this.blockChanges.set(x + y * WORLD_SIZE.x + z * WORLD_SIZE.x * WORLD_SIZE.y, [x, y, z, id])
  }
}
