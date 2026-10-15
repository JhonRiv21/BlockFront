import type { Aabb } from './sweep.ts'

export type LiquidTest = (x: number, y: number, z: number) => boolean

// Water fills 8/9 of its block; the top cell of a column stops there.
export const WATER_SURFACE = 8 / 9

// Fraction of the box height that is inside water, sampled on the box's centre column.
export function submergedRatio(box: Aabb, isLiquid: LiquidTest): number {
  const x = Math.floor((box.min[0] + box.max[0]) / 2)
  const z = Math.floor((box.min[2] + box.max[2]) / 2)
  const height = box.max[1] - box.min[1]
  if (height <= 0) return 0
  let wet = 0
  for (let y = Math.floor(box.min[1]); y < Math.ceil(box.max[1]); y++) {
    if (!isLiquid(x, y, z)) continue
    const top = isLiquid(x, y + 1, z) ? y + 1 : y + WATER_SURFACE
    wet += Math.max(0, Math.min(top, box.max[1]) - Math.max(y, box.min[1]))
  }
  return Math.min(1, wet / height)
}

export function pointInWater(x: number, y: number, z: number, isLiquid: LiquidTest): boolean {
  const cy = Math.floor(y)
  if (!isLiquid(Math.floor(x), cy, Math.floor(z))) return false
  return isLiquid(Math.floor(x), cy + 1, Math.floor(z)) || y < cy + WATER_SURFACE
}
