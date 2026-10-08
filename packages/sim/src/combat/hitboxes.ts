import { PLAYER } from '../physics/player-controller.ts'
import type { Aabb, Vec3 } from '../physics/sweep.ts'
import type { HitZone } from './weapons.ts'

export interface Hitbox extends Aabb {
  zone: HitZone
}

// Standing proportions as fractions of the 1.8 height; crouching squashes them vertically.
const PARTS: { zone: HitZone; x: [number, number]; y: [number, number]; z: [number, number] }[] = [
  { zone: 'head', x: [-0.2, 0.2], y: [1.45, 1.8], z: [-0.2, 0.2] },
  { zone: 'torso', x: [-0.2, 0.2], y: [0.75, 1.45], z: [-0.15, 0.15] },
  { zone: 'limbs', x: [-0.3, -0.2], y: [0.75, 1.4], z: [-0.15, 0.15] },
  { zone: 'limbs', x: [0.2, 0.3], y: [0.75, 1.4], z: [-0.15, 0.15] },
  { zone: 'limbs', x: [-0.3, 0.3], y: [0, 0.75], z: [-0.2, 0.2] },
]

export function playerHitboxes(pos: Vec3, crouching: boolean): Hitbox[] {
  const scaleY = (crouching ? PLAYER.crouchHeight : PLAYER.height) / PLAYER.height
  return PARTS.map(({ zone, x, y, z }) => ({
    zone,
    min: [pos[0] + x[0], pos[1] + y[0] * scaleY, pos[2] + z[0]],
    max: [pos[0] + x[1], pos[1] + y[1] * scaleY, pos[2] + z[1]],
  }))
}

// Slab test; dir must be normalised. Returns the entry distance or null.
export function rayAabb(origin: Vec3, dir: Vec3, box: Aabb): number | null {
  let tMin = 0
  let tMax = Infinity
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!
    const o = origin[i]!
    if (Math.abs(d) < 1e-12) {
      if (o < box.min[i]! || o > box.max[i]!) return null
      continue
    }
    let t1 = (box.min[i]! - o) / d
    let t2 = (box.max[i]! - o) / d
    if (t1 > t2) [t1, t2] = [t2, t1]
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }
  return tMin
}

export function rayHitboxes(
  origin: Vec3,
  dir: Vec3,
  maxDistance: number,
  boxes: Hitbox[],
): { zone: HitZone; distance: number } | null {
  let best: { zone: HitZone; distance: number } | null = null
  for (const box of boxes) {
    const t = rayAabb(origin, dir, box)
    if (t === null || t > maxDistance) continue
    if (best === null || t < best.distance) best = { zone: box.zone, distance: t }
  }
  return best
}
