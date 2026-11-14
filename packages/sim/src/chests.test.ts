import { describe, expect, it } from 'vitest'
import { WEAPONS } from './combat/weapons.ts'
import { TICK_RATE, WORLD_SIZE } from './config.ts'
import { Game, type GameEvent } from './game.ts'
import { applyDamage } from './match/damage.ts'
import type { GameMode } from './rules/modes.ts'
import { BLOCK, isLiquid, isSolid } from './world/blocks.ts'

// Written from docs/final-scope.md §3: ten chests per map, deterministic by seed and mirrored
// (five per half), on dry ground, at least 12 blocks from each flag and 10 from each other, the
// same in every mode. Touching one while alive opens it: both reserves back to their maximum
// (magazines untouched), +1 bandage and +1 grenade, each capped at 3. An open chest stays empty
// for 30 s, then refills; `loot` and `chestRefill` events; id, position and full in the snapshot.

function game(mode: GameMode = 'ctf', seed = 1): Game {
  return new Game({
    seed,
    mode,
    players: [
      { id: 1, team: 'blue', name: 'me' },
      { id: 2, team: 'red', name: 'foe', dummy: true, spawn: [45, 28] },
    ],
  })
}
function run(g: Game, ticks: number): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < ticks; i++) events.push(...g.step(new Map()))
  return events
}
const entity = (g: Game, id: number) => g.players.get(id)!
const me = (g: Game, id = 1) => g.snapshot().players.find((p) => p.id === id)!
const chestsOf = (g: Game) => g.snapshot().chests
const horizontal = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!)
function teleport(g: Game, id: number, pos: readonly number[]): void {
  entity(g, id).state.pos = [pos[0]!, pos[1]!, pos[2]!]
  entity(g, id).state.vel = [0, 0, 0]
}
const loots = (events: GameEvent[]) => events.filter((e) => e.type === 'loot')

describe('chest placement', () => {
  it('ten per map, the same for the same seed, five per half and mirrored over Z', () => {
    const chests = chestsOf(game())
    expect(chests).toHaveLength(10)
    expect(chestsOf(game())).toEqual(chests)
    expect(new Set(chests.map((c) => c.id)).size).toBe(10)
    expect(chests.every((c) => c.full)).toBe(true)
    const half = WORLD_SIZE.z / 2
    expect(chests.filter((c) => c.pos[2] < half)).toHaveLength(5)
    for (const chest of chests) {
      const mirror = chests.find(
        (other) =>
          other.pos[0] === chest.pos[0] &&
          other.pos[1] === chest.pos[1] &&
          Math.abs(other.pos[2] - (WORLD_SIZE.z - chest.pos[2])) < 1e-9,
      )
      expect(mirror, `mirror of chest ${chest.id}`).toBeDefined()
    }
  })

  it('a different seed places them elsewhere', () => {
    const one = chestsOf(game('ctf', 1)).map((c) => c.pos)
    const two = chestsOf(game('ctf', 2)).map((c) => c.pos)
    expect(two).not.toEqual(one)
  })

  it('stand on dry ground, at least 12 blocks from each flag and 10 from each other', () => {
    const g = game()
    const homes = g.snapshot().flags.map((f) => f.home)
    const chests = chestsOf(g)
    for (const chest of chests) {
      const [x, y, z] = chest.pos.map(Math.floor) as [number, number, number]
      const ground = g.world.getBlock(x, y - 1, z)
      expect(isSolid(ground), `ground under chest ${chest.id}`).toBe(true)
      expect(ground).not.toBe(BLOCK.sand)
      expect(isLiquid(g.world.getBlock(x, y, z))).toBe(false)
      expect(isSolid(g.world.getBlock(x, y, z))).toBe(false)
      for (const home of homes) expect(horizontal(chest.pos, home)).toBeGreaterThanOrEqual(12)
      for (const other of chests) {
        if (other.id === chest.id) continue
        expect(horizontal(chest.pos, other.pos)).toBeGreaterThanOrEqual(10)
      }
    }
  })

  it('are the same in TDM and FFA', () => {
    const ctf = chestsOf(game('ctf'))
    expect(chestsOf(game('tdm'))).toEqual(ctf)
    expect(chestsOf(game('ffa'))).toEqual(ctf)
  })
})

describe('opening a chest', () => {
  it('refills both reserves, keeps the magazines, gives +1 bandage and +1 grenade', () => {
    const g = game()
    run(g, 1)
    const chest = chestsOf(g)[0]!
    const player = entity(g, 1)
    player.weapon.mag = 3
    player.weapon.reserve = 0
    player.pistol.mag = 2
    player.pistol.reserve = 5
    player.grenades = 1
    player.bandages = 1
    teleport(g, 1, chest.pos)
    const events = run(g, 1)
    expect(loots(events)).toEqual([{ type: 'loot', player: 1, chest: chest.id }])
    const after = me(g)
    expect(after.mag).toBe(3)
    expect(after.reserve).toBe(WEAPONS[after.weapon].reserve)
    expect(after.pistolMag).toBe(2)
    expect(after.pistolReserve).toBe(WEAPONS.pistol.reserve)
    expect(after.bandages).toBe(2)
    expect(after.grenades).toBe(2)
    expect(chestsOf(g).find((c) => c.id === chest.id)!.full).toBe(false)
  })

  it('bandages and grenades stop at 3', () => {
    const g = game()
    run(g, 1)
    const chest = chestsOf(g)[1]!
    entity(g, 1).grenades = 3
    entity(g, 1).bandages = 3
    teleport(g, 1, chest.pos)
    expect(loots(run(g, 1))).toHaveLength(1)
    expect(me(g).bandages).toBe(3)
    expect(me(g).grenades).toBe(3)
  })

  it('an empty chest gives nothing; it comes back full after 30 s', () => {
    const g = game()
    run(g, 1)
    const chest = chestsOf(g)[2]!
    teleport(g, 1, chest.pos)
    run(g, 1)
    const openedAt = g.tick
    entity(g, 1).bandages = 1
    // Standing on it while empty does nothing.
    const waiting = run(g, 30 * TICK_RATE - 1)
    expect(loots(waiting)).toHaveLength(0)
    expect(waiting.some((e) => e.type === 'chestRefill')).toBe(false)
    expect(g.tick).toBe(openedAt + 30 * TICK_RATE - 1)
    expect(chestsOf(g).find((c) => c.id === chest.id)!.full).toBe(false)
    expect(me(g).bandages).toBe(1)
    // Away from it for the refill tick, so nobody grabs it on the spot.
    teleport(g, 1, [chest.pos[0], chest.pos[1], chest.pos[2] + 6])
    const refill = run(g, 1)
    expect(refill).toContainEqual({ type: 'chestRefill', chest: chest.id })
    expect(chestsOf(g).find((c) => c.id === chest.id)!.full).toBe(true)
    teleport(g, 1, chest.pos)
    expect(loots(run(g, 1))).toHaveLength(1)
  })

  it('a dead player standing on it does not open it', () => {
    const g = game()
    run(g, 1)
    const chest = chestsOf(g)[3]!
    teleport(g, 1, chest.pos)
    entity(g, 1).protectedUntil = 0
    applyDamage(g, entity(g, 1), entity(g, 1), 1000, 'torso', 'fall')
    expect(loots(run(g, 3))).toHaveLength(0)
    expect(chestsOf(g).find((c) => c.id === chest.id)!.full).toBe(true)
  })

  it('the chest state survives a save and restore', () => {
    const g = game()
    run(g, 1)
    const chest = chestsOf(g)[4]!
    teleport(g, 1, chest.pos)
    run(g, 1)
    const restored = Game.restore(g.serialize())
    expect(restored.snapshot().chests).toEqual(chestsOf(g))
  })
})
