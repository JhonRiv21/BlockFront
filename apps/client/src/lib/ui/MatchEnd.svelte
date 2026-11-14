<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { displayName, teamLabel } from './labels.ts'
  import { ffaStanding } from './standings.ts'
  import ScoreTable from './ScoreTable.svelte'

  // Result by mode: a team or a draw (CTF, TDM), a player or a draw (FFA, winner 'player').
  const mvpRow = $derived(hudState.rows.find((row) => row.id === hudState.mvp) ?? null)
  const winnerRow = $derived(hudState.rows.find((row) => row.id === hudState.winnerPlayer) ?? null)
  const ownTeamWon = $derived(hudState.winner === hudState.localTeam)
  const standing = $derived(ffaStanding(hudState.rows, hudState.localId))
</script>

<div class="absolute inset-0 bg-black/50"></div>
<div
  class="absolute top-1/2 left-1/2 flex w-[min(92vw,46rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg bg-hud-panel px-8 py-6 text-center"
>
  {#if hudState.winner === 'player' && winnerRow}
    {#if winnerRow.id === hudState.localId}
      <p class="text-4xl font-bold text-loot">{t('end.youWin')}</p>
    {:else}
      <p class="text-3xl font-bold">{t('end.playerWins', { name: displayName(winnerRow.name) })}</p>
    {/if}
  {:else if hudState.winner === 'blue' || hudState.winner === 'red'}
    <p class="text-lg font-semibold tracking-widest uppercase text-hud-muted">
      {ownTeamWon ? t('end.victory') : t('end.defeat')}
    </p>
    <p
      class="text-3xl font-bold {hudState.winner === 'blue'
        ? 'text-team-blue-ink'
        : 'text-team-red-ink'}"
    >
      {t('end.win', { team: teamLabel(hudState.winner) })}
    </p>
  {:else}
    <p class="text-3xl font-bold">{t('end.draw')}</p>
  {/if}
  {#if hudState.matchMode === 'ffa'}
    <p class="text-lg tabular-nums">{t('end.place', { p: standing.place, n: standing.of })}</p>
  {:else}
    <p class="text-2xl font-semibold tabular-nums">
      <span class="text-team-blue-ink">{hudState.scoreBlue}</span>
      <span class="text-hud-muted"> : </span>
      <span class="text-team-red-ink">{hudState.scoreRed}</span>
    </p>
  {/if}
  {#if mvpRow}
    <p class="text-base">
      <span class="text-hud-muted">{t('end.mvp')}</span>
      <span class="font-semibold">{displayName(mvpRow.name)}</span>
      <span class="text-hud-muted tabular-nums">
        {#if hudState.matchMode === 'ctf'}
          · {t('score.captures')} {mvpRow.captures} · {t('score.kills')} {mvpRow.kills}
        {:else}
          · {t('score.kills')} {mvpRow.kills} · {t('score.deaths')} {mvpRow.deaths}
        {/if}
      </span>
    </p>
  {/if}
  <div class="mt-2 max-h-[45vh] w-full overflow-y-auto">
    <ScoreTable rows={hudState.rows} />
  </div>
  <div class="mt-2 flex gap-3">
    <button
      type="button"
      class="pointer-events-auto rounded-md bg-hud px-8 py-2.5 text-lg font-bold text-hud-ink hover:bg-white"
      onclick={() => hudState.playAgain()}>{t('end.again')}</button
    >
    <button
      type="button"
      class="pointer-events-auto rounded-md border-2 border-hud-muted/40 px-6 py-2.5 text-lg hover:border-hud"
      onclick={() => hudState.quitMatch()}>{t('end.menu')}</button
    >
  </div>
</div>
