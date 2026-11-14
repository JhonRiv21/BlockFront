import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, SETTINGS_KEY } from './settings.ts'
import { loadSetup, saveSetup, SETUP_KEY } from './match-setup.ts'
import type { KeyValueStore } from './storage.ts'

// Spec (docs/final-scope.md §5): settings and the last match setup live in localStorage behind
// try/catch; the one-click default is TDM 4v4 Soldier; FOV goes from 70 to 100.
function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
}

describe('settings', () => {
  it('starts from the defaults with nothing stored, no storage or a throwing storage', () => {
    expect(loadSettings(memoryStore())).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(throwingStore)).toEqual(DEFAULT_SETTINGS)
    expect(() => saveSettings(throwingStore, DEFAULT_SETTINGS)).not.toThrow()
  })

  it('round-trips what was saved', () => {
    const store = memoryStore()
    const chosen = {
      ...DEFAULT_SETTINGS,
      fov: 90,
      invertY: true,
      language: 'es' as const,
      volumeWorld: 0.3,
    }
    saveSettings(store, chosen)
    expect(loadSettings(store)).toEqual(chosen)
  })

  it('keeps the FOV between 70 and 100 and volumes between 0 and 1', () => {
    const store = memoryStore({
      [SETTINGS_KEY]: JSON.stringify({ fov: 140, volumeMaster: -2, volumeWeapons: 7 }),
    })
    const settings = loadSettings(store)
    expect(settings.fov).toBe(100)
    expect(settings.volumeMaster).toBe(0)
    expect(settings.volumeWeapons).toBe(1)
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: '{"fov":10}' })).fov).toBe(70)
  })

  it('ignores corrupt data and wrong types field by field', () => {
    expect(loadSettings(memoryStore({ [SETTINGS_KEY]: 'not json' }))).toEqual(DEFAULT_SETTINGS)
    const settings = loadSettings(
      memoryStore({
        [SETTINGS_KEY]: JSON.stringify({ invertY: 'yes', language: 'fr', sensitivity: 2 }),
      }),
    )
    expect(settings.invertY).toBe(false)
    expect(settings.language).toBe(null)
    expect(settings.sensitivity).toBe(2)
  })
})

describe('last match setup', () => {
  it('defaults to TDM 4v4 on Soldier', () => {
    const setup = loadSetup(memoryStore())
    expect(setup.mode).toBe('tdm')
    expect(setup.teamSize).toBe(4)
    expect(setup.difficulty).toBe('soldier')
    expect(loadSetup(throwingStore).mode).toBe('tdm')
  })

  it('remembers the last configuration', () => {
    const store = memoryStore()
    const setup = {
      mode: 'ffa' as const,
      difficulty: 'veteran' as const,
      teamSize: 2 as const,
      ffaPlayers: 8 as const,
      primary: 'sniper' as const,
      seed: 1,
    }
    saveSetup(store, setup)
    expect(loadSetup(store)).toEqual(setup)
  })

  it('falls back per field on values the menu does not offer', () => {
    const store = memoryStore({
      [SETUP_KEY]: JSON.stringify({ mode: 'ctf', teamSize: 5, ffaPlayers: 3, primary: 'laser' }),
    })
    const setup = loadSetup(store)
    expect(setup.mode).toBe('ctf')
    expect(setup.teamSize).toBe(4)
    expect(setup.ffaPlayers).toBe(6)
    expect(setup.primary).toBe('rifle')
  })
})
