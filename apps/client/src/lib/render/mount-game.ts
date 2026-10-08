import type { Attachment } from 'svelte/attachments'
import { hudState } from '../ui/hud-state.svelte.ts'
import { GameRenderer } from './game-renderer.ts'

const HITMARKER_MS = 140

export const mountGame: Attachment<HTMLCanvasElement> = (canvas) => {
  let hitmarkerTimer: ReturnType<typeof setTimeout> | undefined
  const renderer = new GameRenderer(canvas, {
    onStats: (stats) => {
      hudState.fps = stats.fps
      hudState.tick = stats.tick
      hudState.meshAvgMs = stats.meshAvgMs
      hudState.meshMaxMs = stats.meshMaxMs
      hudState.simAvgMs = stats.simAvgMs
      hudState.simMaxMs = stats.simMaxMs
      hudState.quads = stats.quads
    },
    onPointerLock: (locked) => {
      hudState.pointerLocked = locked
    },
    onMode: (mode) => {
      hudState.mode = mode
    },
    onHitboxes: (shown) => {
      hudState.showHitboxes = shown
    },
    onView: (yaw) => {
      hudState.yaw = yaw
    },
    onAssetsReady: () => {
      hudState.assetsReady = true
    },
    onHud: ({ player, hitmarker, killFeed, damageIndicators }) => {
      hudState.hp = Math.ceil(player.hp)
      hudState.alive = player.alive
      hudState.respawnIn = player.respawnIn
      hudState.slot = player.slot
      hudState.weapon = player.weapon
      hudState.mag = player.mag
      hudState.reserve = player.reserve
      hudState.reloading = player.reloading
      hudState.blocks = player.blocks
      hudState.grenades = player.grenades
      hudState.cooking = player.cooking
      hudState.spread = player.spread
      hudState.killFeed = killFeed
      hudState.damageIndicators = damageIndicators
      if (hitmarker) {
        hudState.hitmarker = true
        hudState.hitmarkerHead = hitmarker.head
        clearTimeout(hitmarkerTimer)
        hitmarkerTimer = setTimeout(() => {
          hudState.hitmarker = false
        }, HITMARKER_MS)
      }
    },
  })
  renderer.start()
  if (import.meta.env.DEV) {
    // window.blockfront.pool.stats(), .transport.stepStats(), .snapshot(), .assets, .renderOnce()
    Object.assign(window, { blockfront: renderer.debug })
  }
  return () => {
    clearTimeout(hitmarkerTimer)
    renderer.dispose()
  }
}
