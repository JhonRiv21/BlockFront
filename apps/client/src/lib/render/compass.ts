// Where a world point sits on the compass strip: -1 (left edge) to 1 (right edge) for bearings
// within ±halfRange of the view yaw; anything further is pinned to the edge. The sim's yaw
// convention: the view looks along [-sin(yaw), 0, -cos(yaw)].
export function compassOffset(
  viewYaw: number,
  from: [number, number, number],
  to: [number, number, number],
  halfRange = Math.PI / 2,
): number {
  const dx = to[0] - from[0]
  const dz = to[2] - from[2]
  const bearing = Math.atan2(-dx, -dz)
  let relative = bearing - viewYaw
  while (relative > Math.PI) relative -= 2 * Math.PI
  while (relative < -Math.PI) relative += 2 * Math.PI
  // Right of the view is a negative relative yaw, which sits on the right of the strip.
  return Math.max(-1, Math.min(1, -relative / halfRange))
}
