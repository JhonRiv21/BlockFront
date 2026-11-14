import type { WeaponId } from '../combat/weapons.ts'
import { TICK_RATE, WORLD_SIZE } from '../config.ts'
import type { InputFrame } from '../input.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { Rng } from '../rng.ts'
import type { MatchContext } from '../match/context.ts'
import type { GameEvent, PlayerConfig, Team } from '../match/types.ts'
import { CTF } from '../rules/ctf.ts'
import type { Difficulty } from '../rules/modes.ts'
import { createBrain, thinkBot, type BotBrain, type BotEnv } from './brain.ts'
import { BOT_SKILL } from './difficulty.ts'
import { BLOCK } from '../world/blocks.ts'
import { findPath, nearestStandable, type NavWorld } from './navigation.ts'
import { choosePrimary, teamRoles } from './roles.ts'

// Runs every bot without an external input inside Game.step (docs/final-scope.md §4): plans
// their paths from one node budget shared per tick, hands out the CTF roles and keeps their
// memories, which serialize with the game.
export const PLANNER = {
  nodesPerTick: 2000,
  // A search starts only with this much budget left and expands at most maxPerSearch.
  minPerSearch: 300,
  maxPerSearch: 1500,
  weight: 1.4,
} as const

export interface BotDirectorState {
  brains: BotBrain[]
  queue: number[]
  lanes: Record<Team, number>
}

// River crossings a team's attack can take: the ford in the middle or a swim on either side.
const LANES = [18, WORLD_SIZE.x / 2, WORLD_SIZE.x - 18]

export interface BotStats {
  id: number
  stuckTicks: number
  aliveTicks: number
}

// The world as navigation needs it: solid and liquid tests that read the live blocks.
type WorldView = Pick<MatchContext, 'world' | 'isSolid' | 'isLiquid' | 'mode' | 'flags' | 'chests'>

export class BotDirector {
  private brains = new Map<number, BotBrain>()
  private queue: number[] = []
  private lanes: Record<Team, number> = { blue: WORLD_SIZE.x / 2, red: WORLD_SIZE.x / 2 }
  private readonly hotspots: Vec3[]
  private readonly nav: NavWorld
  private rolesFor = ''
  // Nodes expanded on the last tick, for the harness.
  lastNodes = 0

  constructor(
    private readonly view: WorldView,
    configs: readonly PlayerConfig[],
  ) {
    this.nav = {
      isSolid: view.isSolid,
      isLiquid: view.isLiquid,
      noFooting: (x, y, z) => view.world.getBlock(x, y, z) === BLOCK.leaves,
    }
    this.hotspots = hotspots(view)
    this.assignRoles(configs)
  }

  private brainFor(config: PlayerConfig): BotBrain {
    let brain = this.brains.get(config.id)
    if (!brain) {
      brain = createBrain(
        config.id,
        'roam',
        this.view.chests.map((c) => c.id),
      )
      this.brains.set(config.id, brain)
    }
    return brain
  }

  // The commander of each team: roles by config order, redone when the roster changes.
  private assignRoles(configs: readonly PlayerConfig[]): void {
    const bots = configs.filter((c) => c.bot && !c.dummy)
    const signature = bots.map((c) => `${c.id}${c.team}`).join(',')
    if (signature === this.rolesFor) return
    this.rolesFor = signature
    const teams =
      this.view.mode === 'ffa'
        ? [bots]
        : ['blue', 'red'].map((t) => bots.filter((c) => c.team === t))
    for (const team of teams) {
      const roles = teamRoles(this.view.mode, team.length)
      team.forEach((config, i) => {
        this.brainFor(config).role = roles[i] ?? 'roam'
      })
    }
  }

  // The first life's primary for a bot that did not bring one.
  initialPrimary(
    config: PlayerConfig,
    configs: readonly PlayerConfig[],
    rng: Rng,
  ): WeaponId | undefined {
    if (!config.bot || config.dummy || config.primary) return undefined
    this.assignRoles(configs)
    const brain = this.brainFor(config)
    const mates = configs.filter((c) => c.team === config.team && c.id !== config.id)
    const sniper = mates.some(
      (c) => this.brains.get(c.id)?.nextPrimary === 'sniper' || c.primary === 'sniper',
    )
    const weapon = choosePrimary(rng, brain.role, config.bot.difficulty, sniper)
    brain.nextPrimary = weapon
    return weapon
  }

  think(
    ctx: MatchContext,
    heard: readonly GameEvent[],
    external: ReadonlyMap<number, InputFrame>,
  ): Map<number, InputFrame> {
    this.assignRoles([...ctx.players.values()].map((p) => p.config))
    for (const id of this.brains.keys()) if (!ctx.players.has(id)) this.brains.delete(id)
    this.queue = this.queue.filter((id) => this.brains.has(id))
    // A fresh lane for each team's attack with every respawn wave.
    if (ctx.mode === 'ctf' && ctx.tick % (CTF.waveSeconds * TICK_RATE) === 1)
      for (const team of ['blue', 'red'] as Team[])
        this.lanes[team] = LANES[Math.floor(ctx.rng.next() * LANES.length)]!
    this.invalidate(heard)
    this.plan(ctx)
    const frames = new Map<number, InputFrame>()
    for (const player of ctx.players.values()) {
      const config = player.config
      if (!config.bot || config.dummy || external.has(config.id)) continue
      const brain = this.brainFor(config)
      frames.set(config.id, thinkBot(this.env(ctx, config.bot.difficulty), player, brain, heard))
    }
    return frames
  }

  private env(ctx: MatchContext, difficulty: Difficulty): BotEnv {
    return {
      ctx,
      skill: BOT_SKILL[difficulty],
      nav: this.nav,
      rng: ctx.rng,
      hotspots: this.hotspots,
      brainOf: (id) => this.brains.get(id),
      laneOf: (team) => this.lanes[team],
      requestPath: (brain) => {
        brain.nav.status =
          brain.nav.status === 'idle' || brain.nav.status === 'direct'
            ? 'pending'
            : brain.nav.status
        if (!this.queue.includes(brain.id)) this.queue.push(brain.id)
      },
      choosePrimary: (brain, bot) => {
        const sniper = [...ctx.players.values()].some(
          (p) =>
            p !== bot &&
            p.config.team === bot.config.team &&
            (p.weapon.weapon === 'sniper' ||
              p.nextPrimary === 'sniper' ||
              this.brains.get(p.config.id)?.nextPrimary === 'sniper'),
        )
        return choosePrimary(ctx.rng, brain.role, bot.config.bot?.difficulty ?? 'soldier', sniper)
      },
    }
  }

  // A block that changed under, in or over a remaining path cell sends that bot back to plan.
  private invalidate(heard: readonly GameEvent[]): void {
    for (const event of heard) {
      if (event.type !== 'block') continue
      for (const brain of this.brains.values()) {
        const nav = brain.nav
        if (nav.status !== 'path' && nav.status !== 'partial') continue
        for (let i = nav.index; i < nav.path.length; i++) {
          const [x, y, z] = nav.path[i]!
          if (x === event.x && z === event.z && event.y >= y - 1 && event.y <= y + 1) {
            nav.status = 'idle'
            break
          }
        }
      }
    }
  }

  private plan(ctx: MatchContext): void {
    let budget: number = PLANNER.nodesPerTick
    while (this.queue.length > 0 && budget >= PLANNER.minPerSearch) {
      const id = this.queue.shift()!
      const brain = this.brains.get(id)
      const player = ctx.players.get(id)
      const dest = brain?.nav.dest
      if (!brain || !player || !player.alive || !dest) continue
      const nav = brain.nav
      const start = nearestStandable(this.nav, player.state.pos, 2)
      const goal = nearestStandable(this.nav, dest, 3)
      if (!start || !goal) {
        nav.status = 'direct'
        continue
      }
      const result = findPath(this.nav, start, goal, {
        maxNodes: Math.min(budget, PLANNER.maxPerSearch),
        weight: PLANNER.weight,
      })
      budget -= result.expanded
      nav.plannedTick = ctx.tick
      nav.index = 0
      if (result.status === 'none' || result.cells.length === 0) {
        nav.path = []
        nav.status = 'direct'
      } else {
        nav.path = result.cells
        nav.status = result.status === 'found' ? 'path' : 'partial'
      }
    }
    this.lastNodes = PLANNER.nodesPerTick - budget
  }

  stats(): BotStats[] {
    return [...this.brains.values()].map((b) => ({ id: b.id, ...b.stats }))
  }

  brain(id: number): BotBrain | undefined {
    return this.brains.get(id)
  }

  serialize(): BotDirectorState {
    return { brains: [...this.brains.values()], queue: [...this.queue], lanes: { ...this.lanes } }
  }

  restore(state: BotDirectorState): void {
    this.brains = new Map(state.brains.map((b) => [b.id, b]))
    this.queue = [...state.queue]
    this.lanes = { ...state.lanes }
  }
}

// Places worth roaming to in TDM and FFA: the ford in the middle, the high ground and the
// chests. Fixed by the map, so every bot (and player) can know them; picked on the blue half
// and mirrored, like the map.
function hotspots(view: WorldView): Vec3[] {
  const ground = (x: number, z: number): number => {
    let y = WORLD_SIZE.y - 2
    for (; y > 0; y--) {
      const id = view.world.getBlock(x, y, z)
      if (view.isSolid(x, y, z) && id !== BLOCK.leaves && id !== BLOCK.log) break
    }
    return y
  }
  const half = WORLD_SIZE.z / 2
  const x = WORLD_SIZE.x / 2
  const spots: Vec3[] = [[x + 0.5, ground(x, half) + 1, half]]
  const home = view.flags.blue.home
  const heights: { x: number; z: number; y: number }[] = []
  for (let z = 8; z < half; z += 4)
    for (let x = 8; x < WORLD_SIZE.x - 8; x += 4) {
      if (Math.hypot(home[0] - x, home[2] - z) < 16) continue
      const y = ground(x, z)
      if (view.isLiquid(x, y + 1, z)) continue
      heights.push({ x, z, y })
    }
  heights.sort((a, b) => b.y - a.y || a.z - b.z || a.x - b.x)
  const high: { x: number; z: number; y: number }[] = []
  for (const h of heights) {
    if (high.length >= 4) break
    if (high.some((o) => Math.hypot(o.x - h.x, o.z - h.z) < 20)) continue
    high.push(h)
  }
  for (const h of high) {
    spots.push([h.x + 0.5, h.y + 1, h.z + 0.5])
    spots.push([h.x + 0.5, h.y + 1, WORLD_SIZE.z - h.z - 0.5])
  }
  for (const chest of view.chests) spots.push([...chest.pos])
  return spots
}
