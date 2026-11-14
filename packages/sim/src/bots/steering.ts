import { TICK_RATE } from '../config.ts'
import type { PlayerState } from '../physics/player-controller.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { Cell, NavWorld } from './navigation.ts'

// Turning a path into movement, and noticing when the body is not getting anywhere
// (docs/final-scope.md §4): without 1 block of progress in 2 s it jumps, in 3 s it digs the
// block in front, in 5 s it gives up on the destination.
export const STUCK = {
  progress: 1,
  jumpTicks: 2 * TICK_RATE,
  digTicks: 3 * TICK_RATE,
  giveUpTicks: 5 * TICK_RATE,
} as const

export const STEER = {
  reach: 0.55,
  lastReach: 0.45,
  stepHeight: 1.3,
  // Far enough out that the body clears the step instead of hitting its face.
  jumpDistance: 2,
  // Farther than this from the next cell, the path no longer describes where the body is.
  offPath: 3.5,
  // A partial path asks for the rest this many cells before its end.
  extendAt: 4,
} as const

export interface NavState {
  dest: Vec3 | null
  path: Cell[]
  index: number
  // 'pending' waits for the shared search budget; 'direct' had no route and walks straight.
  status: 'idle' | 'pending' | 'path' | 'partial' | 'direct'
  plannedTick: number
  anchor: Vec3
  anchorTick: number
}

export function createNav(): NavState {
  return {
    dest: null,
    path: [],
    index: 0,
    status: 'idle',
    plannedTick: -1,
    anchor: [0, 0, 0],
    anchorTick: 0,
  }
}

export function resetProgress(nav: NavState, pos: Vec3, tick: number): void {
  nav.anchor = [...pos]
  nav.anchorTick = tick
}

// Ticks without a block of progress over the ground while trying to move (hopping on the spot
// is no progress); standing still on purpose resets it.
export function stuckTicks(nav: NavState, pos: Vec3, tick: number, moving: boolean): number {
  const dx = pos[0] - nav.anchor[0]
  const dz = pos[2] - nav.anchor[2]
  if (!moving || dx * dx + dz * dz >= STUCK.progress * STUCK.progress) {
    resetProgress(nav, pos, tick)
    return 0
  }
  return tick - nav.anchorTick
}

export interface Steer {
  // Horizontal unit direction to walk, or null when there is nothing to follow.
  dir: [number, number] | null
  jump: boolean
  // The path ran out (or is about to, if partial) or no longer fits the body.
  replan: boolean
}

function reached(state: PlayerState, cell: Cell, radius: number): boolean {
  const dx = cell[0] + 0.5 - state.pos[0]
  const dz = cell[2] + 0.5 - state.pos[2]
  return dx * dx + dz * dz < radius * radius && Math.abs(state.pos[1] - cell[1]) < STEER.stepHeight
}

export function followPath(nav: NavState, state: PlayerState): Steer {
  const last = nav.path.length - 1
  for (let look = Math.min(last, nav.index + 2); look >= nav.index; look--) {
    if (reached(state, nav.path[look]!, look === last ? STEER.lastReach : STEER.reach)) {
      nav.index = look + 1
      break
    }
  }
  const remaining = nav.path.length - nav.index
  const extend = nav.status === 'partial' && remaining <= STEER.extendAt
  const next = nav.path[nav.index]
  if (!next) return { dir: null, jump: false, replan: true }
  const dx = next[0] + 0.5 - state.pos[0]
  const dz = next[2] + 0.5 - state.pos[2]
  const distance = Math.hypot(dx, dz)
  if (distance > STEER.offPath) return { dir: null, jump: false, replan: true }
  const up = next[1] > state.pos[1] + 0.5
  const jump = state.inWater || (up && distance < STEER.jumpDistance && state.onGround)
  const dir: [number, number] = distance > 1e-6 ? [dx / distance, dz / distance] : [0, 0]
  return { dir, jump, replan: extend }
}

// Straight at a point, for when no route exists; the stuck rules do the rest.
export function steerDirect(state: PlayerState, dest: Vec3): Steer {
  const dx = dest[0] - state.pos[0]
  const dz = dest[2] - state.pos[2]
  const distance = Math.hypot(dx, dz)
  if (distance < 1e-6) return { dir: null, jump: false, replan: false }
  return { dir: [dx / distance, dz / distance], jump: state.inWater, replan: false }
}

// The solid block the body is walking into: feet level first, then head level.
export function blockingCell(w: NavWorld, state: PlayerState, dir: [number, number]): Cell | null {
  const x = Math.floor(state.pos[0] + dir[0] * 0.8)
  const z = Math.floor(state.pos[2] + dir[1] * 0.8)
  const y = Math.floor(state.pos[1] + 0.05)
  for (const dy of [0, 1]) {
    if (w.isSolid(x, y + dy, z)) return [x, y + dy, z]
  }
  return null
}
