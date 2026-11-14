import { PLAYER } from '../physics/player-controller.ts'
import type { SolidTest, Vec3 } from '../physics/sweep.ts'
import { raycastVoxels } from '../raycast/dda.ts'
import type { Rng } from '../rng.ts'
import type { MatchContext } from '../match/context.ts'
import { eyePosition, isEnemy, viewDirection, type PlayerEntity } from '../match/entities.ts'
import type { GameEvent } from '../match/types.ts'
import { DEG } from './difficulty.ts'

// What a bot may know (docs/final-scope.md §4): what it sees, what it hears and what its team
// tells it. Nothing in here hands the brain a position it could not have perceived.
export const PERCEPTION = {
  visionRange: 70,
  shotHearing: 30,
  stepHearing: 8,
  hearingError: 3,
  // Ground speed above which steps make noise (the client plays them from 1 m/s).
  stepSpeed: 1,
  // Ticks between two footstep noises of the same player.
  stepInterval: 12,
} as const

const HEAD_HEIGHT = 1.625
const TORSO_HEIGHT = 1.1

export function headPoint(pos: Vec3, crouching: boolean): Vec3 {
  const scale = (crouching ? PLAYER.crouchHeight : PLAYER.height) / PLAYER.height
  return [pos[0], pos[1] + HEAD_HEIGHT * scale, pos[2]]
}

export function torsoPoint(pos: Vec3, crouching: boolean): Vec3 {
  const scale = (crouching ? PLAYER.crouchHeight : PLAYER.height) / PLAYER.height
  return [pos[0], pos[1] + TORSO_HEIGHT * scale, pos[2]]
}

// Inside the field of view, in range and with no solid voxel between the eye and the point.
export function canSee(
  isSolid: SolidTest,
  eye: Vec3,
  yaw: number,
  pitch: number,
  fovDegrees: number,
  point: Vec3,
  range: number = PERCEPTION.visionRange,
): boolean {
  const dx = point[0] - eye[0]
  const dy = point[1] - eye[1]
  const dz = point[2] - eye[2]
  const distance = Math.hypot(dx, dy, dz)
  if (distance > range) return false
  if (distance < 1e-6) return true
  const view = viewDirection(yaw, pitch)
  const cos = (dx * view[0] + dy * view[1] + dz * view[2]) / distance
  if (cos < Math.cos((fovDegrees / 2) * DEG)) return false
  return raycastVoxels(isSolid, eye, [dx, dy, dz], distance) === null
}

export interface SeenEnemy {
  id: number
  pos: Vec3
  vel: Vec3
  crouching: boolean
  distance: number
  carrying: boolean
}

export function visibleEnemies(
  ctx: MatchContext,
  bot: PlayerEntity,
  fovDegrees: number,
  carrierId: number,
): SeenEnemy[] {
  const eye = eyePosition(bot)
  const seen: SeenEnemy[] = []
  for (const other of ctx.players.values()) {
    if (!other.alive || !isEnemy(ctx.mode, bot, other)) continue
    const { pos, crouching } = other.state
    const head = headPoint(pos, crouching)
    const visible =
      canSee(ctx.isSolid, eye, bot.yaw, bot.pitch, fovDegrees, head) ||
      canSee(ctx.isSolid, eye, bot.yaw, bot.pitch, fovDegrees, torsoPoint(pos, crouching))
    if (!visible) continue
    seen.push({
      id: other.config.id,
      pos: [...pos],
      vel: [...other.state.vel],
      crouching,
      distance: Math.hypot(head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]),
      carrying: other.config.id === carrierId,
    })
  }
  return seen
}

export interface Noise {
  pos: Vec3
  tick: number
}

function jitter(rng: Rng, pos: Vec3): Vec3 {
  const e = PERCEPTION.hearingError
  return [pos[0] + (rng.next() * 2 - 1) * e, pos[1], pos[2] + (rng.next() * 2 - 1) * e]
}

function within(a: Vec3, b: Vec3, range: number): boolean {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz <= range * range
}

// Enemy shots within 30 blocks, digging, building and footsteps within 8, each placed within
// ±3 blocks of where it happened.
export function hearNoises(
  ctx: MatchContext,
  bot: PlayerEntity,
  heard: readonly GameEvent[],
  rng: Rng,
): Noise[] {
  const noises: Noise[] = []
  const ear = bot.state.pos
  for (const event of heard) {
    if (event.type !== 'shot') continue
    const source = ctx.players.get(event.player)
    if (!source || !isEnemy(ctx.mode, bot, source)) continue
    const quiet = event.tool === 'shovel' || event.tool === 'ladder' || event.tool === 'tnt'
    const range = quiet ? PERCEPTION.stepHearing : PERCEPTION.shotHearing
    if (within(ear, event.origin, range))
      noises.push({ pos: jitter(rng, event.origin), tick: ctx.tick })
  }
  for (const other of ctx.players.values()) {
    if (!other.alive || !isEnemy(ctx.mode, bot, other)) continue
    if ((ctx.tick + other.config.id) % PERCEPTION.stepInterval !== 0) continue
    const { vel, onGround, pos } = other.state
    if (!onGround || Math.hypot(vel[0], vel[2]) < PERCEPTION.stepSpeed) continue
    if (within(ear, pos, PERCEPTION.stepHearing))
      noises.push({ pos: jitter(rng, pos), tick: ctx.tick })
  }
  return noises
}
