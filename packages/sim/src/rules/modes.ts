import { TICK_RATE } from '../config.ts'
import { CTF, nextWaveTick, secondsLeft, type MatchState, type PlayerStats } from './ctf.ts'

// docs/final-scope.md §1 and §2.
export type GameMode = 'ctf' | 'tdm' | 'ffa'
export type Difficulty = 'recruit' | 'soldier' | 'veteran'

export const MODES: Record<GameMode, { matchSeconds: number }> = {
  ctf: { matchSeconds: CTF.matchSeconds },
  tdm: { matchSeconds: 480 },
  ffa: { matchSeconds: 480 },
}

export const TDM_KILLS_PER_PLAYER = 10
export const FFA_KILLS_TO_WIN = 15

// CTF captures; TDM 10 kills per player per team (2v2 = 20 … 6v6 = 60); FFA 15 kills.
export function scoreToWin(mode: GameMode, teamSize: number): number {
  if (mode === 'ctf') return CTF.capturesToWin
  if (mode === 'tdm') return TDM_KILLS_PER_PLAYER * Math.max(1, teamSize)
  return FFA_KILLS_TO_WIN
}

// Players per team: the larger side of the configured roster (players added later do not move
// the target).
export function rosterTeamSize(players: readonly { team: 'blue' | 'red' }[]): number {
  let blue = 0
  let red = 0
  for (const p of players) {
    if (p.team === 'blue') blue++
    else red++
  }
  return Math.max(blue, red)
}

// TDM and FFA bring each player back on their own, this long after the death.
export const INDIVIDUAL_RESPAWN_SECONDS = 4

export function respawnTickFor(mode: GameMode, deathTick: number): number {
  if (mode === 'ctf') return nextWaveTick(deathTick)
  return deathTick + INDIVIDUAL_RESPAWN_SECONDS * TICK_RATE
}

// Points toward the win in TDM and FFA: kills, minus one per own death.
export function killScore(stats: PlayerStats): number {
  return stats.kills - stats.suicides
}

// TDM and FFA: reaching the target ends the match at once; at full time the leader wins and a
// tie is a draw (winner null). Two sides crossing the target on the same tick: the higher wins.
export function scoreStatus<K>(
  mode: Exclude<GameMode, 'ctf'>,
  sides: { key: K; score: number }[],
  tick: number,
  target: number,
): { ended: boolean; winner: K | null } {
  const rule = MODES[mode]
  let best: { key: K; score: number } | null = null
  let tied = false
  for (const side of sides) {
    if (!best || side.score > best.score) {
      best = side
      tied = false
    } else if (side.score === best.score) tied = true
  }
  const reached = best !== null && best.score >= target
  if (!reached && tick < rule.matchSeconds * TICK_RATE) return { ended: false, winner: null }
  return { ended: true, winner: best && !tied ? best.key : null }
}

export function clockLeft(mode: GameMode, state: MatchState, tick: number): number {
  if (mode === 'ctf') return secondsLeft(state, tick)
  return Math.max(0, MODES[mode].matchSeconds * TICK_RATE - tick) / TICK_RATE
}

// TDM and FFA: most kills, then fewest deaths; the lowest id breaks a full tie.
export function killsMvp(rows: { id: number; stats: PlayerStats }[]): number | null {
  let best: { id: number; stats: PlayerStats } | null = null
  for (const row of rows) {
    const a = row.stats
    const b = best?.stats
    if (
      !best ||
      !b ||
      a.kills > b.kills ||
      (a.kills === b.kills && a.deaths < b.deaths) ||
      (a.kills === b.kills && a.deaths === b.deaths && row.id < best.id)
    )
      best = row
  }
  return best?.id ?? null
}
