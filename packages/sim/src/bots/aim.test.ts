import { describe, expect, it } from 'vitest'
import { Rng } from '../rng.ts'
import { freshError, trackError, turnToward, wrapAngle } from './aim.ts'
import { BOT_SKILL, DEG } from './difficulty.ts'

// Written from docs/final-scope.md §4 (difficulty table): the view turns no faster than the
// skill's maximum and the aim error starts at the skill's value and shrinks while the bot keeps
// following the same target.
// Written with the implementation in context (same session); the cases come from the spec.

describe('turning', () => {
  it('never turns more than the step allowed in one tick', () => {
    const step = (BOT_SKILL.recruit.turnDegreesPerSecond * DEG) / 30
    const next = turnToward(0, 0, Math.PI, 0, step)
    expect(Math.abs(wrapAngle(next.yaw - 0))).toBeCloseTo(step, 9)
  })

  it('takes the short way round across ±π', () => {
    const next = turnToward(Math.PI - 0.1, 0, -Math.PI + 0.1, 0, 1)
    expect(Math.abs(wrapAngle(next.yaw - (-Math.PI + 0.1)))).toBeLessThan(1e-9)
  })

  it('reaches a target within the step and splits a combined turn between yaw and pitch', () => {
    expect(turnToward(0, 0, 0.05, 0.02, 0.1)).toEqual({ yaw: 0.05, pitch: 0.02 })
    const next = turnToward(0, 0, 1, 1, 0.1)
    expect(Math.hypot(next.yaw, next.pitch)).toBeCloseTo(0.1, 9)
  })

  it('a faster skill turns further in the same time', () => {
    const ticks = (skill: keyof typeof BOT_SKILL) => {
      const step = (BOT_SKILL[skill].turnDegreesPerSecond * DEG) / 30
      let yaw = 0
      let n = 0
      while (Math.abs(wrapAngle(Math.PI * 0.9 - yaw)) > 1e-6) {
        yaw = turnToward(yaw, 0, Math.PI * 0.9, 0, step).yaw
        n++
      }
      return n
    }
    expect(ticks('recruit')).toBeGreaterThan(ticks('soldier'))
    expect(ticks('soldier')).toBeGreaterThan(ticks('veteran'))
  })
})

describe('aim error', () => {
  it('starts at the skill error and shrinks while tracking a still target', () => {
    for (const skill of Object.values(BOT_SKILL)) {
      const rng = new Rng(3)
      const error = freshError(rng, skill, 0, 0)
      const start = Math.hypot(error.yaw, error.pitch)
      expect(start).toBeCloseTo(skill.aimErrorDegrees * DEG, 9)
      for (let i = 0; i < 60; i++) trackError(error, rng, skill, 0, 0)
      const end = Math.hypot(error.yaw, error.pitch)
      expect(end).toBeLessThan(start * 0.75)
      expect(end).toBeGreaterThan(0)
    }
  })

  it('grows when the target moves across the view', () => {
    const skill = BOT_SKILL.veteran
    const still = freshError(new Rng(5), skill, 0, 0)
    const moving = freshError(new Rng(5), skill, 0, 0)
    const a = new Rng(9)
    const b = new Rng(9)
    for (let i = 1; i <= 30; i++) {
      trackError(still, a, skill, 0, 0)
      trackError(moving, b, skill, i * 0.05, 0)
    }
    expect(Math.hypot(moving.yaw, moving.pitch)).toBeGreaterThan(Math.hypot(still.yaw, still.pitch))
  })
})
