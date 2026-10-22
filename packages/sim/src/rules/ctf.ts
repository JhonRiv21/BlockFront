import { TICK_RATE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import type { Team } from '../match/types.ts'

// PLAN.md §3 and docs/audit-2026-10-14.md: capture the flag against the clock.
export const CTF = {
  capturesToWin: 3,
  matchSeconds: 600,
  suddenDeathSeconds: 120,
  // Dead players come back together, on the next wave at least this long after dying.
  waveSeconds: 8,
  minRespawnSeconds: 2,
  flagReturnSeconds: 20,
  // Touching a flag: horizontal reach and height window around the flag's foot.
  pickupRadius: 1.5,
  pickupHeight: 2.5,
  // The base: a cylinder around the flag stand where restock, healing and protection apply.
  baseRadius: 8,
  baseHeight: 6,
  restockSeconds: 15,
  spawnProtectionSeconds: 4,
} as const

export type FlagState = 'base' | 'carried' | 'dropped'
export type MatchState = 'playing' | 'suddenDeath' | 'ended'
export type Winner = Team | 'none'

export interface FlagEntity {
  team: Team
  state: FlagState
  home: Vec3
  pos: Vec3
  carrier: number
  droppedTick: number
}

export interface MatchEntity {
  state: MatchState
  score: Record<Team, number>
  winner: Winner | null
  endTick: number
}

export interface PlayerStats {
  kills: number
  deaths: number
  captures: number
  returns: number
  damage: number
}

export function enemyOf(team: Team): Team {
  return team === 'blue' ? 'red' : 'blue'
}

export function createMatch(): MatchEntity {
  return { state: 'playing', score: { blue: 0, red: 0 }, winner: null, endTick: -1 }
}

export function createStats(): PlayerStats {
  return { kills: 0, deaths: 0, captures: 0, returns: 0, damage: 0 }
}

// First wave boundary that is at least minRespawnSeconds after the death.
export function nextWaveTick(deathTick: number): number {
  const wave = CTF.waveSeconds * TICK_RATE
  const earliest = deathTick + CTF.minRespawnSeconds * TICK_RATE
  return Math.ceil(earliest / wave) * wave
}

export function withinFlag(playerPos: Vec3, flagPos: Vec3): boolean {
  const dx = playerPos[0] - flagPos[0]
  const dz = playerPos[2] - flagPos[2]
  const dy = playerPos[1] - flagPos[1]
  return (
    dx * dx + dz * dz <= CTF.pickupRadius * CTF.pickupRadius && Math.abs(dy) <= CTF.pickupHeight
  )
}

export function inBase(pos: Vec3, home: Vec3): boolean {
  const dx = pos[0] - home[0]
  const dz = pos[2] - home[2]
  const dy = pos[1] - home[1]
  return dx * dx + dz * dz <= CTF.baseRadius * CTF.baseRadius && Math.abs(dy) <= CTF.baseHeight
}

// Where the match stands at `tick`: first to capturesToWin wins outright; at full time the
// leader wins, a tie goes to sudden death (next capture wins) and a tie after that is a draw.
export function matchStatus(
  score: Record<Team, number>,
  tick: number,
): { state: MatchState; winner: Winner | null } {
  if (score.blue >= CTF.capturesToWin) return { state: 'ended', winner: 'blue' }
  if (score.red >= CTF.capturesToWin) return { state: 'ended', winner: 'red' }
  const fullTime = CTF.matchSeconds * TICK_RATE
  if (tick < fullTime) return { state: 'playing', winner: null }
  if (score.blue !== score.red)
    return { state: 'ended', winner: score.blue > score.red ? 'blue' : 'red' }
  if (tick < fullTime + CTF.suddenDeathSeconds * TICK_RATE)
    return { state: 'suddenDeath', winner: null }
  return { state: 'ended', winner: 'none' }
}

// Seconds left on the clock: the match, then the sudden death.
export function secondsLeft(state: MatchState, tick: number): number {
  const fullTime = CTF.matchSeconds * TICK_RATE
  const end = state === 'suddenDeath' ? fullTime + CTF.suddenDeathSeconds * TICK_RATE : fullTime
  return Math.max(0, end - tick) / TICK_RATE
}

// Most captures, then kills, then returns; the lowest id breaks a full tie.
export function mvp(rows: { id: number; stats: PlayerStats }[]): number | null {
  let best: { id: number; stats: PlayerStats } | null = null
  for (const row of rows) {
    if (!best) {
      best = row
      continue
    }
    const a = row.stats
    const b = best.stats
    if (
      a.captures > b.captures ||
      (a.captures === b.captures && a.kills > b.kills) ||
      (a.captures === b.captures && a.kills === b.kills && a.returns > b.returns) ||
      (a.captures === b.captures &&
        a.kills === b.kills &&
        a.returns === b.returns &&
        row.id < best.id)
    )
      best = row
  }
  return best?.id ?? null
}
