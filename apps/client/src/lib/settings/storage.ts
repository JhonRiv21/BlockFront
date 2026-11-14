// localStorage can be missing or throw (private windows, blocked site data, sandboxed frames):
// every access goes through here and degrades to "nothing stored".
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem'>

export function browserStorage(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch (error) {
    console.warn('localStorage unavailable', error)
    return null
  }
}

export function readJson(store: KeyValueStore | null, key: string): unknown {
  if (!store) return null
  try {
    const text = store.getItem(key)
    return text === null ? null : (JSON.parse(text) as unknown)
  } catch (error) {
    console.warn(`could not read ${key}`, error)
    return null
  }
}

export function writeJson(store: KeyValueStore | null, key: string, value: unknown): void {
  if (!store) return
  try {
    store.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.warn(`could not save ${key}`, error)
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
