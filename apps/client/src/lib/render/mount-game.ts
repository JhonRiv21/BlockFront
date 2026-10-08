import type { Attachment } from 'svelte/attachments'
import { frameStats } from './frame-stats.svelte.ts'
import { GameRenderer } from './game-renderer.ts'

export const mountGame: Attachment<HTMLCanvasElement> = (canvas) => {
  const renderer = new GameRenderer(canvas, ({ fps, tick }) => {
    frameStats.fps = fps
    frameStats.tick = tick
  })
  renderer.start()
  return () => renderer.dispose()
}
