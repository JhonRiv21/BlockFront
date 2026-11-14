import type { Difficulty } from '../rules/modes.ts'

// docs/final-scope.md §4, difficulty table. Angles in degrees, times in seconds.
export interface BotSkill {
  reactionSeconds: number
  fovDegrees: number
  turnDegreesPerSecond: number
  // Starting aim error; it shrinks while the bot keeps tracking the same target.
  aimErrorDegrees: number
  headshotChance: number
  memorySeconds: number
  // Aims down sights beyond this many blocks; null never does.
  adsBeyond: number | null
  // Chance to take each grenade opportunity.
  grenadeChance: number
  strafes: boolean
}

export const BOT_SKILL: Record<Difficulty, BotSkill> = {
  recruit: {
    reactionSeconds: 0.45,
    fovDegrees: 90,
    turnDegreesPerSecond: 180,
    aimErrorDegrees: 6,
    headshotChance: 0,
    memorySeconds: 2,
    adsBeyond: null,
    grenadeChance: 0,
    strafes: false,
  },
  soldier: {
    reactionSeconds: 0.3,
    fovDegrees: 110,
    turnDegreesPerSecond: 300,
    aimErrorDegrees: 3.5,
    headshotChance: 0.25,
    memorySeconds: 4,
    adsBeyond: 15,
    grenadeChance: 0.35,
    strafes: true,
  },
  veteran: {
    reactionSeconds: 0.18,
    fovDegrees: 120,
    turnDegreesPerSecond: 450,
    aimErrorDegrees: 1.5,
    headshotChance: 0.6,
    memorySeconds: 6,
    adsBeyond: 15,
    grenadeChance: 1,
    strafes: true,
  },
}

export const DEG = Math.PI / 180
