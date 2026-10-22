<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { displayName } from './labels.ts'

  const teams = ['blue', 'red'] as const
  const rowsOf = (team: 'blue' | 'red') => hudState.rows.filter((row) => row.team === team)
</script>

<div
  class="absolute top-1/2 left-1/2 w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-hud-panel px-6 py-4"
>
  <p class="mb-3 text-center text-lg font-bold">{t('score.title')}</p>
  <div class="grid grid-cols-2 gap-6">
    {#each teams as team (team)}
      <table class="w-full text-sm tabular-nums">
        <thead>
          <tr class="{team === 'blue' ? 'text-team-blue' : 'text-team-red'} text-xs">
            <th class="text-left font-semibold">{t('score.player')}</th>
            <th class="text-right">{t('score.kills')}</th>
            <th class="text-right">{t('score.deaths')}</th>
            <th class="text-right">{t('score.captures')}</th>
            <th class="text-right">{t('score.returns')}</th>
            <th class="text-right">{t('score.damage')}</th>
          </tr>
        </thead>
        <tbody>
          {#each rowsOf(team) as row (row.id)}
            <tr class={row.id === hudState.localId ? 'font-semibold' : 'text-hud-muted'}>
              <td class="truncate text-left {row.alive ? '' : 'line-through'}"
                >{displayName(row.name)}</td
              >
              <td class="text-right">{row.kills}</td>
              <td class="text-right">{row.deaths}</td>
              <td class="text-right">{row.captures}</td>
              <td class="text-right">{row.returns}</td>
              <td class="text-right">{Math.round(row.damage)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/each}
  </div>
</div>
