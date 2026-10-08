import type { Attachment } from 'svelte/attachments'
import { frameStats } from './frame-stats.svelte.ts'
import { GameRenderer } from './game-renderer.ts'

export const mountGame: Attachment<HTMLCanvasElement> = (canvas) => {
  const renderer = new GameRenderer(canvas, {
    onStats: ({ fps, tick, meshAvgMs, meshMaxMs, quads }) => {
      frameStats.fps = fps
      frameStats.tick = tick
      frameStats.meshAvgMs = meshAvgMs
      frameStats.meshMaxMs = meshMaxMs
      frameStats.quads = quads
    },
    onPointerLock: (locked) => {
      frameStats.pointerLocked = locked
    },
  })
  renderer.start()
  if (import.meta.env.DEV) {
    // window.blockfront.pool.stats(), .worldView.totalQuads, .renderOnce()
    Object.assign(window, { blockfront: renderer.debug })
  }
  return () => renderer.dispose()
}
