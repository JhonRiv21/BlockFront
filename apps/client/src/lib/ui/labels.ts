import { t } from '../i18n/locale.svelte.ts'
import type { StringKey } from '../i18n/strings.ts'
import { botName } from './bot-names.ts'

// Item keys from the renderer and weapon ids map to item.* strings.
export const itemLabel = (key: string): string => t(`item.${key}` as StringKey)

// Kill feed middle column: weapons by item name, drowning and falls by cause.
export const causeLabel = (tool: string): string =>
  tool === 'drowning' || tool === 'fall' || tool === 'blocks'
    ? t(`cause.${tool}` as StringKey)
    : itemLabel(tool)

// Config names are ids ('you', 'dummy-2', 'bot-3'); anything else shows as is.
export function displayName(name: string): string {
  if (name === 'you') return t('player.you')
  const dummy = /^dummy-(\d+)$/.exec(name)
  if (dummy) return t('player.dummy', { n: Number(dummy[1]) })
  const bot = /^bot-(\d+)$/.exec(name)
  if (bot) return botName(Number(bot[1]))
  return name
}

export const teamLabel = (team: 'blue' | 'red'): string => t(`team.${team}`)

// mm:ss of a clock in seconds.
export function clockText(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(total / 60)
  const sec = total % 60
  return `${m}:${sec < 10 ? '0' : ''}${sec}`
}
