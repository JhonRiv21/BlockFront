import { WEAPONS } from '../combat/weapons.ts'
import { TICK_RATE } from '../config.ts'
import { Game } from '../game.ts'
import { matchPlayers, type MatchSetup } from '../match/setup.ts'
import type { GameConfig, GameEvent } from '../match/types.ts'
import { MODES, type Difficulty, type GameMode } from '../rules/modes.ts'
import { CTF } from '../rules/ctf.ts'

// Headless bot-only matches for the harness (docs/final-scope.md §4): the human is replaced by
// a bot and the match runs to its end as fast as the machine goes. The clock is injected so
// the sim stays free of platform timers.
export interface BenchSpec {
  mode: GameMode
  // Players per team in CTF and TDM; players in total in FFA.
  size: number
  blue: Difficulty
  red: Difficulty
  seed: number
}

export interface MatchReport {
  ticks: number
  seconds: number
  winner: string
  winnerPlayer: number
  scoreBlue: number
  scoreRed: number
  endedBy: 'score' | 'time'
  captures: number
  firstCaptureSeconds: number | null
  kills: number
  accuracy: Partial<Record<Difficulty, { shots: number; hits: number }>>
  // Share of its alive time each bot spent stuck.
  stuck: { id: number; difficulty: Difficulty; share: number }[]
  stepMs: number[]
}

export function benchConfig(spec: BenchSpec): GameConfig {
  const setup: MatchSetup = {
    mode: spec.mode,
    difficulty: spec.blue,
    teamSize: spec.size as MatchSetup['teamSize'],
    ffaPlayers: spec.size as MatchSetup['ffaPlayers'],
    primary: 'rifle',
    seed: spec.seed,
  }
  // The human's menu primary goes too: every bot picks its own.
  const players = matchPlayers(setup).map(({ id, team, name }) => {
    const difficulty = spec.mode !== 'ffa' && team === 'red' ? spec.red : spec.blue
    return { id, team, name, bot: { difficulty } }
  })
  return { seed: spec.seed, mode: spec.mode, players }
}

// `variant` reseeds the match RNG, so matches on the same map play out differently.
export function runBenchMatch(spec: BenchSpec, variant: number, now: () => number): MatchReport {
  const game = new Game(benchConfig(spec))
  game.rng.state = (Math.imul(variant + 1, 0x9e3779b1) ^ spec.seed) >>> 0
  const difficultyOf = new Map(game.config.players.map((p) => [p.id, p.bot!.difficulty]))
  const accuracy: MatchReport['accuracy'] = {}
  const stepMs: number[] = []
  let captures = 0
  let firstCapture: number | null = null
  let kills = 0
  const limit = (MODES[spec.mode].matchSeconds + CTF.suddenDeathSeconds + 5) * TICK_RATE
  const inputs = new Map()
  while (game.match.state !== 'ended' && game.tick < limit) {
    const start = now()
    const events: GameEvent[] = game.step(inputs)
    stepMs.push(now() - start)
    const shooters = new Map<number, string>()
    for (const event of events) {
      if (event.type === 'shot' && event.tool in WEAPONS) {
        const difficulty = difficultyOf.get(event.player)!
        const row = (accuracy[difficulty] ??= { shots: 0, hits: 0 })
        row.shots++
        shooters.set(event.player, event.tool)
      } else if (event.type === 'hit' && shooters.get(event.attacker) === event.tool) {
        accuracy[difficultyOf.get(event.attacker)!]!.hits++
        shooters.delete(event.attacker)
      } else if (event.type === 'flag' && event.action === 'captured') {
        captures++
        firstCapture ??= game.tick / TICK_RATE
      } else if (event.type === 'death' && event.attacker !== event.victim) kills++
    }
  }
  const timeUp = game.match.endTick >= MODES[spec.mode].matchSeconds * TICK_RATE
  return {
    ticks: game.tick,
    seconds: game.tick / TICK_RATE,
    winner: game.match.winner ?? 'none',
    winnerPlayer: game.match.winnerPlayer,
    scoreBlue: game.match.score.blue,
    scoreRed: game.match.score.red,
    endedBy: timeUp || game.match.state !== 'ended' ? 'time' : 'score',
    captures,
    firstCaptureSeconds: firstCapture,
    kills,
    accuracy,
    stuck: game.bots.stats().map((s) => ({
      id: s.id,
      difficulty: difficultyOf.get(s.id)!,
      share: s.aliveTicks > 0 ? s.stuckTicks / s.aliveTicks : 0,
    })),
    stepMs,
  }
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!
}
