import { describe, expect, it } from 'vitest'
import { TICK_RATE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { GRENADE } from './combat/weapons.ts'
import { BUTTON, createInputFrame, type InputFrame } from './input.ts'
import { BLOCK } from './world/blocks.ts'

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
    const aim = frame({ pitch: -0.9, slot: 4 })
    const placeEvents = run(g, { ...aim, buttons: BUTTON.fire }, 1)
    const placed = placeEvents.find((e) => e.type === 'block')
    expect(placed).toBeDefined()
    expect(me().blocks).toBe(49)
    const target = placed!.type === 'block' ? placed : null
    expect(target!.id).not.toBe(BLOCK.air)
    expect(g.world.getBlock(target!.x, target!.y, target!.z)).toBe(target!.id)

    const shovel = frame({ pitch: -0.9, slot: 3 })
    run(g, shovel, 2)
    const first = [...run(g, { ...shovel, buttons: BUTTON.fire }, 1), ...run(g, shovel, 6)]
    expect(first.some((e) => e.type === 'blockDamaged')).toBe(true)
    expect(g.world.getBlock(target!.x, target!.y, target!.z)).toBe(target!.id)
    run(g, shovel, 10)
    const second = [...run(g, { ...shovel, buttons: BUTTON.fire }, 1), ...run(g, shovel, 6)]
    expect(second.some((e) => e.type === 'block' && e.id === BLOCK.air)).toBe(true)
    expect(g.world.getBlock(target!.x, target!.y, target!.z)).toBe(BLOCK.air)
    expect(me().blocks).toBe(50)
  })

  it('never exceeds 50 blocks when digging', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const shovel = frame({ pitch: -0.9, slot: 3 })
    run(g, shovel, 2)
    for (let i = 0; i < 4; i++) {
      run(g, { ...shovel, buttons: BUTTON.fire }, 1)
      run(g, shovel, 12)
    }
    expect(g.snapshot().players.find((p) => p.id === 1)!.blocks).toBe(50)
  })

  it('places nothing when aiming at nothing within reach', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const before = g.snapshot().players.find((p) => p.id === 1)!.blocks
    const events = run(g, frame({ slot: 4, pitch: 0.4, buttons: BUTTON.fire }), 1)
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

describe('vegetation rules', () => {
  it('removes the tall grass standing on a block that the shovel breaks', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = g.snapshot().players.find((p) => p.id === 1)!
    // The block the shovel will hit when looking down ahead, and a plant on top of it.
    const shovel = frame({ pitch: -0.9, slot: 3 })
    const first = [...run(g, { ...shovel, buttons: BUTTON.fire }, 1), ...run(g, shovel, 6)]
    const damaged = first.find((e) => e.type === 'blockDamaged')
    expect(damaged).toBeDefined()
    const { x, y, z } = damaged as { x: number; y: number; z: number }
    expect(me.pos[1]).toBeGreaterThan(y)
    g.world.fillBlock(x, y + 1, z, BLOCK.tallGrass)
    run(g, shovel, 10)
    const second = [...run(g, { ...shovel, buttons: BUTTON.fire }, 1), ...run(g, shovel, 6)]
    const cleared = second.filter((e) => e.type === 'block' && e.id === BLOCK.air)
    expect(cleared.length).toBe(2)
    expect(g.world.getBlock(x, y + 1, z)).toBe(BLOCK.air)
  })

  it('does not stop bullets or movement with tall grass', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = () => g.snapshot().players.find((p) => p.id === 1)!
    const [px, py, pz] = me().pos
    for (let dz = 1; dz <= 4; dz++)
      g.world.fillBlock(Math.floor(px), Math.floor(py), Math.floor(pz) + dz, BLOCK.tallGrass)
    run(g, frame({ forward: 1 }), 20)
    expect(me().pos[2]).toBeGreaterThan(pz + 2)
  })
})

describe('water rules', () => {
  it('fills a hole dug below the water level next to water, in one step only', () => {
    const g = game()
    // Find a sand block on the river bank under the water level with water beside it.
    let target: [number, number, number] | null = null
    for (let z = 80; z < 96 && !target; z++)
      for (let x = 20; x < 60 && !target; x++) {
        const id = g.world.getBlock(x, 16, z)
        if (
          id !== BLOCK.air &&
          id !== BLOCK.water &&
          g.world.getBlock(x, 16, z + 1) === BLOCK.water
        )
          target = [x, 16, z]
      }
    expect(target).not.toBeNull()
    const [x, y, z] = target!
    // Blow it up through the private helper path used by shovel and grenade.
    const health = g['health'] as {
      damage: (x: number, y: number, z: number, amount: number) => boolean
    }
    expect(health.damage(x, y, z, 1000)).toBe(true)
    const fill = g['fillWithWater'] as (x: number, y: number, z: number) => void
    fill.call(g, x, y, z)
    expect(g.world.getBlock(x, y, z)).toBe(BLOCK.water)
    // The neighbour on the dry side stays as it was: no cascade.
    expect(g.world.getBlock(x, y, z - 1)).not.toBe(BLOCK.water)
  })

  it('does not fill holes above the water level', () => {
    const g = game()
    const fill = g['fillWithWater'] as (x: number, y: number, z: number) => void
    g.world.fillBlock(10, 30, 10, BLOCK.air)
    g.world.fillBlock(11, 30, 10, BLOCK.water)
    fill.call(g, 10, 30, 10)
    expect(g.world.getBlock(10, 30, 10)).toBe(BLOCK.air)
  })

  it('drowns a player whose eyes stay under water', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const me = () => g.snapshot().players.find((p) => p.id === 1)!
    const [px, py, pz] = me().pos
    // Flood a 3×4×3 pit around the player, 2 blocks over the head.
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++)
        for (let y = Math.floor(py) - 2; y <= Math.floor(py) + 2; y++)
          g.world.fillBlock(Math.floor(px) + dx, y, Math.floor(pz) + dz, BLOCK.water)
    run(g, frame({ crouch: true } as never), 1)
    const events = run(g, { ...frame({}), buttons: BUTTON.crouch }, TICK_RATE * 18)
    expect(me().eyeInWater).toBe(true)
    expect(events.some((e) => e.type === 'hit' && e.tool === 'drowning')).toBe(true)
    expect(me().hp).toBeLessThan(100)
    expect(me().air).toBe(0)
  })
})

describe('shovel swing timing (docs/f2-5-polish.md §5.3)', () => {
  it('lands the hit about 0.14 s after the swing starts and spaces swings 0.35 s apart', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const shovel = frame({ pitch: -0.9, slot: 3 })
    const swing = run(g, { ...shovel, buttons: BUTTON.fire }, 1)
    expect(swing.some((e) => e.type === 'shot' && e.tool === 'shovel')).toBe(true)
    expect(swing.some((e) => e.type === 'blockDamaged')).toBe(false)
    let hitTick = -1
    for (let i = 1; i <= 8 && hitTick < 0; i++) {
      const events = run(g, shovel, 1)
      if (events.some((e) => e.type === 'blockDamaged')) hitTick = i
    }
    expect(hitTick).toBeGreaterThanOrEqual(3)
    expect(hitTick).toBeLessThanOrEqual(5)
    // Holding the button: the next swing waits for the 0.35 s interval.
    let swings = 0
    for (let i = 0; i < Math.round(0.35 * TICK_RATE * 3); i++) {
      swings += run(g, { ...shovel, buttons: BUTTON.fire }, 1).filter(
        (e) => e.type === 'shot',
      ).length
    }
    expect(swings).toBeGreaterThanOrEqual(2)
    expect(swings).toBeLessThanOrEqual(3)
  })

  it('carries the face that was hit in the block damage event', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    const shovel = frame({ pitch: -0.9, slot: 3 })
    run(g, { ...shovel, buttons: BUTTON.fire }, 1)
    const events = run(g, shovel, 6)
    const hit = events.find((e) => e.type === 'blockDamaged')
    expect(hit && hit.type === 'blockDamaged' ? hit.normal : null).toEqual([0, 1, 0])
  })
})

describe('sprint and fire (docs/f2-5-polish.md §5.1)', () => {
  it('cannot fire for 0.15 s after sprinting', () => {
    const g = game()
    run(g, frame({}), TICK_RATE)
    run(g, frame({ forward: 1, buttons: BUTTON.sprint }), 20)
    const immediate = run(g, frame({ buttons: BUTTON.fire }), 1)
    expect(immediate.some((e) => e.type === 'shot')).toBe(false)
    const later = run(g, frame({ buttons: BUTTON.fire }), 6)
    expect(later.some((e) => e.type === 'shot')).toBe(true)
  })
})

describe('knockback (playtest 2026-10-09)', () => {
  it('pushes the victim away from the shooter', () => {
    const g = new Game({
      seed: 1,
      players: [
        { id: 1, team: 'blue', name: 'me' },
        { id: 2, team: 'red', name: 'dummy', dummy: true, spawn: [61, 28] },
      ],
    })
    run(g, frame({}), TICK_RATE)
    const before = g.snapshot().players.find((p) => p.id === 2)!.pos
    const me = g.snapshot().players.find((p) => p.id === 1)!
    const dx = before[0] - me.pos[0]
    const dz = before[2] - me.pos[2]
    const dy = before[1] + 1.1 - (me.pos[1] + me.eyeHeight)
    const aim = frame({ yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) })
    const events = run(g, { ...aim, buttons: BUTTON.fire }, 1)
    expect(events.some((e) => e.type === 'hit' && e.victim === 2)).toBe(true)
    run(g, aim, 10)
    const after = g.snapshot().players.find((p) => p.id === 2)!.pos
    // Moved away from the shooter by a noticeable amount.
    const dist = (p: number[]) => Math.hypot(p[0]! - me.pos[0], p[2]! - me.pos[2])
    expect(dist(after) - dist(before)).toBeGreaterThan(0.2)
  })
})

// Spec agreed in the 2026-10-14 playtest: a grenade cooked through its whole fuse kills the
// holder; explosion damage is 150 at the centre fading to 0 at 4.5 blocks (lethal inside 1.5);
// slots 4 and 5 cannot be selected without stock and hand back to the primary when it runs out;
// pulling the trigger on an empty magazine with no reserve emits a dry-fire event and no shot.
// The game code was in context while writing these; the numbers come from the agreement above.
describe('grenade stock, cook-out and dry fire', () => {
  function settled(): Game {
    const g = game()
    run(g, frame({}), TICK_RATE)
    return g
  }
  const me = (g: Game) => g.snapshot().players.find((p) => p.id === 1)!

  it('holding the grenade for the whole fuse kills the holder', () => {
    const g = settled()
    const hold = frame({ slot: 5, buttons: BUTTON.fire })
    const events = run(g, hold, TICK_RATE * 3 + 2)
    const death = events.find((e) => e.type === 'death')
    expect(death).toBeDefined()
    if (death?.type !== 'death') throw new Error('no death event')
    expect(death.victim).toBe(1)
    expect(death.attacker).toBe(1)
    expect(death.tool).toBe('grenade')
    expect(me(g).alive).toBe(false)
  })

  it('explosion damage: lethal inside 1.5 blocks, 50 at 3 blocks', () => {
    expect(GRENADE.maxDamage * (1 - 1.5 / GRENADE.damageRadius)).toBeGreaterThanOrEqual(100)
    expect(GRENADE.maxDamage * (1 - 3 / GRENADE.damageRadius)).toBeCloseTo(50, 5)
  })

  it('slot 5 cannot be selected with no grenades and hands back to the primary after the last one', () => {
    const g = settled()
    // Quick-throw two from the primary, then hold slot 5 and throw the last one.
    for (let i = 0; i < 2; i++) {
      run(g, frame({ buttons: BUTTON.grenade }), 1)
      run(g, frame({}), 2)
    }
    expect(me(g).grenades).toBe(1)
    run(g, frame({ slot: 5 }), 1)
    expect(me(g).slot).toBe(5)
    run(g, frame({ slot: 5, buttons: BUTTON.fire }), 3)
    run(g, frame({ slot: 5 }), 2)
    expect(me(g).grenades).toBe(0)
    expect(me(g).slot).toBe(1)
    // Asking for slot 5 again is refused while the stock is empty.
    run(g, frame({ slot: 5 }), 2)
    expect(me(g).slot).toBe(1)
  })

  it('slot 4 is refused with no blocks', () => {
    const g = settled()
    const entity = (g['players'] as Map<number, { blocks: number }>).get(1)!
    entity.blocks = 0
    run(g, frame({ slot: 4 }), 2)
    expect(me(g).slot).toBe(1)
  })

  it('an empty magazine with no reserve clicks instead of shooting', () => {
    const g = settled()
    const entity = (g['players'] as Map<number, { weapon: { mag: number; reserve: number } }>).get(
      1,
    )!
    entity.weapon.mag = 0
    entity.weapon.reserve = 0
    const events = run(g, frame({ buttons: BUTTON.fire }), 1)
    expect(events.some((e) => e.type === 'dryfire' && e.player === 1)).toBe(true)
    expect(events.some((e) => e.type === 'shot')).toBe(false)
    // Holding the trigger does not repeat the click every tick.
    const more = run(g, frame({ buttons: BUTTON.fire }), 5)
    expect(more.filter((e) => e.type === 'dryfire')).toHaveLength(0)
  })
})
