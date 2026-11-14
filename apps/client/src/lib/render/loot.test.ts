import type { PlayerSnapshot } from '@blockfront/sim/game'
import { describe, expect, it } from 'vitest'
import { lootGain } from './loot.ts'

const stock = (reserve: number, pistolReserve: number, bandages: number, grenades: number) =>
  ({ reserve, pistolReserve, bandages, grenades }) as PlayerSnapshot

// Spec (docs/final-scope.md §3 and §5): a chest refills both reserves and gives +1 bandage and
// +1 grenade up to the caps; the notice says only what was really given.
describe('lootGain', () => {
  it('reports everything a chest gave', () => {
    expect(lootGain(stock(30, 24, 1, 2), stock(90, 48, 2, 3))).toEqual({
      ammo: true,
      bandages: 1,
      grenades: 1,
    })
  })

  it('leaves out what was already at its cap', () => {
    expect(lootGain(stock(90, 48, 3, 3), stock(90, 48, 3, 3))).toEqual({
      ammo: false,
      bandages: 0,
      grenades: 0,
    })
    expect(lootGain(stock(90, 10, 3, 1), stock(90, 48, 3, 2))).toEqual({
      ammo: true,
      bandages: 0,
      grenades: 1,
    })
  })

  it('reports nothing without a snapshot to compare with', () => {
    expect(lootGain(null, stock(90, 48, 2, 3)).ammo).toBe(false)
  })
})
