<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import ScoreTable from './ScoreTable.svelte'

  // Tab: one table per team, stacked, same layout as the end-of-match table. FFA: one table,
  // already ordered by score.
  const teams = ['blue', 'red'] as const
  const rowsOf = (team: 'blue' | 'red') => hudState.rows.filter((row) => row.team === team)
</script>

<div
  class="absolute top-1/2 left-1/2 flex w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg bg-hud-panel px-6 py-4"
>
  <p class="text-center text-xl font-bold">{t('score.title')}</p>
  {#if hudState.matchMode === 'ffa'}
    <ScoreTable rows={hudState.rows} />
  {:else}
    {#each teams as team (team)}
      <ScoreTable rows={rowsOf(team)} {team} />
    {/each}
  {/if}
</div>
