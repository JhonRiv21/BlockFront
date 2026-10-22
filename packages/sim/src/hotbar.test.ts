import { describe, expect, it } from 'vitest'
import { TICK_RATE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { BUILD_COLORS, BUTTON, createInputFrame, type InputFrame } from './input.ts'
import { BLOCK } from './world/blocks.ts'

// Written from docs/f2-5-polish.md §3.3–3.4: five slots in Counter-Strike order, a quick
// grenade throw that keeps the current slot, and one block slot with a colour selector.

function game(): Game {
  return new Game({
    seed: 1,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'dummy', dummy: true },
    ],
  })
}

function frame(overrides: Partial<InputFrame>): InputFrame {
  return { ...createInputFrame(), yaw: Math.PI, ...overrides }
}

function run(g: Game, input: InputFrame, ticks: number): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) events.push(...g.step(new Map([[1, input]])))
  return events
}

describe('hotbar', () => {
  it('has the primary in 1, the pistol in 2, the shovel in 3, blocks in 4 and the grenade in 5', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = () => g.snapshot().players.find((p) => p.id === 1)!
    expect(me().slot).toBe(1)
    expect(me().weapon).toBe('rifle')
    run(g, frame({ slot: 2 }), 2)
    expect(me().slot).toBe(2)
    expect(me().pistolMag).toBe(12)
    const shots = run(g, frame({ slot: 2, buttons: BUTTON.fire }), 1)
    expect(shots.some((e) => e.type === 'shot' && e.tool === 'pistol')).toBe(true)
    expect(me().pistolMag).toBe(11)
    run(g, frame({ slot: 3 }), 2)
    expect(me().slot).toBe(3)
    // Dig natural ground (yaw 0 faces away from the base platform, which the team cannot dig).
    const digs = [
      ...run(g, frame({ slot: 3, yaw: 0, pitch: -0.9, buttons: BUTTON.fire }), 1),
      ...run(g, frame({ slot: 3, yaw: 0, pitch: -0.9 }), 6),
    ]
    expect(digs.some((e) => e.type === 'blockDamaged')).toBe(true)
    run(g, frame({ slot: 4 }), 2)
    expect(me().slot).toBe(4)
    run(g, frame({ slot: 5 }), 2)
    expect(me().slot).toBe(5)
  })

  it('quick-throws a grenade with G without leaving the current slot', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = () => g.snapshot().players.find((p) => p.id === 1)!
    const events = run(g, frame({ slot: 1, buttons: BUTTON.grenade }), 1)
    expect(events.some((e) => e.type === 'grenade')).toBe(true)
    expect(me().grenades).toBe(2)
    expect(me().slot).toBe(1)
    // Holding G does not spam: one grenade per press.
    run(g, frame({ slot: 1, buttons: BUTTON.grenade }), 10)
    expect(me().grenades).toBe(2)
  })

  it('places blocks of the chosen colour, team colour by default, only from the 8 allowed', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = () => g.snapshot().players.find((p) => p.id === 1)!
    expect(BUILD_COLORS.length).toBe(8)
    expect(me().blockColor).toBe(BLOCK.blue)
    const placed = run(g, frame({ slot: 4, pitch: -0.9, buttons: BUTTON.fire }), 1)
    const first = placed.find((e) => e.type === 'block')
    expect(first && first.type === 'block' && first.id).toBe(BLOCK.blue)

    const yellow = BUILD_COLORS[4]!
    run(g, frame({ slot: 4, pitch: -0.9, blockColor: yellow }), 8)
    expect(me().blockColor).toBe(yellow)
    const placed2 = run(
      g,
      frame({ slot: 4, pitch: -0.7, blockColor: yellow, buttons: BUTTON.fire }),
      1,
    )
    const second = placed2.find((e) => e.type === 'block')
    expect(second && second.type === 'block' && second.id).toBe(yellow)

    run(g, frame({ slot: 4, blockColor: BLOCK.bedrock }), 2)
    expect(me().blockColor).toBe(yellow)
  })
})
