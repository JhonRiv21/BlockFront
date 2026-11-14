import { browserStorage } from './storage.ts'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type Settings,
} from './settings.ts'

// Player settings, saved on every change; the mount applies them to the renderer and locale.
class SettingsState {
  values = $state<Settings>(loadSettings(browserStorage()))
  private listener: (settings: Settings) => void = () => {}

  // Called once by the mount; hears the current values at once.
  listen(listener: (settings: Settings) => void): void {
    this.listener = listener
    listener(this.current())
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.commit(sanitizeSettings({ ...this.current(), [key]: value }))
  }

  reset(): void {
    // Language stays: resetting should not flip the copy under the player.
    this.commit({ ...DEFAULT_SETTINGS, language: this.values.language })
  }

  current(): Settings {
    return $state.snapshot(this.values)
  }

  private commit(next: Settings): void {
    this.values = next
    saveSettings(browserStorage(), next)
    this.listener(next)
  }
}

export const settingsState = new SettingsState()
