import { describe, expect, it } from 'vitest'
import { TICK_RATE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { BUTTON, createInputFrame, type InputFrame } from './input.ts'

// PLAN.md §7: the same seed and the same sequence of inputs produce the same final state on the
// same machine. The script below walks, jumps, shoots the rifle and the pistol, throws a
// grenade, digs and builds, so every system that touches the RNG or the world runs.

function config(seed: number) {
  return {
    seed,
    players: [
      { id: 1, team: 'blue' as const, name: 'me' },
      {
        id: 2,
        team: 'red' as const,
        name: 'dummy',
        dummy: true,
        spawn: [61, 28] as [number, number],
      },
    ],
  }
}

function script(tick: number): InputFrame {
  const frame = createInputFrame()
  frame.yaw = Math.PI + Math.sin(tick / 20) * 0.4
  frame.pitch = tick % 90 < 45 ? -0.6 : 0.1
  frame.forward = tick % 60 < 30 ? 1 : 0
  frame.strafe = tick % 45 < 15 ? 1 : 0
  if (tick % 50 === 10) frame.buttons |= BUTTON.jump
  frame.slot = tick < 100 ? 1 : tick < 150 ? 2 : tick < 200 ? 3 : tick < 250 ? 4 : 5
  if (tick % 8 === 0) frame.buttons |= BUTTON.fire
  if (tick === 120) frame.buttons |= BUTTON.reload
  if (tick === 260 || tick === 261) frame.buttons |= BUTTON.fire
  if (tick === 30) frame.buttons |= BUTTON.grenade
  return frame
}

function play(seed: number, ticks: number, from?: Game): { game: Game; events: GameEvent[] } {
  const game = from ?? new Game(config(seed))
  const events: GameEvent[] = []
  for (let t = game.tick; t < ticks; t++) events.push(...game.step(new Map([[1, script(t)]])))
  return { game, events }
}

describe('deterministic replay', () => {
  it('same seed and same inputs: identical final state and identical events', () => {
    const a = play(7, TICK_RATE * 10)
    const b = play(7, TICK_RATE * 10)
    expect(a.game.serialize()).toEqual(b.game.serialize())
    expect(a.events).toEqual(b.events)
    // The script did things: shots, a grenade, block changes.
    expect(a.events.some((e) => e.type === 'shot')).toBe(true)
    expect(a.events.some((e) => e.type === 'grenade')).toBe(true)
    expect(a.events.some((e) => e.type === 'block')).toBe(true)
  })

  it('a different seed diverges', () => {
    const a = play(7, TICK_RATE * 5)
    const b = play(8, TICK_RATE * 5)
    expect(a.game.serialize()).not.toEqual(b.game.serialize())
  })

  it('restoring a mid-match save and replaying the rest lands on the same state', () => {
    const whole = play(7, TICK_RATE * 10)
    const half = play(7, TICK_RATE * 5)
    const resumed = play(7, TICK_RATE * 10, Game.restore(half.game.serialize()))
    expect(resumed.game.serialize()).toEqual(whole.game.serialize())
  })
})

describe('players joining and leaving', () => {
  it('a newcomer spawns alive at their team spawn and shows up in the next snapshot', () => {
    const game = new Game(config(1))
    game.step(new Map())
    game.addPlayer({ id: 3, team: 'red', name: 'late' })
    const snapshot = game.snapshot()
    const late = snapshot.players.find((p) => p.id === 3)
    expect(late).toBeDefined()
    expect(late!.alive).toBe(true)
    expect(late!.hp).toBe(100)
    expect(snapshot.players).toHaveLength(3)
  })

  it('refuses a duplicate id', () => {
    const game = new Game(config(1))
    expect(() => game.addPlayer({ id: 1, team: 'red', name: 'twin' })).toThrow()
  })

  it('a leaver disappears and their grenade in flight still explodes', () => {
    const game = new Game(config(1))
    for (let i = 0; i < TICK_RATE; i++) game.step(new Map())
    const throwFrame = { ...createInputFrame(), yaw: Math.PI, buttons: BUTTON.grenade }
    game.step(new Map([[1, throwFrame]]))
    expect(game.snapshot().grenades).toHaveLength(1)
    game.removePlayer(1)
    expect(game.snapshot().players.find((p) => p.id === 1)).toBeUndefined()
    const events: GameEvent[] = []
    for (let i = 0; i < TICK_RATE * 4; i++) events.push(...game.step(new Map()))
    expect(events.some((e) => e.type === 'explosion')).toBe(true)
    // Removing twice or an unknown id is a no-op.
    game.removePlayer(1)
    game.removePlayer(99)
  })

  it('serialize and restore round-trip after a join', () => {
    const game = new Game(config(1))
    game.addPlayer({ id: 3, team: 'red', name: 'late' })
    game.step(new Map())
    const restored = Game.restore(game.serialize())
    expect(restored.snapshot()).toEqual(game.snapshot())
  })
})
