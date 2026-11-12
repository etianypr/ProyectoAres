# 030 · Ruta sin reglas de barrio (y los sectores, para el escáner)

**Estado:** en curso · **Rama:** `030-ruta-por-sectores` · **Paso del flujo:** 3 (armar la ruta)

Empezó como «ruta por sectores». Se programó, se midió contra una ruta real y el dueño decidió otra
cosa (2026-11-12): por eso la carpeta conserva el nombre.

## Por qué (dueño, 2026-11-12, en terreno)
- Hubo que rehacer la ruta 4 veces, y la ruta «toma muchos kilómetros».
- Le gustó más el orden que el conductor armó en otra app para el mismo día.

## Lo medido (ruta real del 10-11, 87 paradas; matriz y trazado de ORS)
| Orden | Km | Manejando | Mayor salto entre paradas |
|---|---|---|---|
| La otra app | 37,3 | 86 min | 1,7 km |
| ARES con «cada zona una sola vez» | 37,1 | 87 min | 2,2 km |
| **ARES sin esa regla (km y tiempo)** | **36,7** | **85 min** | **1,7 km** |
| ARES solo km, sin la regla | 36,0 | 88 min | 1,5 km |
| ARES por sectores municipales | +7 % | — | — |

- La regla de barrios prohibía dejar dos paradas de pasada y volver después: de ahí el salto.
- Por sectores (un sector entero y después el otro): +7 % ese día; se descartó.

## Qué
- **R1. El orden se decide con el costo solo** (km a $130 y hora a $6.000): sale «cada zona una
  sola vez». `generar-ruta/zonas.ts` queda sin uso en el armado.
- **R2. Los sectores no entran al orden.** Quedan como dato: `geo/sectores-arica.ts`, los siete del
  plano de poblaciones de la Municipalidad (2025), con `sectorDe(punto)`, en el teléfono y sin red.
- **R3 (pendiente, pedido del dueño).** Al escanear un bulto, además de «PARADA n de N», decir el
  sector al que va.

## Datos y sistema
- Postgres e IndexedDB: sin cambios. Proveedores: ninguno nuevo. El plano es público.

## Verificación
- `pruebas/rutas-030-sectores.test.mjs`; `npm test`, `npm run lint`, `npm run build`.
- En el teléfono: armar un día real y comparar los km con la ruta de antes; que no haya que rehacerla.
