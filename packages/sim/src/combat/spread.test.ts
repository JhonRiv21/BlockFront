import { describe, expect, it } from 'vitest'
import { Rng } from '../rng.ts'
import { computeSpread, scatterRadius, SPREAD, type SpreadContext } from './spread.ts'

// Written from docs/f2-6-feel.md §2: hip and ADS half-angles per weapon, modifiers, the
// interpolation during the ADS transition, and the two shot distributions.

const DEG = Math.PI / 180
const still: SpreadContext = { ads: 0, bloom: 0, moving: false, airborne: false, crouching: false }

describe('spread table', () => {
  // Hip columns toned down ~35 % after the playtest; ADS, recoil, zoom, time and move as in the doc.
  it.each([
    ['rifle', 1.6, 3.0, 0.5, 0.08, 0.5, 0.15, 0.6, 1.5, 0.22, 0.7],
    ['carbine', 1.4, 3.2, 0.3, 0.15, 0.9, 0.08, 0.65, 1.35, 0.2, 0.72],
    ['smg', 0.9, 2.2, 0.18, 0.35, 1.0, 0.06, 0.75, 1.2, 0.15, 0.8],
    ['pistol', 0.8, 2.2, 0.4, 0.12, 0.8, 0.1, 0.7, 1.25, 0.12, 0.85],
  ] as const)(
    '%s: hip %s→%s (+%s), ADS %s→%s (+%s), recoil ×%s, zoom %sx, %s s, move %s',
    (weapon, hip, hipMax, hipShot, ads, adsMax, adsShot, recoil, zoom, seconds, move) => {
      const s = SPREAD[weapon]
      expect(s.hip.base).toBeCloseTo(hip, 9)
      expect(s.hip.max).toBeCloseTo(hipMax, 9)
      expect(s.hip.perShot).toBeCloseTo(hipShot, 9)
      expect(s.ads.base).toBeCloseTo(ads, 9)
      expect(s.ads.max).toBeCloseTo(adsMax, 9)
      expect(s.ads.perShot).toBeCloseTo(adsShot, 9)
      expect(s.recoilAds).toBeCloseTo(recoil, 9)
      expect(s.zoom).toBeCloseTo(zoom, 9)
      expect(s.adsSeconds).toBeCloseTo(seconds, 9)
      expect(s.move).toBeCloseTo(move, 9)
    },
  )

  it('shotgun is a fixed cone and the sniper punishes the hip', () => {
    expect(SPREAD.shotgun.hip.base).toBeCloseTo(4.5, 9)
    expect(SPREAD.shotgun.ads.base).toBeCloseTo(3.5, 9)
    expect(SPREAD.shotgun.hip.perShot).toBe(0)
    expect(SPREAD.sniper.hip.base).toBeCloseTo(4, 9)
    expect(SPREAD.sniper.ads.base).toBeCloseTo(0.02, 9)
    expect(SPREAD.sniper.zoom).toBeCloseTo(4, 9)
    expect(SPREAD.sniper.move).toBeCloseTo(0.55, 9)
    expect(SPREAD.sniper.recoilAds).toBeCloseTo(0.5, 9)
  })

  it('bloom recovers between 6 and 10 degrees per second', () => {
    for (const s of Object.values(SPREAD)) {
      expect(s.recoveryPerSecond).toBeGreaterThanOrEqual(6)
      expect(s.recoveryPerSecond).toBeLessThanOrEqual(10)
    }
  })
})

describe('computeSpread', () => {
  it('returns the hip base still and the ADS base fully aimed, in radians', () => {
    expect(computeSpread('rifle', still)).toBeCloseTo(1.6 * DEG, 9)
    expect(computeSpread('rifle', { ...still, ads: 1 })).toBeCloseTo(0.08 * DEG, 9)
  })

  it('applies the modifiers: moving ×1.3 / ×1.25, air +2° / +1.5°, crouched ×0.8', () => {
    expect(computeSpread('carbine', { ...still, moving: true })).toBeCloseTo(1.4 * 1.3 * DEG, 9)
    expect(computeSpread('carbine', { ...still, ads: 1, moving: true })).toBeCloseTo(
      0.15 * 1.25 * DEG,
      9,
    )
    expect(computeSpread('carbine', { ...still, airborne: true })).toBeCloseTo(3.4 * DEG, 9)
    expect(computeSpread('carbine', { ...still, ads: 1, airborne: true })).toBeCloseTo(
      1.65 * DEG,
      9,
    )
    expect(computeSpread('carbine', { ...still, crouching: true })).toBeCloseTo(1.4 * 0.8 * DEG, 9)
  })

  it('the sniper moving with the scope gets +1.5°', () => {
    expect(computeSpread('sniper', { ...still, ads: 1, moving: true })).toBeCloseTo(
      (0.02 * 1.25 + 1.5) * DEG,
      9,
    )
  })

  it('bloom adds up to the max and no further', () => {
    expect(computeSpread('pistol', { ...still, bloom: 1 })).toBeCloseTo(1.2 * DEG, 9)
    expect(computeSpread('pistol', { ...still, bloom: 50 })).toBeCloseTo(2.2 * DEG, 9)
    expect(computeSpread('pistol', { ...still, ads: 1, bloom: 50 })).toBeCloseTo(0.8 * DEG, 9)
  })

  it('interpolates from hip to ADS during the transition and snaps to ADS from 90 %', () => {
    const hip = computeSpread('rifle', still)
    const ads = computeSpread('rifle', { ...still, ads: 1 })
    const mid = computeSpread('rifle', { ...still, ads: 0.5 })
    expect(mid).toBeLessThan(hip)
    expect(mid).toBeGreaterThan(ads)
    expect(computeSpread('rifle', { ...still, ads: 0.9 })).toBeCloseTo(ads, 9)
    expect(computeSpread('rifle', { ...still, ads: 0.85 })).toBeGreaterThan(ads * 1.5)
  })
})

describe('scatterRadius', () => {
  it('is uniform over the disk from the hip and centred in ADS', () => {
    // Uniform disk: r = R·√u has mean 2/3; centred r = R·u has mean 1/2.
    const rng = new Rng(7)
    let hip = 0
    let ads = 0
    const n = 20000
    for (let i = 0; i < n; i++) {
      hip += scatterRadius(rng.next(), 0)
      ads += scatterRadius(rng.next(), 1)
    }
    expect(hip / n).toBeCloseTo(2 / 3, 2)
    expect(ads / n).toBeCloseTo(1 / 2, 2)
    expect(scatterRadius(0.25, 0)).toBeCloseTo(0.5, 9)
    expect(scatterRadius(0.25, 1)).toBeCloseTo(0.25, 9)
  })
})
