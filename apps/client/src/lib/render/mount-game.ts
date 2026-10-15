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
      hudState.now = performance.now()
    },
    onAssetsReady: () => {
      hudState.assetsReady = true
    },
    onUnderwater: (underwater) => {
      hudState.underwater = underwater
    },
    onScope: (scoped, fade) => {
      hudState.scoped = scoped
      hudState.scopeFade = fade
    },
    onBlast: (strength) => {
      hudState.blastAt = performance.now()
      hudState.blastStrength = strength
    },
    onDryFire: () => {
      hudState.dryFireAt = performance.now()
    },
    onItem: (name) => {
      hudState.itemName = name
      hudState.itemNameAt = performance.now()
    },
    onHud: ({ player, hitmarker, killFeed, damageIndicators }) => {
      if (player.hp < hudState.hp) {
        hudState.hpBefore = hudState.hp
        hudState.hurtAt = performance.now()
      } else if (player.hp > hudState.hp) {
        hudState.hpBefore = player.hp
      }
      hudState.hp = player.hp
      hudState.air = player.air
      hudState.eyeInWater = player.eyeInWater
      hudState.pistolMag = player.pistolMag
      hudState.pistolReserve = player.pistolReserve
      hudState.pistolReloading = player.pistolReloading
      hudState.blockColor = player.blockColor
      hudState.alive = player.alive
      hudState.respawnIn = player.respawnIn
      hudState.slot = player.slot
      hudState.weapon = player.weapon
      hudState.mag = player.mag
      hudState.reserve = player.reserve
      hudState.reloading = player.reloading
      hudState.reloadLeft = player.reloadLeft
      hudState.reloadTotal = player.reloadTotal
      hudState.blocks = player.blocks
      hudState.grenades = player.grenades
      hudState.cooking = player.cooking
      hudState.spread = player.spread
      hudState.ads = player.ads
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
  hudState.selectPrimary = (weapon) => renderer.setPrimary(weapon)
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
