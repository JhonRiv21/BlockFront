<script lang="ts">
  import { mountGame } from './lib/render/mount-game.ts'
  import Hud from './lib/ui/Hud.svelte'
</script>

<canvas class="fixed inset-0 block size-full" {@attach mountGame}></canvas>
<Hud />
