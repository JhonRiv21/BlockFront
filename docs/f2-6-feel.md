# F2.6 — Sensación: pala, mira, sonido, granada y caída

Correcciones tras el playtest de Jhon del 2026-10-09. Sale de tres investigaciones (Minecraft y
Blockade 3D, sonido de armas, gunplay). Las reglas de ejecución son las del PLAN.md §11: tests desde
esta especificación, sin commit. **[I]** marca un valor de diseño para ajustar jugando.

| Queja del playtest | Causa encontrada | Sección |
|---|---|---|
| «La pala no parece de Minecraft» | En Minecraft los ítems no son modelos 3D: son **dibujos de 16×16 extruidos** 1/16 de grosor, sostenidos en diagonal. La nuestra está hecha de cajas lisas | §1 |
| «Usar mira no da ventaja» | La cadera es casi tan precisa como el ADS: carabina 0,6° contra 0,36°, con ~83 % de impactos a 40 m sin apuntar. Zoom de 1,1–1,4x apenas perceptible | §2 |
| «El sonido de disparo no es bueno» | Es sintético y no tiene capas: le faltan golpe real, mecánica, cola según entorno y variación. Además, `PositionalAudio` de Three **ignora `play()` si ya está sonando**, así que las automáticas enemigas pierden disparos | §3 |
| «La granada debería llegar más lejos cuanto más la presiono» | La velocidad es fija (16 m/s); mantener presionado solo cocina la mecha | §4 |
| «No hay daño por caída» | No existe en el sim | §5 |

---

## 1. Pala estilo Minecraft (y el patrón para ítems de mano)

### Cómo lo hace Minecraft

- Las herramientas usan el modelo `item/handheld`, que hereda de `item/generated`: la geometría se
  **genera desde una textura de 16×16**. Fuentes: https://minecraft.wiki/w/Model y
  https://docs.neoforged.net/docs/1.20.6/resources/client/models/
- La geometría que sale [I, ItemModelGenerator]:
  - Una cara frontal y una trasera con la textura completa (alpha test).
  - **Caras laterales de 1 px solo donde un píxel opaco toca uno transparente**.
  - Grosor de 1/16.
- Transformación en primera persona, del JSON real de la 1.21.4 (`handheld.json`):
  `firstperson_righthand` = rotation **[0, −90, 25]**, translation **[1.13, 3.2, 1.13]** (en px de
  1/16), scale **0.68**. Fuente:
  https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/models/item/handheld.json
- La mano va anclada respecto a la cámara en ≈ (+0,56, −0,52, −0,72) bloques [I]. El ítem entra en
  diagonal desde abajo a la derecha, con la hoja hacia arriba y adelante, en vista de 3/4.

### Qué construir

- **`SpriteItem`** (cliente): toma un sprite de 16×16 y genera frente y dorso
  (`CanvasTexture` + `NearestFilter` + `alphaTest 0.5`), más las caras laterales solo en los bordes
  opaco/transparente, con laterales y dorso oscurecidos por color de vértice. Son pocas decenas de
  triángulos.
- **Sprite propio de la pala**, dibujado por código en un canvas de 16×16 (nada de la textura de
  Mojang):
  - Diagonal de abajo a la izquierda a arriba a la derecha.
  - Mango de madera de 2 px de grosor y ~9 px de largo, con contorno oscuro y un pomo un poco más
    ancho.
  - Cuello de 1 px.
  - Hoja de metal en forma de lágrima o rombo de ~5×5 px, con contorno oscuro de 1 px y brillo en el
    borde superior izquierdo.
  - 1–2 px de margen vacío.
- Se usa la transformación `firstperson_righthand` de arriba como punto de partida y se ajusta a
  ojo. **Sin brazos con la pala**: en Minecraft, el ítem se sostiene «solo» en la esquina. Si se deja
  el brazo, que sea el del estilo Minecraft, por debajo del ítem.
- El swing ya usa la curva de Minecraft (F2.5-E). Se verifican los valores contra el renderer de
  Minecraft [I]: rotY = 45 + sin(√s·π)·(−20), rotZ = sin(√s·π)·(−20), rotX = sin(s·π)·(−80). Al
  cambiar de ranura, el ítem baja y sube (`equipProgress`).
- La granada, el botiquín o cualquier ítem nuevo que no sea arma de fuego **usan `SpriteItem`**. Las
  armas siguen siendo modelos 3D (ver la decisión E3 en §7).
- Tests: el generador produce caras laterales solo en los bordes. Casos: un píxel solo da 4
  laterales; una línea de 3 px da 8; no hay caras entre píxeles opacos vecinos.

---

## 2. Cadera contra mira: que apuntar valga la pena

Referencias:
- BF4, algoritmo de dispersión: https://forum.sym.gg/t/algorithms-for-the-shooting-mechanics-in-bf4/81
- CoD, zoom de miras de hierro (1,2x subfusil, 1,35x asalto): https://callofduty.fandom.com/wiki/Iron_Sight
- Krunker (asalto 1,6x): https://krunkerio.org/krunker-io-assault-rifle-stats/
- Apex («el ADS elimina la imprecisión de la cadera»):
  https://forums.ea.com/discussions/apex-legends-general-discussion-en/hipfire-i-dont-get-it/5323134/replies/5323135

### Tabla nueva (semiángulo en grados; reemplaza la de `combat/ads.ts` y la dispersión de `weapons.ts`)

| Arma | Cadera base | Cadera máx. (+por disparo) | ADS base | ADS máx. (+por disparo) | Retroceso en ADS | Zoom → FOV (base 75) | Tiempo de ADS | Movimiento en ADS |
|---|---|---|---|---|---|---|---|---|
| Fusil semi | **2,5** | 4,0 (+0,6) | **0,08** | 0,5 (+0,15) | ×0,6 | **1,5x** | 0,22 s | 70 % |
| Carabina | **2,0** | 4,5 (+0,35) | **0,15** | 0,9 (+0,08) | ×0,65 | **1,35x** | 0,20 s | 72 % |
| Subfusil | **1,2** | 3,0 (+0,2) | 0,35 | 1,0 (+0,06) | ×0,75 | 1,2x | 0,15 s | 80 % |
| Escopeta (cono) | **5,5** | — | 3,5 | — | ×0,85 | 1,15x | 0,18 s | 80 % |
| Pistola | **1,0** | 3,0 (+0,5) | **0,12** | 0,8 (+0,1) | ×0,7 | 1,25x | 0,12 s | 85 % |
| Francotirador | 6,0 (castigo sin mira) | — | **0,02** | 0,02 | ×0,5 | **4x** | 0,35 s | 55 % |

- **Modificadores:**
  - Moverse: cadera ×1,5 y ADS ×1,25.
  - En el aire: +3° desde la cadera y +1,5° en ADS.
  - Agachado: ×0,8.
  - Recuperación del bloom lineal, de 6–10 °/s.
  - Francotirador moviéndose con la mira: +1,5°.
- **Distribución del disparo:**
  - Desde la cadera, **uniforme en el disco** (`r = R·√u`): honestamente imprecisa.
  - En ADS, **centrada** (`r = R·u`), como el radial de BF4.
  - La dispersión interpola de la cadera al ADS durante el tiempo de ADS, y se mantiene la regla del
    90 % contra el quickscope.
- **Efecto esperado** (cono uniforme contra un objetivo de 0,6 × 1,8):
  - Carabina desde la cadera: ~43 % de impactos a 25 m y ~23 % a 40 m; en ADS, ~100 %.
  - Subfusil desde la cadera: 100 % a 10 m y ~69 % a 25 m.
  - **La cadera manda de cerca y la mira decide a media y larga distancia.**
- **Sensación de apuntar** (se suma a lo de F2.5-D):
  - Viñeta CSS `radial-gradient` con opacidad de 0 a 0,3 durante el tiempo de ADS. Costo cero.
  - Sonido de «roce» de 60–80 ms al entrar y al salir del ADS.
  - Bob al 20 % y sway al 30 %. FOV con easeOutCubic.
- **Francotirador:**
  - Vaivén Lissajous de ±0,3° con la mira.
  - **Shift = contener la respiración**: 3 s estable y luego temblor ×2 durante 2 s. Con la mira no se
    puede correr, así que no choca con el sprint.
- Tests desde la tabla: dispersión de cadera y de ADS por arma, modificadores (moverse, aire,
  agachado), interpolación durante la transición, y una distribución de impactos
  estadísticamente centrada en ADS (semilla fija).

---

## 3. Sonido de disparos de verdad

### Fuente: Free Firearm Sound Library (CC0)

- **22 armas reales** grabadas a 192 kHz con 7 micrófonos, con tomas cerca, media distancia, lejos y
  **detrás del tirador** (lo que se oye en primera persona), más la mecánica (cerrojo, corredera,
  bombeo, cargador y disparo en seco).
- Licencia **CC0 1.0** verificada.
- Descarga por archivo desde el espejo de GitHub: https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
  (`Prepared SFX` y `Master Tracks`). Paquete completo:
  https://opengameart.org/content/the-free-firearm-sound-library
- **Descartadas por licencia:**
  - Sonniss GDC: prohíbe redistribuir los efectos, y un repo público lo es.
  - Mixkit y Pixabay: prohíben distribuirlos sueltos.

| Arma | Disparo (códigos FFSL) | Mecánica |
|---|---|---|
| Fusil semi | SKS: `U_14P` cerca, `U_19P` media, más su toma de detrás en Master Tracks | Corredera del SKS o AR-15 `D_14` |
| Carabina | AR-15: `D_32P` / `D_24P`, lejos `D_25`, detrás `D_27` (alternativa: AK-47 `C_28P` / `C_39`) | Reset del gatillo; cerrojo `D_6`/`D_7` al recargar |
| Subfusil | Carl Gustav M45: `G_31P` / `G_20P`, detrás `G_26` (alternativa: PPSh `P_30P`) | `G_2` al recargar |
| Escopeta | Benelli Nova: `O_21P` / `O_17P` | Bombeo `O_6` ~300 ms después del disparo; casquillo de 12 ga (Freesound 773860, CC0) |
| Francotirador | Tikka T3: `W_29P` / `W_24P`; Mosin lejos y detrás (`M_23`/`M_25`, `M_20`/`M_22`) | Cerrojo `W_16` a ~600 ms |
| Pistola | Walther PPQ: `X_39P` / `X_31P` (alternativa: 1911 `A_42P`) | Corredera `X_6`, disparo en seco |
| Granada | Freesound unfa 609587 (CC0) más un grave sintético | Anilla: Kenney |
| Extras | Silbido de bala qubodup 855248, casquillos GryffDavid 318964, IR de túnel Tim_Verberne 537675 (todos CC0 en Freesound) | — |

### Diseño por capas

Fuentes:
- CoD MW: https://www.asoundeffect.com/call-of-duty-modern-warfare-sound/
- Splice: https://splice.com/blog/design-weapon-sound-video-games/
- Frostbite HDR: https://www.ea.com/frostbite/news/how-hdr-audio-makes-battlefield-bad-company-go-boom

**Disparo propio**, sin posición:
- Mecánica.
- Cuerpo: la toma de **detrás**, de 120–250 ms.
- Grave sintético (seno de 50–60 Hz, 80–120 ms; **se conserva solo el «thump» actual como esta
  capa**).
- Cola según el entorno.
- Las capas se escalonan unos ms para que sus picos no se sumen.

**Disparo enemigo**, con posición:
- Cuerpo de la toma cercana más cola lejana o media, mezcladas según la distancia.
- Se mantienen el pasa-bajos y el retardo por la velocidad del sonido que ya existen.

**Variación:**
- 3–4 muestras por capa en round-robin, sin repetir la anterior.
- Tono ±3–5 % con `playbackRate`.
- Volumen ±1–1,5 dB.

**Una sola cola por arma:** con cada disparo nuevo, la cola anterior baja a 0 en 20–40 ms. En
ráfaga solo resuena la última.

**Información para el jugador:**
- Hitmarker: clic corto de 2–4 kHz.
- Headshot: un sonido distinto.
- **Silbido o chasquido cuando una bala enemiga pasa cerca.**

### Motor de audio (reemplaza `PositionalAudio` para los disparos)

- **Gestor de voces propio con Web Audio**: un `AudioBufferSourceNode` por disparo y un `PannerNode`
  reutilizado por entidad. HRTF solo para las 3–4 fuentes más cercanas y `equalpower` para el resto.
  Referencia de costos: https://padenot.github.io/web-audio-perf/
- **Límite de voces:**
  - Arma propia: 8. Cada enemigo: 3. Global: 32–48.
  - Cuando hay que quitar una, se quita la de menor volumen percibido. Se descarta lo que llegue por
    debajo de −60 dB.
  - No disparar la misma muestra dos veces en menos de 25 ms sobre la misma entidad.
- **Buses:** propio, enemigos, impactos, mundo e interfaz, cada uno con −6 dB de margen.
- **Bus maestro:** compresor (−12 dB, 4:1, ataque 3 ms, release 150 ms) y después un limitador
  (−1 dB, 20:1).
- **Ducking:** cada disparo propio baja enemigos y mundo 3–4 dB (ataque 5 ms, vuelta en 200 ms).
- **Reverb:** un solo `ConvolverNode` compartido como envío, con la IR de túnel mono de 0,8 s y
  pre-delay de 15 ms. El nivel del envío sale del **encierro del oyente**: la proporción de 8–14 rayos
  DDA cortos que chocan con bloques a menos de N bloques. En túnel suena a túnel; en campo abierto
  basta la cola de las tomas lejanas.
- **Formato:**
  - Opus en WebM como principal y AAC `.m4a` como respaldo. Se elige probando a decodificar un
    archivo diminuto al arrancar.
  - **Recortar todo pre-roll hasta el transitorio.** Ojo con el retardo inicial de AAC (~45 ms):
    verificarlo.

### Pipeline reproducible

- `scripts/audio/` descarga del espejo de GitHub solo los archivos de la tabla, corta cada disparo
  y recorta hasta el transitorio. Después:
  - Remuestrea a 48 kHz mono.
  - Aplica un pasa-altos de 30–40 Hz.
  - Separa cuerpo y cola.
  - Normaliza a pico −1 dBFS.
  - Codifica Opus (96 kbps lo propio, 64 kbps el resto) y AAC de respaldo.
- Fuentes y licencias en `assets/CREDITS.md`.
- **Presupuesto: ~0,7–0,9 MB** en total.

---

## 4. Granada con carga

Referencias:
- CS2, tres velocidades y herencia de velocidad: https://memorin.app/mechanics/grenade-throw
- Apex, arco predicho al mantener: https://apexlegends.wiki.gg/wiki/Grenade
- Arco de Minecraft, curva de carga: https://minecraft.wiki/w/Bow
- Rainbow Six quitó el cocinado:
  https://siege.gg/news/ubisoft-removes-fragmentation-grenades-cooking-feature-in-operation-deep-freeze

### Diseño elegido: una tecla, dos fases (carga y luego cocina)

- **Al presionar:** se quita el seguro, **arranca la mecha de 3,0 s** (tic sonoro cada 0,5 s) y
  aparece el arco predicho.
- **Potencia:** `f = min(1, t / 0,8)`, `p = (f² + 2f) / 3` (curva del arco de Minecraft) y
  `v = lerp(9, 24, p)` m/s. Un toque da ~9 m/s.
- **Pasados 0,8 s** la potencia se queda en el tope y solo cocina. A los 3,0 s explota en la mano
  (como hoy).
- **Al soltar:** `vel = dir · v + 1,0 · velJugador`, con **+8° hacia arriba** sobre el pitch de la
  mirada, como en CS.
- **Clic derecho mientras se mantiene:** lanzamiento por abajo a 7 m/s, para cocinar tiros cortos.
- **Alcance en suelo plano** con g = 28 a 45°: 9 m/s ≈ 3 m, 16 m/s ≈ 9 m, **24 m/s ≈ 21 m**. A 24 m/s
  el vuelo dura 1,2 s y queda mecha para que caiga y ruede.
- **Sim:** el lanzamiento lleva `power` (0–1) y la mecha restante. El worker es la autoridad.

### Arco predicho

- **Se reutiliza la misma función de paso de la granada del sim** (dt fijo, gravedad, rebotes y
  fricción), importada, no reescrita. Así el arco coincide con el resultado real.
- Cada frame mientras se mantiene: se simula hasta la mecha restante o 180 pasos (<0,1 ms).
- Se dibuja con un `InstancedMesh` de ~40 puntos con opacidad decreciente. `LineDashedMaterial`
  siempre mide 1 px en WebGL.
- **Punto final:** un anillo plano con el radio de daño, **rojo si va a estallar en el aire y blanco
  si cae al suelo**. Al cocinar, el arco se acorta solo.
- Solo lo ve quien lanza.

Tests: potencia contra tiempo de carga (toque, 0,4 s, 0,8 s, más), la herencia de velocidad, que el
arco predicho coincide con la trayectoria simulada (misma semilla) y que explota en la mano a los 3 s.

---

## 5. Daño por caída

- **Fórmula:** la de Minecraft escalada a nuestra vida.
  - **`daño = 5 × floor(caídaY − 3)` HP**, medido desde el punto más alto de la caída hasta el suelo.
  - Referencias: 4 bloques = 5 HP, 7 = 20, 10 = 35, 15 = 60; muerte desde ~23.
  - Fuente: https://minecraft.wiki/w/Damage#Fall_damage
  - Si en las torres de CTF se siente blanda, subir a ×6 [I].
- **Lo anulan:** el agua (si la tocas antes que el suelo) y, cuando existan, la escalera de mano y el
  slime.
- **Aterrizaje fuerte** (> 4 bloques): la velocidad horizontal baja al 50 %, como en Ace of Spades
  (`FALL_SLOW_DOWN`, https://raw.githubusercontent.com/piqueserver/piqueserver/master/pyspades/world_c.cpp).
  Además:
  - La cámara baja según la altura.
  - Tilt de daño.
  - Sonido de golpe seco (4–7 bloques) o crujido (8 o más).
- **Atribución de la kill:** si un enemigo te dañó en los últimos 5 s, la muerte por caída es suya
  («X tiró a Y»). La granada y la pala ganan valor.
- Vive en el sim (autoritativo).

### Agacharse no te deja caer del borde (Minecraft)

- Fuente: https://minecraft.wiki/w/Sneaking
- Agachado, el controlador no deja que el AABB salga de un borde con más de 0,5 bloques de caída.
  Recorta el movimiento por eje, igual que en Minecraft.
- Hace posible construir puentes y tapar huecos sobre el vacío sin morir, lo que importa ahora que
  hay daño por caída.

Tests: daño en cada punto de referencia, caída al agua sin daño, atribución en la ventana de 5 s,
agachado sin caer de un borde de 1 bloque pero sí bajando un escalón de 0,5.

---

## 6. Ideas nuevas con evidencia

**Aprobadas por Jhon (2026-10-09) para F3-A:** #1 protección al aparecer, #2 TNT, #3 bloque
reforzado, #4 escalera de mano y #5 botiquín. **No entran a F2.6.** Las #6–#8 quedan descartadas por
ahora.

| # | Idea | Origen | Qué aporta al CTF | Costo | Riesgo y mitigación |
|---|---|---|---|---|---|
| 1 | Protección al aparecer (3–5 s, se corta al disparar o al salir de la base) | Blockade | Evita el spawn-kill en bucle, la queja documentada | Bajo | Abuso para recuperar vida → no aplica al reaparecer a voluntad |
| 2 | TNT colocable (explota al dispararle o por mecha de 4 s) | Blockade y Minecraft | Abrir brechas en la base rival: el corazón de construir y romper | Medio | Grief → sin daño a aliados ni a bloques propios, 1–2 por vida |
| 3 | Bloque reforzado | Blockade | Defensa real del cuarto de la bandera; da sentido a la TNT | Bajo | Búnker eterno → límite por jugador, la TNT lo rompe |
| 4 | Escalera de mano | Minecraft | Rutas verticales y anula la caída (en Blockade la pedían) | Medio | Escalar muros de base → se rompe de un golpe de pala |
| 5 | Botiquín (slot extra, ~1 s de canalización) | Blockade | Sostener el ataque sin volver a la base | Bajo | No lo puede usar el portador de la bandera |
| 6 | Estructuras sin apoyo que se caen (solo bloques de jugador) | Ace of Spades | Derribar un puente con el enemigo encima | Alto | Rendimiento → flood-fill acotado |
| 7 | Escudo frontal | Blockade | Avanzar bajo fuego | Medio | Prohibido para el portador de la bandera |
| 8 | Puertas que solo abre tu equipo | Pedido de jugadores de Blockade | Bases con entrada | Medio | Bases selladas → rompibles |

Descartadas:
- Perla de ender: captura instantánea.
- Cubeta de agua: necesita fluidos dinámicos.
- Andamio: duplica la escalera.

Fuentes de Blockade:
- https://store.steampowered.com/news/app/302830/view/2888452431146889364
- https://blockade-3d-original.fandom.com/wiki/TNT
- https://steamcommunity.com/sharedfiles/filedetails/?id=2293066789
- https://mmohuts.com/review/blockade-3d

---

## 7. Decisiones abiertas

- **E1.** Factor del daño por caída: **×5 (decidido por Jhon)**.
- **E2.** Lanzamiento de granada por abajo con clic derecho: [sí].
- **E3.** Armas como **grillas voxel en código** (estilo Guncraft o Voxiom, un greedy mesh por arma y
  la mira como vóxel ancla del ADS) en lugar de los modelos de cajas actuales. [No por ahora]: se
  decide después de ver la pala nueva. Hay modelos .vox CC0 para partir:
  - https://technistguru.itch.io/voxel-weapons
  - https://opengameart.org/content/free-voxel-weapon-pack

## 8. Partes

| Parte | Contenido |
|---|---|
| **A** | §2 (cadera y mira) + §5 (caída y agacharse en el borde) + §4 (granada con carga y arco). Toca sobre todo el sim y tiene tests |
| **B** | §1 (pala y `SpriteItem`) + §3 (sonido: pipeline, motor de voces, buses y reverb) |

Al cerrar cada parte: checks en verde y sección en `docs/progress.md`. **Presupuestos:** JS
< 600 KB gzip, primera partida < 5 MB, audio total < 1,5 MB.
