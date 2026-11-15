import { describe, expect, it } from 'vitest'
import { TICK_RATE } from '../config.ts'
import { Game } from '../game.ts'
import { BUTTON, createInputFrame, type InputFrame } from '../input.ts'

// Written from Jhon's playtest request (2026-11-14): a gun that reloads cannot aim. The sniper
// that fires its last round while scoped leaves the scope and reloads by itself; holding right
// click through the reload brings the aim back once the magazine is full.

function game(): Game {
  return new Game({
    seed: 1,
    instantLoadout: true,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'dummy', dummy: true },
    ],
  })
}

function frame(overrides: Partial<InputFrame>): InputFrame {
  return { ...createInputFrame(), yaw: 0, pitch: 0.4, primary: 'sniper', ...overrides }
}

function run(g: Game, input: InputFrame, ticks: number): void {
  for (let i = 0; i < ticks; i++) g.step(new Map([[1, input]]))
}

const me = (g: Game) => g.snapshot().players.find((p) => p.id === 1)!

describe('aiming and reloading', () => {
  it('drops the scope when the last round leaves and the sniper reloads by itself', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    expect(me(g).weapon).toBe('sniper')
    run(g, frame({ buttons: BUTTON.alt }), TICK_RATE)
    expect(me(g).ads).toBe(1)
    // Five bolt shots, right click held throughout.
    for (let shot = 0; shot < 5; shot++) {
      run(g, frame({ buttons: BUTTON.alt | BUTTON.fire }), 1)
      run(g, frame({ buttons: BUTTON.alt }), Math.ceil(1.3 * TICK_RATE) + 1)
      if (shot < 4) expect(me(g).ads).toBe(1)
    }
    expect(me(g).mag).toBe(0)
    expect(me(g).reloading).toBe(true)
    expect(me(g).ads).toBe(0)
  })

  it('aims again after the reload if right click is still held', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    run(g, frame({ buttons: BUTTON.alt | BUTTON.reload }), 1)
    run(g, frame({ buttons: BUTTON.alt }), 1)
    // A full magazine does not reload: spend one round first.
    run(g, frame({ buttons: BUTTON.fire }), 1)
    run(g, frame({}), Math.ceil(1.3 * TICK_RATE) + 1)
    run(g, frame({ buttons: BUTTON.alt | BUTTON.reload }), 1)
    expect(me(g).reloading).toBe(true)
    run(g, frame({ buttons: BUTTON.alt }), TICK_RATE)
    expect(me(g).ads).toBe(0)
    run(g, frame({ buttons: BUTTON.alt }), Math.ceil(2.6 * TICK_RATE))
    expect(me(g).reloading).toBe(false)
    expect(me(g).ads).toBe(1)
  })
})
