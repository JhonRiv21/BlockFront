import { describe, expect, it } from 'vitest'
import { TICK_SECONDS } from '../config.ts'
import { ADS, adsProgress, aimedEnough, moveMultiplier } from './ads.ts'
import { createWeaponState, currentSpread } from './weapon-state.ts'

// Written from docs/f2-5-polish.md §4.1–4.2: aim-down-sights times per weapon, the spread
// reaches its ADS minimum only once the transition is 90 % done, movement slows while aiming.

describe('ADS', () => {
  it('has the times and zooms of the docs/f2-6-feel.md table', () => {
    expect(ADS.rifle.seconds).toBeCloseTo(0.22, 9)
    expect(ADS.rifle.zoom).toBeCloseTo(1.5, 9)
    expect(ADS.carbine.seconds).toBeCloseTo(0.2, 9)
    expect(ADS.carbine.zoom).toBeCloseTo(1.35, 9)
    expect(ADS.smg.seconds).toBeCloseTo(0.15, 9)
    expect(ADS.smg.zoom).toBeCloseTo(1.2, 9)
    expect(ADS.shotgun.seconds).toBeCloseTo(0.18, 9)
    expect(ADS.shotgun.zoom).toBeCloseTo(1.15, 9)
    expect(ADS.pistol.seconds).toBeCloseTo(0.12, 9)
    expect(ADS.pistol.zoom).toBeCloseTo(1.25, 9)
    expect(ADS.sniper.seconds).toBeCloseTo(0.35, 9)
    expect(ADS.sniper.zoom).toBeCloseTo(4, 9)
    expect(ADS.sniper.scope).toBe(true)
  })

  it('progress rises with the aim held and falls when released, clamped to [0, 1]', () => {
    let t = 0
    for (let i = 0; i < 100; i++) t = adsProgress(t, 'rifle', true, TICK_SECONDS)
    expect(t).toBe(1)
    const half = adsProgress(0, 'rifle', true, 0.11)
    expect(half).toBeCloseTo(0.5, 6)
    for (let i = 0; i < 100; i++) t = adsProgress(t, 'rifle', false, TICK_SECONDS)
    expect(t).toBe(0)
  })

  it('counts as aimed only from 90 % of the transition', () => {
    expect(aimedEnough(0.89)).toBe(false)
    expect(aimedEnough(0.9)).toBe(true)
    const rifle = createWeaponState('rifle')
    expect(currentSpread(rifle, false, true)).toBeLessThan(currentSpread(rifle, false, false))
  })

  it('slows movement per the table while aiming', () => {
    expect(moveMultiplier('rifle', 1)).toBeCloseTo(0.7, 9)
    expect(moveMultiplier('sniper', 1)).toBeCloseTo(0.55, 9)
    expect(moveMultiplier('pistol', 1)).toBeCloseTo(0.85, 9)
    expect(moveMultiplier('rifle', 0)).toBeCloseTo(1, 9)
    // Weapon in hand: the carbine walks at 95 %, the pistol at 100 %.
    expect(moveMultiplier('carbine', 0)).toBeCloseTo(0.95, 9)
    expect(moveMultiplier('pistol', 0)).toBeCloseTo(1, 9)
  })
})
