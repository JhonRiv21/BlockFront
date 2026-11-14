import { describe, expect, it } from 'vitest'
import { maxBlockHp } from './combat/blocks.ts'
import { ITEMS } from './combat/weapons.ts'
import { TICK_RATE, TICK_SECONDS } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { BUTTON, createInputFrame, type InputFrame } from './input.ts'
import { applyDamage } from './match/damage.ts'
import { createPlayer, stepPlayer, type MoveInput } from './physics/player-controller.ts'
import { BLOCK } from './world/blocks.ts'

// Written from docs/f2-6-feel.md §6 and the F3-B brief: TNT placed as a block that goes off
// when shot or after a 4 s fuse, 2 per life, harmless to allies and to the team's own blocks;
// a ladder on a
// side face, climbed with W or Space, which cancels the fall and breaks at one shovel hit; a
// medkit on its own slot, a 1 s channel, unusable by the flag carrier. (The reinforced block
// was dropped on 2026-10-22: a bunker around the flag kills the capture.) The medkit became
// bandages in docs/final-scope.md §3: +40 hp capped at 100, start with 1, carry up to 3.

function game(extra: Game['config']['players'] = []): Game {
  return new Game({
    seed: 1,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'dummy', dummy: true, spawn: [45, 28] },
      ...extra,
    ],
  })
}
function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...createInputFrame(), yaw: 0, ...overrides }
}
function run(g: Game, ticks: number, inputs: Map<number, InputFrame> = new Map()): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) events.push(...g.step(inputs))
  return events
}
const entity = (g: Game, id: number) => g.players.get(id)!
const me = (g: Game, id = 1) => g.snapshot().players.find((p) => p.id === id)!

// A flat stone slab at y = 40 with air above, far from both bases; the player stands on it.
function arena(g: Game, ...ids: number[]): void {
  for (let x = 30; x <= 50; x++)
    for (let z = 50; z <= 70; z++) {
      g.world.fillBlock(x, 40, z, BLOCK.stone)
      for (let y = 41; y <= 50; y++) g.world.fillBlock(x, y, z, BLOCK.air)
    }
  for (const id of ids) {
    entity(g, id).state.pos = [40.5, 41, 60.5]
    entity(g, id).state.vel = [0, 0, 0]
    entity(g, id).protectedUntil = 0
  }
}
const placeAhead = (slot: number) => frame({ pitch: -0.9, slot, buttons: BUTTON.fire })

describe('TNT', () => {
  it('is placed as a block with 2 per life and goes off by itself after 4 s', () => {
    const g = game()
    run(g, 1)
    arena(g, 1)
    expect(me(g).tnt).toBe(ITEMS.tnt.perLife)
    const placed = run(g, 1, new Map([[1, placeAhead(6)]]))
    const block = placed.find((e) => e.type === 'block')
    expect(block && block.type === 'block' ? block.id : null).toBe(BLOCK.tnt)
    expect(me(g).tnt).toBe(1)
    const quiet = run(g, ITEMS.tnt.fuseSeconds * TICK_RATE - 3, new Map([[1, frame({ slot: 6 })]]))
    expect(quiet.some((e) => e.type === 'explosion')).toBe(false)
    const boom = run(g, 4, new Map([[1, frame({ slot: 6 })]]))
    expect(boom.some((e) => e.type === 'explosion')).toBe(true)
    expect(g.world.getBlock(40, 41, 59)).toBe(BLOCK.air)
    // The blast opened the stone slab under it (radius 3), the thrower took damage.
    expect(g.world.getBlock(40, 40, 59)).toBe(BLOCK.air)
    expect(me(g).hp).toBeLessThan(100)
  })

  it('goes off at once when shot', () => {
    const g = game()
    run(g, 1)
    arena(g, 1)
    run(g, 1, new Map([[1, placeAhead(6)]]))
    run(g, 2, new Map([[1, frame({ slot: 1 })]]))
    const events = run(g, 1, new Map([[1, frame({ slot: 1, pitch: -0.9, buttons: BUTTON.fire })]]))
    expect(events.some((e) => e.type === 'shot')).toBe(true)
    expect(events.some((e) => e.type === 'explosion')).toBe(true)
  })

  it('spares allies and the team own blocks, hurts enemies', () => {
    const g = game([
      { id: 3, team: 'blue', name: 'mate' },
      { id: 4, team: 'red', name: 'foe' },
    ])
    run(g, 1)
    arena(g, 1, 3, 4)
    entity(g, 3).state.pos = [42.5, 41, 60.5]
    entity(g, 4).state.pos = [38.5, 41, 60.5]
    g.world.fillBlock(41, 41, 61, BLOCK.blue)
    g.world.fillBlock(39, 41, 61, BLOCK.red)
    run(g, 1, new Map([[1, placeAhead(6)]]))
    run(g, ITEMS.tnt.fuseSeconds * TICK_RATE + 2, new Map([[1, frame({ slot: 6 })]]))
    expect(me(g, 3).hp).toBe(100)
    expect(me(g, 4).hp).toBeLessThan(100)
    expect(g.world.getBlock(41, 41, 61)).toBe(BLOCK.blue)
    expect(g.world.getBlock(39, 41, 61)).toBe(BLOCK.air)
  })

  it('a shovel can dig an enemy TNT out before it blows: no explosion', () => {
    const g = game([{ id: 4, team: 'red', name: 'foe' }])
    run(g, 1)
    arena(g, 1, 4)
    run(g, 1, new Map([[1, placeAhead(6)]]))
    // Without a fresh frame the sim keeps the last one, trigger held: let go of it.
    run(g, 1, new Map([[1, frame({ slot: 6 })]]))
    entity(g, 1).state.pos = [45.5, 41, 65.5]
    const digFrames = new Map([
      [1, frame({ slot: 6 })],
      [4, frame({ pitch: -0.9, slot: 3, buttons: BUTTON.fire })],
    ])
    const hold = new Map([
      [1, frame({ slot: 6 })],
      [4, frame({ pitch: -0.9, slot: 3 })],
    ])
    let gone = false
    for (let i = 0; i < 8 && !gone; i++) {
      run(g, 1, digFrames)
      run(g, 11, hold)
      gone = g.world.getBlock(40, 41, 59) === BLOCK.air
    }
    expect(gone).toBe(true)
    const rest = run(g, ITEMS.tnt.fuseSeconds * TICK_RATE, hold)
    expect(rest.some((e) => e.type === 'explosion')).toBe(false)
  })

  // docs/final-scope.md §2: the own shovel picks the own TNT back up before it blows, an
  // exception to D3; it returns 1 to the stock and does not go off. A teammate still cannot.
  it('the own shovel picks the own TNT back up: +1 stock, no blast', () => {
    const g = game()
    run(g, 1)
    arena(g, 1)
    run(g, 1, new Map([[1, placeAhead(6)]]))
    expect(me(g).tnt).toBe(ITEMS.tnt.perLife - 1)
    run(g, 1, new Map([[1, frame({ pitch: -0.9, slot: 3 })]]))
    const swing = run(g, 1, new Map([[1, frame({ pitch: -0.9, slot: 3, buttons: BUTTON.fire })]]))
    const after = run(g, 11, new Map([[1, frame({ pitch: -0.9, slot: 3 })]]))
    expect([...swing, ...after].some((e) => e.type === 'explosion')).toBe(false)
    expect(g.world.getBlock(40, 41, 59)).toBe(BLOCK.air)
    expect(me(g).tnt).toBe(ITEMS.tnt.perLife)
    const rest = run(g, ITEMS.tnt.fuseSeconds * TICK_RATE, new Map([[1, frame({ slot: 3 })]]))
    expect(rest.some((e) => e.type === 'explosion')).toBe(false)
    expect(me(g).hp).toBe(100)
  })

  it('a teammate shovel leaves the TNT alone (D3)', () => {
    const g = game([{ id: 3, team: 'blue', name: 'mate' }])
    run(g, 1)
    arena(g, 1, 3)
    run(g, 1, new Map([[1, placeAhead(6)]]))
    entity(g, 1).state.pos = [45.5, 41, 65.5]
    const quiet: [number, InputFrame] = [1, frame({ slot: 6 })]
    for (let i = 0; i < 3; i++) {
      run(g, 1, new Map([quiet, [3, frame({ pitch: -0.9, slot: 3, buttons: BUTTON.fire })]]))
      run(g, 11, new Map([quiet, [3, frame({ pitch: -0.9, slot: 3 })]]))
    }
    expect(g.world.getBlock(40, 41, 59)).toBe(BLOCK.tnt)
    expect(me(g, 3).tnt).toBe(ITEMS.tnt.perLife)
  })
})

describe('ladder', () => {
  const idle: MoveInput = {
    forward: 0,
    strafe: 0,
    yaw: 0,
    jump: false,
    crouch: false,
    sprint: false,
  }
  const wall = (_x: number, y: number, z: number) => y < 0 || z <= -1
  const ladder = (x: number, y: number, z: number) => x === 0 && z === 0 && y >= 0 && y < 6

  it('climbs with W or Space, holds with C, slides down otherwise, and the fall is forgiven', () => {
    const up = createPlayer([0.5, 0, 0.5])
    for (let i = 0; i < 30; i++)
      stepPlayer(up, { ...idle, forward: 1 }, wall, TICK_SECONDS, undefined, ladder)
    expect(up.pos[1]).toBeGreaterThan(1.5)
    const space = createPlayer([0.5, 0, 0.5])
    for (let i = 0; i < 30; i++)
      stepPlayer(space, { ...idle, jump: true }, wall, TICK_SECONDS, undefined, ladder)
    expect(space.pos[1]).toBeGreaterThan(1.5)
    const hold = createPlayer([0.5, 3, 0.5])
    for (let i = 0; i < 30; i++)
      stepPlayer(hold, { ...idle, crouch: true }, wall, TICK_SECONDS, undefined, ladder)
    expect(hold.pos[1]).toBeCloseTo(3, 1)
    const slide = createPlayer([0.5, 3, 0.5])
    for (let i = 0; i < 30; i++) stepPlayer(slide, idle, wall, TICK_SECONDS, undefined, ladder)
    expect(slide.pos[1]).toBeLessThan(3)
    expect(slide.pos[1]).toBeGreaterThan(1)
    // Fell 20 blocks onto a ladder: no landing to pay for.
    const drop = createPlayer([0.5, 20, 0.5])
    let worst = 0
    for (let i = 0; i < 120; i++) {
      stepPlayer(drop, idle, wall, TICK_SECONDS, undefined, ladder)
      worst = Math.max(worst, drop.landedFrom)
    }
    expect(worst).toBeLessThan(1)
  })

  it('is placed only on a side face and breaks at one shovel hit', () => {
    const g = game([{ id: 4, team: 'red', name: 'foe' }])
    run(g, 1)
    arena(g, 1, 4)
    // On the floor (top face): refused.
    run(g, 1, new Map([[1, placeAhead(7)]]))
    expect(me(g).ladders).toBe(ITEMS.ladder.perLife)
    // Against a wall ahead, at eye level: accepted.
    for (let y = 41; y <= 45; y++) g.world.fillBlock(40, y, 57, BLOCK.stone)
    run(g, 1, new Map([[1, frame({ pitch: 0, slot: 7, buttons: BUTTON.fire })]]))
    // Hung on the wall's +z face: the south-facing ladder.
    expect(g.world.getBlock(40, 42, 58)).toBe(BLOCK.ladderSouth)
    expect(me(g).ladders).toBe(ITEMS.ladder.perLife - 1)
    expect(maxBlockHp(BLOCK.ladderSouth)).toBe(1)
    entity(g, 1).state.pos = [45.5, 41, 65.5]
    entity(g, 4).state.pos = [40.5, 41, 60.5]
    const quiet = new Map([[1, frame({ slot: 7 })]])
    run(g, 1, new Map([...quiet, [4, frame({ pitch: -0.1, slot: 3, buttons: BUTTON.fire })]]))
    run(g, 6, new Map([...quiet, [4, frame({ pitch: -0.1, slot: 3 })]]))
    expect(g.world.getBlock(40, 42, 58)).toBe(BLOCK.air)
  })
})

describe('bandages', () => {
  it('start with 1; holding fire for 1 s heals +40, letting go restarts the channel', () => {
    const g = game()
    run(g, 1)
    arena(g, 1)
    expect(me(g).bandages).toBe(1)
    entity(g, 1).hp = 30
    const hold = new Map([[1, frame({ slot: 8, buttons: BUTTON.fire })]])
    run(g, TICK_RATE - 5, hold)
    expect(me(g).hp).toBe(30)
    expect(me(g).healing).toBeGreaterThan(0.5)
    run(g, 2, new Map([[1, frame({ slot: 8 })]]))
    expect(me(g).healing).toBe(0)
    expect(me(g).hp).toBe(30)
    const events = run(g, TICK_RATE + 2, hold)
    expect(events.filter((e) => e.type === 'heal' && e.player === 1)).toHaveLength(1)
    expect(me(g).hp).toBe(70)
    expect(me(g).bandages).toBe(0)
    // No stock left: the slot hands back to the primary.
    run(g, 1, hold)
    expect(me(g).slot).toBe(1)
  })

  it('never heal past 100 and use one bandage each', () => {
    const g = game()
    run(g, 1)
    arena(g, 1)
    entity(g, 1).bandages = 3
    entity(g, 1).hp = 80
    run(g, TICK_RATE + 2, new Map([[1, frame({ slot: 8, buttons: BUTTON.fire })]]))
    expect(me(g).hp).toBe(100)
    expect(me(g).bandages).toBe(2)
  })

  it('the flag carrier cannot use them', () => {
    const g = game()
    run(g, 1)
    const red = g.snapshot().flags.find((f) => f.team === 'red')!
    entity(g, 1).state.pos = [...red.home]
    entity(g, 1).protectedUntil = 0
    run(g, 1)
    expect(me(g).carrying).toBe(true)
    applyDamage(g, entity(g, 2), entity(g, 1), 50, 'torso', 'rifle')
    run(g, TICK_RATE * 2, new Map([[1, frame({ slot: 8, buttons: BUTTON.fire })]]))
    expect(me(g).hp).toBe(50)
    expect(me(g).bandages).toBe(1)
  })
})
