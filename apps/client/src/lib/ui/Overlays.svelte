<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'

  const hurtFlash = $derived(hudState.now - hudState.hurtAt < 1000)
  // Blast flash: full for the first 60 ms, then gone over 300 ms more.
  const blastOpacity = $derived.by(() => {
    const age = hudState.now - hudState.blastAt
    if (age > 360) return 0
    return hudState.blastStrength * 0.8 * (age < 60 ? 1 : 1 - (age - 60) / 300)
  })
</script>

{#if hudState.underwater}
  <div class="absolute inset-0 bg-water-tint shadow-[inset_0_0_100px_30px_rgba(5,5,51,0.4)]"></div>
{/if}
{#if hurtFlash && hudState.alive}
  <div
    class="absolute inset-0 shadow-[inset_0_0_120px_40px_rgba(200,30,30,0.55)] transition-opacity"
    style="opacity: {1 - (hudState.now - hudState.hurtAt) / 1000}"
  ></div>
{/if}

{#if hudState.phase !== 'menu'}
  {#if hudState.ads > 0 && !hudState.scoped}
    <div
      class="absolute inset-0"
      style="opacity: {0.3 *
        hudState.ads}; background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.85) 100%)"
    ></div>
  {/if}
  {#if hudState.scoped}
    <!-- Hybrid scope: black circular vignette and a thin reticle instead of a second render. -->
    <div
      class="absolute inset-0 bg-black/95"
      style="mask: radial-gradient(circle at center, transparent 0, transparent 34vh, black 35vh); -webkit-mask: radial-gradient(circle at center, transparent 0, transparent 34vh, black 35vh)"
    ></div>
    <div class="absolute top-1/2 left-1/2 size-0">
      <span
        class="absolute top-1/2 left-1/2 h-px w-[70vh] -translate-x-1/2 -translate-y-1/2 bg-black/80"
      ></span>
      <span
        class="absolute top-1/2 left-1/2 h-[70vh] w-px -translate-x-1/2 -translate-y-1/2 bg-black/80"
      ></span>
      <span
        class="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-team-red"
      ></span>
    </div>
  {/if}
  {#if blastOpacity > 0}
    <div
      class="absolute inset-0"
      style="opacity: {blastOpacity}; background: radial-gradient(ellipse at center, rgba(255, 244, 214, 1) 0%, rgba(255, 170, 70, 0.85) 45%, rgba(255, 90, 20, 0.4) 100%)"
    ></div>
  {/if}
  {#if hudState.scopeFade > 0}
    <div class="absolute inset-0 bg-black" style="opacity: {hudState.scopeFade}"></div>
  {/if}

  {#if !hudState.assetsReady}
    <div
      class="absolute top-16 left-1/2 -translate-x-1/2 rounded-md bg-hud-panel px-3 py-1 text-xs text-hud-muted"
    >
      {t('hud.loadingAssets')}
    </div>
  {/if}
{/if}

{#if hudState.fatal}
  <div class="absolute inset-0 bg-black/70"></div>
  <div
    class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3 rounded-lg bg-hud-panel px-8 py-6 text-center"
  >
    <p class="text-lg font-semibold text-team-red">{t(`error.${hudState.fatal.kind}`)}</p>
    {#if hudState.fatal.message}<p class="text-xs text-hud-muted">
        {hudState.fatal.message}
      </p>{/if}
    {#if hudState.fatal.kind !== 'webgl'}
      <button
        type="button"
        class="pointer-events-auto rounded-md bg-hud px-6 py-2 font-semibold text-hud-ink hover:bg-white"
        onclick={() => location.reload()}>{t('error.reload')}</button
      >
    {/if}
  </div>
{/if}

{#if hudState.lockFailure && hudState.now - hudState.lockFailureAt < 2500}
  <div
    class="absolute top-16 left-1/2 -translate-x-1/2 rounded-md bg-hud-panel px-3 py-1.5 text-sm text-hud"
  >
    {t(`lock.${hudState.lockFailure}`)}
  </div>
{/if}

{#if import.meta.env.DEV && hudState.errorLog.length > 0}
  <div
    class="pointer-events-auto absolute top-4 left-4 max-w-[40vw] rounded-md bg-team-red/80 px-3 py-2 text-xs"
  >
    {#each hudState.errorLog as line, i (i)}<p class="truncate">{line}</p>{/each}
    <button type="button" class="mt-1 underline" onclick={() => (hudState.errorLog = [])}>×</button>
  </div>
{/if}
