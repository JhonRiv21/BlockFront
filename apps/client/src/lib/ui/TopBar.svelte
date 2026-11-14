<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { clockText } from './labels.ts'
  import { ffaStanding } from './standings.ts'

  // Top of the screen by mode: CTF captures and clock; TDM team kills, the goal and the clock;
  // FFA your place and kills, the leader's kills, the goal and the clock.
  const clock = $derived(clockText(hudState.timeLeft))
  const suddenDeath = $derived(hudState.matchState === 'suddenDeath')
  const standing = $derived(ffaStanding(hudState.rows, hudState.localId))
</script>

<div
  class="absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-md bg-hud-panel px-5 py-1.5 text-lg font-semibold tabular-nums"
>
  {#if hudState.matchMode === 'ffa'}
    <span
      ><span class="text-base text-hud-muted">{t('hud.position')}</span>
      {standing.place}/{standing.of}</span
    >
    <span
      ><span class="text-base text-hud-muted">{t('hud.yourKills')}</span>
      {standing.score}</span
    >
    <span
      ><span class="text-base text-hud-muted">{t('hud.leader')}</span>
      <span class="text-loot">{standing.leader}</span></span
    >
    <span class="text-base text-hud-muted">{t('hud.goal', { n: hudState.scoreToWin })}</span>
  {:else}
    <span class="flex items-center gap-2">
      <span class="text-team-blue-ink">{hudState.scoreBlue}</span>
      <span class="text-hud-muted">:</span>
      <span class="text-team-red-ink">{hudState.scoreRed}</span>
    </span>
    {#if hudState.matchMode === 'tdm'}
      <span class="text-base text-hud-muted">{t('hud.goal', { n: hudState.scoreToWin })}</span>
    {/if}
  {/if}
  <span class="text-base {suddenDeath ? 'text-team-red-ink' : 'text-hud-muted'}"
    >{suddenDeath ? t('match.suddenDeath') + ' ' : ''}{clock}</span
  >
</div>
