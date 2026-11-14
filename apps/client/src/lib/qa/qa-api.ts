import { BLOCKS } from '@blockfront/sim/world/blocks'
import type { GameEvent } from '@blockfront/sim/game'
import { DEFAULT_MATCH_SETUP, type MatchSetup } from '@blockfront/sim/match/setup'
import type { DevItem } from '../net/sim-messages.ts'
import type { LocalTransport } from '../net/local-transport.ts'
import type { GameRenderer } from '../render/game-renderer.ts'
import { hudState } from '../ui/hud-state.svelte.ts'
import { menuState } from '../ui/menu-state.svelte.ts'
import { settingsState } from '../settings/settings-state.svelte.ts'
import type { Settings } from '../settings/settings.ts'
import { locale } from '../i18n/locale.svelte.ts'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Hooks for automated QA, mounted on window.blockfront.qa in dev builds with ?qa=1. Everything
// returns plain data; input goes through the real InputState latch.
export function createQaApi(renderer: GameRenderer) {
  const debug = renderer.debug
  const transport = debug.transport as LocalTransport
  const local = () => debug.buffer.player(1)

  const waitTicks = async (n: number, timeoutMs = 10000): Promise<number> => {
    const target = debug.buffer.tick + n
    const deadline = performance.now() + timeoutMs
    while (debug.buffer.tick < target && performance.now() < deadline) await sleep(20)
    return debug.buffer.tick
  }

  return {
    async hold(code: string, ms: number): Promise<void> {
      debug.input.injectKey(code, true)
      await sleep(ms)
      debug.input.injectKey(code, false)
    },
    async press(code: string): Promise<void> {
      debug.input.injectKey(code, true)
      await sleep(40)
      debug.input.injectKey(code, false)
    },
    async mouse(button: number, ms: number): Promise<void> {
      debug.input.injectMouse(button, true)
      await sleep(ms)
      debug.input.injectMouse(button, false)
    },
    look(yaw: number, pitch: number): void {
      debug.input.yaw = yaw
      debug.input.pitch = pitch
    },
    teleport(x: number, y: number, z: number): void {
      transport.dev({ kind: 'teleport', x, y, z })
    },
    give(item: DevItem, n = 1): void {
      transport.dev({ kind: 'give', item, n })
    },
    setHp(hp: number): void {
      transport.dev({ kind: 'setHp', hp })
    },
    kill(): void {
      transport.dev({ kind: 'kill' })
    },
    addDummy(team: 'blue' | 'red', name: string, x: number, z: number): void {
      transport.dev({ kind: 'addDummy', team, name, x, z })
    },
    slot(n: number): void {
      debug.controls.selectSlot(n)
    },
    // Missing fields take DEFAULT_MATCH_SETUP (TDM 4v4 Soldier, rifle). A seed other than 1
    // is not supported yet: the client world is generated once at mount.
    startMatch(setup: Partial<MatchSetup> = {}): void {
      if (setup.seed !== undefined && setup.seed !== 1)
        console.warn('qa.startMatch: only seed 1 is supported for now')
      renderer.startMatch({ ...DEFAULT_MATCH_SETUP, ...setup, seed: 1 })
    },
    endMatch(): void {
      renderer.endMatch()
    },
    pause(): void {
      renderer.pause()
    },
    // Sim and UI together; no pointer lock involved in QA mode.
    resume(): void {
      renderer.resume()
    },
    state() {
      const me = local()
      const snapshot = debug.buffer.latest
      return {
        phase: debug.phase(),
        matchId: debug.matchId(),
        tick: debug.buffer.tick,
        me: me
          ? {
              pos: me.pos,
              yaw: me.yaw,
              pitch: me.pitch,
              // Cone half-angle in degrees.
              spread: (me.spread * 180) / Math.PI,
              hp: me.hp,
              alive: me.alive,
              respawnIn: me.respawnIn,
              slot: me.slot,
              weapon: me.weapon,
              mag: me.mag,
              reserve: me.reserve,
              pistolMag: me.pistolMag,
              pistolReserve: me.pistolReserve,
              blocks: me.blocks,
              grenades: me.grenades,
              tnt: me.tnt,
              ladders: me.ladders,
              bandages: me.bandages,
              healing: me.healing,
              carrying: me.carrying,
              protected: me.protected,
              inWater: me.inWater,
              eyeInWater: me.eyeInWater,
              onLadder: me.onLadder,
              onGround: me.onGround,
              air: me.air,
              kills: me.kills,
              deaths: me.deaths,
              captures: me.captures,
              returns: me.returns,
              suicides: me.suicides,
              score: me.score,
              killedBy: me.killedBy,
              killedWith: me.killedWith,
            }
          : null,
        players: snapshot?.players.map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          pos: p.pos,
          hp: p.hp,
          alive: p.alive,
          kills: p.kills,
          deaths: p.deaths,
          score: p.score,
        })),
        flags: snapshot?.flags ?? [],
        chests: snapshot?.chests ?? [],
        match: snapshot?.match ?? null,
      }
    },
    events(n = 20): { tick: number; event: GameEvent }[] {
      return debug.recentEvents.slice(-n)
    },
    blockAt(x: number, y: number, z: number): { id: number; name: string } {
      const id = debug.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))
      return { id, name: BLOCKS[id]?.name ?? `#${id}` }
    },
    ui() {
      return {
        phase: hudState.phase,
        menu: hudState.phase === 'menu',
        paused: hudState.phase === 'paused',
        scoreboard: hudState.showScoreboard,
        death: hudState.phase !== 'menu' && !hudState.alive && hudState.matchState !== 'ended',
        matchEnd: hudState.phase !== 'menu' && hudState.matchState === 'ended',
        error: hudState.fatal,
        hasSnapshot: hudState.hasSnapshot,
        showStats: hudState.showStats,
        settings: hudState.settingsOpen && hudState.phase !== 'playing',
        loading: {
          stage: hudState.loadStage,
          progress: hudState.loadProgress,
          done: hudState.loadStage === 'done',
        },
        locale: locale.current,
        menuSetup: menuState.current(),
        settingsValues: settingsState.current(),
        mode: hudState.matchMode,
        scoreToWin: hudState.scoreToWin,
        winner: hudState.winner,
        winnerPlayer: hudState.winnerPlayer,
        chestMarkers: hudState.chestMarkers.map((marker) => ({ ...marker })),
        loot: hudState.loot ? { ...hudState.loot, at: hudState.lootAt } : null,
      }
    },
    // Opens or closes the settings panel (menu or pause) and changes one setting, as the
    // panel would.
    openSettings(open = true): void {
      hudState.settingsOpen = open
    },
    setting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
      settingsState.set(key, value)
      return settingsState.current()
    },
    waitTicks,
    async waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<boolean> {
      const deadline = performance.now() + timeoutMs
      while (performance.now() < deadline) {
        if (predicate()) return true
        await sleep(30)
      }
      return false
    },
  }
}
