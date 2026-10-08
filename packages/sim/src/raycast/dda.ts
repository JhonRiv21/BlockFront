import type { SolidTest, Vec3 } from '../physics/sweep.ts'

export interface VoxelHit {
  x: number
  y: number
  z: number
  // Outward normal of the face entered; all zeros when the origin is inside a solid voxel.
  normal: Vec3
  distance: number
}

// Amanatides & Woo grid traversal. direction need not be normalised; distance is in world units.
export function raycastVoxels(
  isSolid: SolidTest,
  origin: Vec3,
  direction: Vec3,
  maxDistance: number,
): VoxelHit | null {
  const length = Math.hypot(direction[0], direction[1], direction[2])
  if (length === 0 || !Number.isFinite(length)) return null
  const dir: Vec3 = [direction[0] / length, direction[1] / length, direction[2] / length]

  const cell: Vec3 = [Math.floor(origin[0]), Math.floor(origin[1]), Math.floor(origin[2])]
  if (isSolid(cell[0], cell[1], cell[2])) {
    return { x: cell[0], y: cell[1], z: cell[2], normal: [0, 0, 0], distance: 0 }
  }

  const step: Vec3 = [0, 0, 0]
  const tMax: Vec3 = [Infinity, Infinity, Infinity]
  const tDelta: Vec3 = [Infinity, Infinity, Infinity]
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!
    if (d === 0) continue
    step[i] = d > 0 ? 1 : -1
    tDelta[i] = 1 / Math.abs(d)
    const boundary = d > 0 ? cell[i]! + 1 : cell[i]!
    tMax[i] = (boundary - origin[i]!) / d
  }

  for (;;) {
    let axis = 0
    if (tMax[1] < tMax[axis]!) axis = 1
    if (tMax[2] < tMax[axis]!) axis = 2
    const t = tMax[axis]!
    if (t > maxDistance) return null
    cell[axis] = cell[axis]! + step[axis]!
    tMax[axis] = t + tDelta[axis]!
    if (isSolid(cell[0], cell[1], cell[2])) {
      const normal: Vec3 = [0, 0, 0]
      normal[axis] = -step[axis]!
      return { x: cell[0], y: cell[1], z: cell[2], normal, distance: t }
    }
  }
}
