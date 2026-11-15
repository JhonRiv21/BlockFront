<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'
  import { itemLabel } from './labels.ts'
  import { PRIMARIES } from '../settings/match-setup.ts'
  import ChoiceButton from './ChoiceButton.svelte'
</script>

<!-- Dims the frozen frame so it reads as a pause, not a hang. -->
<div class="absolute inset-0 bg-black/45"></div>
<div
  class="absolute top-[40%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-md bg-hud-panel px-7 py-5 text-center"
>
  <p class="text-3xl font-bold">{t('pause.title')}</p>
  <p class="text-base text-hud-muted">{t('pause.resume')}</p>
  {#if import.meta.env.DEV}
    <!-- Testing tool, dev builds only: the primary changes at once. -->
    <span class="mt-1 text-sm text-hud-muted">{t('hud.primaryWeapon')} (dev)</span>
    <div class="flex gap-1.5">
      {#each PRIMARIES as weapon (weapon)}
        <ChoiceButton
          selected={weapon === hudState.weapon}
          onclick={() => hudState.selectPrimary(weapon)}>{itemLabel(weapon)}</ChoiceButton
        >
      {/each}
    </div>
  {/if}
  <div class="mt-1 flex gap-3">
    <button
      type="button"
      class="pointer-events-auto rounded-md border-2 border-hud-muted/40 px-5 py-2 text-base hover:border-hud"
      onclick={() => (hudState.settingsOpen = true)}>{t('menu.settings')}</button
    >
    <button
      type="button"
      class="pointer-events-auto rounded-md border-2 border-hud-muted/40 px-5 py-2 text-base hover:border-hud"
      onclick={() => hudState.quitMatch()}>{t('pause.quit')}</button
    >
  </div>
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
