# QA checklist — Blockfront (dev, `?qa=1`)

Pruebas end-to-end en `localhost:5174/?qa=1` con la API `window.blockfront.qa`. Cada caso define el
resultado **esperado según la especificación** (PLAN.md y docs/f2-*.md), no según el código.
Resultado: ✅ pasa · ❌ falla (con evidencia) · ⚠️ dudoso (requiere ojo humano).

## 0. Arranque y robustez

| #   | Caso                                    | Esperado                                                                |
| --- | --------------------------------------- | ----------------------------------------------------------------------- |
| 0.1 | Cargar la página                        | Menú visible, consola sin errores                                       |
| 0.2 | «Jugar»                                 | La partida empieza; el HUD no muestra munición hasta el primer snapshot |
| 0.3 | Medir fps (400 frames)                  | p99 < 20 ms en el mapa                                                  |
| 0.4 | `?qa` ausente en el build de producción | La API no existe en `dist`                                              |
| 0.5 | Pausa con P y reanudar                  | El sim se detiene y no recupera ticks de golpe al volver                |

## 1. Movimiento, caída y agua

| #   | Caso                               | Esperado                                                                                  |
| --- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| 1.1 | Caída de 4 / 7 / 10 bloques        | 5 / 20 / 35 HP de daño                                                                    |
| 1.2 | Caída al agua desde 10 bloques     | 0 de daño                                                                                 |
| 1.3 | Nado                               | Espacio sube, sin input se hunde lento; la velocidad horizontal es de nado, no de caminar |
| 1.4 | Aire bajo el agua                  | 10 burbujas en 15 s; al llegar a 0 hay 1 s de gracia y luego 10 HP/s                      |
| 1.5 | Agachado al borde de un precipicio | No cae                                                                                    |

## 2. Combate

| #   | Caso                                          | Esperado                                                               |
| --- | --------------------------------------------- | ---------------------------------------------------------------------- |
| 2.1 | Fusil desde la cadera contra ADS a 30 bloques | La dispersión en ADS es mucho menor (ver la tabla de f2-6 §2)          |
| 2.2 | Daño por zona del fusil                       | Torso 50, cabeza 100, extremidades 34                                  |
| 2.3 | Granada con un toque y con carga completa     | ~3 bloques contra ~20 bloques de alcance; el arco es visible al cargar |
| 2.4 | Granada cocinada 3 s                          | Explota en la mano                                                     |
| 2.5 | Recarga al vaciar el cargador                 | Recarga automática si hay reserva                                      |

## 3. CTF y flujo de partida

| #    | Caso                                                   | Esperado                                                                        |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 3.1  | Tocar la bandera roja                                  | Evento `taken` y aviso; la bandera sigue al jugador                             |
| 3.2  | Captura con la propia en base                          | Marcador 1:0 y evento en el feed                                                |
| 3.3  | Captura con la propia fuera de su base                 | No cuenta                                                                       |
| 3.4  | Tres capturas                                          | Fin de partida con MVP y «Jugar otra vez»                                       |
| 3.5  | Morir con la bandera                                   | La bandera cae; vuelve a los 20 s o al tocarla un aliado                        |
| 3.6  | Muerte                                                 | Pantalla de muerte (quién, con qué, daño), respawn en la oleada de 8 s          |
| 3.7  | Cambiar de primaria estando vivo (build de producción) | Aplica solo al reaparecer                                                       |
| 3.8  | Protección al aparecer                                 | Sin daño durante ~4 s; se corta al disparar o al salir de la base               |
| 3.9  | Recarga en la base                                     | HP, bloques, granadas y munición vuelven cada 15 s                              |
| 3.10 | Romper un bloque propio o de la base propia            | No se rompe; uno enemigo sí                                                     |
| 3.11 | Tab                                                    | Marcador por equipo con las estadísticas                                        |
| 3.12 | Nameplates                                             | Solo aliados, con ícono de equipo; el portador aliado se ve a través de paredes |
| 3.13 | Brújula                                                | Muestra las dos banderas con su distancia                                       |

## 4. Ítems de F3-B

| #   | Caso                                      | Esperado                                                                                                                                 |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Bloque reforzado                          | **No existe** (eliminado por Jhon)                                                                                                       |
| 4.2 | Escalera                                  | Plana sobre la cara del bloque, estilo Minecraft (no una hélice); se sube con W o Espacio; anula la caída; se rompe con un golpe de pala |
| 4.3 | TNT                                       | Se coloca como bloque; explota al dispararle o a los 4 s; no daña aliados ni bloques del propio equipo; límite por vida                  |
| 4.4 | Botiquín                                  | ~1 s de canalización; cura; el portador de la bandera no puede usarlo                                                                    |
| 4.5 | Hotbar y textos ES/EN de los ítems nuevos | Correctos                                                                                                                                |
