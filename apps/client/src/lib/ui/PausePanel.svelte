<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { itemLabel, PRIMARIES } from './labels.ts'
</script>

<div
  class="absolute top-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3 rounded-md bg-hud-panel px-6 py-4 text-center"
>
  <p class="text-2xl font-bold">{t('pause.title')}</p>
  <p class="text-sm text-hud-muted">{t('pause.resume')}</p>
  <!-- Loadout: a testing tool until F3; applies at once. -->
  <span class="mt-1 text-xs text-hud-muted">{t('hud.primaryWeapon')}</span>
  <div class="pointer-events-auto flex gap-1.5">
    {#each PRIMARIES as weapon (weapon)}
      <button
        type="button"
        class="rounded-md border-2 px-3 py-1.5 text-sm {weapon === hudState.weapon
          ? 'border-hud bg-hud/90 font-semibold text-hud-ink'
          : 'border-hud-muted/30 bg-hud-panel text-hud hover:border-hud'}"
        onclick={() => hudState.selectPrimary(weapon)}>{itemLabel(weapon)}</button
      >
    {/each}
  </div>
  <button
    type="button"
    class="pointer-events-auto mt-1 rounded-md border-2 border-hud-muted/30 px-4 py-1.5 text-sm hover:border-hud"
    onclick={() => hudState.quitMatch()}>{t('pause.quit')}</button
  >
</div>
<div
  class="absolute bottom-28 left-1/2 -translate-x-1/2 rounded-md bg-hud-panel px-4 py-2 text-center text-sm text-hud-muted"
>
  {#if hudState.mode === 'fps'}
    <p>{t('hint.move')}</p>
    <p>{t('hint.slots')}</p>
    <p>{t('hint.mouse')}</p>
    {#if import.meta.env.DEV}<p>{t('hint.dev')}</p>{/if}
  {:else}
    <p>{t('hint.fly')}</p>
  {/if}
</div>
