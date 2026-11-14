import { describe, expect, it } from 'vitest'
import { TICK_RATE, WORLD_SIZE } from '../config.ts'
import { Game, type GameEvent, type PlayerConfig } from '../game.ts'
import { BUTTON } from '../input.ts'
import { setBlock } from '../match/block-edits.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { Rng } from '../rng.ts'
import type { Difficulty, GameMode } from '../rules/modes.ts'
import { BLOCK } from '../world/blocks.ts'
import { createBrain, thinkBot, type BotEnv } from './brain.ts'
import { BOT_SKILL, DEG } from './difficulty.ts'
import { wrapAngle } from './aim.ts'

// Written from docs/final-scope.md §4: a bot builds its input from what it perceives, reacts
// no sooner than its reaction time, turns no faster than its skill, gets itself unstuck
// (jump at 2 s, dig at 3 s) and replans when a block on its route changes; everything runs on
// the match RNG. NOTE: written by the same session that wrote the bots, with the code in
// context; the cases come from the spec, not from the implementation's numbers.

// Feet stand at y = FLOOR + 1 on a flat stone world, so each case controls the geometry.
const FLOOR = 20
const FEET = FLOOR + 1

function flatGame(players: PlayerConfig[], mode: GameMode = 'tdm'): Game {
  const game = new Game({ seed: 1, mode, players })
  for (let x = 0; x < WORLD_SIZE.x; x++)
    for (let z = 0; z < WORLD_SIZE.z; z++)
      for (let y = 0; y < WORLD_SIZE.y; y++)
        game.world.fillBlock(
          x,
          y,
          z,
          y === 0 ? BLOCK.bedrock : y <= FLOOR ? BLOCK.stone : BLOCK.air,
        )
  return game
}

function fill(game: Game, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) game.world.fillBlock(x, y, z, BLOCK.stone)
}

function put(game: Game, id: number, pos: Vec3): void {
  const player = game.players.get(id)!
  player.state.pos = [...pos]
  player.state.vel = [0, 0, 0]
}

const bot = (difficulty: Difficulty, team: 'blue' | 'red' = 'blue'): PlayerConfig => ({
  id: 1,
  team,
  name: 'bot',
  bot: { difficulty },
})
const dummy: PlayerConfig = { id: 2, team: 'red', name: 'dummy', dummy: true }

const shotsBy = (events: GameEvent[], id: number) =>
  events.filter((e) => e.type === 'shot' && e.player === id && e.tool !== 'shovel')

describe('a bot never reads an enemy it does not perceive', () => {
  // The bot is shut in a stone room facing +Z; the enemy stands right behind the front wall.
  function walledIn(open: boolean): Game {
    const game = flatGame([bot('veteran'), dummy])
    fill(game, 45, 51, FEET, FEET + 3, 37, 37)
    fill(game, 45, 51, FEET, FEET + 3, 43, 43)
    fill(game, 45, 45, FEET, FEET + 3, 37, 43)
    fill(game, 51, 51, FEET, FEET + 3, 37, 43)
    fill(game, 45, 51, FEET + 3, FEET + 3, 37, 43)
    if (open)
      for (let x = 47; x <= 49; x++)
        for (let y = FEET; y <= FEET + 1; y++) game.world.fillBlock(x, y, 43, BLOCK.air)
    put(game, 1, [48.5, FEET, 40.5])
    put(game, 2, [48.5, FEET, 45.5])
    return game
  }

  it('behind a wall the enemy is never a contact, a target or shot at', () => {
    const game = walledIn(false)
    const events: GameEvent[] = []
    // Under 3 s, so the stuck rules never dig through the wall.
    for (let i = 0; i < 2.5 * TICK_RATE; i++) {
      events.push(...game.step(new Map()))
      const brain = game.bots.brain(1)!
      expect(brain.target).not.toBe(2)
      expect(brain.contacts.some((c) => c.id === 2)).toBe(false)
    }
    expect(shotsBy(events, 1)).toEqual([])
  })

  it('control: with a gap in the wall the same bot sees and shoots it', () => {
    const game = walledIn(true)
    const events: GameEvent[] = []
    let targeted = false
    for (let i = 0; i < 2.5 * TICK_RATE; i++) {
      events.push(...game.step(new Map()))
      targeted ||= game.bots.brain(1)!.target === 2
    }
    expect(targeted).toBe(true)
    expect(shotsBy(events, 1).length).toBeGreaterThan(0)
  })
})

// One bot driven tick by tick through thinkBot, its view applied by hand and nothing else
// moving, so only perception, reaction and aim are at play.
function aimRig(difficulty: Difficulty) {
  const game = flatGame([bot(difficulty), dummy])
  put(game, 1, [48.5, FEET, 40.5])
  // Out of sight behind the bot.
  put(game, 2, [48.5, FEET, 28.5])
  const player = game.players.get(1)!
  player.yaw = Math.PI
  const brain = createBrain(1, 'roam', [])
  const env: BotEnv = {
    ctx: game,
    skill: BOT_SKILL[difficulty],
    nav: { isSolid: game.isSolid, isLiquid: game.isLiquid },
    rng: new Rng(11),
    hotspots: [[48.5, FEET, 40.5]],
    brainOf: () => brain,
    laneOf: () => WORLD_SIZE.x / 2,
    requestPath: () => {},
    choosePrimary: () => 'rifle',
  }
  const step = () => {
    game.tick++
    const frame = thinkBot(env, player, brain, [])
    const turned = Math.abs(wrapAngle(frame.yaw - player.yaw))
    player.yaw = frame.yaw
    player.pitch = frame.pitch
    player.lastButtons = frame.buttons
    return { frame, turned }
  }
  return { game, player, brain, step }
}

describe('reaction time', () => {
  for (const difficulty of ['recruit', 'soldier', 'veteran'] as const) {
    it(`${difficulty}: no target and no shot before ${BOT_SKILL[difficulty].reactionSeconds * 1000} ms`, () => {
      const rig = aimRig(difficulty)
      for (let i = 0; i < 10; i++) rig.step()
      // The enemy steps into view, 12 blocks ahead.
      put(rig.game, 2, [48.5, FEET, 52.5])
      const appeared = rig.game.tick + 1
      let targetTick = -1
      let fireTick = -1
      for (let i = 0; i < 2 * TICK_RATE; i++) {
        const { frame } = rig.step()
        if (targetTick < 0 && rig.brain.target === 2) targetTick = rig.game.tick
        if (fireTick < 0 && frame.buttons & BUTTON.fire) fireTick = rig.game.tick
      }
      const reaction = BOT_SKILL[difficulty].reactionSeconds * TICK_RATE
      expect(targetTick).toBeGreaterThan(0)
      expect(targetTick - appeared).toBeGreaterThanOrEqual(reaction)
      // And not much later either.
      expect(targetTick - appeared).toBeLessThanOrEqual(reaction + 2)
      expect(fireTick).toBeGreaterThanOrEqual(targetTick)
    })
  }
})

describe('turn rate', () => {
  for (const difficulty of ['recruit', 'veteran'] as const) {
    it(`${difficulty}: the view never turns faster than ${BOT_SKILL[difficulty].turnDegreesPerSecond}°/s`, () => {
      const rig = aimRig(difficulty)
      // 40° to the side of the view, inside both fields of view, 10 blocks away.
      const angle = 40 * DEG
      put(rig.game, 2, [48.5 + Math.sin(angle) * 10, FEET, 40.5 + Math.cos(angle) * 10])
      const limit = (BOT_SKILL[difficulty].turnDegreesPerSecond * DEG) / TICK_RATE
      let fastest = 0
      for (let i = 0; i < 2 * TICK_RATE; i++) fastest = Math.max(fastest, rig.step().turned)
      expect(fastest).toBeLessThanOrEqual(limit + 1e-9)
      // It did turn onto the enemy.
      const enemy = rig.game.players.get(2)!.state.pos
      const toward = Math.atan2(-(enemy[0] - 48.5), -(enemy[2] - 40.5))
      expect(Math.abs(wrapAngle(rig.player.yaw - toward))).toBeLessThan(
        BOT_SKILL[difficulty].aimErrorDegrees * DEG,
      )
    })
  }
})

describe('getting unstuck', () => {
  it('walking into a wall it cannot jump, it jumps, then digs its way through', () => {
    // A CTF attacker heads for the enemy half; a 3-high stone wall spans the whole map.
    const game = flatGame([bot('veteran')], 'ctf')
    fill(game, 0, WORLD_SIZE.x - 1, FEET, FEET + 2, 45, 45)
    put(game, 1, [48.5, FEET, 40.5])
    const player = game.players.get(1)!
    let contact = -1
    let jumped = false
    let firstDig = -1
    let dug = false
    for (let i = 0; i < 15 * TICK_RATE && player.state.pos[2] < 46; i++) {
      const events = game.step(new Map())
      if (contact < 0 && player.state.pos[2] + 0.3 > 44.95) contact = game.tick
      if (contact >= 0 && firstDig < 0 && player.lastInput.buttons & BUTTON.jump) jumped = true
      for (const e of events) {
        if (e.type === 'shot' && e.player === 1 && e.tool === 'shovel' && firstDig < 0)
          firstDig = game.tick
        if (e.type === 'block' && e.z === 45 && e.id === BLOCK.air) dug = true
      }
    }
    expect(contact).toBeGreaterThan(0)
    expect(jumped).toBe(true)
    expect(firstDig - contact).toBeGreaterThanOrEqual(2.5 * TICK_RATE)
    expect(dug).toBe(true)
    expect(player.state.pos[2]).toBeGreaterThan(46)
  })
})

describe('replanning', () => {
  it('a block placed on its route sends the bot round it', () => {
    const game = flatGame([bot('veteran')], 'ctf')
    put(game, 1, [48.5, FEET, 40.5])
    const brain = game.bots.brain(1)!
    for (let i = 0; i < 10; i++) game.step(new Map())
    expect(brain.nav.path.length).toBeGreaterThan(8)
    const [x, y, z] = brain.nav.path[brain.nav.index + 6]!
    setBlock(game, x, y, z, BLOCK.stone, true)
    setBlock(game, x, y + 1, z, BLOCK.stone, true)
    for (let i = 0; i < 3; i++) game.step(new Map())
    const blocked = brain.nav.path.some(
      ([px, py, pz]) => game.isSolid(px, py, pz) || game.isSolid(px, py + 1, pz),
    )
    expect(blocked).toBe(false)
  })
})

describe('determinism and limits', () => {
  const config = () => ({
    seed: 1,
    mode: 'tdm' as const,
    players: [1, 2, 3, 4].map((id) => ({
      id,
      team: (id <= 2 ? 'blue' : 'red') as 'blue' | 'red',
      name: `bot-${id}`,
      bot: { difficulty: 'veteran' as const },
    })),
  })
  const play = (game: Game, until: number) => {
    const events: GameEvent[] = []
    while (game.tick < until) events.push(...game.step(new Map()))
    return events
  }

  it('a bots-only match replays identically, and from a mid-match save', () => {
    const a = new Game(config())
    const b = new Game(config())
    const eventsA = play(a, 20 * TICK_RATE)
    const eventsB = play(b, 20 * TICK_RATE)
    expect(eventsA).toEqual(eventsB)
    expect(a.serialize()).toEqual(b.serialize())
    expect(eventsA.some((e) => e.type === 'shot')).toBe(true)

    const half = new Game(config())
    play(half, 10 * TICK_RATE)
    const resumed = Game.restore(half.serialize())
    play(resumed, 20 * TICK_RATE)
    expect(resumed.serialize()).toEqual(a.serialize())
  })

  it('bots neither build nor place TNT or ladders', () => {
    const game = new Game(config())
    const events = play(game, 30 * TICK_RATE)
    const placed = events.filter(
      (e) => e.type === 'block' && e.id !== BLOCK.air && e.id !== BLOCK.water,
    )
    expect(placed).toEqual([])
    const tools = events.filter(
      (e) => e.type === 'shot' && (e.tool === 'blocks' || e.tool === 'tnt' || e.tool === 'ladder'),
    )
    expect(tools).toEqual([])
  })

  it('the sniper only on Veteran and at most one per team', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const difficulty of ['recruit', 'soldier', 'veteran'] as const) {
        const players = Array.from({ length: 12 }, (_, i) => ({
          id: i + 1,
          team: (i < 6 ? 'blue' : 'red') as 'blue' | 'red',
          name: `bot-${i + 1}`,
          bot: { difficulty },
        }))
        const game = new Game({ seed, mode: 'ctf', players })
        for (const team of ['blue', 'red']) {
          const snipers = [...game.players.values()].filter(
            (p) => p.config.team === team && p.weapon.weapon === 'sniper',
          )
          expect(snipers.length).toBeLessThanOrEqual(difficulty === 'veteran' ? 1 : 0)
        }
      }
    }
    // 36 full world generations: ~3 s alone, past vitest's 5 s default under a parallel run.
  }, 20_000)
})
