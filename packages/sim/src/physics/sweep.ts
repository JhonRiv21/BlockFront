export type Vec3 = [number, number, number]

export interface Aabb {
  min: Vec3
  max: Vec3
}

export type SolidTest = (x: number, y: number, z: number) => boolean

// Per axis: -1 or 1 when the box collided moving in that direction, 0 otherwise.
export interface SweepHit {
  x: number
  y: number
  z: number
}

const AXES = ['x', 'y', 'z'] as const

interface Collision {
  axis: number
  t: number
}

function anySolidInPlane(
  isSolid: SolidTest,
  axis: number,
  plane: number,
  lo: Vec3,
  hi: Vec3,
): boolean {
  const u = (axis + 1) % 3
  const v = (axis + 2) % 3
  const cell: Vec3 = [0, 0, 0]
  cell[axis] = plane
  for (let i = lo[u]!; i <= hi[u]!; i++) {
    cell[u] = i
    for (let j = lo[v]!; j <= hi[v]!; j++) {
      cell[v] = j
      if (isSolid(cell[0], cell[1], cell[2])) return true
    }
  }
  return false
}

// Moves the box along vec until it touches a solid voxel on one axis (fenomas/voxel-aabb-sweep
// style): voxel boundaries crossed by the leading faces are visited in order of time, and the
// slice of voxels the face would enter is tested before entering it. Returns the collision or
// null when the whole vector was applied.
function sweepOnce(isSolid: SolidTest, box: Aabb, vec: Vec3): Collision | null {
  const step: Vec3 = [0, 0, 0]
  const leadVoxel: Vec3 = [0, 0, 0]
  const tNext: Vec3 = [Infinity, Infinity, Infinity]
  const tDelta: Vec3 = [Infinity, Infinity, Infinity]

  for (let i = 0; i < 3; i++) {
    const v = vec[i]!
    if (v === 0) continue
    step[i] = v > 0 ? 1 : -1
    const lead = v > 0 ? box.max[i]! : box.min[i]!
    leadVoxel[i] = v > 0 ? Math.ceil(lead) - 1 : Math.floor(lead)
    const boundary = v > 0 ? leadVoxel[i]! + 1 : leadVoxel[i]!
    tDelta[i] = 1 / Math.abs(v)
    tNext[i] = (boundary - lead) / v
  }

  const lo: Vec3 = [0, 0, 0]
  const hi: Vec3 = [0, 0, 0]
  for (;;) {
    let axis = 0
    if (tNext[1] < tNext[axis]!) axis = 1
    if (tNext[2] < tNext[axis]!) axis = 2
    const t = tNext[axis]!
    if (t > 1) break

    const plane = leadVoxel[axis]! + step[axis]!
    for (let j = 0; j < 3; j++) {
      lo[j] = Math.floor(box.min[j]! + vec[j]! * t)
      hi[j] = Math.ceil(box.max[j]! + vec[j]! * t) - 1
    }
    if (anySolidInPlane(isSolid, axis, plane, lo, hi)) {
      for (let j = 0; j < 3; j++) {
        box.min[j] = box.min[j]! + vec[j]! * t
        box.max[j] = box.max[j]! + vec[j]! * t
      }
      // Snap the colliding face exactly onto the voxel boundary to kill float drift.
      const size = box.max[axis]! - box.min[axis]!
      if (step[axis]! > 0) {
        box.max[axis] = plane
        box.min[axis] = plane - size
      } else {
        box.min[axis] = plane + 1
        box.max[axis] = plane + 1 + size
      }
      return { axis, t }
    }
    leadVoxel[axis] = leadVoxel[axis]! + step[axis]!
    tNext[axis] = t + tDelta[axis]!
  }

  for (let j = 0; j < 3; j++) {
    box.min[j] = box.min[j]! + vec[j]!
    box.max[j] = box.max[j]! + vec[j]!
  }
  return null
}

// Sweeps the box through the grid applying delta, sliding along whatever it hits. The box is
// moved in place; the result says on which axes and directions it collided.
export function sweepAabb(isSolid: SolidTest, box: Aabb, delta: Vec3): SweepHit {
  const hit: SweepHit = { x: 0, y: 0, z: 0 }
  const vec: Vec3 = [delta[0], delta[1], delta[2]]
  // At most one collision per axis; after each one that component is dropped.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (vec[0] === 0 && vec[1] === 0 && vec[2] === 0) break
    const collision = sweepOnce(isSolid, box, vec)
    if (collision === null) break
    const { axis, t } = collision
    hit[AXES[axis]!] = vec[axis]! > 0 ? 1 : -1
    const remaining = 1 - t
    for (let j = 0; j < 3; j++) vec[j] = j === axis ? 0 : vec[j]! * remaining
  }
  return hit
}
