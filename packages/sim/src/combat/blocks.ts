import { WORLD_SIZE } from '../config.ts'
import type { Vec3 } from '../physics/sweep.ts'
import { BLOCK } from '../world/palette.ts'
import type { World } from '../world/world.ts'

export const BLOCK_HP = 100

function blockIndex(x: number, y: number, z: number): number {
  return x + y * WORLD_SIZE.x + z * WORLD_SIZE.x * WORLD_SIZE.y
}

// Sparse HP of damaged blocks; anything absent is at full health.
export class BlockHealth {
  private readonly hp = new Map<number, number>()

  constructor(private readonly world: World) {}

  get size(): number {
    return this.hp.size
  }

  get(x: number, y: number, z: number): number {
    return this.hp.get(blockIndex(x, y, z)) ?? BLOCK_HP
  }

  // Returns true when the block broke (and was turned into air).
  damage(x: number, y: number, z: number, amount: number): boolean {
    const id = this.world.getBlock(x, y, z)
    if (id === BLOCK.air || id === BLOCK.bedrock) return false
    const key = blockIndex(x, y, z)
    const left = (this.hp.get(key) ?? BLOCK_HP) - amount
    if (left > 0) {
      this.hp.set(key, left)
      return false
    }
    this.hp.delete(key)
    this.world.fillBlock(x, y, z, BLOCK.air)
    return true
  }

  forget(x: number, y: number, z: number): void {
    this.hp.delete(blockIndex(x, y, z))
  }

  entries(): [number, number][] {
    return [...this.hp.entries()]
  }

  restore(entries: [number, number][]): void {
    this.hp.clear()
    for (const [key, hp] of entries) this.hp.set(key, hp)
  }
}

// Turns every breakable block whose center is within radius of center into air.
export function explodeBlocks(
  world: World,
  health: BlockHealth,
  center: Vec3,
  radius: number,
): Vec3[] {
  const broken: Vec3[] = []
  const r = Math.ceil(radius)
  const cx = Math.floor(center[0])
  const cy = Math.floor(center[1])
  const cz = Math.floor(center[2])
  for (let z = cz - r; z <= cz + r; z++)
    for (let y = cy - r; y <= cy + r; y++)
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = x + 0.5 - center[0]
        const dy = y + 0.5 - center[1]
        const dz = z + 0.5 - center[2]
        if (dx * dx + dy * dy + dz * dz > radius * radius) continue
        const id = world.getBlock(x, y, z)
        if (id === BLOCK.air || id === BLOCK.bedrock) continue
        world.fillBlock(x, y, z, BLOCK.air)
        health.forget(x, y, z)
        broken.push([x, y, z])
      }
  return broken
}
