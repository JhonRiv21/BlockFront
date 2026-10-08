import { describe, expect, it } from 'vitest'
import { TICK_RATE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { BUTTON, createInputFrame, type InputFrame } from './input.ts'
import { BLOCK } from './world/palette.ts'

// Written from PLAN.md §2–3: the game steps at 30 Hz from InputFrames and emits events; digging
// returns +1 block; placing spends one; a block takes two shovel hits.

function game(): Game {
  return new Game({
    seed: 1,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'dummy', dummy: true },
    ],
  })
}

// Face the enemy base (+Z) unless the test says otherwise.
function frame(overrides: Partial<InputFrame>): InputFrame {
  return { ...createInputFrame(), yaw: Math.PI, ...overrides }
}

function run(g: Game, input: InputFrame, ticks: number): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) events.push(...g.step(new Map([[1, input]])))
  return events
}

describe('Game', () => {
  it('spawns players alive with the resources of the table', () => {
    const g = game()
    const me = g.snapshot().players.find((p) => p.id === 1)!
    expect(me.hp).toBe(100)
    expect(me.blocks).toBe(50)
    expect(me.grenades).toBe(3)
    expect(me.alive).toBe(true)
    expect(me.slot).toBe(1)
  })

  it('settles the player on the ground within a second', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = g.snapshot().players.find((p) => p.id === 1)!
    expect(me.onGround).toBe(true)
  })

  it('placing a block spends one and digging it back with the shovel returns it', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = () => g.snapshot().players.find((p) => p.id === 1)!
    // Aim at the ground a block ahead: the block goes on its top face, in front of the feet.
    const aim = frame({ pitch: -0.9, slot: 3 })
    const placeEvents = run(g, { ...aim, buttons: BUTTON.fire }, 1)
    const placed = placeEvents.find((e) => e.type === 'block')
    expect(placed).toBeDefined()
    expect(me().blocks).toBe(49)
    const target = placed!.type === 'block' ? placed : null
    expect(target!.id).not.toBe(BLOCK.air)
    expect(g.world.getBlock(target!.x, target!.y, target!.z)).toBe(target!.id)

    const shovel = frame({ pitch: -0.9, slot: 2 })
    run(g, shovel, 2)
    const first = run(g, { ...shovel, buttons: BUTTON.fire }, 1)
    expect(first.some((e) => e.type === 'blockDamaged')).toBe(true)
    expect(g.world.getBlock(target!.x, target!.y, target!.z)).toBe(target!.id)
    run(g, shovel, 10)
    const second = run(g, { ...shovel, buttons: BUTTON.fire }, 1)
    expect(second.some((e) => e.type === 'block' && e.id === BLOCK.air)).toBe(true)
    expect(g.world.getBlock(target!.x, target!.y, target!.z)).toBe(BLOCK.air)
    expect(me().blocks).toBe(50)
  })

  it('never exceeds 50 blocks when digging', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const shovel = frame({ pitch: -0.9, slot: 2 })
    run(g, shovel, 2)
    for (let i = 0; i < 4; i++) {
      run(g, { ...shovel, buttons: BUTTON.fire }, 1)
      run(g, shovel, 10)
    }
    expect(g.snapshot().players.find((p) => p.id === 1)!.blocks).toBe(50)
  })

  it('places nothing when aiming at nothing within reach', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const before = g.snapshot().players.find((p) => p.id === 1)!.blocks
    const events = run(g, frame({ slot: 3, pitch: 0.4, buttons: BUTTON.fire }), 1)
    expect(events.some((e) => e.type === 'block')).toBe(false)
    expect(g.snapshot().players.find((p) => p.id === 1)!.blocks).toBe(before)
  })

  it('serialises and restores its state', () => {
    const g = game()
    run(g, frame({ forward: 1 }), 20)
    const saved = JSON.parse(JSON.stringify(g.serialize()))
    const restored = Game.restore(saved)
    expect(restored.snapshot()).toEqual(g.snapshot())
    expect(restored.tick).toBe(g.tick)
  })
})
