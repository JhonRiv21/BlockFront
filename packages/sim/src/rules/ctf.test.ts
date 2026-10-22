import { describe, expect, it } from 'vitest'
import { TICK_RATE } from '../config.ts'
import {
  CTF,
  createStats,
  inBase,
  matchStatus,
  mvp,
  nextWaveTick,
  secondsLeft,
  withinFlag,
} from './ctf.ts'

// Written from PLAN.md §3 (match rules) and the F3-A brief: 3 captures or the lead at 10 min,
// a tie goes to 2 min of sudden death, respawn in waves of 8 s, a dropped flag returns at 20 s.

describe('match status', () => {
  it('ends at once when a team reaches 3 captures', () => {
    expect(matchStatus({ blue: 3, red: 1 }, 100)).toEqual({ state: 'ended', winner: 'blue' })
    expect(matchStatus({ blue: 0, red: 3 }, 100)).toEqual({ state: 'ended', winner: 'red' })
  })

  it('keeps playing before 10 minutes', () => {
    expect(matchStatus({ blue: 2, red: 1 }, 600 * TICK_RATE - 1)).toEqual({
      state: 'playing',
      winner: null,
    })
  })

  it('the leader wins at 10 minutes', () => {
    expect(matchStatus({ blue: 1, red: 2 }, 600 * TICK_RATE)).toEqual({
      state: 'ended',
      winner: 'red',
    })
  })

  it('a tie at 10 minutes goes to sudden death, a tie after 12 is a draw', () => {
    expect(matchStatus({ blue: 1, red: 1 }, 600 * TICK_RATE)).toEqual({
      state: 'suddenDeath',
      winner: null,
    })
    expect(matchStatus({ blue: 1, red: 1 }, 720 * TICK_RATE - 1).state).toBe('suddenDeath')
    expect(matchStatus({ blue: 1, red: 1 }, 720 * TICK_RATE)).toEqual({
      state: 'ended',
      winner: 'none',
    })
  })

  it('the clock counts the match, then the sudden death', () => {
    expect(secondsLeft('playing', 0)).toBe(600)
    expect(secondsLeft('playing', 30 * TICK_RATE)).toBe(570)
    expect(secondsLeft('suddenDeath', 600 * TICK_RATE)).toBe(120)
  })
})

describe('respawn waves', () => {
  it('respawns on the next 8 s boundary that is at least 2 s away', () => {
    const wave = 8 * TICK_RATE
    expect(nextWaveTick(10)).toBe(wave)
    expect(nextWaveTick(wave - 1)).toBe(2 * wave)
    expect(nextWaveTick(wave * 3)).toBe(wave * 4)
  })
})

describe('reach', () => {
  it('touches a flag within 1.5 blocks sideways and 2.5 up or down', () => {
    expect(withinFlag([1, 0, 0], [0, 0, 0])).toBe(true)
    expect(withinFlag([1.6, 0, 0], [0, 0, 0])).toBe(false)
    expect(withinFlag([0, 2.4, 0], [0, 0, 0])).toBe(true)
    expect(withinFlag([0, 2.6, 0], [0, 0, 0])).toBe(false)
  })

  it('the base is 8 blocks around the flag stand', () => {
    expect(inBase([7.9, 1, 0], [0, 0, 0])).toBe(true)
    expect(inBase([8.1, 1, 0], [0, 0, 0])).toBe(false)
    expect(CTF.flagReturnSeconds).toBe(20)
    expect(CTF.restockSeconds).toBe(15)
  })
})

describe('mvp', () => {
  it('captures first, then kills, then returns', () => {
    const rows = [
      { id: 1, stats: { ...createStats(), captures: 1, kills: 9 } },
      { id: 2, stats: { ...createStats(), captures: 2, kills: 0 } },
      { id: 3, stats: { ...createStats(), captures: 2, kills: 1 } },
    ]
    expect(mvp(rows)).toBe(3)
    expect(
      mvp([
        { id: 5, stats: createStats() },
        { id: 4, stats: createStats() },
      ]),
    ).toBe(4)
    expect(mvp([])).toBeNull()
  })
})
