import { t } from '../i18n/locale.svelte.ts'
import type { StringKey } from '../i18n/strings.ts'

export const PRIMARIES = ['rifle', 'carbine', 'smg', 'shotgun', 'sniper'] as const

// Item keys from the renderer and weapon ids map to item.* strings.
export const itemLabel = (key: string): string => t(`item.${key}` as StringKey)

// Kill feed middle column: weapons by item name, drowning and falls by cause.
export const causeLabel = (tool: string): string =>
  tool === 'drowning' || tool === 'fall' || tool === 'blocks'
    ? t(`cause.${tool}` as StringKey)
    : itemLabel(tool)

// Config names are ids ('you', 'dummy-2'); bots and rooms will bring real names through as is.
export function displayName(name: string): string {
  if (name === 'you') return t('player.you')
  const dummy = /^dummy-(\d+)$/.exec(name)
  if (dummy) return t('player.dummy', { n: Number(dummy[1]) })
  return name
}

export const teamLabel = (team: 'blue' | 'red'): string => t(`team.${team}`)
