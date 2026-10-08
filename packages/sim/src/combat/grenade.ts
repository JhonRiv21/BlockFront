import { sweepAabb, type Aabb, type SolidTest, type Vec3 } from '../physics/sweep.ts'
import { GRENADE } from './weapons.ts'

export interface GrenadeEntity {
  id: number
  owner: number
  pos: Vec3
  vel: Vec3
  fuse: number
}

// Gravity, bounce off whatever it hits and ground friction. Returns true when the fuse ran out.
export function stepGrenade(grenade: GrenadeEntity, isSolid: SolidTest, dt: number): boolean {
  grenade.fuse -= dt
  grenade.vel[1] -= GRENADE.gravity * dt
  const half = GRENADE.size / 2
  const box: Aabb = {
    min: [grenade.pos[0] - half, grenade.pos[1] - half, grenade.pos[2] - half],
    max: [grenade.pos[0] + half, grenade.pos[1] + half, grenade.pos[2] + half],
  }
  const hit = sweepAabb(isSolid, box, [
    grenade.vel[0] * dt,
    grenade.vel[1] * dt,
    grenade.vel[2] * dt,
  ])
  grenade.pos[0] = box.min[0] + half
  grenade.pos[1] = box.min[1] + half
  grenade.pos[2] = box.min[2] + half
  if (hit.x !== 0) grenade.vel[0] *= -GRENADE.bounce
  if (hit.z !== 0) grenade.vel[2] *= -GRENADE.bounce
  if (hit.y !== 0) {
    grenade.vel[1] *= -GRENADE.bounce
    if (hit.y === -1) {
      grenade.vel[0] *= GRENADE.groundFriction
      grenade.vel[2] *= GRENADE.groundFriction
      if (Math.abs(grenade.vel[1]) < 1) grenade.vel[1] = 0
    }
  }
  return grenade.fuse <= 0
}
