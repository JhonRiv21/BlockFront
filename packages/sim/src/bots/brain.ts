import { throwSpeed, throwVelocity } from '../combat/grenade.ts'
import { WEAPONS, type WeaponId } from '../combat/weapons.ts'
import { TICK_RATE, TICK_SECONDS, WORLD_SIZE } from '../config.ts'
import { BUTTON, createInputFrame, type InputFrame } from '../input.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { raycastVoxels } from '../raycast/dda.ts'
import type { Rng } from '../rng.ts'
import { CTF, enemyOf } from '../rules/ctf.ts'
import { isCarrying } from '../match/ctf-system.ts'
import type { MatchContext } from '../match/context.ts'
import { eyePosition, viewDirection, type PlayerEntity } from '../match/entities.ts'
import type { GameEvent, Team } from '../match/types.ts'
import {
  bearing,
  freshError,
  onTarget,
  trackError,
  turnToward,
  wrapAngle,
  type AimError,
} from './aim.ts'
import { DEG, type BotSkill } from './difficulty.ts'
import { nearestStandable, standable, type Cell, type NavWorld } from './navigation.ts'
import {
  canSee,
  headPoint,
  hearNoises,
  torsoPoint,
  visibleEnemies,
  type Noise,
} from './perception.ts'
import type { BotRole } from './roles.ts'
import {
  blockingCell,
  createNav,
  followPath,
  resetProgress,
  steerDirect,
  STUCK,
  stuckTicks,
  type NavState,
  type Steer,
} from './steering.ts'

// One bot's mind: everything it remembers is plain data, so a saved game carries it.
export interface Contact {
  id: number
  pos: Vec3
  crouching: boolean
  // Last tick it was seen and the tick the current sighting began.
  tick: number
  since: number
  visible: boolean
}

export interface ChestBelief {
  id: number
  full: boolean
  // -1 until the bot has seen it.
  seenTick: number
}

export type GoalKind =
  'combat' | 'heal' | 'survive' | 'ammo' | 'search' | 'objective' | 'noise' | 'roam' | 'unstick'

export interface Goal {
  kind: GoalKind
  pos: Vec3 | null
  score: number
}

export interface BotBrain {
  id: number
  role: BotRole
  alive: boolean
  // Primary picked for the next life, sent while dead.
  nextPrimary: WeaponId | ''
  target: number
  error: AimError
  head: boolean
  strafe: number
  strafeUntil: number
  grenadeTick: number
  throwPitch: number | null
  throwUntil: number
  contacts: Contact[]
  noises: Noise[]
  chests: ChestBelief[]
  goal: GoalKind | null
  // Roaming hotspot or patrol point, and when to pick another.
  wander: Vec3 | null
  wanderUntil: number
  unstick: Vec3 | null
  unstickUntil: number
  nav: NavState
  digging: Cell | null
  scan: number
  // Attackers wait at a staging point in front of the enemy base, then rush the flag together.
  stagedTick: number
  rushUntil: number
  // X of the river crossing this life's attack takes (the team's lane at spawn), and how far
  // along it the bot is: 0 to the near bank, 1 to the far bank, 2 crossed.
  lane: number
  laneStep: number
  stuckCounted: boolean
  // Ticks pushing on the ground without moving; a short one is a snag a hop clears.
  blocked: number
  stats: { stuckTicks: number; aliveTicks: number }
}

export function createBrain(id: number, role: BotRole, chestIds: number[]): BotBrain {
  return {
    id,
    role,
    alive: false,
    nextPrimary: '',
    target: 0,
    error: { yaw: 0, pitch: 0, lastYaw: 0, lastPitch: 0 },
    head: false,
    strafe: 1,
    strafeUntil: 0,
    grenadeTick: 0,
    throwPitch: null,
    throwUntil: 0,
    contacts: [],
    noises: [],
    chests: chestIds.map((chest) => ({ id: chest, full: false, seenTick: -1 })),
    goal: null,
    wander: null,
    wanderUntil: 0,
    unstick: null,
    unstickUntil: 0,
    nav: createNav(),
    digging: null,
    scan: 1,
    stagedTick: -1,
    rushUntil: 0,
    lane: WORLD_SIZE.x / 2,
    laneStep: 0,
    stuckCounted: false,
    blocked: 0,
    stats: { stuckTicks: 0, aliveTicks: 0 },
  }
}

// What the director gives every bot: the match, its skill and the shared services.
export interface BotEnv {
  ctx: MatchContext
  skill: BotSkill
  nav: NavWorld
  rng: Rng
  hotspots: readonly Vec3[]
  brainOf(id: number): BotBrain | undefined
  laneOf(team: Team): number
  requestPath(brain: BotBrain): void
  choosePrimary(brain: BotBrain, bot: PlayerEntity): WeaponId
}

export const BRAIN = {
  // A sighting that resumes within this many ticks keeps its reaction.
  reacquireTicks: 15,
  noiseSeconds: 8,
  lookAtNoiseSeconds: 1.5,
  hurtHp: 50,
  lowAmmo: 0.3,
  reloadBelow: 0.6,
  hysteresis: 0.05,
  arrive: 1.2,
  repathDistance: 4,
  repathTicks: 20,
  directRetryTicks: 3 * TICK_RATE,
  chestLookInterval: 6,
  wanderSeconds: 20,
  patrolSeconds: 6,
  unstickSeconds: 4,
  grenadeCooldownSeconds: 5,
  grenadeRetrySeconds: 2,
  grenadeRange: [11, 26] as [number, number],
  scanSpeed: 60 * DEG,
  fireRange: 70,
  attackerFightRange: 12,
  // The flag is close enough to go for it at once.
  grabRange: 12,
  stageRange: 24,
  escortGap: 4,
  laneBank: 14.5,
  heldRadius: 16,
  carrierFightRange: 12,
  // On an errand, a lost enemy closer than this is still worth watching for.
  preAimRange: 12,
  hipRangeFactor: 0.5,
  snagSpeed: 0.6,
  snagTicks: 8,
  stageSideways: 6,
  stageWaitSeconds: 12,
  // Seconds into the respawn wave to reach the flag, and the speed the estimate assumes.
  arriveWindow: [3.5, 5.5] as [number, number],
  lateArrival: 6.5,
  rushSpeed: 3.5,
  rushSeconds: 12,
} as const

const EFFECTIVE_RANGE: Record<WeaponId, number> = {
  shotgun: 9,
  smg: 20,
  pistol: 18,
  carbine: 32,
  rifle: 45,
  sniper: 70,
}

const SHOTGUN_FIRE_RANGE = 22
const SAFE_EXTENT = 1

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2])
}

function reactionTicks(skill: BotSkill): number {
  return Math.ceil(skill.reactionSeconds * TICK_RATE - 1e-9)
}

export function onDeath(brain: BotBrain): void {
  brain.alive = false
  brain.target = 0
  brain.contacts = []
  brain.noises = []
  brain.goal = null
  brain.wander = null
  brain.unstick = null
  brain.digging = null
  brain.throwPitch = null
  brain.nav = createNav()
  brain.nextPrimary = ''
  brain.stagedTick = -1
  brain.rushUntil = 0
}

function onSpawn(env: BotEnv, brain: BotBrain, bot: PlayerEntity, tick: number): void {
  brain.alive = true
  brain.lane = env.laneOf(bot.config.team)
  brain.laneStep = 0
  brain.nav = createNav()
  resetProgress(brain.nav, bot.state.pos, tick)
  brain.stuckCounted = false
}

// Sight, hearing and chests for this tick; the contacts are all the brain knows of enemies.
function perceive(env: BotEnv, bot: PlayerEntity, brain: BotBrain, heard: readonly GameEvent[]) {
  const { ctx, skill } = env
  const tick = ctx.tick
  const ownFlag = ctx.mode === 'ctf' ? ctx.flags[bot.config.team] : null
  const carrierId = ownFlag?.state === 'carried' ? ownFlag.carrier : 0
  const seen = visibleEnemies(ctx, bot, skill.fovDegrees, carrierId)
  for (const contact of brain.contacts) contact.visible = false
  for (const enemy of seen) {
    const known = brain.contacts.find((c) => c.id === enemy.id)
    if (known) {
      if (tick - known.tick > BRAIN.reacquireTicks) known.since = tick
      known.pos = enemy.pos
      known.crouching = enemy.crouching
      known.tick = tick
      known.visible = true
    } else
      brain.contacts.push({
        id: enemy.id,
        pos: enemy.pos,
        crouching: enemy.crouching,
        tick,
        since: tick,
        visible: true,
      })
  }
  // A death seen happen ends the memory of that enemy.
  for (const event of heard) {
    if (event.type !== 'death') continue
    brain.contacts = brain.contacts.filter((c) => c.id !== event.victim || tick - c.tick > 1)
  }
  const memory = skill.memorySeconds * TICK_RATE
  brain.contacts = brain.contacts.filter((c) => tick - c.tick <= memory)

  const noises = hearNoises(ctx, bot, heard, env.rng)
  if (noises.length) brain.noises.push(...noises)
  const noiseLimit = BRAIN.noiseSeconds * TICK_RATE
  brain.noises = brain.noises.filter((n) => tick - n.tick <= noiseLimit).slice(-6)

  for (const event of heard) {
    if (event.type !== 'loot' || event.player !== bot.config.id) continue
    const belief = brain.chests.find((b) => b.id === event.chest)
    if (belief) {
      belief.full = false
      belief.seenTick = tick
    }
  }
  if ((tick + bot.config.id) % BRAIN.chestLookInterval === 0) {
    const eye = eyePosition(bot)
    for (const chest of ctx.chests) {
      const point: Vec3 = [chest.pos[0], chest.pos[1] + 0.4, chest.pos[2]]
      if (!canSee(ctx.isSolid, eye, bot.yaw, bot.pitch, skill.fovDegrees, point)) continue
      const belief = brain.chests.find((b) => b.id === chest.id)
      if (belief) {
        belief.full = chest.full
        belief.seenTick = tick
      }
    }
  }
  return seen.length
}

// The enemy to fight: only one seen for at least the reaction time, the current one first.
function pickTarget(env: BotEnv, bot: PlayerEntity, brain: BotBrain): Contact | null {
  const tick = env.ctx.tick
  const ready = brain.contacts.filter(
    (c) => c.visible && tick - c.since >= reactionTicks(env.skill),
  )
  if (ready.length === 0) {
    brain.target = 0
    return null
  }
  const current = ready.find((c) => c.id === brain.target)
  const eye = eyePosition(bot)
  const chosen =
    current ??
    ready.reduce((best, c) => {
      const d = horizontal(c.pos, eye)
      const bd = horizontal(best.pos, eye)
      return d < bd ? c : best
    })
  const aimPoint = (c: Contact) => (brain.head ? headPoint : torsoPoint)(c.pos, c.crouching)
  if (chosen.id !== brain.target) {
    brain.target = chosen.id
    brain.head = env.rng.next() < env.skill.headshotChance
    const b = bearing(eye, aimPoint(chosen))
    brain.error = freshError(env.rng, env.skill, b.yaw, b.pitch)
    brain.grenadeTick = Math.max(brain.grenadeTick, tick + reactionTicks(env.skill))
  } else {
    const b = bearing(eye, aimPoint(chosen))
    trackError(brain.error, env.rng, env.skill, b.yaw, b.pitch)
  }
  return chosen
}

function believedFull(belief: ChestBelief, tick: number): number {
  if (belief.seenTick < 0) return 1.5
  if (belief.full) return 1
  // Seen empty: it comes back after its refill time, which any player can learn.
  return tick - belief.seenTick > 30 * TICK_RATE ? 1.5 : 0
}

// Nearest place to stock up: a chest believed full (seen full beats unseen) or the own base.
function supplyPoint(env: BotEnv, bot: PlayerEntity, brain: BotBrain): Vec3 | null {
  const { ctx } = env
  const pos = bot.state.pos
  let best: Vec3 | null = null
  let bestCost = Infinity
  for (const chest of ctx.chests) {
    const belief = brain.chests.find((b) => b.id === chest.id)
    const penalty = belief ? believedFull(belief, ctx.tick) : 1.5
    if (penalty === 0) continue
    const cost = horizontal(pos, chest.pos) * penalty
    if (cost < bestCost) {
      bestCost = cost
      best = chest.pos
    }
  }
  if (ctx.mode !== 'ffa') {
    const home = ctx.flags[bot.config.team].home
    // Waiting for the base restock counts as walking at about 4 blocks a second.
    const restockIn = CTF.restockSeconds * TICK_RATE - (ctx.tick - bot.lastRestockTick)
    const cost = horizontal(pos, home) + Math.max(0, restockIn) * TICK_SECONDS * 4
    if (cost < bestCost) best = home
  }
  return best
}

// A dry standable spot min..max blocks from center, no more than 2 blocks off `level`, so it
// is not the top of a wall or a tower.
function randomPointNear(env: BotEnv, center: Vec3, min: number, max: number, level: number): Vec3 {
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = env.rng.next() * Math.PI * 2
    const r = min + env.rng.next() * (max - min)
    const x = Math.min(WORLD_SIZE.x - 3, Math.max(2, center[0] + Math.cos(angle) * r))
    const z = Math.min(WORLD_SIZE.z - 3, Math.max(2, center[2] + Math.sin(angle) * r))
    const cell = nearestStandable(env.nav, [x, level, z], 2)
    if (!cell || env.nav.isLiquid(cell[0], cell[1], cell[2]) || Math.abs(cell[1] - level) > 2)
      continue
    return [cell[0] + 0.5, cell[1], cell[2] + 0.5]
  }
  return [...center]
}

// TDM and FFA: a hotspot weighted toward the closer ones and the middle of the map; in TDM
// also toward the enemy half, where its players come from (but not into its base).
function pickHotspot(env: BotEnv, bot: PlayerEntity): Vec3 {
  const { ctx } = env
  const pos = bot.state.pos
  const middle: Vec3 = [WORLD_SIZE.x / 2, 0, WORLD_SIZE.z / 2]
  const own = ctx.flags[bot.config.team].home
  const theirs = ctx.flags[enemyOf(bot.config.team)].home
  const weights = env.hotspots.map((spot) => {
    if (horizontal(spot, pos) < 6) return 0
    let w = 1 / (1 + horizontal(spot, pos) / 40) / (1 + horizontal(spot, middle) / 30)
    if (ctx.mode === 'tdm') {
      if (horizontal(spot, theirs) < CTF.baseRadius + 4) return 0
      const progress = (spot[2] - own[2]) / (theirs[2] - own[2])
      w *= 1 + 2 * Math.min(1, Math.max(0, progress))
    }
    return w
  })
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = env.rng.next() * total
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!
    if (roll < 0) return env.hotspots[i]!
  }
  return env.hotspots[0] ?? middle
}

function wanderPoint(env: BotEnv, bot: PlayerEntity, brain: BotBrain, center: Vec3 | null): Vec3 {
  const tick = env.ctx.tick
  const reached = brain.wander !== null && horizontal(brain.wander, bot.state.pos) < 2.5
  if (brain.wander && !reached && tick < brain.wanderUntil) return brain.wander
  if (center) {
    brain.wander = randomPointNear(env, center, 4, 14, bot.state.pos[1])
    brain.wanderUntil = tick + BRAIN.patrolSeconds * TICK_RATE
  } else {
    brain.wander = pickHotspot(env, bot)
    brain.wanderUntil = tick + BRAIN.wanderSeconds * TICK_RATE
  }
  return brain.wander
}

// The mode's objective for this bot's role (CTF), from what the team knows: both flags (the
// compass shows them) and its own players.
function objective(env: BotEnv, bot: PlayerEntity, brain: BotBrain): Goal | null {
  const { ctx } = env
  if (ctx.mode !== 'ctf') return null
  const team = bot.config.team
  const own = ctx.flags[team]
  const theirs = ctx.flags[enemyOf(team)]
  if (isCarrying(ctx, bot)) return { kind: 'objective', pos: own.home, score: 0.95 }
  if (rushing(env, bot, brain)) {
    // Too slow to grab the flag before the next wave lands on it: back off and try again.
    if (theirs.state === 'base' && ctx.tick < brain.rushUntil && lateArrival(env, bot, theirs.home))
      brain.rushUntil = 0
    else return { kind: 'objective', pos: theirs.pos, score: 0.95 }
  }
  const ownAway = own.state !== 'base'
  const allyCarrier = theirs.state === 'carried' ? ctx.players.get(theirs.carrier) : undefined
  const escort = allyCarrier ? allyCarrier.state.pos : null
  switch (brain.role) {
    case 'attack':
      if (escort) return { kind: 'objective', pos: escort, score: 0.55 }
      return { kind: 'objective', pos: stage(env, bot, brain), score: 0.62 }
    case 'defend':
      if (ownAway) return { kind: 'objective', pos: own.pos, score: 0.75 }
      return { kind: 'objective', pos: wanderPoint(env, bot, brain, own.home), score: 0.45 }
    case 'flex': {
      // Escort: the allied carrier first, otherwise the nearest attacker on its way.
      if (ownAway) return { kind: 'objective', pos: own.pos, score: 0.72 }
      if (escort) return { kind: 'objective', pos: escort, score: 0.6 }
      const lead = nearestAttacker(env, bot)
      if (lead && horizontal(lead, bot.state.pos) > BRAIN.escortGap)
        return { kind: 'objective', pos: lead, score: 0.5 }
      if (lead) return { kind: 'objective', pos: null, score: 0.5 }
      return { kind: 'objective', pos: stage(env, bot, brain), score: 0.45 }
    }
    default:
      return null
  }
}

// The carrier running home, or an attacker going for the enemy flag whatever stands in the
// way: on a rush, near enough to grab it, or after a dropped one.
function rushing(env: BotEnv, bot: PlayerEntity, brain: BotBrain): boolean {
  const { ctx } = env
  if (ctx.mode !== 'ctf') return false
  if (isCarrying(ctx, bot)) return true
  const theirs = ctx.flags[enemyOf(bot.config.team)]
  if (brain.role !== 'attack' || theirs.state === 'carried') return false
  const distance = horizontal(theirs.pos, bot.state.pos)
  return (
    ctx.tick < brain.rushUntil ||
    distance < BRAIN.grabRange ||
    (theirs.state === 'dropped' && distance < BRAIN.stageRange * 1.5)
  )
}

function groundNear(env: BotEnv, spot: Vec3): Vec3 {
  const cell = nearestStandable(env.nav, spot, 3)
  return cell ? [cell[0] + 0.5, cell[1], cell[2] + 0.5] : spot
}

// Side lanes cross the river away from the ford: first the near bank, then the far one.
function laneWaypoint(env: BotEnv, bot: PlayerEntity, brain: BotBrain): Vec3 | null {
  if (Math.abs(brain.lane - WORLD_SIZE.x / 2) < 1 || brain.laneStep >= 2) return null
  const { ctx } = env
  const own = ctx.flags[bot.config.team].home
  const theirs = ctx.flags[enemyOf(bot.config.team)].home
  const forward = Math.sign(theirs[2] - own[2])
  // The mirror line of the map: cell z and 127 - z sit at the same distance from it.
  const riverZ = WORLD_SIZE.z / 2
  const side = brain.laneStep === 0 ? -1 : 1
  const waypoint = groundNear(env, [brain.lane, own[1], riverZ + side * forward * BRAIN.laneBank])
  const passed = (bot.state.pos[2] - waypoint[2]) * forward > 0
  if (passed || horizontal(waypoint, bot.state.pos) < 4) {
    brain.laneStep++
    return laneWaypoint(env, bot, brain)
  }
  return waypoint
}

// Ticks into a respawn wave at which a rush from here would reach the flag.
function arrivalPhase(env: BotEnv, bot: PlayerEntity, flag: Vec3): number {
  const eta = (horizontal(flag, bot.state.pos) / BRAIN.rushSpeed) * TICK_RATE
  return (env.ctx.tick + eta) % (CTF.waveSeconds * TICK_RATE)
}

function lateArrival(env: BotEnv, bot: PlayerEntity, flag: Vec3): boolean {
  if (horizontal(flag, bot.state.pos) < BRAIN.grabRange) return false
  return arrivalPhase(env, bot, flag) > BRAIN.lateArrival * TICK_RATE
}

function nearestAttacker(env: BotEnv, bot: PlayerEntity): Vec3 | null {
  let best: Vec3 | null = null
  let bestDistance = Infinity
  for (const other of env.ctx.players.values()) {
    if (other === bot || !other.alive || other.config.team !== bot.config.team) continue
    if (env.brainOf(other.config.id)?.role !== 'attack') continue
    const distance = horizontal(other.state.pos, bot.state.pos)
    if (distance < bestDistance) {
      bestDistance = distance
      best = other.state.pos
    }
  }
  return best
}

// Where an attacker gathers before the rush, and the decision to go: right after a respawn
// wave (the schedule is the same for everyone), when a teammate goes, or after a long wait.
function stage(env: BotEnv, bot: PlayerEntity, brain: BotBrain): Vec3 {
  const { ctx } = env
  const tick = ctx.tick
  const team = bot.config.team
  const theirs = ctx.flags[enemyOf(team)]
  const toward = Math.sign(ctx.flags[team].home[2] - theirs.home[2])
  const side = brain.id % 2 === 0 ? 1 : -1
  const spot: Vec3 = [
    theirs.home[0] + side * BRAIN.stageSideways,
    theirs.home[1],
    theirs.home[2] + toward * BRAIN.stageRange,
  ]
  const via = laneWaypoint(env, bot, brain)
  if (via) return via
  const point = groundNear(env, spot)
  if (horizontal(point, bot.state.pos) > 4) {
    brain.stagedTick = -1
    return point
  }
  if (brain.stagedTick < 0) brain.stagedTick = tick
  // Arrive once the last wave has left the base and before the next one: the respawn schedule
  // is the same for everyone.
  const phase = arrivalPhase(env, bot, theirs.home)
  const freshWave =
    phase >= BRAIN.arriveWindow[0] * TICK_RATE && phase <= BRAIN.arriveWindow[1] * TICK_RATE
  const mateGoes = [...ctx.players.values()].some(
    (p) =>
      p !== bot &&
      p.config.team === team &&
      (env.brainOf(p.config.id)?.rushUntil ?? 0) > tick &&
      env.brainOf(p.config.id)?.role === 'attack',
  )
  // A teammate still on the way is worth waiting for: two rush better than one.
  const mateComing = [...ctx.players.values()].some((p) => {
    const mate = env.brainOf(p.config.id)
    if (p === bot || !p.alive || p.config.team !== team || mate?.role !== 'attack') return false
    const away = horizontal(p.state.pos, theirs.home)
    return mate.stagedTick < 0 && mate.rushUntil <= tick && away > BRAIN.stageRange + 4 && away < 70
  })
  const waited = tick - brain.stagedTick > BRAIN.stageWaitSeconds * TICK_RATE
  // Never into a base it knows is held: an enemy remembered near the flag waits for the fight.
  const held = brain.contacts.some((c) => horizontal(c.pos, theirs.home) < BRAIN.heldRadius)
  const fit = bot.hp >= BRAIN.hurtHp || bot.bandages === 0
  if (!held && fit && (mateGoes || waited || (freshWave && !mateComing))) {
    brain.rushUntil = tick + BRAIN.rushSeconds * TICK_RATE
    brain.stagedTick = -1
  }
  return point
}

function decide(
  env: BotEnv,
  bot: PlayerEntity,
  brain: BotBrain,
  engaged: Contact | null,
  visible: number,
): Goal {
  const { ctx } = env
  const tick = ctx.tick
  const carrying = rushing(env, bot, brain)
  const options: Goal[] = []
  if (brain.unstick && tick < brain.unstickUntil)
    options.push({ kind: 'unstick', pos: brain.unstick, score: 0.85 })
  if (engaged) {
    // Attackers shoot on the move unless the enemy is close; the carrier never stops.
    const far = horizontal(engaged.pos, bot.state.pos) > BRAIN.attackerFightRange
    const score = carrying ? 0.3 : brain.role === 'attack' && far ? 0.5 : 0.8
    options.push({ kind: 'combat', pos: engaged.pos, score })
  }
  if (bot.hp < BRAIN.hurtHp && !carrying) {
    if (bot.bandages > 0 && visible === 0) options.push({ kind: 'heal', pos: null, score: 0.9 })
    else if (bot.bandages === 0) {
      const supply = supplyPoint(env, bot, brain)
      if (supply) options.push({ kind: 'survive', pos: supply, score: 0.65 })
    }
  }
  const spec = WEAPONS[bot.weapon.weapon]
  const ammo = (bot.weapon.mag + bot.weapon.reserve) / (spec.magazine + spec.reserve)
  if (ammo < BRAIN.lowAmmo && !carrying) {
    const supply = supplyPoint(env, bot, brain)
    if (supply) options.push({ kind: 'ammo', pos: supply, score: 0.6 })
  }
  const lost = brain.contacts
    .filter((c) => !c.visible)
    .reduce<Contact | null>((best, c) => (!best || c.tick > best.tick ? c : best), null)
  if (lost && !carrying) options.push({ kind: 'search', pos: lost.pos, score: 0.5 })
  const goal = objective(env, bot, brain)
  if (goal) options.push(goal)
  const noise = brain.noises[brain.noises.length - 1]
  if (noise && !carrying) {
    const score = ctx.mode === 'ctf' ? (brain.role === 'attack' ? 0 : 0.4) : 0.42
    if (score > 0) options.push({ kind: 'noise', pos: noise.pos, score })
  }
  if (ctx.mode !== 'ctf')
    options.push({ kind: 'roam', pos: wanderPoint(env, bot, brain, null), score: 0.3 })
  let best: Goal = { kind: 'roam', pos: null, score: -1 }
  for (const option of options) {
    const score = option.score + (option.kind === brain.goal ? BRAIN.hysteresis : 0)
    const bestScore = best.score + (best.kind === brain.goal ? BRAIN.hysteresis : 0)
    if (score > bestScore) best = option
  }
  brain.goal = best.kind
  return best
}

// Path toward dest through the shared planner; walks straight while a search is pending or
// when there is no route.
function navigate(env: BotEnv, bot: PlayerEntity, brain: BotBrain, dest: Vec3): Steer | null {
  const nav = brain.nav
  const tick = env.ctx.tick
  if (horizontal(bot.state.pos, dest) < BRAIN.arrive && Math.abs(bot.state.pos[1] - dest[1]) < 2)
    return null
  const moved = nav.dest === null || horizontal(nav.dest, dest) > BRAIN.repathDistance
  const due = tick - nav.plannedTick >= BRAIN.repathTicks
  const retry = nav.status === 'direct' && tick - nav.plannedTick >= BRAIN.directRetryTicks
  if (nav.status === 'idle' || (moved && due) || retry) {
    nav.dest = [...dest]
    nav.plannedTick = tick
    env.requestPath(brain)
  }
  if (nav.status === 'path' || nav.status === 'partial') {
    const steer = followPath(nav, bot.state)
    if (steer.replan && due) {
      nav.plannedTick = tick
      env.requestPath(brain)
    }
    if (steer.dir) return steer
  }
  return steerDirect(bot.state, dest)
}

// Sideways relative to the target, flipping now and then and never off a ledge or into water.
function strafeDir(
  env: BotEnv,
  bot: PlayerEntity,
  brain: BotBrain,
  target: Vec3,
): [number, number] {
  const tick = env.ctx.tick
  if (tick >= brain.strafeUntil) {
    brain.strafe = env.rng.next() < 0.5 ? -1 : 1
    brain.strafeUntil = tick + Math.round((0.4 + env.rng.next() * 0.8) * TICK_RATE)
  }
  const pos = bot.state.pos
  const dx = target[0] - pos[0]
  const dz = target[2] - pos[2]
  const length = Math.hypot(dx, dz) || 1
  const side = (sign: number): [number, number] => [(-dz / length) * sign, (dx / length) * sign]
  const safe = (dir: [number, number]) => {
    const x = Math.floor(pos[0] + dir[0] * SAFE_EXTENT)
    const z = Math.floor(pos[2] + dir[1] * SAFE_EXTENT)
    const y = Math.floor(pos[1] + 0.05)
    const ok = standable(env.nav, x, y, z) || standable(env.nav, x, y - 1, z)
    return ok && !env.nav.isLiquid(x, y, z)
  }
  let dir = side(brain.strafe)
  if (!safe(dir)) {
    brain.strafe = -brain.strafe
    dir = side(brain.strafe)
    if (!safe(dir)) return [0, 0]
  }
  return dir
}

// Lowest launch pitch of the quick throw whose arc comes down at the target's distance.
export function grenadePitch(bot: PlayerEntity, yaw: number, target: Vec3): number | null {
  const eye = eyePosition(bot)
  const distance = horizontal(eye, target)
  const drop = eye[1] - target[1]
  let best: number | null = null
  let bestError = 1.5
  for (let pitch = -0.3; pitch <= 1.0; pitch += 0.04) {
    const v = throwVelocity(yaw, pitch, throwSpeed(0.4), bot.state.vel, false)
    const vh = Math.hypot(v[0], v[2])
    const disc = v[1] * v[1] + 56 * drop
    if (disc < 0) continue
    const time = (v[1] + Math.sqrt(disc)) / 28
    const error = Math.abs(vh * time - distance)
    if (error < bestError) {
      bestError = error
      best = pitch
    }
  }
  return best
}

function allyNear(env: BotEnv, bot: PlayerEntity, pos: Vec3, radius: number): boolean {
  if (env.ctx.mode === 'ffa') return false
  for (const other of env.ctx.players.values()) {
    if (other === bot || !other.alive || other.config.team !== bot.config.team) continue
    if (horizontal(other.state.pos, pos) < radius) return true
  }
  return false
}

export function thinkBot(
  env: BotEnv,
  bot: PlayerEntity,
  brain: BotBrain,
  heard: readonly GameEvent[],
): InputFrame {
  const { ctx, skill } = env
  const tick = ctx.tick
  const frame = createInputFrame()
  frame.seq = tick
  frame.yaw = bot.yaw
  frame.pitch = bot.pitch
  frame.slot = bot.slot
  frame.blockColor = bot.blockColor
  if (!bot.alive) {
    if (brain.alive) onDeath(brain)
    if (!brain.nextPrimary) brain.nextPrimary = env.choosePrimary(brain, bot)
    frame.primary = brain.nextPrimary
    return frame
  }
  if (!brain.alive) onSpawn(env, brain, bot, tick)
  brain.stats.aliveTicks++

  const visible = perceive(env, bot, brain, heard)
  const engaged = pickTarget(env, bot, brain)
  const goal = decide(env, bot, brain, engaged, visible)
  const state = bot.state
  const eye = eyePosition(bot)

  // Movement, in world space.
  let steer: Steer | null = null
  let moving = false
  if (goal.kind === 'combat' && engaged) {
    const gun = bot.slot === 2 ? bot.pistol.weapon : bot.weapon.weapon
    // Without sights a bot closes in before it settles into a firefight.
    const range = EFFECTIVE_RANGE[gun] * (skill.adsBeyond === null ? BRAIN.hipRangeFactor : 1)
    if (horizontal(engaged.pos, state.pos) > range) {
      steer = navigate(env, bot, brain, engaged.pos)
      moving = steer !== null
    } else if (skill.strafes) {
      steer = { dir: strafeDir(env, bot, brain, engaged.pos), jump: state.inWater, replan: false }
    }
  } else if (goal.kind !== 'heal' && goal.pos) {
    steer = navigate(env, bot, brain, goal.pos)
    moving = steer !== null
    if (!steer && goal.kind === 'unstick') brain.unstick = null
    // No route to a hunch (a noise, a lost enemy, a hotspot): drop it rather than walk into
    // whatever is in the way.
    const failed =
      brain.nav.status === 'direct' &&
      brain.nav.dest !== null &&
      horizontal(brain.nav.dest, goal.pos) <= BRAIN.repathDistance
    if (failed && forget(brain, goal)) {
      steer = null
      moving = false
    }
  }
  const dir = steer?.dir ?? null
  let jump = steer?.jump ?? false
  const hurry = rushing(env, bot, brain)
  // A carrier with a distant enemy behind it runs instead of turning round to fight.
  let fight = engaged
  if (fight && hurry && dir && horizontal(fight.pos, state.pos) > BRAIN.carrierFightRange) {
    const toward = bearing(state.pos, fight.pos).yaw
    if (Math.abs(wrapAngle(toward - Math.atan2(-dir[0], -dir[1]))) > Math.PI / 2) fight = null
  }

  // Stuck: jump at 2 s, dig at 3 s, another destination at 5 s.
  const stuck = stuckTicks(brain.nav, state.pos, tick, moving)
  if (stuck >= STUCK.jumpTicks) {
    brain.stats.stuckTicks += brain.stuckCounted ? 1 : STUCK.jumpTicks
    brain.stuckCounted = true
  } else brain.stuckCounted = false
  if (stuck >= STUCK.giveUpTicks) {
    brain.unstick = randomPointNear(env, state.pos, 5, 12, state.pos[1])
    brain.unstickUntil = tick + BRAIN.unstickSeconds * TICK_RATE
    brain.digging = null
    brain.nav.status = 'idle'
    resetProgress(brain.nav, state.pos, tick)
  } else if (stuck >= STUCK.digTicks && dir && !brain.digging) {
    brain.digging = blockingCell(env.nav, state, dir)
  } else if (stuck >= STUCK.jumpTicks && !brain.digging) jump = true
  // Free again (or the block is gone): back to the gun.
  if (brain.digging && (stuck < STUCK.jumpTicks || !ctx.isSolid(...brain.digging)))
    brain.digging = null
  const speed = Math.hypot(state.vel[0], state.vel[2])
  brain.blocked = moving && dir && state.onGround && speed < BRAIN.snagSpeed ? brain.blocked + 1 : 0
  if (brain.blocked >= BRAIN.snagTicks && !brain.digging) jump = true

  // Where to look.
  const turnStep = skill.turnDegreesPerSecond * DEG * TICK_SECONDS
  let look: { yaw: number; pitch: number }
  let step = turnStep
  if (brain.digging) {
    const [x, y, z] = brain.digging
    look = bearing(eye, [x + 0.5, y + 0.5, z + 0.5])
  } else if (fight) {
    const point = (brain.head ? headPoint : torsoPoint)(fight.pos, fight.crouching)
    const b = bearing(eye, point)
    look = { yaw: b.yaw + brain.error.yaw, pitch: b.pitch + brain.error.pitch }
    if (brain.throwPitch !== null) look = { yaw: b.yaw, pitch: brain.throwPitch }
  } else {
    const lost = brain.contacts.find((c) => !c.visible && horizontal(c.pos, state.pos) < 25)
    const noise = brain.noises[brain.noises.length - 1]
    const recentNoise = noise && tick - noise.tick <= BRAIN.lookAtNoiseSeconds * TICK_RATE
    const errand = goal.kind === 'objective' || goal.kind === 'survive' || goal.kind === 'ammo'
    const close = lost && horizontal(lost.pos, state.pos) < BRAIN.preAimRange
    if ((hurry || (errand && !close)) && dir) look = { yaw: Math.atan2(-dir[0], -dir[1]), pitch: 0 }
    else if (lost) look = bearing(eye, headPoint(lost.pos, lost.crouching))
    else if (recentNoise) look = bearing(eye, [noise.pos[0], eye[1], noise.pos[2]])
    else if (dir && (dir[0] !== 0 || dir[1] !== 0))
      look = { yaw: Math.atan2(-dir[0], -dir[1]), pitch: 0 }
    else if (brain.stagedTick >= 0 && ctx.mode === 'ctf') {
      // Waiting in front of the enemy base: watch it, sweeping side to side.
      const flag = ctx.flags[enemyOf(bot.config.team)].home
      look = { yaw: bearing(eye, flag).yaw + Math.sin(tick / 25) * 0.6, pitch: 0 }
      step = Math.min(turnStep, BRAIN.scanSpeed * TICK_SECONDS)
    } else {
      look = { yaw: bot.yaw + brain.scan, pitch: 0 }
      step = Math.min(turnStep, BRAIN.scanSpeed * TICK_SECONDS)
      if ((tick + brain.id * 37) % (4 * TICK_RATE) === 0) brain.scan = -brain.scan
    }
  }
  const view = turnToward(bot.yaw, bot.pitch, look.yaw, look.pitch, step)
  frame.yaw = view.yaw
  frame.pitch = view.pitch

  if (dir) {
    const sin = Math.sin(view.yaw)
    const cos = Math.cos(view.yaw)
    frame.forward = dir[0] * -sin + dir[1] * -cos
    frame.strafe = dir[0] * cos + dir[1] * -sin
  }
  if (jump) frame.buttons |= BUTTON.jump
  const calm = !fight && !brain.contacts.some((c) => tick - c.tick < TICK_RATE)
  // On an errand (objective, supplies) only an enemy in sight stops the sprint.
  const errand = goal.kind === 'objective' || goal.kind === 'survive' || goal.kind === 'ammo'
  const sprintable = frame.forward > 0.7 && !state.inWater && !brain.digging
  if (moving && (calm || (errand && !fight)) && sprintable) frame.buttons |= BUTTON.sprint

  // Hands: shovel to dig, bandage to heal, otherwise a gun with rounds in it.
  const primaryEmpty = bot.weapon.mag === 0 && bot.weapon.reserve === 0
  const pistolEmpty = bot.pistol.mag === 0 && bot.pistol.reserve === 0
  if (brain.digging) frame.slot = 3
  else if (goal.kind === 'heal' && bot.bandages > 0) frame.slot = 8
  else frame.slot = primaryEmpty && !pistolEmpty ? 2 : 1

  if (brain.digging && bot.slot === 3) {
    // Whatever solid the swing reaches next to the block in the way is in the way too.
    const [x, y, z] = brain.digging
    const hit = raycastVoxels(ctx.isSolid, eye, viewDirection(view.yaw, view.pitch), 4.5)
    const feet = Math.floor(state.pos[1] + 0.05)
    const near = hit && Math.abs(hit.x - x) + Math.abs(hit.z - z) <= 1 && Math.abs(hit.y - y) <= 1
    if (hit && near && hit.y >= feet && hit.y <= feet + 1) {
      brain.digging = [hit.x, hit.y, hit.z]
      frame.buttons |= BUTTON.fire
    }
  } else if (goal.kind === 'heal' && bot.slot === 8) {
    frame.buttons |= BUTTON.fire
  } else if (bot.slot === 1 || bot.slot === 2) {
    const gun = bot.slot === 1 ? bot.weapon : bot.pistol
    const spec = WEAPONS[gun.weapon]
    if (fight) {
      const distance = horizontal(fight.pos, state.pos)
      const wantsAds =
        skill.adsBeyond !== null && (distance > skill.adsBeyond || gun.weapon === 'sniper')
      if (wantsAds) frame.buttons |= BUTTON.alt
      const steady = !wantsAds || bot.ads >= 0.9
      const range = gun.weapon === 'shotgun' ? SHOTGUN_FIRE_RANGE : BRAIN.fireRange
      const aimed = onTarget(eye, view.yaw, view.pitch, fight.pos, fight.crouching, range)
      const trigger = spec.automatic || !(bot.lastButtons & BUTTON.fire)
      if (aimed && steady && trigger && gun.cooldown <= TICK_SECONDS && brain.throwPitch === null)
        frame.buttons |= BUTTON.fire
      considerGrenade(env, bot, brain, fight, distance)
    } else if (
      calm &&
      gun.reserve > 0 &&
      !gun.reloading &&
      gun.mag < spec.magazine * BRAIN.reloadBelow
    ) {
      frame.buttons |= BUTTON.reload
    }
  }
  if (fight && brain.throwPitch !== null) {
    const b = bearing(eye, fight.pos)
    const aligned =
      Math.abs(wrapAngle(view.yaw - b.yaw)) < 3 * DEG &&
      Math.abs(view.pitch - brain.throwPitch) < 3 * DEG
    if (aligned) {
      frame.buttons |= BUTTON.grenade
      brain.throwPitch = null
    } else if (tick > brain.throwUntil) brain.throwPitch = null
  } else brain.throwPitch = null
  return frame
}

function forget(brain: BotBrain, goal: Goal): boolean {
  const pos = goal.pos
  if (!pos) return false
  if (goal.kind === 'noise') brain.noises = []
  else if (goal.kind === 'search')
    brain.contacts = brain.contacts.filter((c) => c.visible || c.pos !== pos)
  else if (goal.kind === 'roam') brain.wander = null
  else return false
  brain.nav.status = 'idle'
  return true
}

function considerGrenade(
  env: BotEnv,
  bot: PlayerEntity,
  brain: BotBrain,
  engaged: Contact,
  distance: number,
): void {
  const tick = env.ctx.tick
  const [near, far] = BRAIN.grenadeRange
  if (env.skill.grenadeChance <= 0 || bot.grenades <= 0 || brain.throwPitch !== null) return
  if (tick < brain.grenadeTick || bot.state.inWater || distance < near || distance > far) return
  if (rushing(env, bot, brain)) return
  if (env.rng.next() >= env.skill.grenadeChance || allyNear(env, bot, engaged.pos, 5)) {
    brain.grenadeTick = tick + BRAIN.grenadeRetrySeconds * TICK_RATE
    return
  }
  brain.grenadeTick = tick + BRAIN.grenadeCooldownSeconds * TICK_RATE
  const pitch = grenadePitch(bot, bearing(eyePosition(bot), engaged.pos).yaw, engaged.pos)
  if (pitch === null) return
  brain.throwPitch = pitch
  brain.throwUntil = tick + TICK_RATE
}
