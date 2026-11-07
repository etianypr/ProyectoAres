---
name: rutas-ares
description: Úsala siempre que vayas a modificar, revisar o proponer cambios en el armado de la ruta del día de ARES — orden de paradas, zonas, horarios, propuestas, paradas lejanas, sentido de las calles, matriz o trazado de OpenRouteService, rehacer la ruta o sumar un pedido a la ruta — y antes de opinar sobre algoritmos de ruteo (TSP, VRP, metaheurísticas, sectorizar) para este proyecto.
---

# Rutas en ARES

Ayuda a tocar la ruta sin repetir lo que ya se midió. Las reglas vienen de `AGENTS.md`
(«Rutas») y de `docs/HOJA-DE-RUTA.md`. Si este archivo y esos documentos no coinciden, valen
ellos, y hay que avisar la diferencia.

## Antes de tocar nada
1. Lee `docs/HOJA-DE-RUTA.md` → «Algoritmo de rutas: qué se midió (2026-10-29)». Lo que está
   ahí no se vuelve a proponer sin datos nuevos medidos.
2. Si el cambio toca los criterios de la ruta (km, tiempo, éxito por parada, ganancia):
   `specs/024-criterios-de-ruta/spec.md`. Pedidos con ⚠: `specs/022-…`. Paradas cercanas:
   `specs/023-…`. Lugares donde se queda mal ubicada una parada: `specs/025-…` y la 019 (T008).
3. Tipos y nombres: `docs/CLASES.md` §2 (armado de rutas).

## Lo que ya está decidido (no se «corrige»)
- **Objetivo: km.** Encima, una pasada saca los bultos antes solo si cuesta ≤ 1 % de km y cada
  metro de más los saca en promedio un metro antes (`descarga.ts`, spec 024): no darle más peso
  sin preguntar (sin tope, ≤ 10–15 % menos espera por +10–15 % de km). La ruta es cerrada (vuelve a la central). Cada zona de ~900 m se recorre una
  sola vez (`zonas.ts`), aunque cueste ~5 % más: lo pidió el dueño.
- **No se da la vuelta** en pasajes ni en calles residenciales (`sentido.ts`, `geo/ors/vuelta.ts`).
- **El orden ya está en el óptimo práctico** con un conductor y ~60–100 paradas: la búsqueda llega
  en 1–2 s a lo que 87.000 intentos más no mejoran. No proponer ALNS, Tabu, genéticos, colonias de
  hormigas, OR-Tools, VROOM ni sectorizar con k-means/HSAC: sectorizar alargó la ruta entre 4 % y
  20 %.
- **Lo que gana km es ubicar bien.** Dos paradas mal ubicadas subieron una ruta de 39,3 a 59,1 km.
  Si una ruta sale larga, mira primero los puntos (`lejanas.ts`, `ubicar-pedidos.ts`, geocoding)
  y después el orden.
- Una propuesta por defecto, y hasta tres solo si difieren de verdad (`estrategias.ts`).
- «Respeta horarios» nunca sale peor que la ruta anterior (`horarios.ts`, `con-horarios.ts`).
- Sin cupo de ORS (429), la ruta sigue en línea recta con aviso; nunca se cae.
- «Dejar como pendiente» manda la parada al final. Rehacer la ruta desde «Mi ubicación» ordena solo
  lo pendiente (decisión del dueño, en vez de reoptimizar solo).

## Dónde está cada cosa
| Qué | Archivo |
|---|---|
| Armado del día en el teléfono (entrada) | `src/lib/encomiendas/local/generar-ruta/index.ts` |
| Las tres estrategias y cuáles se muestran | `generar-ruta/estrategias.ts` |
| Zonas de barrio, una pasada por zona | `generar-ruta/zonas.ts` |
| Sentido de calles y vueltas prohibidas | `generar-ruta/sentido.ts`, `src/lib/geo/ors/vuelta.ts` |
| Paradas lejanas (aviso con su costo) | `generar-ruta/lejanas.ts` |
| Reubicar pedidos sin punto y puntos pegados a carretera | `generar-ruta/ubicar-pedidos.ts` |
| Partida (central guardada) | `generar-ruta/partida.ts` |
| Orden: construcción, 2-opt/Or-opt, sacudida, exacto (Held-Karp) | `src/lib/rutas/orden-paradas/` |
| Bultos fuera antes, casi sin km de más (spec 024) | `orden-paradas/descarga.ts`, `DescargaDelDia` en `estrategias.ts` |
| Orden con horarios, sin congelar la pantalla | `orden-paradas/con-horarios.ts`, `sin-congelar.ts` |
| Hora de llegada, replanificar, sumar a la ruta | `local/planificar.ts`, `replanificar.ts`, `sumar-a-ruta.ts` |
| Matriz y trazado | `src/lib/geo/matriz.ts`, `trazado.ts`, `ors/` |

`rutas/orden-paradas/` es puro: sin red, sin IndexedDB, sin React. Mantenlo así.

## Plata y cupos
- ORS: 500 matrices al día, gratis. Toda consulta real se pide antes al dueño, diciendo cuántas;
  se reutiliza dentro de la corrida y nunca se usa `Infinity` como cupo (así se generó la cuenta de
  US$66 de Mapbox el 2026-10-29).
- La herramienta `get_route_ch` del MCP `ares-geo` también consulta ORS.
- La calle cercana a cada parada (`corregirAccesos`, `geo/acceso.ts`) sale de las teselas de
  OpenFreeMap (`geo/teselas.ts`, spec 019): gratis, sin clave y sin cupo. Mapbox salió entero.

## Medir un cambio
- Compara km (y minutos, si aplica) antes y después sobre **la misma matriz**: fixtures de
  `pruebas/fixtures/` o una matriz guardada, no la red. Reporta las dos cifras y la diferencia
  en %.
- Si el cambio es del orden, pruébalo también con horarios y con una parada lejana.

## Pruebas
- Siempre: `npm test`, `npm run lint`, `npm run build`.
- Cambios de rutas llevan pruebas enfocadas nuevas (constitución III). Las que ya cubren esto:
  `2-rutas`, `8-orden-paradas`, `rutas-017`, `rutas-024`, `planificar`, `replanificar`, `sumar-a-ruta`,
  `asistencia-rutas`, `15-ruteo-ch` y `ubicar-direcciones`. Para correr una sola:
  `node --import ./pruebas/registrar.mjs --test pruebas/8-orden-paradas.test.mjs`
- Un proveedor se sustituye reemplazando el `fetch` global, no el módulo (`pruebas/README.md`).
- Datos de prueba: calles reales de Arica con números y nombres inventados.

## Docs que hoy no calzan con el código
- `orden-paradas/index.ts` dice «~30 paradas/día»; hoy son ~60–100.
