class FrameStats {
  fps = $state(0)
  tick = $state(0)
  meshAvgMs = $state(0)
  meshMaxMs = $state(0)
  quads = $state(0)
  pointerLocked = $state(false)
}

export const frameStats = new FrameStats()
