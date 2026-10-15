export const AIR = {
  bubbles: 10,
  secondsPerBubble: 1.5,
  maxSeconds: 15,
  graceSeconds: 1,
  damagePerSecond: 10,
  refillSeconds: 2,
} as const

export interface AirState {
  seconds: number
  // Time spent at zero air, for the grace period.
  empty: number
}

export function createAir(): AirState {
  return { seconds: AIR.maxSeconds, empty: 0 }
}

// Returns the drowning damage of this tick.
export function stepAir(air: AirState, eyeInWater: boolean, dt: number): number {
  if (!eyeInWater) {
    air.seconds = Math.min(AIR.maxSeconds, air.seconds + (AIR.maxSeconds / AIR.refillSeconds) * dt)
    air.empty = 0
    return 0
  }
  air.seconds = Math.max(0, air.seconds - dt)
  if (air.seconds > 0) return 0
  air.empty += dt
  if (air.empty <= AIR.graceSeconds + 1e-9) return 0
  return AIR.damagePerSecond * dt
}

export function bubbles(air: AirState): number {
  return Math.max(0, Math.ceil(air.seconds / AIR.secondsPerBubble - 1e-9))
}
