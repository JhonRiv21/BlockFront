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
const CORNER_EPSILON = 1e-6

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

// Voxel range of the box on every axis at time t. The leading side of a moving axis comes
// from leadVoxel (the voxel its face is in), so a face resting exactly on a boundary is not
// taken as already past it; axes in `entering` also include the voxel they enter at t.
function rangeAt(
  box: Aabb,
  vec: Vec3,
  t: number,
  step: Vec3,
  leadVoxel: Vec3,
  entering: readonly boolean[],
  lo: Vec3,
  hi: Vec3,
): void {
  for (let j = 0; j < 3; j++) {
    const min = Math.floor(box.min[j]! + vec[j]! * t)
    const max = Math.ceil(box.max[j]! + vec[j]! * t) - 1
    const lead = leadVoxel[j]! + (entering[j] ? step[j]! : 0)
    lo[j] = step[j]! < 0 ? lead : min
    hi[j] = step[j]! > 0 ? lead : max
  }
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
  const none = [false, false, false]
  const tied = [false, false, false]
  for (;;) {
    const t = Math.min(tNext[0], tNext[1], tNext[2])
    if (t > 1) break

    // Axes whose faces reach a boundary at this same instant (within CORNER_EPSILON of travel).
    let crossing = 0
    for (let j = 0; j < 3; j++) {
      tied[j] = (tNext[j]! - t) * Math.abs(vec[j]!) <= CORNER_EPSILON
      if (tied[j]) crossing++
    }

    // A tied axis blocked by its own slice collides first: a box resting on the floor that
    // walks across a boundary is stopped by the floor on Y, not by the floor row on X.
    let axis = -1
    rangeAt(box, vec, t, step, leadVoxel, none, lo, hi)
    for (let a = 0; a < 3 && axis < 0; a++) {
      if (tied[a] && anySolidInPlane(isSolid, a, leadVoxel[a]! + step[a]!, lo, hi)) axis = a
    }
    // Otherwise the voxel diagonal to two simultaneous crossings blocks too, so the box cannot
    // slip through a corner.
    for (let a = 0; a < 3 && axis < 0 && crossing > 1; a++) {
      if (!tied[a]) continue
      tied[a] = false
      rangeAt(box, vec, t, step, leadVoxel, tied, lo, hi)
      tied[a] = true
      if (anySolidInPlane(isSolid, a, leadVoxel[a]! + step[a]!, lo, hi)) axis = a
    }

    if (axis >= 0) {
      const plane = leadVoxel[axis]! + step[axis]!
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
    for (let j = 0; j < 3; j++) {
      if (!tied[j]) continue
      leadVoxel[j] = leadVoxel[j]! + step[j]!
      tNext[j] = tNext[j]! + tDelta[j]!
    }
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
