// Touch-only device: a coarse primary pointer and no fine pointer (mouse, trackpad) at all.
// A tablet with a mouse attached still plays.
export function isTouchOnly(): boolean {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
}
