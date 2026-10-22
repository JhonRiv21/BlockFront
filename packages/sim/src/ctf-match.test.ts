import { describe, expect, it } from 'vitest'
import { TICK_RATE, WORLD_SIZE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { BUTTON, createInputFrame, type InputFrame } from './input.ts'
import { applyDamage } from './match/damage.ts'
import { CTF } from './rules/ctf.ts'
import { BLOCK } from './world/blocks.ts'

// Written from PLAN.md §3, docs/audit-2026-10-14.md ("must have in F3") and docs/f2-6-feel.md
// §6 #1 (spawn protection) and D3 (team blocks). Players are moved by hand where walking the
// 87 blocks between bases would say nothing about the rules.

function game(extra: Game['config']['players'] = [], instantLoadout = false): Game {
  return new Game({
    seed: 1,
    instantLoadout,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'dummy', dummy: true, spawn: [45, 28] },
      ...extra,
    ],
  })
}

function frame(overrides: Partial<InputFrame> = {}): InputFrame {
  return { ...createInputFrame(), yaw: Math.PI, ...overrides }
}

function run(g: Game, ticks: number, inputs: Map<number, InputFrame> = new Map()): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) events.push(...g.step(inputs))
  return events
}

const entity = (g: Game, id: number) => g.players.get(id)!
const me = (g: Game, id = 1) => g.snapshot().players.find((p) => p.id === id)!
const flag = (g: Game, team: 'blue' | 'red') => g.snapshot().flags.find((f) => f.team === team)!
function teleport(g: Game, id: number, pos: [number, number, number]): void {
  entity(g, id).state.pos = pos
  entity(g, id).state.vel = [0, 0, 0]
}

describe('flags', () => {
  it('start on their poles, one per base, mirrored over Z', () => {
    const g = game()
    const blue = flag(g, 'blue')
    const red = flag(g, 'red')
    expect(blue.state).toBe('base')
    expect(blue.home[2]).toBeCloseTo(20.5, 5)
    // The generator mirrors z into WORLD_SIZE.z - 1 - z.
    expect(red.home[2]).toBeCloseTo(WORLD_SIZE.z - 1 - 20 + 0.5, 5)
    expect(g.world.getBlock(WORLD_SIZE.x / 2, Math.floor(blue.home[1]) - 1, 20)).toBe(BLOCK.blue)
  })

  it('an enemy touching a flag takes it and it follows them', () => {
    const g = game()
    run(g, 1)
    const red = flag(g, 'red')
    teleport(g, 1, [red.home[0], red.home[1], red.home[2]])
    const events = run(g, 1)
    expect(events.some((e) => e.type === 'flag' && e.action === 'taken' && e.player === 1)).toBe(
      true,
    )
    expect(flag(g, 'red').state).toBe('carried')
    expect(flag(g, 'red').carrier).toBe(1)
    expect(me(g).carrying).toBe(true)
    teleport(g, 1, [50, red.home[1], 90])
    run(g, 1)
    expect(flag(g, 'red').pos[2]).toBeCloseTo(90, 0)
  })

  it('captures only with the own flag at home; three captures win the match', () => {
    const g = game()
    run(g, 1)
    const blueHome = flag(g, 'blue').home
    const redHome = flag(g, 'red').home
    // Take the blue flag away with a red player so the first run back cannot score.
    g.addPlayer({ id: 3, team: 'red', name: 'raider' })
    teleport(g, 3, blueHome)
    run(g, 1)
    expect(flag(g, 'blue').state).toBe('carried')
    teleport(g, 3, [48.5, blueHome[1], 50])
    teleport(g, 1, redHome)
    run(g, 1)
    teleport(g, 1, blueHome)
    run(g, 1)
    expect(g.snapshot().match.scoreBlue).toBe(0)
    expect(flag(g, 'red').state).toBe('carried')
    // The raider dies: the blue flag drops and a blue player touching it returns it.
    applyDamage(g, entity(g, 1), entity(g, 3), 1000, 'torso', 'rifle')
    expect(flag(g, 'blue').state).toBe('dropped')
    teleport(g, 1, flag(g, 'blue').pos)
    const returned = run(g, 1)
    expect(returned.some((e) => e.type === 'flag' && e.action === 'returned')).toBe(true)
    expect(me(g).returns).toBe(1)
    expect(flag(g, 'blue').state).toBe('base')
    teleport(g, 1, blueHome)
    const scored = run(g, 1)
    expect(scored.some((e) => e.type === 'flag' && e.action === 'captured')).toBe(true)
    expect(g.snapshot().match.scoreBlue).toBe(1)
    expect(me(g).captures).toBe(1)
    expect(flag(g, 'red').state).toBe('base')
    for (let i = 0; i < 2; i++) {
      teleport(g, 1, redHome)
      run(g, 1)
      teleport(g, 1, blueHome)
      run(g, 1)
    }
    const after = g.snapshot()
    expect(after.match.scoreBlue).toBe(CTF.capturesToWin)
    expect(after.match.state).toBe('ended')
    expect(after.match.winner).toBe('blue')
    expect(after.match.mvp).toBe(1)
    // Frozen: the clock stops once the match is over.
    const tick = g.tick
    run(g, 5)
    expect(g.tick).toBe(tick)
  })

  it('a dropped flag returns by itself after 20 s', () => {
    const g = game()
    run(g, 1)
    teleport(g, 1, flag(g, 'red').home)
    run(g, 1)
    teleport(g, 1, [48.5, 30, 80])
    applyDamage(g, entity(g, 2), entity(g, 1), 1000, 'torso', 'rifle')
    expect(flag(g, 'red').state).toBe('dropped')
    run(g, CTF.flagReturnSeconds * TICK_RATE - 2)
    expect(flag(g, 'red').state).toBe('dropped')
    const events = run(g, 3)
    expect(events.some((e) => e.type === 'flag' && e.action === 'returned' && e.player === 0)).toBe(
      true,
    )
    expect(flag(g, 'red').state).toBe('base')
  })
})

describe('spawn protection and the base', () => {
  it('a fresh spawn takes no damage for 4 s, then does', () => {
    const g = game()
    run(g, 1)
    applyDamage(g, entity(g, 2), entity(g, 1), 30, 'torso', 'rifle')
    expect(me(g).hp).toBe(100)
    expect(me(g).protected).toBe(true)
    run(g, CTF.spawnProtectionSeconds * TICK_RATE)
    applyDamage(g, entity(g, 2), entity(g, 1), 30, 'torso', 'rifle')
    expect(me(g).hp).toBe(70)
  })

  it('firing ends the protection at once', () => {
    const g = game()
    run(g, 1)
    run(g, 1, new Map([[1, frame({ buttons: BUTTON.fire })]]))
    expect(me(g).protected).toBe(false)
    applyDamage(g, entity(g, 2), entity(g, 1), 30, 'torso', 'rifle')
    expect(me(g).hp).toBe(70)
  })

  it('leaving the base ends the protection; a dummy outside its base has none', () => {
    const g = game()
    run(g, 1)
    expect(me(g, 2).protected).toBe(false)
    teleport(g, 1, [48.5, entity(g, 1).state.pos[1], 50])
    run(g, 1)
    expect(me(g).protected).toBe(false)
  })

  it('restocks hp, blocks, grenades and ammo in the base every 15 s', () => {
    const g = game()
    run(g, 1)
    const player = entity(g, 1)
    player.protectedUntil = 0
    player.hp = 40
    player.blocks = 5
    player.grenades = 0
    player.weapon.mag = 1
    player.weapon.reserve = 0
    run(g, CTF.restockSeconds * TICK_RATE - 5)
    expect(me(g).hp).toBe(40)
    const events = run(g, 6)
    expect(events.some((e) => e.type === 'restock' && e.player === 1)).toBe(true)
    const after = me(g)
    expect(after.hp).toBe(100)
    expect(after.blocks).toBe(50)
    expect(after.grenades).toBe(3)
    expect(after.mag).toBe(8)
    expect(after.reserve).toBe(48)
    // Not again until another 15 s pass.
    entity(g, 1).hp = 50
    run(g, TICK_RATE)
    expect(me(g).hp).toBe(50)
  })
})

describe('respawn waves and loadout', () => {
  it('a death waits for the next 8 s wave and the primary chosen while alive arrives with it', () => {
    const g = game()
    run(g, 1)
    run(g, 1, new Map([[1, frame({ primary: 'smg' })]]))
    expect(me(g).weapon).toBe('rifle')
    entity(g, 1).protectedUntil = 0
    applyDamage(g, entity(g, 2), entity(g, 1), 1000, 'torso', 'carbine')
    const dead = me(g)
    expect(dead.alive).toBe(false)
    expect(dead.killedBy).toBe(2)
    expect(dead.killedWith).toBe('carbine')
    expect(dead.deaths).toBe(1)
    expect(me(g, 2).kills).toBe(1)
    const wave = CTF.waveSeconds * TICK_RATE
    expect(entity(g, 1).respawnTick % wave).toBe(0)
    run(g, entity(g, 1).respawnTick - g.tick)
    const back = me(g)
    expect(back.alive).toBe(true)
    expect(back.weapon).toBe('smg')
    expect(back.protected).toBe(true)
    expect(back.deaths).toBe(1)
  })

  it('with instantLoadout the primary changes at once (dev pause panel)', () => {
    const g = game([], true)
    run(g, 1)
    run(g, 1, new Map([[1, frame({ primary: 'shotgun' })]]))
    expect(me(g).weapon).toBe('shotgun')
  })

  it('damage dealt and taken are tracked per life', () => {
    const g = game()
    run(g, 1)
    entity(g, 1).protectedUntil = 0
    applyDamage(g, entity(g, 1), entity(g, 2), 34, 'limbs', 'rifle')
    applyDamage(g, entity(g, 2), entity(g, 1), 25, 'torso', 'smg')
    expect(me(g).dealtThisLife).toBe(34)
    expect(me(g).takenThisLife).toBe(25)
    expect(me(g).damageDealt).toBe(34)
  })
})

describe('team blocks (D3)', () => {
  it('a grenade spares the thrower team blocks and breaks the enemy ones', () => {
    const g = game()
    run(g, 1)
    const y = 40
    g.world.fillBlock(30, y, 60, BLOCK.dirt)
    g.world.fillBlock(31, y, 60, BLOCK.blue)
    g.world.fillBlock(32, y, 60, BLOCK.red)
    g.grenades.push({ id: 99, owner: 1, pos: [31.5, y + 1.2, 60.5], vel: [0, 0, 0], fuse: 0.01 })
    run(g, 2)
    expect(g.world.getBlock(30, y, 60)).toBe(BLOCK.air)
    expect(g.world.getBlock(31, y, 60)).toBe(BLOCK.blue)
    expect(g.world.getBlock(32, y, 60)).toBe(BLOCK.air)
  })

  it('an enemy can dig a placed block; the placing team cannot', () => {
    const g = game([{ id: 3, team: 'red', name: 'raider' }])
    run(g, 1)
    // Both players stand on a flat spot and aim at the same block placed by blue.
    teleport(g, 1, [40.5, 41, 60.5])
    teleport(g, 3, [40.5, 41, 60.5])
    for (let x = 38; x <= 42; x++)
      for (let z = 58; z <= 62; z++) g.world.fillBlock(x, 40, z, BLOCK.stone)
    for (let x = 38; x <= 42; x++)
      for (let yy = 41; yy <= 45; yy++)
        for (let z = 58; z <= 62; z++) g.world.fillBlock(x, yy, z, BLOCK.air)
    const place = frame({ yaw: 0, pitch: -0.9, slot: 4, buttons: BUTTON.fire })
    run(g, 2, new Map([[1, place]]))
    const placed = [...g.blockOwners.values()]
    expect(placed).toEqual(['blue'])
    const dig = (id: number) =>
      [
        ...run(
          g,
          1,
          new Map([[id, frame({ yaw: 0, pitch: -0.9, slot: 3, buttons: BUTTON.fire })]]),
        ),
        ...run(g, 6, new Map([[id, frame({ yaw: 0, pitch: -0.9, slot: 3 })]])),
      ].some((e) => e.type === 'blockDamaged')
    run(g, 2, new Map([[1, frame({ yaw: 0, slot: 3 })]]))
    expect(dig(1)).toBe(false)
    // Move blue out of the way: the shovel would hit them before reaching the block.
    teleport(g, 1, [40.5, 41, 58.5])
    teleport(g, 1, [38.5, 41, 61.5])
    run(g, 12, new Map([[3, frame({ yaw: 0, slot: 3 })]]))
    expect(dig(3)).toBe(true)
  })
})
