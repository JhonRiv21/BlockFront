import type { GameMode } from '@blockfront/sim/rules/modes'

interface Ranked {
  id: number
  kills: number
  deaths: number
  captures: number
  score: number
}

// Scoreboard order: CTF by captures then kills; TDM and FFA by score (kills minus own deaths),
// then kills, then fewer deaths. The id keeps the order stable.
export function sortRows<T extends Ranked>(rows: T[], mode: GameMode): T[] {
  const byCaptures = (a: T, b: T) => b.captures - a.captures || b.kills - a.kills
  const byScore = (a: T, b: T) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths
  return [...rows].sort(
    (a, b) => (mode === 'ctf' ? byCaptures(a, b) : byScore(a, b)) || a.id - b.id,
  )
}

// FFA top bar: the local place (players with a strictly higher score go ahead; ties share a
// place), the own score and the leader's.
export function ffaStanding(
  rows: { id: number; score: number }[],
  localId: number,
): { place: number; of: number; score: number; leader: number } {
  const own = rows.find((row) => row.id === localId)?.score ?? 0
  const ahead = rows.filter((row) => row.score > own).length
  const leader = rows.reduce((best, row) => Math.max(best, row.score), own)
  return { place: ahead + 1, of: rows.length, score: own, leader }
}
