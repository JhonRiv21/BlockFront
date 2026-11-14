import type { Locale } from '../i18n/strings.ts'
import { isRecord, readJson, writeJson, type KeyValueStore } from './storage.ts'

export const SETTINGS_KEY = 'blockfront:settings'

export interface Settings {
  // Multipliers on the base mouse sensitivity; the ADS one applies on top while aiming.
  sensitivity: number
  adsSensitivity: number
  // Vertical field of view in degrees at the hip.
  fov: number
  // 0..1 each; weapons and world are scaled by the general volume.
  volumeMaster: number
  volumeWeapons: number
  volumeWorld: number
  invertY: boolean
  showFps: boolean
  // Turns off the camera shake and most of the weapon bob.
  reduceMotion: boolean
  // null follows the browser.
  language: Locale | null
}

type NumberKey = {
  [K in keyof Settings]: Settings[K] extends number ? K : never
}[keyof Settings]

export const SETTING_RANGES: Record<NumberKey, { min: number; max: number; step: number }> = {
  sensitivity: { min: 0.2, max: 3, step: 0.05 },
  adsSensitivity: { min: 0.3, max: 1.5, step: 0.05 },
  fov: { min: 70, max: 100, step: 1 },
  volumeMaster: { min: 0, max: 1, step: 0.05 },
  volumeWeapons: { min: 0, max: 1, step: 0.05 },
  volumeWorld: { min: 0, max: 1, step: 0.05 },
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  adsSensitivity: 1,
  fov: 75,
  volumeMaster: 0.8,
  volumeWeapons: 1,
  volumeWorld: 1,
  invertY: false,
  showFps: false,
  reduceMotion: false,
  language: null,
}

// Anything stored (or nothing) to a complete, in-range Settings; bad fields take the default.
export function sanitizeSettings(raw: unknown): Settings {
  const source = isRecord(raw) ? raw : {}
  const settings: Settings = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(SETTING_RANGES) as NumberKey[]) {
    const value = source[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const { min, max } = SETTING_RANGES[key]
    settings[key] = Math.min(max, Math.max(min, value))
  }
  for (const key of ['invertY', 'showFps', 'reduceMotion'] as const) {
    if (typeof source[key] === 'boolean') settings[key] = source[key]
  }
  if (source.language === 'es' || source.language === 'en') settings.language = source.language
  return settings
}

export const loadSettings = (store: KeyValueStore | null): Settings =>
  sanitizeSettings(readJson(store, SETTINGS_KEY))

export const saveSettings = (store: KeyValueStore | null, settings: Settings): void =>
  writeJson(store, SETTINGS_KEY, settings)
