import type { Attachment } from 'svelte/attachments'
import { hudState } from '../ui/hud-state.svelte.ts'
import { GameRenderer } from './game-renderer.ts'
import { settingsState } from '../settings/settings-state.svelte.ts'
import { locale } from '../i18n/locale.svelte.ts'
import { detectLocale } from '../i18n/strings.ts'

const HITMARKER_MS = 140

export const mountGame: Attachment<HTMLCanvasElement> = (canvas) => {
  let hitmarkerTimer: ReturnType<typeof setTimeout> | undefined
  // Killer id to its config name; the rows come from the same snapshot as the player.
  const rowName = (id: number) => hudState.rows.find((row) => row.id === id)?.name ?? `#${id}`
  // QA mode: dev builds only, ?qa=1. The flag and the API are stripped from production.
  const qa = import.meta.env.DEV && new URLSearchParams(location.search).get('qa') === '1'
  const renderer = new GameRenderer(
    canvas,
    {
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
      onPhase: (phase) => {
        hudState.phase = phase
        // Between matches nothing from the last one may linger (an "ended" state would keep the
        // result panel up over the next match until its first snapshot).
        if (phase === 'menu') {
          hudState.hasSnapshot = false
          hudState.matchState = 'playing'
          hudState.winner = null
          hudState.rows = []
          hudState.compass = []
          hudState.chestMarkers = []
          hudState.loot = null
          hudState.killFeed = []
        }
        if (phase === 'playing') hudState.settingsOpen = false
      },
      onShowStats: (shown) => {
        hudState.showStats = shown
      },
      onLockFailure: (reason) => {
        hudState.lockFailure = reason
        hudState.lockFailureAt = performance.now()
      },
      onFatal: (fatal) => {
        hudState.fatal = fatal
      },
      onScoreboard: (shown) => {
        hudState.showScoreboard = shown
      },
      onLoading: (stage, progress) => {
        hudState.loadStage = stage
        hudState.loadProgress = progress
      },
      onLoot: (gain) => {
        hudState.loot = gain
        hudState.lootAt = performance.now()
      },
      onMatch: ({ match, ownFlag, compass, chests, rows }) => {
        hudState.matchMode = match.mode
        hudState.scoreToWin = match.scoreToWin
        hudState.winnerPlayer = match.winnerPlayer
        hudState.chestMarkers = chests
        hudState.scoreBlue = match.scoreBlue
        hudState.scoreRed = match.scoreRed
        hudState.matchState = match.state
        hudState.timeLeft = match.timeLeft
        hudState.winner = match.winner
        hudState.mvp = match.mvp
        hudState.ownFlag = ownFlag
        hudState.compass = compass
        hudState.rows = rows
      },
      onItem: (name) => {
        hudState.itemName = name
        hudState.itemNameAt = performance.now()
      },
      onHud: ({ player, hitmarker, killFeed, damageIndicators }) => {
        hudState.hasSnapshot = true
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
        hudState.menuPrimary = player.weapon
        hudState.mag = player.mag
        hudState.reserve = player.reserve
        hudState.reloading = player.reloading
        hudState.reloadLeft = player.reloadLeft
        hudState.reloadTotal = player.reloadTotal
        hudState.blocks = player.blocks
        hudState.grenades = player.grenades
        hudState.tnt = player.tnt
        hudState.ladders = player.ladders
        hudState.bandages = player.bandages
        hudState.healing = player.healing
        hudState.cooking = player.cooking
        hudState.spread = player.spread
        hudState.ads = player.ads
        hudState.localId = player.id
        hudState.localTeam = player.team
        hudState.carrying = player.carrying
        hudState.protected = player.protected
        hudState.killedBy = player.killedBy ? rowName(player.killedBy) : ''
        hudState.killedWith = player.killedWith
        hudState.dealtThisLife = player.dealtThisLife
        hudState.takenThisLife = player.takenThisLife
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
    },
    { qa },
  )
  hudState.selectPrimary = (weapon) => {
    hudState.menuPrimary = weapon
    renderer.setPrimary(weapon)
  }
  hudState.startMatch = (setup) => {
    hudState.settingsOpen = false
    hudState.menuPrimary = setup.primary
    renderer.startMatch(setup)
  }
  hudState.quitMatch = () => renderer.endMatch()
  hudState.playAgain = () => renderer.restartMatch()
  settingsState.listen((settings) => {
    renderer.applySettings(settings)
    locale.set(settings.language ?? detectLocale(navigator.languages ?? [navigator.language]))
  })
  renderer.start()
  // Uncaught errors land in a visible log while developing; production keeps the console.
  const logError = (event: ErrorEvent | PromiseRejectionEvent) => {
    const reason = 'reason' in event ? event.reason : event.message
    const text = reason instanceof Error ? reason.message : String(reason)
    hudState.errorLog = [...hudState.errorLog.slice(-4), text]
  }
  if (import.meta.env.DEV) {
    window.addEventListener('error', logError)
    window.addEventListener('unhandledrejection', logError)
    // window.blockfront.pool.stats(), .transport.stepStats(), .snapshot(), .assets, .renderOnce()
    // `debug` is a getter that builds a fresh object: keep one so the QA API can hang off it.
    const debug = renderer.debug
    Object.assign(window, { blockfront: debug })
    if (qa) {
      void import('../qa/qa-api.ts').then(({ createQaApi }) => {
        Object.assign(debug, { qa: createQaApi(renderer) })
      })
    }
  }
  return () => {
    clearTimeout(hitmarkerTimer)
    window.removeEventListener('error', logError)
    window.removeEventListener('unhandledrejection', logError)
    renderer.dispose()
  }
}
