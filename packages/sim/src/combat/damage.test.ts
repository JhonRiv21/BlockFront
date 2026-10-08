import { describe, expect, it } from 'vitest'
import { damageFor } from './damage.ts'

// Written from PLAN.md §3. Rifle and sniper have no falloff; the SMG keeps 100% up to 20 blocks
// and is at 60% by 45; the shotgun (per pellet) is strong until 8 blocks (weapons.ts fixes the
// far end at 25% by 20 blocks); the shovel does 60 to any zone in melee range.

describe('damageFor', () => {
  it('rifle: 50 torso / 100 head / 34 limbs at any distance', () => {
    for (const d of [1, 30, 150]) {
      expect(damageFor('rifle', 'torso', d)).toBe(50)
      expect(damageFor('rifle', 'head', d)).toBe(100)
      expect(damageFor('rifle', 'limbs', d)).toBe(34)
    }
  })

  it('sniper: 90 / 150 / 60 at any distance', () => {
    for (const d of [1, 60, 200]) {
      expect(damageFor('sniper', 'torso', d)).toBe(90)
      expect(damageFor('sniper', 'head', d)).toBe(150)
      expect(damageFor('sniper', 'limbs', d)).toBe(60)
    }
  })

  it('smg: full up to 20 blocks, 60% at 45 and beyond, linear in between', () => {
    expect(damageFor('smg', 'torso', 5)).toBe(25)
    expect(damageFor('smg', 'head', 20)).toBe(60)
    expect(damageFor('smg', 'limbs', 20)).toBe(18)
    expect(damageFor('smg', 'torso', 45)).toBeCloseTo(15, 9)
    expect(damageFor('smg', 'head', 45)).toBeCloseTo(36, 9)
    expect(damageFor('smg', 'torso', 100)).toBeCloseTo(15, 9)
    expect(damageFor('smg', 'torso', 32.5)).toBeCloseTo(20, 9)
  })

  it('shotgun pellet: 14 / 20 / 9 until 8 blocks, then down to 25% at 20', () => {
    expect(damageFor('shotgun', 'torso', 2)).toBe(14)
    expect(damageFor('shotgun', 'head', 8)).toBe(20)
    expect(damageFor('shotgun', 'limbs', 8)).toBe(9)
    expect(damageFor('shotgun', 'torso', 20)).toBeCloseTo(3.5, 9)
    expect(damageFor('shotgun', 'torso', 40)).toBeCloseTo(3.5, 9)
    expect(damageFor('shotgun', 'head', 14)).toBeCloseTo(12.5, 9)
  })

  it('shovel: 60 to every zone', () => {
    expect(damageFor('shovel', 'torso', 1)).toBe(60)
    expect(damageFor('shovel', 'head', 1)).toBe(60)
    expect(damageFor('shovel', 'limbs', 2)).toBe(60)
  })
})
