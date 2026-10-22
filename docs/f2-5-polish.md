# F2.5 — Pulido: mundo, agua, HUD y armas

Especificación de la fase de pulido entre F2 (combate) y F3 (CTF + bots). Sale de tres
investigaciones del 2026-10-08:
- Blockade 3D y Minecraft como referencias de diseño.
- Render voxel.
- Armas y animación en primera persona.

Cada decisión trae su número y su fuente. **Lo marcado [I] es criterio de diseño, no un dato
verificado: ajustarlo a ojo jugando.**

Principio rector: **tomar lo que funcionó en Blockade 3D y en Minecraft, mejor armado**, y evitar lo
que se les criticó (ver §0).

Reglas de ejecución: PLAN.md §11. Código en inglés, `sim` sin DOM/Three, tests desde esta
especificación (no leyendo la implementación), sin commit.

---

## 0. Lecciones de Blockade 3D (reseñas de Steam, wiki, notas de parche)

| Funcionó | Se criticó | Qué hacemos |
|---|---|---|
| Gunplay simple, cabezas fáciles de acertar, buen registro de impactos | Pay-to-win | Arsenal fijo; las armas se eligen, no se compran |
| Construir fuertes al vuelo, con bloques por vida que se reponen en la base | Los compañeros rompían tu fuerte | Ver la decisión abierta D3 (§7) |
| Miras modeladas en todas las armas (hubo parches de «mira delantera invisible» y de «STECHKIN al apuntar») y telescopio en el francotirador | Niebla en caja: se veía más lejos por las esquinas | **Niebla esférica** (§1.6). Hoy la nuestra es plana |
| Ligero; los veteranos preferían los gráficos simples a los de 2018 | Lag con muchos bloques | Presupuestos del PLAN §6 |
| Kit base: francotirador, subfusil, escopeta, pistola y pala | Rondas de 30 min; búnkeres imposibles en la zona de captura | Reloj de 10 min (PLAN); límite de construcción cerca de la bandera (F3) |

Fuentes:
- Página de Steam (app 302830) y su API de reseñas:
  https://store.steampowered.com/appreviews/302830?json=1&language=english&filter=all&num_per_page=100
- Wiki: https://blockade-3d-original.fandom.com/wiki/All_the_Items
- Guías de Steam: https://steamcommunity.com/sharedfiles/filedetails/?id=532527128 y
  https://steamcommunity.com/sharedfiles/filedetails/?id=2293066789
- Hilo del desarrollador: https://gamedev.ru/projects/forum/?id=184836

---

## 1. Mundo visual (parte A)

Objetivo: que los bloques dejen de verse «corrientes» sin perder el estilo limpio ni salir del
presupuesto (<5 MB para la primera partida, 60 fps, <600 KB de JS gzip).

### 1.1 Registro de bloques con caras

La paleta plana se reemplaza por un registro de bloques. El modelo es el de noa-engine:
https://github.com/fenomas/noa/blob/master/src/lib/registry.js

```ts
interface BlockDef {
  id: number
  name: string
  faces: { top: TextureLayer; bottom: TextureLayer; side: TextureLayer }
  render: 'cube' | 'cross' | 'liquid' | 'none'
  solid: boolean
  opaque: boolean
  liquid: boolean
  tint?: number // multiplicador; los bloques de jugador = capa lisa + tinte de color
}
```

- El registro vive en `packages/sim/world/blocks.ts`. Al worker se le pasa compilado a tablas
  tipadas: `FACE_LAYER = Uint8Array(256 * 6)` y `FLAGS = Uint8Array(256)`.
- **Grama:** arriba `grass_top`; a los lados `grass_side` (tierra con una franja verde ya horneada);
  abajo `dirt`. La franja queda alineada sola porque los quads empiezan en y entera.
- **Tronco:** arriba y abajo `log_rings`; a los lados `bark`. **Hojas:** `leaves`, opacas.
- Bloques nuevos: tronco, hojas, pasto alto y flores (estos dos en cruz), y agua (líquido).
- Los bloques de los jugadores siguen siendo un color de la paleta: una capa «lisa» más un tinte.

### 1.2 Texturas procedurales horneadas: el híbrido recomendado

- Al arrancar, un worker genera 16×16 texeles por material con código procedural y los sube a una
  `DataArrayTexture` (unas 32–64 capas, ≈64 KB) con mipmaps y filtro `NearestMipmapLinear`. Pesan
  0 KB de descarga, no parpadean de lejos, y cualquier capa se puede reemplazar después por una
  textura CC0 hecha a mano.
- Patrones de bajo contraste, por material:
  - Tierra granulada.
  - Piedra con vetas.
  - Anillos de tronco y corteza vertical.
  - Hojas moteadas con huecos oscuros pintados.
  - Arena con grano fino.
  - Grava.
  - Grama con briznas.
  - En todos, un **borde oscurecido de 1 texel**.
- **Se mantiene el tinte por voxel** con hash. La variación de color por voxel es la mitad del look
  (así se ve bien Teardown).
- Greedy meshing:
  - La clave de fusión pasa de `(color, AO)` a `(capa, AO)`.
  - Sin atributo de UV: el shader la deriva de la posición y la normal
    (`uv = n.x≠0 ? pos.zy : n.y≠0 ? pos.xz : pos.xy`), con `RepeatWrapping`, para que se repita una
    vez por bloque sin costuras.
- `ShaderMaterial` con `glslVersion: THREE.GLSL3` para usar `sampler2DArray`.
- Fuente del greedy con array textures:
  https://0fps.net/2013/07/09/texture-atlases-wrapping-and-mip-mapping/
- Si se quieren texturas a mano, packs CC0 verificados:
  - https://opengameart.org/content/1616-block-textures
  - https://opengameart.org/content/16x16-block-texture-set
  - Kenney Voxel Pack (128 px, habría que reducirlo).
  - **No usar Pixel Perfection ni Minetest: son CC-BY-SA.**

### 1.3 Árboles y vegetación

- **Distribución:**
  - Grilla con jitter de 6–8 bloques por celda y probabilidad según un ruido de bioma.
  - `hash(cx, cz, seed)` entero, nunca `Math.random`: el multijugador necesita el mismo mapa.
  - Referencia: https://www.redblobgames.com/maps/terrain-from-noise/
  - **Nunca dentro de las bases ni en los pasillos de la bandera.** Respetar la simetría en espejo.
- **Plantilla de árbol:** tronco de 4–6 bloques y copa de radio 2–3 (esfera con el borde recortado por
  hash, o cubo sin esquinas). Variedad por semilla: 2–3 formas.
- **Hojas opacas**, como en el modo «fast» de Minecraft. Con alpha-test se multiplican las caras y se
  crea visibilidad asimétrica en un shooter.
- **Pasto alto y flores en cruz** (cross-quads: dos planos en X):
  - Van en una malla `decor` por chunk, generada por el mismo worker y fuera del greedy.
  - `discard` si alfa < 0,5; `DoubleSide`.
  - Sin colisión, y las balas los atraviesan.
  - Altura ≤ 1 bloque, para que no sirvan de escondite injusto.
  - Se borran si se rompe el bloque de abajo. Balanceo por viento opcional en el vertex shader.

### 1.4 Luz de cielo (skylight) por flood-fill: el mayor salto visual

- Da sombra bajo los árboles y oscurece cuevas y túneles. Algoritmo de Seeds of Andromeda:
  https://notverymoe.github.io/md-gamedev-gems/voxel/lighting/soa/index.html
  - El sol baja por las columnas sin perder intensidad.
  - Desde ahí se propaga por BFS.
  - Al quitar luz se hace un BFS de eliminación.
- Se guarda en una `Data3DTexture` R8 de 128×64×192 (1,5 MB). El fragment shader la muestrea en
  `worldPos + normal * 0.5` con `LinearFilter`: **luz suave gratis y sin tocar el greedy**.
- El cálculo inicial va en worker (estimado 20–60 ms [I]). Al editar un bloque, BFS local (<1 ms [I])
  y resubir la textura con throttle.
- `uniform skyIntensity` deja abierto un ciclo de día y noche a futuro (fuera de alcance).

### 1.5 Cielo y tone mapping

- Cielo con gradiente (cenit → horizonte) y disco de sol. La niebla toma **el mismo color del
  horizonte**.
- Tone mapping dentro del `ShaderMaterial`, con `#include <tonemapping_fragment>` y
  `#include <colorspace_fragment>` al final. Probar `ACESFilmic` y `Neutral`; AgX desatura demasiado
  para voxels de colores [I].
  Fuente: https://discourse.threejs.org/t/tone-mapping-color-issues-with-custom-shadermaterial/77261
- Nubes planas de bloques que se desplazan (un plano alto con ruido umbralizado): opcional.
- **No hacer:** CSM, EffectComposer, bloom ni SSAO. El composer pierde el MSAA del canvas, que en
  bordes voxel importa mucho.

### 1.6 Niebla esférica

Hoy la niebla usa los chunks de Three (`fog_vertex`): profundidad sobre el eje de la cámara, es decir,
**plana**. Es el defecto criticado en Blockade 3D (se ve más lejos por las esquinas y la niebla «gira»
con la cámara). Hay que calcularla con `length(mvPosition.xyz)` en el voxel shader, en el de agua y en
el de los materiales estándar de jugadores (con un `onBeforeCompile` o un chunk propio).

---

## 2. Agua y nado (parte B)

Referencias:
- https://minecraft.wiki/w/Water
- https://minecraft.wiki/w/Swimming
- https://minecraft.wiki/w/Fog
- Física de Minecraft por tick: https://github.com/ddevault/TrueCraft/wiki/Entity-Movement-And-Physics
- Flotación en AABB: https://raw.githubusercontent.com/fenomas/voxel-physics-engine/master/src/index.js

### 2.1 Representación

- **Agua estática** definida por el generador: el río central y, si cabe, lagos por semilla, todo
  como fuente. **Sin simular flujo.** En un shooter flujo significa sincronizar cientos de cambios de
  bloque por red, permite inundar la base rival y vuelve el mapa impredecible.
- Regla mínima de relleno: al romper un bloque por debajo del nivel del agua que tiene agua al lado o
  encima, ese hueco pasa a ser agua. Es un solo paso, sin cascada, y lo decide el sim.
- El agua no es sólida: las balas la atraviesan y los bloques no se pueden colocar «sobre» ella como
  si fuera sólida, pero sí reemplazarla.

### 2.2 Render

- Malla `liquid` aparte por chunk, `transparent: true`, `depthWrite: false`, dibujada después de lo
  opaco.
- Solo se generan caras de agua hacia el aire (nunca agua-agua ni agua-sólido). La superficie superior
  baja a **0,889** (8/9) cuando no hay agua encima.
- Shader: dos capas de ruido desplazándose perturban la normal, Fresnel con el color del cielo y alfa
  de 0,6–0,75. Color base `#3F76E4` (el de Minecraft).

### 2.3 Bajo el agua

- Cuando el ojo está dentro del agua (por debajo de `y + 0.889`):
  - La niebla pasa a azul oscuro `#050533` mezclado con el color del agua, a 16–24 bloques [I].
  - Overlay azul con viñeta.
  - La superficie se dibuja en `DoubleSide`.
- Al entrar, la niebla empieza casi opaca y **se aclara en 2–3 s** [I]. En Minecraft tarda 30 s,
  demasiado para un shooter.

### 2.4 Física de nado (en `packages/sim/physics`)

Las constantes de Minecraft están en ticks de 20 Hz y hay que convertirlas a nuestro dt: `k^(dt·20)`.

| Parámetro | Valor |
|---|---|
| Arrastre en agua | `vel *= 0.8` por tick de 20 Hz, es decir `0.8^(dt·20)` |
| Gravedad en agua | ~0,1 de la normal; hundimiento terminal ~0,5 bloques/s |
| Subir | Mantener Espacio: +0,04 por tick de 20 Hz (≈ 1,6 bloques/s de subida neta [I]) |
| Velocidad horizontal | Superficie ~2,2 bloques/s; sumergido ~2,0 (caminar en agua) |
| Nado con sprint (Minecraft 1.13, añadido 2026-10-20) | Sprint + adelante con el cuerpo al menos medio sumergido: ~5,6 bloques/s en la dirección de la mirada; mirar abajo bucea, mirar arriba sale; con la mirada al frente se mantiene en superficie. Espacio sube, agacharse baja |
| Agacharse | Hunde más rápido |
| Salir por el borde | Si choca en horizontal estando en agua y el espacio 0,6 más arriba está libre: impulso vertical de ≈ 6 bloques/s |
| Detección | `inWater` (física) por el ratio sumergido del AABB, y `eyeInWater` (overlay y aire) por el voxel del ojo |
| Flotación | `−g · densidad · ratioSumergido`; arrastre escalado por `1 − (1 − ratio)²` |

Además:
- Si algún día se agrega daño por caída, el agua lo anula. Hoy no existe.
- **Sin mira dentro del agua.** La pala funciona pero 2× más lenta [I].

Tests: flota en la superficie, se hunde sin input, sube con Espacio, sale por un borde de 1 bloque, el
ratio sumergido es correcto en los bordes de chunk, y el relleno de un paso no cae en cascada.

---

## 3. HUD estilo Minecraft (parte C)

Referencias:
- https://minecraft.wiki/w/Heads-up_display
- https://minecraft.wiki/w/Health
- https://minecraft.wiki/w/Damage#Drowning

### 3.1 Vida en corazones

- 100 HP = **10 corazones de 10 HP**; medio corazón = 5 HP. Se muestra redondeado hacia arriba al
  múltiplo de 5.
- Corazones dibujados en pixel art 9×9 (SVG o canvas propio, no assets de Minecraft), con contorno
  oscuro.
- **Temblor con ≤ 20 HP.**
- Al recibir daño:
  - La barra parpadea con un contorno blanco durante 1 s.
  - Los corazones recién perdidos se ven en pálido un momento.
  - Viñeta roja en pantalla y un ligero roll de cámara hacia el atacante.
- **Sin** los 0,5 s de invulnerabilidad de Minecraft: en un shooter se comería balas.
- Un número pequeño de HP junto a los corazones, opcional en ajustes (por defecto apagado).
- Regeneración: ver la decisión abierta D1 (§7).

### 3.2 Aire en burbujas

- **10 burbujas = 15 s.** Se pierde una cada 1,5 s.
- Al reventar cada burbuja, un «pop» cada vez más agudo.
- La barra solo aparece con el ojo dentro del agua o con el aire incompleto, encima de los corazones.
- Al llegar a 0: 1 s de gracia y luego **10 HP/s** (1 corazón por segundo, la misma proporción que en
  Minecraft). Las burbujas vacías tiemblan.
- Fuera del agua el aire se repone completo en ~2 s.
- El aire vive en el sim, porque afecta la vida. El HUD solo lo dibuja.

Tests: tiempos de consumo, gracia, daño por segundo y recarga.

### 3.3 Hotbar

- **5 ranuras** en el orden de Counter-Strike, que el público de shooters ya trae aprendido:

| Tecla | Ranura | Notas |
|---|---|---|
| 1 | Primaria | Elegida en el loadout: fusil, carabina, subfusil, escopeta o francotirador |
| 2 | Pistola | Siempre presente |
| 3 | Pala | — |
| 4 | Bloques | Contador de la pila. Selector de color (§3.4) |
| 5 | Granada | Contador. Además, `G` lanza rápido sin cambiar de ranura |

- Rueda para ciclar; `Q` vuelve a la ranura anterior.
- Aspecto: barra de cajones cuadrados con un marco grueso en el seleccionado y el ícono del ítem (un
  render 3D del modelo a una textura, o un SVG pixel art). El conteo va abajo a la derecha, en blanco
  con sombra, y se oculta si es 1.
- Al cambiar de ranura, el **nombre del ítem** aparece sobre la barra 2 s, con fundido en los últimos
  0,5 s (ES/EN).
- La munición del arma (cargador / reserva) se queda aparte, abajo a la derecha.

### 3.4 Color de los bloques

- Una **sola ranura** con selector de color: los bloques son un único recurso por vida, como en
  Blockade. Varias pilas confunden y llenan la barra.
- Paleta de 8 colores; por defecto, el del equipo.
- Pulsar `4` estando en bloques, o la rueda mientras se mantiene `4`, cambia el color. El clic
  central copia el color del bloque apuntado (cuentagotas).
- El cubo en la mano y el ícono de la ranura toman el color elegido.

---

## 4. Armas: miras, ADS y armas nuevas (parte D)

### 4.1 Sistema de ADS

Fuentes:
- https://github.com/initialvisuals/aim-offset-weapon-viewmodel-debugger
- https://www.devunallocated.com/projects/project-killhouse/procedural-weapon-animations-condensed
- https://sahildhanju.com/posts/render-first-person-fov/
- https://bevy.org/examples/camera/first-person-view-model/

- **Una sola verdad para la puntería:** el rayo de la cámara decide el impacto. El viewmodel solo lo
  representa.
- Cada arma tiene un `Object3D` llamado `sight` en la línea de mira. En ADS, la pose del arma en el
  espacio de la cámara es `−(sight.position rotada) + (0, 0, −d)`, con rotación 0 y `d` entre 0,25 y
  0,35. Se pasa de la cadera al ADS con `lerp(hip, ads, t)` usando smoothstep o un resorte crítico.
- Orden de capas: primero ADS, encima retroceso, sway y bob. Si no, el arma «se hunde».
- **FOV del viewmodel separado del mundo:** cámara del viewmodel con FOV vertical fijo de 70 (60 en
  ADS), near 0,01. El zoom del mundo se calcula con tangentes, no dividiendo grados:
  `fovAds = 2·atan(tan(fov/2)/zoom)`.
- **Sensibilidad en ADS:** multiplicar por `tan(fovAds/2)/tan(fovHip/2)`, con un ajuste de usuario de
  0,5 a 1,5.
- Durante el ADS:
  - Movimiento al 75 %; con telescopio, al 50 %.
  - Bob ×0,15 y sway ×0,3.
  - La dispersión llega a su mínimo de ADS solo con `t ≥ 0,9`, para evitar el quickscope perfecto.
- La mira de la HUD se desvanece con `1 − t`.

### 4.2 Miras por arma

Las miras son procedurales, coherentes con los modelos actuales:
- Cajas y cilindros de 8 lados.
- Una sola geometría unida con colores por vértice: 1 draw call por arma.
- Las partes emisivas aparte, con `toneMapped: false`.

| Arma | Mira | Zoom | Tiempo de ADS |
|---|---|---|---|
| Fusil semi (actual) | **Hierros de dioptra (peep)**: alza con anillo y guion. Punto emisivo de 2 px en el guion | 1,4x | 260 ms |
| Carabina (nueva) | **Punto rojo**: marco de 4 cajas o tubo corto, vidrio con opacidad 0,12 y punto `#ff2a2a` en el eje | 1,25x | 220 ms |
| Subfusil | **Holográfico**: capuchón de cajas y retícula en `CanvasTexture` 64², filtro nearest | 1,15x | 170 ms |
| Escopeta | Guion de esfera | 1,1x (el ADS solo cierra la dispersión un 15 %) | 150 ms |
| Pistola (nueva) | Hierros: alza de dos postes y guion | 1,15x | 140 ms |
| Francotirador | **Telescopio**: tubo, campanas, monturas, torretas y lente negro azulada | 4x | 350 ms |

Las medidas de cada pieza (alza, guion, punto rojo, tubo) están en el informe de armas; se resumen
en la tabla. Regla: la punta del guion y el centro de cada mira quedan exactamente en el eje de
`sight`.

### 4.3 Telescopio: híbrido

- ADS normal hasta t ≈ 0,8; después, fundido a negro de 60 ms, se oculta el viewmodel y aparece un
  **overlay 2D** (viñeta negra circular más retícula fina).
- Costo prácticamente nulo y sensación de PiP sin pagar un segundo render del mundo. Así lo hacen
  Krunker y CS.
- El PiP con render-to-texture queda fuera de alcance.
- **Destello (glint):** sprite aditivo en el telescopio de un rival que apunta con mira, visible si
  me apunta dentro de unos 12°. Escalado por distancia; cuesta 1 sprite por francotirador.
  Referencia: https://battlefield.fandom.com/wiki/Aiming

### 4.4 Armas nuevas y balance

Las cifras de las armas actuales no cambian. Propuesta [I], pensada con el TTK de la tabla vigente:

| Arma | Torso / cabeza / extremidades | Intervalo | Cargador / reserva | Caída de daño | Dispersión | Daño a bloque |
|---|---|---|---|---|---|---|
| **Carabina automática** | 28 / 70 / 20 | 0,12 s (500 rpm) | 30 / 90, recarga 2,2 s | 100 % hasta 35 bloques → 75 % a 70 | Media-alta desde la cadera; ADS ×0,45 | 30 |
| **Pistola semi** (secundaria) | 30 / 80 / 20 | 0,18 s mínimo | 12 / 48, recarga 1,4 s | 100 % hasta 15 → 70 % a 40 | La mejor desde la cadera; ADS ×0,6 | 20 |

- Carabina: 4 tiros al torso en 0,36 s. El subfusil gana de cerca y la carabina a media distancia.
- Pistola: cabeza + torso mata con 2 tiros. Sacarla toma 0,35 s y ese es su valor.
- Movimiento: 95 % con la carabina en la mano y 100 % con la pistola.

### 4.5 Retroceso por arma

El pitch de cámara sube por disparo y hay un yaw aleatorio acotado; la última columna es el porcentaje
recuperado.

| Arma | Vertical | Horizontal | Recupera |
|---|---|---|---|
| Fusil semi | 1,4° | ±0,3° | 85 % |
| Subfusil | 0,35° | ±0,35° | 60 % |
| Carabina | 0,5° en los primeros 5 tiros, luego 0,7°; desde el 6.º deriva hacia un lado (signo aleatorio por ráfaga) | ±0,25° | 70 % |
| Pistola | 1,2° | ±0,4° | 90 % (vida media 0,08 s) |
| Escopeta | 3° | ±0,6° | — |
| Francotirador | 4° más rebote del telescopio | ±0,5° | — |

- La recuperación de la cámara usa un damper con vida media de 0,12 s.
- En ráfagas largas el retroceso visual del arma se reduce poco a poco («counter-push»).
- **El retroceso de cámara no se escribe en el input** (como en F2).

---

## 5. Brazos y animación en primera persona (parte E)

### 5.1 Resortes, no keyframes

Daniel Holden, https://www.theorangeduck.com/page/spring-roll-call:
- Damper: `x = lerp(x, g, 1 − exp(−0.693·dt/halflife))`.
- Resorte crítico exacto: con `y = 2·0.693/halflife`, `j0 = x − g`, `j1 = v + j0·y` y `e = exp(−y·dt)`,
  queda `x = e·(j0 + j1·dt) + g` y `v = e·(v − j1·y·dt)`.

Así la animación no depende del framerate. Una utilidad `spring.ts` en el cliente, con tests.

- **Retroceso del arma:** cada disparo suma un impulso a la velocidad en z (hacia atrás, 0,03–0,08), en
  pitch (3–8°), en yaw (±1°) y en roll (±2°). Resorte subamortiguado con ζ ≈ 0,5 y ω ≈ 25 rad/s:
  chasquido y un rebote pequeño.
- **Sway por ratón:** objetivo `clamp(−delta·0,02°/px, ±4°)`, con resorte de vida media 0,07 s y
  0,01–0,02 de desplazamiento.
- **Bob:** Lissajous 1:2.
  - `x = A·sin φ`, `y = B·sin 2φ`, roll de 1,5°·sin φ; un ciclo son 2 pasos.
  - Unos 1,9 pasos/s caminando y 2,6 corriendo.
  - A = 0,012 y B = 0,008; corriendo ×1,8. Proporcional a la velocidad (Half-Life,
    https://twhl.info/wiki/page/Tutorial:_View_bobbing:_Part_1).
- **Pose de carrera:** yaw 30°, roll −12° y bajada de 0,05. De correr a poder disparar pasan 0,15 s.
- **Inclinación lateral:** roll = −velocidad lateral × 0,8° por m/s, con un máximo de 3,5°.
- **Aterrizaje:** impulso según la velocidad vertical.
- **Recarga procedural** (unos 2,2 s en el fusil):

| Tramo | Qué pasa |
|---|---|
| 0–0,2 | Baja el arma y gira 25° de roll |
| 0,2–0,45 | El cargador cae con gravedad |
| 0,45–0,7 | Entra el cargador nuevo |
| 0,7–0,8 | Golpe: impulso al resorte |
| 0,8–1 | El arma vuelve a su pose |

  Si el cargador estaba vacío, se agrega un tirón de cerrojo. La escopeta mete cartucho por cartucho.
- **Cambio de arma:** guardar en 0,2 s (baja 0,3 y gira −40° de pitch); sacar en 0,35–0,6 s desde
  abajo con easeOutBack.

### 5.2 Brazos de bloques

- Proporción de Minecraft (4×12×4 px):
  - Manga de 0,10 × 0,10 × 0,45.
  - Mano de 0,10³ color piel.
  - **Puño de la manga del color del equipo**, como en Blockade.
- **«IK» de dos puntos:**
  - El hombro queda fijo en el espacio de la cámara, fuera de pantalla: (±0,28, −0,38, +0,05).
  - La mano es hija del arma: la derecha en la empuñadura, la izquierda en el guardamanos.
  - El cubo del brazo se pone en el punto medio, se orienta con `lookAt` y se escala en z según la
    distancia.
  - Así **los brazos siguen solos el retroceso, la recarga y el ADS**.
- Con arma larga: el brazo derecho entra casi recto desde abajo a la derecha y el izquierdo cruza
  desde la izquierda con unos 35° de yaw hacia dentro. Con la pistola, los dos brazos convergen en V.
- Con la pala y los bloques: solo el brazo derecho, en la pose de Minecraft (ítem abajo a la derecha;
  el bloque como un cubo pequeño girado unos 45°).
- Referencias open source (MIT, solo para leer):
  - https://github.com/Kr555Dev/fps-striker (brazos volumétricos, resortes, ADS con réflex).
  - https://github.com/mohsenheydari/three-fps

### 5.3 Golpe de pala y colocación de bloque al estilo Minecraft

Fuentes:
- https://minecraft.wiki/w/Data_component_format/swing_animation
- https://minecraft.wiki/w/Breaking
- https://forums.minecraftforge.net/topic/18178-172custom-swing-animation/

- **Curva del swing**, con `p` de 0 a 1 y `f = sin(√p·π)`:
  - Rotación x = −80°·f.
  - Traslación x = −0,4·f e y = 0,2·sin(√p·2π).
- **Pala:**
  - Swing de 7 ticks de 20 Hz (350 ms).
  - El impacto se aplica en p ≈ 0,4.
  - Al golpear: **hitstop de 40–50 ms**, sacudida de cámara de 0,5° y partículas.
  - Pausa de 300 ms entre bloques al picar seguido.
- **Colocar bloque:** el mismo swing al 60 % de amplitud y en 200 ms. Manteniendo el clic se repite
  cada 200 ms (ya existe en el sim). Una bajada de ~0,1 al cambiar de bloque.
- La pala actual (procedural) se rehace con mango de madera, cuello y hoja de metal con bisel; misma
  rejilla de detalle que las armas.

---

## 6. Retroalimentación de disparo extra (parte E)

En orden de costo:

1. **Grietas por vida del bloque.** Los bloques ya tienen 100 HP en el sim. Se muestran en 10 etapas
   como el minado de Minecraft, con una capa de grietas en el array de texturas aplicada solo a los
   bloques dañados (overlay instanciado o atributo). Es feedback e información de juego a la vez.
2. **Marcas de impacto en caras de voxel:** un quad de 0,12 en la normal con `polygonOffset`
   (−1, −4), en un `InstancedMesh` como buffer circular de 256 = 1 draw call. Se borran al destruir el
   bloque. **No usar `DecalGeometry`**: es lento y no sirve con instancias.
3. **Trazadoras:** caja estirada de 1,5–3 m, aditiva, de 60–100 ms, una de cada 3 balas en las
   automáticas. `InstancedMesh`.
4. **Casquillos:** `InstancedMesh` de 32–64. Salen a 1,5–2,5 m/s hacia la derecha y 1–2 m/s hacia
   arriba, viven 1–1,5 s y solo chocan contra el piso de voxel.
5. **Luz del fogonazo:** una `PointLight` **permanente** con intensidad 0 que solo cambia la
   intensidad. Agregar o quitar luces recompila los shaders.
6. **Sonido por distancia:**
   - Pasa-bajos de 20 kHz cerca a ~1,5 kHz a más de 100 bloques.
   - Fundido entre la muestra cercana y una cola lejana entre 30 y 60 bloques.
   - Retardo de distancia/343 m/s (el propio disparo, sin retardo).
   - Paneo `equalpower`.

---

## 7. Decisiones abiertas (valor por defecto entre corchetes; Jhon puede cambiarlas)

- **D1. Regeneración de vida.** [Sin regeneración natural: el PLAN dice «sin regeneración» y Blockade
  tampoco tenía. **Tocar la base cura por completo** con el mismo cooldown de recarga de 15 s.]
  Alternativa: regenerar 10 HP/s tras 6 s sin recibir daño.
- **D2. Color de bloques.** [8 colores con selector, el del equipo por defecto.] Alternativa: solo el
  color del equipo.
- **D3. Bloques del propio equipo.** [Un jugador no puede romper bloques colocados por su equipo; solo
  los enemigos pueden. Requiere guardar el equipo dueño de cada bloque colocado en un mapa disperso.]
  Se implementa con las reglas de CTF en F3-A.
- **D4. Nado agachado por huecos de 1×1** (nado-sprint de Minecraft). [Fuera de alcance.]

---

## 8. Partes y orden de ejecución

| Parte | Contenido | Por qué en este orden |
|---|---|---|
| **A** | §1: registro de bloques, texturas horneadas, árboles y vegetación, skylight, cielo, tone mapping, niebla esférica | Cambia el mesher y el shader; todo lo demás se apoya en eso |
| **B** | §2: agua (render y física) | Necesita el registro (bloque líquido) y la malla aparte |
| **C** | §3: corazones, burbujas, hotbar y selector de color | Necesita el aire de B; es casi todo UI |
| **D** | §4: ADS, miras, carabina, pistola, telescopio y retroceso | Toca el sim (armas nuevas, slots) y el viewmodel |
| **E** | §5 y §6: brazos, resortes, animaciones, pala y bloque, y feedback extra | Se monta sobre el viewmodel de D |

Al cerrar cada parte:
- `npm run typecheck && npm run lint && npm test && npm run deploy:check` en verde.
- Sección en `docs/progress.md` con números: peso del bundle, ms del mesher y de la luz, cantidad de
  quads.

**Presupuestos que no se pueden romper:** JS inicial < 600 KB gzip, primera partida < 5 MB y un tick
del sim < 8 ms.
