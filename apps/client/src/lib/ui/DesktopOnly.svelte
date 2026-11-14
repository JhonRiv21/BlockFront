<script lang="ts">
  import { t } from '../i18n/locale.svelte.ts'
</script>

<!-- Touch-only devices: the game needs a keyboard and a mouse. -->
<main
  class="flex h-full flex-col overflow-y-auto items-center justify-center gap-6 bg-hud-solid px-6 py-10 text-center font-hud text-hud"
>
  <h1 class="text-4xl font-bold tracking-wide">Blockfront</h1>
  <img
    src="/og.png"
    alt=""
    width="1200"
    height="630"
    class="w-full max-w-xl rounded-lg border border-hud-muted/30"
  />
  <h2 class="text-2xl font-semibold">{t('desktop.title')}</h2>
  <p class="max-w-md text-lg text-hud-muted">{t('desktop.body')}</p>
</main>
