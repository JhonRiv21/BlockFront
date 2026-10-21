import { TICK_SECONDS } from '@blockfront/sim/config'
import type { PlayerSnapshot, Snapshot } from '@blockfront/sim/game'
import type { Vec3 } from '@blockfront/sim/physics/sweep'

const TICK_MS = TICK_SECONDS * 1000

// The last two snapshots from the sim: positions interpolate between them at the display rate,
// and the speeds the client needs (bob, footsteps, landing) come from their difference.
export class SnapshotBuffer {
  previous: Snapshot | null = null
  latest: Snapshot | null = null
  latestAt = 0

  push(snapshot: Snapshot, now: number): void {
    this.previous = this.latest
    this.latest = snapshot
    this.latestAt = now
  }

  clear(): void {
    this.previous = null
    this.latest = null
    this.latestAt = 0
  }

  get tick(): number {
    return this.latest?.tick ?? 0
  }

  player(id: number): PlayerSnapshot | null {
    return this.latest?.players.find((p) => p.id === id) ?? null
  }

  // Share of the way from the previous snapshot to the latest at `now`.
  alpha(now: number): number {
    return Math.min(1, (now - this.latestAt) / TICK_MS)
  }

  interpolated(id: number, alpha: number): [PlayerSnapshot, Vec3] | null {
    const current = this.latest?.players.find((p) => p.id === id)
    if (!current) return null
    const before = this.previous?.players.find((p) => p.id === id)
    if (!before || !before.alive || !current.alive) return [current, current.pos]
    return [
      current,
      [
        before.pos[0] + (current.pos[0] - before.pos[0]) * alpha,
        before.pos[1] + (current.pos[1] - before.pos[1]) * alpha,
        before.pos[2] + (current.pos[2] - before.pos[2]) * alpha,
      ],
    ]
  }

  verticalSpeedOf(id: number): number {
    const pair = this.pair(id)
    if (!pair) return 0
    return (pair[0].pos[1] - pair[1].pos[1]) / TICK_SECONDS
  }

  // Sideways speed along the view's right axis, positive to the right.
  lateralSpeedOf(id: number, yaw: number): number {
    const pair = this.pair(id)
    if (!pair) return 0
    const vx = (pair[0].pos[0] - pair[1].pos[0]) / TICK_SECONDS
    const vz = (pair[0].pos[2] - pair[1].pos[2]) / TICK_SECONDS
    return vx * Math.cos(yaw) - vz * Math.sin(yaw)
  }

  // Horizontal speed from the last two snapshots, in blocks per second.
  speedOf(id: number): number {
    const pair = this.pair(id)
    if (!pair) return 0
    const dx = pair[0].pos[0] - pair[1].pos[0]
    const dz = pair[0].pos[2] - pair[1].pos[2]
    return Math.hypot(dx, dz) / TICK_SECONDS
  }

  private pair(id: number): [PlayerSnapshot, PlayerSnapshot] | null {
    const current = this.latest?.players.find((p) => p.id === id)
    const before = this.previous?.players.find((p) => p.id === id)
    return current && before ? [current, before] : null
  }
}
