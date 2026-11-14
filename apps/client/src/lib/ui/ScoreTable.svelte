<script lang="ts">
  import { hudState, type ScoreRow } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { displayName } from './labels.ts'

  // One table of players. With `team` the rows are that team's and the header takes its colour;
  // without it every row carries its own team colour (the end-of-match table), except in FFA,
  // where colours mean nothing and only the local row stands out. CTF counts captures and
  // returns; TDM and FFA count the score (kills minus own deaths) instead.
  let { rows, team = null }: { rows: ScoreRow[]; team?: 'blue' | 'red' | null } = $props()
  const ffa = $derived(hudState.matchMode === 'ffa')
  const ctf = $derived(hudState.matchMode === 'ctf')
  const ink = (row: ScoreRow) => {
    if (team || ffa)
      return row.id === hudState.localId ? 'font-semibold text-hud' : 'text-hud-muted'
    const local = row.id === hudState.localId ? 'font-semibold' : ''
    return `${row.team === 'blue' ? 'text-team-blue-ink' : 'text-team-red-ink'} ${local}`
  }
  const headerInk = $derived(
    team === 'blue'
      ? 'text-team-blue-ink'
      : team === 'red'
        ? 'text-team-red-ink'
        : 'text-hud-muted',
  )
</script>

<table class="w-full table-fixed text-base tabular-nums">
  <colgroup>
    <col class="w-auto" />
    <col class="w-20" />
    <col class="w-20" />
    {#if ctf}<col class="w-20" />{/if}
    <col class="w-20" />
    <col class="w-20" />
  </colgroup>
  <thead>
    <tr class="text-sm {headerInk}">
      <th class="text-left font-semibold">{t('score.player')}</th>
      <th class="px-1 text-right">{t('score.kills')}</th>
      <th class="px-1 text-right">{t('score.deaths')}</th>
      {#if ctf}
        <th class="px-1 text-right">{t('score.captures')}</th>
        <th class="px-1 text-right">{t('score.returns')}</th>
      {:else}
        <th class="px-1 text-right">{t('score.points')}</th>
      {/if}
      <th class="px-1 text-right">{t('score.damage')}</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.id)}
      <tr class="{ink(row)} {row.alive ? '' : 'opacity-70'}">
        <td class="truncate text-left {row.alive ? '' : 'line-through'}">{displayName(row.name)}</td
        >
        <td class="px-1 text-right">{row.kills}</td>
        <td class="px-1 text-right">{row.deaths}</td>
        {#if ctf}
          <td class="px-1 text-right">{row.captures}</td>
          <td class="px-1 text-right">{row.returns}</td>
        {:else}
          <td class="px-1 text-right">{row.score}</td>
        {/if}
        <td class="px-1 text-right">{Math.round(row.damage)}</td>
      </tr>
    {/each}
  </tbody>
</table>
