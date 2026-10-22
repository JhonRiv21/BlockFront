<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { displayName, teamLabel } from './labels.ts'

  const mvpRow = $derived(hudState.rows.find((row) => row.id === hudState.mvp) ?? null)
</script>

<div class="absolute inset-0 bg-black/50"></div>
<div
  class="absolute top-1/2 left-1/2 flex w-[min(92vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg bg-hud-panel px-8 py-6 text-center"
>
  {#if hudState.winner === 'blue' || hudState.winner === 'red'}
    <p class="text-3xl font-bold {hudState.winner === 'blue' ? 'text-team-blue' : 'text-team-red'}">
      {t('end.win', { team: teamLabel(hudState.winner) })}
    </p>
  {:else}
    <p class="text-3xl font-bold">{t('end.draw')}</p>
  {/if}
  <p class="text-xl font-semibold tabular-nums">
    <span class="text-team-blue">{hudState.scoreBlue}</span>
    <span class="text-hud-muted"> : </span>
    <span class="text-team-red">{hudState.scoreRed}</span>
  </p>
  {#if mvpRow}
    <p class="text-sm">
      <span class="text-hud-muted">{t('end.mvp')}</span>
      <span class="font-semibold">{displayName(mvpRow.name)}</span>
      <span class="text-hud-muted tabular-nums">
        · {mvpRow.captures} {t('score.captures')} · {mvpRow.kills} {t('score.kills')}</span
      >
    </p>
  {/if}
  <table class="mt-2 w-full text-sm tabular-nums">
    <thead>
      <tr class="text-xs text-hud-muted">
        <th class="text-left font-semibold">{t('score.player')}</th>
        <th class="text-right">{t('score.kills')}</th>
        <th class="text-right">{t('score.deaths')}</th>
        <th class="text-right">{t('score.captures')}</th>
        <th class="text-right">{t('score.returns')}</th>
        <th class="text-right">{t('score.damage')}</th>
      </tr>
    </thead>
    <tbody>
      {#each hudState.rows as row (row.id)}
        <tr class={row.team === 'blue' ? 'text-team-blue' : 'text-team-red'}>
          <td class="text-left">{displayName(row.name)}</td>
          <td class="text-right">{row.kills}</td>
          <td class="text-right">{row.deaths}</td>
          <td class="text-right">{row.captures}</td>
          <td class="text-right">{row.returns}</td>
          <td class="text-right">{Math.round(row.damage)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="mt-2 flex gap-3">
    <button
      type="button"
      class="pointer-events-auto rounded-md bg-hud px-8 py-2.5 text-lg font-bold text-hud-ink hover:bg-white"
      onclick={() => hudState.playAgain()}>{t('end.again')}</button
    >
    <button
      type="button"
      class="pointer-events-auto rounded-md border-2 border-hud-muted/30 px-6 py-2.5 hover:border-hud"
      onclick={() => hudState.quitMatch()}>{t('end.menu')}</button
    >
  </div>
</div>
