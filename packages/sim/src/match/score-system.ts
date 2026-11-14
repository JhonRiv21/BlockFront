import { killScore, scoreStatus } from '../rules/modes.ts'
import type { MatchContext } from './context.ts'
import type { PlayerEntity } from './entities.ts'
import type { Team } from './types.ts'

// A death in TDM: an enemy kill scores for the killer's team; an own death (suicide, a fall
// or drowning nobody is credited with) costs the victim's team a point. FFA reads the players'
// own kills and suicides instead.
export function scoreDeath(
  ctx: MatchContext,
  attacker: PlayerEntity,
  victim: PlayerEntity,
  enemy: boolean,
): void {
  if (attacker === victim) victim.stats.suicides++
  if (ctx.mode !== 'tdm') return
  if (enemy) ctx.match.score[attacker.config.team]++
  else if (attacker === victim) ctx.match.score[victim.config.team]--
}

// TDM and FFA: first to the target, or the leader at full time; a tie at time is a draw.
export function stepScoreMatch(ctx: MatchContext): void {
  if (ctx.mode === 'ctf' || ctx.match.state === 'ended') return
  if (ctx.mode === 'tdm') {
    const sides = (['blue', 'red'] as Team[]).map((key) => ({ key, score: ctx.match.score[key] }))
    const status = scoreStatus('tdm', sides, ctx.tick, ctx.scoreToWin)
    if (status.ended) end(ctx, status.winner ?? 'none', 0)
    return
  }
  const sides = [...ctx.players.values()].map((p) => ({
    key: p.config.id,
    score: killScore(p.stats),
  }))
  const status = scoreStatus('ffa', sides, ctx.tick, ctx.scoreToWin)
  if (status.ended) end(ctx, status.winner === null ? 'none' : 'player', status.winner ?? 0)
}

function end(ctx: MatchContext, winner: Team | 'player' | 'none', winnerPlayer: number): void {
  ctx.match.state = 'ended'
  ctx.match.winner = winner
  ctx.match.winnerPlayer = winnerPlayer
  ctx.match.endTick = ctx.tick
  ctx.events.push({ type: 'matchEnd', winner, winnerPlayer })
}
