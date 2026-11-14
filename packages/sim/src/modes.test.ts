import { describe, expect, it } from 'vitest'
import { TICK_RATE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { BUTTON, createInputFrame, type InputFrame } from './input.ts'
import { applyDamage } from './match/damage.ts'
import { ffaSpawnPoints } from './match/placement.ts'
import { createGameConfig, DEFAULT_MATCH_SETUP, matchPlayers } from './match/setup.ts'
import type { MatchSetup } from './match/setup.ts'
import { BLOCK, isSolid } from './world/blocks.ts'
import { WORLD_SIZE } from './config.ts'

// Written from docs/final-scope.md §1 and §2. Setup: the human (id 1) in blue with teamSize − 1
// allied bots against teamSize red bots in CTF and TDM; in FFA the human against ffaPlayers − 1
// bots. TDM: first team to 10 kills per player per team (2v2 20, 3v3 30, 4v4 40, 6v6 60), 8 min, the leader wins at time and a tie is a draw,
// individual respawn at 4 s in the own base, restock in the base, no flags. FFA: first to 15
// kills, 8 min, same time rule, respawn at 4 s on the spawn point farthest from living enemies
// (decided here: horizontal distance), no bases or flags, D3 off, everyone is everyone's enemy.
// Suicide and deaths by falling or drowning cost the own score 1 in TDM and FFA (in TDM the
// rival gains nothing). MVP: CTF captures then kills; TDM and FFA kills then fewer deaths.

const MINUTE = 60 * TICK_RATE

function setup(overrides: Partial<MatchSetup>): MatchSetup {
  return { ...DEFAULT_MATCH_SETUP, ...overrides }
}
// These are rule tests: an idle external frame keeps every bot still (an external input
// overrides the bot AI).
function run(g: Game, ticks: number, inputs: Map<number, InputFrame> = new Map()): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) {
    const frames = new Map(inputs)
    for (const p of g.players.values())
      if (p.config.bot && !frames.has(p.config.id))
        frames.set(p.config.id, { ...createInputFrame(), yaw: p.yaw })
    events.push(...g.step(frames))
  }
  return events
}
function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...createInputFrame(), yaw: 0, ...overrides }
}
const entity = (g: Game, id: number) => g.players.get(id)!
const snap = (g: Game, id: number) => g.snapshot().players.find((p) => p.id === id)!
const horizontal = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!)
function teleport(g: Game, id: number, pos: readonly number[]): void {
  entity(g, id).state.pos = [pos[0]!, pos[1]!, pos[2]!]
  entity(g, id).state.vel = [0, 0, 0]
}
function kill(g: Game, attacker: number, victim: number, tool: 'rifle' | 'fall' = 'rifle'): void {
  entity(g, victim).protectedUntil = 0
  applyDamage(g, entity(g, attacker), entity(g, victim), 1000, 'head', tool)
}
const matchEnds = (events: GameEvent[]) => events.filter((e) => e.type === 'matchEnd')

describe('match setup', () => {
  it('CTF and TDM: the human in blue with teamSize − 1 allied bots against teamSize red bots', () => {
    for (const mode of ['ctf', 'tdm'] as const) {
      for (const teamSize of [2, 3, 4, 6] as const) {
        const players = matchPlayers(
          setup({ mode, teamSize, difficulty: 'veteran', primary: 'sniper' }),
        )
        expect(players).toHaveLength(teamSize * 2)
        const human = players.find((p) => p.id === 1)!
        expect(human.team).toBe('blue')
        expect(human.bot).toBeUndefined()
        expect(human.primary).toBe('sniper')
        expect(players.filter((p) => p.team === 'blue')).toHaveLength(teamSize)
        expect(players.filter((p) => p.team === 'red')).toHaveLength(teamSize)
        const bots = players.filter((p) => p.id !== 1)
        expect(bots.every((p) => p.bot?.difficulty === 'veteran')).toBe(true)
        expect(players.some((p) => p.dummy)).toBe(false)
        expect(new Set(players.map((p) => p.id)).size).toBe(players.length)
      }
    }
  })

  it('FFA: the human against ffaPlayers − 1 bots', () => {
    for (const ffaPlayers of [4, 6, 8] as const) {
      const players = matchPlayers(setup({ mode: 'ffa', ffaPlayers, difficulty: 'recruit' }))
      expect(players).toHaveLength(ffaPlayers)
      expect(players.filter((p) => p.bot?.difficulty === 'recruit')).toHaveLength(ffaPlayers - 1)
      expect(players.find((p) => p.id === 1)!.bot).toBeUndefined()
    }
  })

  it('the game config carries the mode and the seed; bots are ordinary players', () => {
    const config = createGameConfig(setup({ mode: 'tdm', teamSize: 3, seed: 1 }))
    expect(config.mode).toBe('tdm')
    expect(config.seed).toBe(1)
    const g = new Game(config)
    expect(g.snapshot().players).toHaveLength(6)
    expect(g.snapshot().match.mode).toBe('tdm')
    // Held still, the bots are just there, alive.
    run(g, TICK_RATE)
    expect(g.snapshot().players.every((p) => p.alive)).toBe(true)
  })
})

describe('TDM', () => {
  const tdm = (teamSize: 2 | 3 | 4 | 6 = 2) =>
    new Game(createGameConfig(setup({ mode: 'tdm', teamSize })))
  const reds = (g: Game) => g.snapshot().players.filter((p) => p.team === 'red')

  it('has no flags to take', () => {
    const g = tdm()
    run(g, 1)
    expect(g.snapshot().flags).toEqual([])
    teleport(g, 1, g.flags.red.home)
    const events = run(g, 5)
    expect(events.some((e) => e.type === 'flag')).toBe(false)
  })

  it('the target is 10 kills per player per team, and the snapshot says so', () => {
    const targets = { 2: 20, 3: 30, 4: 40, 6: 60 } as const
    for (const teamSize of [2, 3, 4, 6] as const) {
      expect(tdm(teamSize).snapshot().match.scoreToWin).toBe(targets[teamSize])
    }
  })

  for (const teamSize of [2, 3] as const) {
    it(`the first team to ${teamSize * 10} kills wins (${teamSize}v${teamSize})`, () => {
      const target = teamSize * 10
      const g = tdm(teamSize)
      run(g, 1)
      const victim = reds(g)[0]!.id
      let ended: GameEvent[] = []
      for (let i = 0; i < target; i++) {
        expect(g.snapshot().match.state).toBe('playing')
        kill(g, 1, victim)
        ended = run(g, 4 * TICK_RATE + 1)
        if (i < target - 1) expect(matchEnds(ended)).toHaveLength(0)
      }
      expect(g.snapshot().match.scoreBlue).toBe(target)
      expect(matchEnds(ended)).toEqual([{ type: 'matchEnd', winner: 'blue', winnerPlayer: 0 }])
      expect(g.snapshot().match.state).toBe('ended')
      expect(g.snapshot().match.winner).toBe('blue')
    })
  }

  it('at 8 minutes the leader wins; a tie is a draw, with no sudden death', () => {
    const lead = tdm()
    run(lead, 1)
    kill(lead, reds(lead)[0]!.id, 1)
    lead.tick = 8 * MINUTE - 1
    expect(matchEnds(run(lead, 1))).toEqual([{ type: 'matchEnd', winner: 'red', winnerPlayer: 0 }])

    const tie = tdm()
    tie.tick = 8 * MINUTE - 2
    expect(matchEnds(run(tie, 1))).toHaveLength(0)
    expect(tie.snapshot().match.timeLeft).toBeCloseTo(1 / TICK_RATE, 5)
    expect(matchEnds(run(tie, 1))).toEqual([{ type: 'matchEnd', winner: 'none', winnerPlayer: 0 }])
    expect(tie.snapshot().match.state).toBe('ended')
  })

  it('a suicide, a fall or drowning costs the own team a point and gives the rival nothing', () => {
    const g = tdm()
    run(g, 1)
    kill(g, 1, reds(g)[0]!.id)
    expect(g.snapshot().match.scoreBlue).toBe(1)
    kill(g, 1, 1, 'fall')
    expect(g.snapshot().match.scoreBlue).toBe(0)
    expect(g.snapshot().match.scoreRed).toBe(0)
    expect(snap(g, 1).score).toBe(0)
    run(g, 4 * TICK_RATE + 1)
    entity(g, 1).protectedUntil = 0
    applyDamage(g, entity(g, 1), entity(g, 1), 1000, 'torso', 'drowning')
    expect(g.snapshot().match.scoreBlue).toBe(-1)
    expect(g.snapshot().match.scoreRed).toBe(0)
  })

  it('respawns one by one after 4 s, in the own base', () => {
    const g = tdm()
    run(g, 1)
    const victim = reds(g)[0]!.id
    teleport(g, victim, [48.5, 30, 64.5])
    kill(g, 1, victim)
    run(g, 4 * TICK_RATE - 1)
    expect(snap(g, victim).alive).toBe(false)
    run(g, 1)
    const back = snap(g, victim)
    expect(back.alive).toBe(true)
    expect(horizontal(back.pos, g.flags.red.home)).toBeLessThanOrEqual(8)
  })

  it('the base still restocks', () => {
    const g = tdm()
    run(g, 1)
    entity(g, 1).hp = 50
    run(g, 16 * TICK_RATE)
    expect(snap(g, 1).hp).toBe(100)
  })

  it('MVP: most kills, then fewest deaths', () => {
    const g = tdm()
    run(g, 1)
    const mate = g.snapshot().players.find((p) => p.team === 'blue' && p.id !== 1)!.id
    const [a, b] = reds(g).map((p) => p.id) as [number, number]
    kill(g, a, 1)
    kill(g, mate, a)
    kill(g, mate, b)
    run(g, 4 * TICK_RATE + 1)
    kill(g, 1, a)
    kill(g, 1, b)
    g.tick = 8 * MINUTE - 1
    run(g, 1)
    expect(g.snapshot().match.state).toBe('ended')
    expect(g.snapshot().match.mvp).toBe(mate)
  })
})

describe('FFA', () => {
  const ffa = (ffaPlayers: 4 | 6 | 8 = 4) =>
    new Game(createGameConfig(setup({ mode: 'ffa', ffaPlayers })))
  const others = (g: Game) => g.snapshot().players.filter((p) => p.id !== 1)

  it('everyone is an enemy: same-colour players hurt and score on each other', () => {
    const g = ffa()
    run(g, 1)
    const [a, b] = others(g).map((p) => p.id) as [number, number]
    expect(snap(g, a).team).toBe(snap(g, b).team)
    kill(g, a, b)
    expect(snap(g, a).kills).toBe(1)
    // A grenade of one bot next to another bot of the same colour.
    const target = entity(g, others(g)[2]!.id)
    expect(target.config.team).toBe(snap(g, a).team)
    target.protectedUntil = 0
    const [x, y, z] = target.state.pos
    g.grenades.push({ id: 99, owner: a, pos: [x + 1, y + 0.5, z], vel: [0, 0, 0], fuse: 0.01 })
    run(g, 2)
    expect(snap(g, target.config.id).hp).toBeLessThan(100)
  })

  it('has no flags and no base restock', () => {
    const g = ffa()
    run(g, 1)
    expect(g.snapshot().flags).toEqual([])
    teleport(g, 1, g.flags.blue.home)
    entity(g, 1).hp = 50
    const events = run(g, 16 * TICK_RATE)
    expect(events.some((e) => e.type === 'flag' || e.type === 'restock')).toBe(false)
    expect(snap(g, 1).hp).toBe(50)
  })

  it('D3 does not apply: a player breaks a block of their own colour', () => {
    const dig = (mode: 'ffa' | 'ctf') => {
      const g =
        mode === 'ffa'
          ? ffa()
          : new Game({ seed: 1, players: [{ id: 1, team: 'blue', name: 'me' }] })
      run(g, 1)
      for (let x = 37; x <= 43; x++)
        for (let z = 56; z <= 64; z++) {
          g.world.fillBlock(x, 40, z, BLOCK.stone)
          for (let yy = 41; yy <= 46; yy++) g.world.fillBlock(x, yy, z, BLOCK.air)
        }
      g.world.fillBlock(40, 41, 59, BLOCK.blue)
      teleport(g, 1, [40.5, 41, 60.5])
      const swing = new Map([[1, frame({ pitch: -0.9, slot: 3, buttons: BUTTON.fire })]])
      const rest = new Map([[1, frame({ pitch: -0.9, slot: 3 })]])
      for (let i = 0; i < 6; i++) {
        run(g, 1, swing)
        run(g, 11, rest)
      }
      return g.world.getBlock(40, 41, 59)
    }
    expect(dig('ctf')).toBe(BLOCK.blue)
    expect(dig('ffa')).toBe(BLOCK.air)
  })

  it('the target stays at 15 kills whatever the number of players', () => {
    for (const ffaPlayers of [4, 6, 8] as const)
      expect(ffa(ffaPlayers).snapshot().match.scoreToWin).toBe(15)
  })

  it('the first player to 15 kills wins', () => {
    const g = ffa()
    run(g, 1)
    const victim = others(g)[0]!.id
    let events: GameEvent[] = []
    for (let i = 0; i < 15; i++) {
      kill(g, 1, victim)
      events = run(g, 4 * TICK_RATE + 1)
      if (i < 14) expect(matchEnds(events)).toHaveLength(0)
    }
    expect(matchEnds(events)).toEqual([{ type: 'matchEnd', winner: 'player', winnerPlayer: 1 }])
    const match = g.snapshot().match
    expect(match.state).toBe('ended')
    expect(match.winner).toBe('player')
    expect(match.winnerPlayer).toBe(1)
    expect(match.mvp).toBe(1)
  })

  it('at 8 minutes the leader wins; a tie is a draw', () => {
    const lead = ffa()
    run(lead, 1)
    const [a, b] = others(lead).map((p) => p.id) as [number, number]
    kill(lead, a, b)
    lead.tick = 8 * MINUTE - 1
    expect(matchEnds(run(lead, 1))).toEqual([
      { type: 'matchEnd', winner: 'player', winnerPlayer: a },
    ])

    const tie = ffa()
    run(tie, 1)
    const [c, d] = others(tie).map((p) => p.id) as [number, number]
    kill(tie, 1, c)
    kill(tie, d, 1)
    tie.tick = 8 * MINUTE - 1
    expect(matchEnds(run(tie, 1))).toEqual([{ type: 'matchEnd', winner: 'none', winnerPlayer: 0 }])
  })

  it('a suicide takes 1 from the own score', () => {
    const g = ffa()
    run(g, 1)
    kill(g, 1, others(g)[0]!.id)
    expect(snap(g, 1).score).toBe(1)
    kill(g, 1, 1, 'fall')
    expect(snap(g, 1).score).toBe(0)
    expect(snap(g, 1).kills).toBe(1)
  })

  it('12 spawn points, deterministic, on dry ground away from water', () => {
    const g = ffa()
    const points = ffaSpawnPoints(g.world, 1)
    expect(points).toHaveLength(12)
    expect(ffaSpawnPoints(g.world, 1)).toEqual(points)
    const top = (x: number, z: number) => {
      for (let y = WORLD_SIZE.y - 1; y >= 0; y--) {
        const id = g.world.getBlock(x, y, z)
        if (id !== BLOCK.air && isSolid(id)) return id
        if (id === BLOCK.water) return id
      }
      return BLOCK.air
    }
    for (const [px, py, pz] of points) {
      const x = Math.floor(px)
      const z = Math.floor(pz)
      const ground = g.world.getBlock(x, Math.floor(py) - 1, z)
      expect(isSolid(ground)).toBe(true)
      expect(ground).not.toBe(BLOCK.sand)
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) expect(top(x + dx, z + dz)).not.toBe(BLOCK.water)
    }
  })

  it('players start on distinct spawn points', () => {
    const g = ffa(8)
    const points = ffaSpawnPoints(g.world, 1)
    const starts = g
      .snapshot()
      .players.map((p) => points.findIndex((q) => horizontal(q, p.pos) < 1e-6))
    expect(starts.every((i) => i >= 0)).toBe(true)
    expect(new Set(starts).size).toBe(starts.length)
  })

  it('respawns after 4 s on the spawn point farthest from the living enemies', () => {
    const g = ffa()
    run(g, 1)
    const points = ffaSpawnPoints(g.world, 1)
    // Park the bots on three points, one of them where the human started.
    others(g).forEach((bot, i) => teleport(g, bot.id, points[(i * 4) % points.length]!))
    kill(g, others(g)[0]!.id, 1)
    run(g, 4 * TICK_RATE - 1)
    expect(snap(g, 1).alive).toBe(false)
    run(g, 1)
    const me = snap(g, 1)
    expect(me.alive).toBe(true)
    const enemies = others(g).filter((p) => p.alive)
    const nearest = (p: readonly number[]) => Math.min(...enemies.map((e) => horizontal(p, e.pos)))
    const best = Math.max(...points.map(nearest))
    expect(points.some((p) => horizontal(p, me.pos) < 1e-6)).toBe(true)
    expect(nearest(me.pos)).toBeCloseTo(best, 5)
  })
})
