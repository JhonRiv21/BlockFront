// Frame-rate independent smoothing (theorangeduck.com/page/spring-roll-call).

export interface SpringState {
  x: number
  v: number
}

const LN2 = 0.693

// Exponential approach: the distance to the goal halves every halfLife seconds.
export function damper(x: number, goal: number, halfLife: number, dt: number): number {
  return x + (goal - x) * (1 - Math.exp((-LN2 * dt) / Math.max(halfLife, 1e-6)))
}

// Exact critically damped spring with a half-life.
export function springCritical(s: SpringState, goal: number, halfLife: number, dt: number): void {
  const y = (2 * LN2) / Math.max(halfLife, 1e-6)
  const j0 = s.x - goal
  const j1 = s.v + j0 * y
  const e = Math.exp(-y * dt)
  s.x = e * (j0 + j1 * dt) + goal
  s.v = e * (s.v - j1 * y * dt)
}

// Underdamped spring (exact), for impacts that should snap and bounce once.
export function springUnderdamped(
  s: SpringState,
  goal: number,
  zeta: number,
  omega: number,
  dt: number,
): void {
  const j0 = s.x - goal
  const d = omega * zeta
  const w = omega * Math.sqrt(Math.max(1 - zeta * zeta, 1e-6))
  const e = Math.exp(-d * dt)
  const c = Math.cos(w * dt)
  const sn = Math.sin(w * dt)
  const j1 = (s.v + j0 * d) / w
  s.x = e * (j0 * c + j1 * sn) + goal
  s.v = e * (s.v * c - (j0 * w + j1 * d) * sn)
}
