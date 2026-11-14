<script lang="ts">
  import { hudState } from './hud-state.svelte.ts'
  import { t } from '../i18n/locale.svelte.ts'

  // Start-up: covers the canvas until the world is meshed and the assets are in.
  const percent = $derived(Math.round(hudState.loadProgress * 100))
</script>

<div class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-hud-solid">
  <h1 class="text-5xl font-bold tracking-wide">Blockfront</h1>
  <div class="flex w-[min(80vw,26rem)] flex-col gap-2">
    <div
      class="h-3 overflow-hidden rounded-full border border-hud-muted/40 bg-black/40"
      role="progressbar"
      aria-label={t('loading.title')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        class="h-full rounded-full bg-hud transition-[width] duration-150"
        style="width: {percent}%"
      ></div>
    </div>
    <div class="flex justify-between text-base text-hud-muted tabular-nums">
      <span>{hudState.loadStage === 'assets' ? t('loading.assets') : t('loading.terrain')}</span>
      <span>{percent} %</span>
    </div>
  </div>
</div>
