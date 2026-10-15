// docs/f2-6-feel.md §5: Minecraft's fall damage scaled to 100 HP, factor decided by Jhon.
export const FALL = {
  factor: 5,
  safeBlocks: 3,
  // Landings above this halve the horizontal speed (Ace of Spades FALL_SLOW_DOWN).
  hardBlocks: 4,
  // An enemy who hurt you this recently gets the kill.
  attributionSeconds: 5,
} as const

export function fallDamage(blocks: number): number {
  return FALL.factor * Math.max(0, Math.floor(blocks - FALL.safeBlocks))
}
