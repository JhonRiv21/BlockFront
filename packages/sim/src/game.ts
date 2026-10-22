import { BlockHealth } from './combat/blocks.ts'
import { adsProgress, moveMultiplier } from './combat/ads.ts'
import type { GrenadeEntity } from './combat/grenade.ts'
import { FALL, fallDamage } from './physics/fall.ts'
import { createWeaponState, reloadRemaining, stepWeapon } from './combat/weapon-state.ts'
import { BLOCKS, GRENADE, PLAYER_HP, SHOVEL, SPRINT_RECOVERY, WEAPONS } from './combat/weapons.ts'
import { TICK_RATE, TICK_SECONDS, WORLD_SIZE } from './config.ts'
import { BUILD_COLORS, BUTTON, createInputFrame, hasButton, type InputFrame } from './input.ts'
import { createPlayer, stepPlayer, type MoveInput } from './physics/player-controller.ts'
import type { SolidTest, Vec3 } from './physics/sweep.ts'
import { Rng } from './rng.ts'
import { generateWorld } from './world/generator.ts'
import { BLOCK, isLiquid, isSolid, type BlockId } from './world/blocks.ts'
import { bubbles, createAir, stepAir } from './physics/air.ts'
import type { LiquidTest } from './physics/water.ts'
import type { World } from './world/world.ts'
import { placeBlock, setBlock } from './match/block-edits.ts'
import type { MatchContext } from './match/context.ts'
import { applyDamage } from './match/damage.ts'
import { eyePosition, heldGun, viewDirection, type PlayerEntity } from './match/entities.ts'
import { handleGrenade, stepGrenades, throwGrenade } from './match/grenades.ts'
import { fireWeapon, spreadOf, swingShovel } from './match/hitscan.ts'
import { createFlag, dropFlag, isCarrying, stepBase, stepCtf } from './match/ctf-system.ts'
import {
  CTF,
  createMatch,
  createStats,
  mvp,
  secondsLeft,
  type FlagEntity,
  type MatchEntity,
} from './rules/ctf.ts'
import type { GameConfig, GameEvent, PlayerConfig, Snapshot, Team } from './match/types.ts'

export type {
  DamageSource,
  FlagSnapshot,
  GameConfig,
  GameEvent,
  GrenadeSnapshot,
  MatchSnapshot,
  PlayerConfig,
  PlayerSnapshot,
  Snapshot,
  Team,
} from './match/types.ts'

export interface SerializedGame {
  config: GameConfig
  tick: number
  rng: number
  nextGrenadeId: number
  players: Omit<PlayerEntity, 'config'>[]
  grenades: GrenadeEntity[]
  blockChanges: [number, number, number, BlockId][]
  blockHealth: [number, number][]
  blockOwners: [number, Team][]
  flags: Record<Team, FlagEntity>
  match: MatchEntity
}

// Plain-data deep copy; the sim has no DOM, so no structuredClone.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
const TEAM_BLOCK: Record<Team, BlockId> = { blue: BLOCK.blue, red: BLOCK.red }
const DEFAULT_SPAWN: Record<Team, [number, number]> = {
  blue: [WORLD_SIZE.x / 2, 17],
  red: [WORLD_SIZE.x / 2, WORLD_SIZE.z - 1 - 17],
}

// Authoritative match state: steps at TICK_RATE from one InputFrame per player and emits events.
// Movement, resources and slot dispatch live here; hitscan, block edits and grenades are the
// systems under ./match, which operate on this object as their context.
export class Game implements MatchContext {
  readonly world: World
  tick = 0
  readonly rng: Rng
  readonly health: BlockHealth
  readonly players = new Map<number, PlayerEntity>()
  grenades: GrenadeEntity[] = []
  nextGrenadeId = 1
  readonly blockChanges = new Map<number, [number, number, number, BlockId]>()
  readonly isSolid: SolidTest
  readonly isLiquid: LiquidTest
  events: GameEvent[] = []
  readonly flags: Record<Team, FlagEntity>
  readonly match: MatchEntity = createMatch()
  readonly blockOwners = new Map<number, Team>()

  constructor(readonly config: GameConfig) {
    this.world = generateWorld(config.seed)
    this.rng = new Rng(config.seed ^ 0x9e3779b9)
    this.health = new BlockHealth(this.world)
    this.isSolid = (x, y, z) => isSolid(this.world.getBlock(x, y, z))
    this.isLiquid = (x, y, z) => isLiquid(this.world.getBlock(x, y, z))
    this.flags = { blue: createFlag(this.world, 'blue'), red: createFlag(this.world, 'red') }
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
    for (const [x, y, z, id] of saved.blockChanges) setBlock(game, x, y, z, id, false)
    game.health.restore(saved.blockHealth)
    saved.players.forEach((data, index) => {
      const config = saved.config.players[index]!
      game.players.set(config.id, clone({ ...data, config }))
    })
    game.grenades = clone(saved.grenades)
    for (const [key, team] of saved.blockOwners) game.blockOwners.set(key, team)
    Object.assign(game.flags, clone(saved.flags))
    Object.assign(game.match, clone(saved.match))
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
      blockOwners: [...this.blockOwners.entries()],
      flags: this.flags,
      match: this.match,
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
        inWater: player.state.inWater,
        eyeInWater: player.state.eyeInWater,
        air: bubbles(player.air),
        hp: player.hp,
        alive: player.alive,
        respawnIn: player.alive ? 0 : Math.max(0, player.respawnTick - this.tick) / TICK_RATE,
        slot: player.slot,
        weapon: player.weapon.weapon,
        mag: player.weapon.mag,
        reserve: player.weapon.reserve,
        reloading: player.weapon.reloading,
        pistolMag: player.pistol.mag,
        pistolReserve: player.pistol.reserve,
        pistolReloading: player.pistol.reloading,
        reloadLeft: reloadRemaining(heldGun(player)),
        reloadTotal: heldGun(player).reloadTotal,
        spread: spreadOf(player),
        ads: player.ads,
        blocks: player.blocks,
        blockColor: player.blockColor,
        grenades: player.grenades,
        cooking: player.cooking,
        charge: player.charge,
        protected: this.tick < player.protectedUntil,
        carrying: isCarrying(this, player),
        kills: player.stats.kills,
        deaths: player.stats.deaths,
        captures: player.stats.captures,
        returns: player.stats.returns,
        damageDealt: player.stats.damage,
        dealtThisLife: player.dealtThisLife,
        takenThisLife: player.takenThisLife,
        killedBy: player.killedBy,
        killedWith: player.killedWith,
      })),
      grenades: this.grenades.map((grenade) => ({ id: grenade.id, pos: [...grenade.pos] as Vec3 })),
      flags: Object.values(this.flags).map((flag) => ({
        team: flag.team,
        state: flag.state,
        pos: [...flag.pos] as Vec3,
        home: [...flag.home] as Vec3,
        carrier: flag.carrier,
      })),
      match: {
        state: this.match.state,
        scoreBlue: this.match.score.blue,
        scoreRed: this.match.score.red,
        timeLeft: secondsLeft(this.match.state, this.tick),
        winner: this.match.winner,
        mvp:
          this.match.state === 'ended'
            ? mvp([...this.players.values()].map((p) => ({ id: p.config.id, stats: p.stats })))
            : null,
      },
    }
  }

  // Players can join and leave mid-match (bots in F3, rooms in F4). A newcomer spawns fresh at
  // their team's point; a leaver vanishes, their grenades in flight keep going unowned.
  addPlayer(config: PlayerConfig): void {
    if (this.players.has(config.id)) throw new Error(`player ${config.id} already in the match`)
    this.config.players.push(config)
    this.players.set(config.id, this.createEntity(config))
  }

  removePlayer(id: number): void {
    const leaver = this.players.get(id)
    if (!leaver) return
    dropFlag(this, leaver)
    this.players.delete(id)
    const index = this.config.players.findIndex((p) => p.id === id)
    if (index !== -1) this.config.players.splice(index, 1)
  }

  step(inputs: Map<number, InputFrame>): GameEvent[] {
    this.events = []
    // The world freezes when the match is over; the client shows the result over it.
    if (this.match.state === 'ended') return this.events
    this.tick++
    for (const player of this.players.values()) {
      const input = player.config.dummy
        ? player.lastInput
        : (inputs.get(player.config.id) ?? player.lastInput)
      // A loadout change waits for the next life, except in the dev loadout mode.
      if (input.primary && input.primary in WEAPONS) player.nextPrimary = input.primary
      if (player.alive) this.stepAlive(player, input)
      else if (this.tick >= player.respawnTick) this.respawn(player)
      player.lastButtons = input.buttons
      player.lastInput = input
    }
    stepGrenades(this)
    stepCtf(this)
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
      pistol: createWeaponState('pistol'),
      blockColor: TEAM_BLOCK[config.team],
      ads: 0,
      shovelCooldown: 0,
      swingTicks: -1,
      swingColumn: false,
      sprintUntil: 0,
      holdFireEdge: false,
      placeCooldown: 0,
      blocks: BLOCKS.max,
      grenades: GRENADE.perLife,
      cooking: -1,
      charge: 0,
      lastAttacker: 0,
      lastAttackedTick: -1,
      air: createAir(),
      lastButtons: 0,
      lastInput: createInputFrame(),
      nextPrimary: '',
      protectedUntil: this.tick + CTF.spawnProtectionSeconds * TICK_RATE,
      lastRestockTick: this.tick,
      stats: createStats(),
      dealtThisLife: 0,
      takenThisLife: 0,
      killedBy: 0,
      killedWith: '',
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
    const primary = player.nextPrimary || player.weapon.weapon
    const fresh = this.createEntity({ ...player.config, primary })
    Object.assign(player, fresh, {
      config: player.config,
      lastInput: player.lastInput,
      lastButtons: player.lastButtons,
      stats: player.stats,
    })
    this.events.push({ type: 'respawn', player: player.config.id })
  }

  private stepAlive(player: PlayerEntity, input: InputFrame): void {
    const move: MoveInput = {
      forward: input.forward,
      strafe: input.strafe,
      yaw: input.yaw,
      pitch: input.pitch,
      jump: hasButton(input, BUTTON.jump),
      crouch: hasButton(input, BUTTON.crouch),
      sprint: hasButton(input, BUTTON.sprint),
    }
    // ADS only with a gun in hand and out of the water; it slows the walk while held.
    const gun =
      player.slot === 1 ? player.weapon.weapon : player.slot === 2 ? player.pistol.weapon : null
    const wantsAim = gun !== null && hasButton(input, BUTTON.alt) && !player.state.inWater
    player.ads = gun ? adsProgress(player.ads, gun, wantsAim, TICK_SECONDS) : 0
    move.speedMultiplier = gun ? moveMultiplier(gun, player.ads) : 1
    stepPlayer(player.state, move, this.isSolid, TICK_SECONDS, this.isLiquid)
    if (player.state.landedFrom >= 1) {
      this.events.push({
        type: 'landed',
        player: player.config.id,
        height: player.state.landedFrom,
      })
      const damage = fallDamage(player.state.landedFrom)
      if (damage > 0) {
        // A recent enemy hit turns the fall into their kill.
        const recent = this.tick - player.lastAttackedTick <= FALL.attributionSeconds * TICK_RATE
        const attacker = (recent && this.players.get(player.lastAttacker)) || player
        applyDamage(this, attacker, player, damage, 'torso', 'fall')
        if (!player.alive) return
      }
    }
    const sprinting =
      move.sprint && (input.forward !== 0 || input.strafe !== 0) && !player.state.inWater
    if (sprinting) player.sprintUntil = this.tick + Math.round(SPRINT_RECOVERY * TICK_RATE)
    player.yaw = input.yaw
    player.pitch = input.pitch
    const drowning = stepAir(player.air, player.state.eyeInWater, TICK_SECONDS)
    if (drowning > 0) applyDamage(this, player, player, drowning, 'torso', 'drowning')
    if (!player.alive) return

    const inStock = (slot: number) =>
      slot === 4 ? player.blocks > 0 : slot === 5 ? player.grenades > 0 : true
    if (
      input.slot >= 1 &&
      input.slot <= 5 &&
      input.slot !== player.slot &&
      player.cooking < 0 &&
      inStock(input.slot)
    ) {
      player.slot = input.slot
      player.weapon.reloading = false
      player.pistol.reloading = false
      player.ads = 0
    }
    if (
      this.config.instantLoadout &&
      player.nextPrimary &&
      player.nextPrimary !== player.weapon.weapon
    ) {
      player.weapon = createWeaponState(player.nextPrimary)
      player.ads = 0
    }
    stepBase(this, player)
    if (input.blockColor !== player.blockColor && BUILD_COLORS.includes(input.blockColor)) {
      player.blockColor = input.blockColor
    }

    if (player.swingTicks >= 0 && --player.swingTicks < 0)
      swingShovel(this, player, player.swingColumn)

    const fire = hasButton(input, BUTTON.fire)
    const firePressed = fire && !(player.lastButtons & BUTTON.fire)
    const alt = hasButton(input, BUTTON.alt)
    const altPressed = alt && !(player.lastButtons & BUTTON.alt)
    player.shovelCooldown = Math.max(0, player.shovelCooldown - TICK_SECONDS)
    player.placeCooldown = Math.max(0, player.placeCooldown - TICK_SECONDS)

    // G throws a grenade straight away from any slot.
    const quickThrow = hasButton(input, BUTTON.grenade) && !(player.lastButtons & BUTTON.grenade)
    // The quick throw goes out at the speed of a 0.4 s charge, about the old fixed 16 m/s.
    if (quickThrow && player.cooking < 0 && player.grenades > 0)
      throwGrenade(this, player, GRENADE.fuse, 0.4, false)

    switch (player.slot) {
      case 1:
      case 2: {
        const weapon = player.slot === 1 ? player.weapon : player.pistol
        // Coming out of a sprint the gun needs a moment before it can fire.
        const ready = this.tick >= player.sprintUntil
        // A trigger held through the recovery still counts as a press once the gun is ready.
        if (!ready) player.holdFireEdge = true
        const result = stepWeapon(weapon, TICK_SECONDS, {
          fire: fire && ready,
          firePressed: (firePressed || player.holdFireEdge) && fire && ready,
          reload: hasButton(input, BUTTON.reload),
        })
        if (ready) player.holdFireEdge = false
        if (result === 'fired') fireWeapon(this, player, weapon)
        else if (firePressed && ready && weapon.mag === 0)
          this.events.push({ type: 'dryfire', player: player.config.id })
        break
      }
      case 3:
        if ((fire || alt) && player.shovelCooldown <= 1e-6) {
          // The shovel swings at half speed under water; the hit lands part-way through.
          const slow = player.state.inWater ? 2 : 1
          player.shovelCooldown = SHOVEL.interval * slow
          player.swingTicks = Math.round(SHOVEL.impactDelay * TICK_RATE * slow)
          player.swingColumn = alt && !fire
          const origin = eyePosition(player)
          this.events.push({
            type: 'shot',
            player: player.config.id,
            tool: 'shovel',
            origin,
            dir: viewDirection(player.yaw, player.pitch),
          })
        }
        break
      case 4:
        if (fire && player.placeCooldown <= 1e-6 && placeBlock(this, player)) {
          player.placeCooldown = BLOCKS.placeInterval
        }
        break
      case 5:
        handleGrenade(this, player, fire, firePressed, altPressed)
        break
    }
    // Out of blocks or grenades: the slot locks and the hand goes back to the primary.
    if (player.alive && player.cooking < 0 && !inStock(player.slot)) player.slot = 1
  }
}
