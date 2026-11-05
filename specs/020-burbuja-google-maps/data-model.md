# Data model · Spec 020

Sin tablas, stores ni migraciones nuevas, y sin versión nueva de la base local. La burbuja vive
en memoria del teléfono; nada sale del teléfono salvo el punto de la parada hacia Google Maps.
Lo único que se guarda de más son los tramos de la línea del día (`Ruta.tramos`, campo opcional
del store que ya existe y que el cierre del día ya borra).

| Dato | Dónde | Cambio |
|---|---|---|
| `RutaCalles.tramos` | `lib/geo/ors/direcciones.ts` | nuevo (lo que hoy se pega y se bota) |
| `Ruta.tramos?: TramoDelDia[]` | `almacen/tipos.ts`, store de la ruta (IndexedDB) | campo opcional nuevo; lo escriben `generar-ruta`, `replanificar`, `sumar-a-ruta` (`fijarTrazado`) |
| `HaciaParada` | `lib/geo/hacia-parada.ts` (puro) | nuevo; reemplaza a `Navegacion` (`use-navegacion.ts`) |
| `BotonParada`, `estadoDeParada` | `_hooks/botones-parada.ts` (puro) | nuevo; sale del JSX de `parada-activa.tsx` |
| `VistaBurbuja`, `ToqueBurbuja` | `lib/nativo/burbuja.ts` | nuevo (contrato en `contracts/burbuja.md`) |
| Burbuja en curso | `_hooks/use-burbuja.ts` (memoria) | nuevo |
| `Navegacion`, `PasoNavegacion`, `AvisoVoz`, `Voz`, `ResultadoNavegacion` | — | salen |

## Tipos nuevos

### `BotonParada` (web, `_hooks/botones-parada.ts`, puro)

Los botones del paso de la parada, en filas. Los dibujan **la tarjeta de ARES y la burbuja**: es
el "un solo lugar" de FR-006.

| Campo | Tipo | Nota |
|---|---|---|
| `id` | `IdBoton` | qué hace al tocarlo (abajo) |
| `texto` | `string` | el de la tarjeta de hoy ("Llamar", "Pedido finalizado", …) |
| `detalle` | `string?` | la consecuencia, en las salidas ("Se tacha por hoy") |
| `tono` | `"marca" \| "ok" \| "peligro" \| "borde-marca" \| "borde-ok" \| "borde-peligro" \| "neutro"` | el color de hoy; la tarjeta lo pasa a clases, la burbuja a colores Dashund |
| `soloIcono` | `boolean?` | el "volver a llamar" redondo del medio |
| `abreAres` | `boolean` | `escanear`, `telefono` |

`IdBoton` = `"llamar" | "escanear" | "telefono" | "entregado" | "no_se_pudo" | "contesto" |
"no_contesto" | "finalizado" | "pendiente" | "no_entregado" | "volver"` (botones del paso) y
`"deshacer" | "navegar" | "ares"` (fijos de la burbuja).

`botonesDeParada(activa, fase): BotonParada[][]` — por fase (hoy en el JSX de
`parada-activa.tsx`):

| Fase | Filas |
|---|---|
| `antes_llamar` con teléfono | `[llamar]` |
| `antes_llamar` sin teléfono | `[escanear]` · `[telefono, entregado, no_se_pudo]` |
| `esperando_resultado` | `[contesto, llamar(soloIcono), no_contesto]` |
| `confirmado` / `esperando_entrega` | `[finalizado]` · `[llamar, no_se_pudo]` |
| `salidas` | `[pendiente]` · `[no_entregado]` · `[volver]` |

`estadoDeParada(activa, whatsapp): { texto, tono } | null` — el renglón "Pidió …", "Estará en
su domicilio", "Sin respuesta todavía" (hoy también en el JSX), compartido igual.

### `VistaBurbuja` (web → nativo, `lib/nativo/burbuja.ts`)

| Campo | Tipo | De dónde |
|---|---|---|
| `secuencia` | `number` | `activa.secuencia` (el círculo achicado) |
| `titulo` | `string` | `OF 123 456 789` o `Parada N` (como la franja de hoy) |
| `detalle` | `string` | `nombre · dirección` |
| `estado` | `{ texto, tono } \| null` | `estadoDeParada` |
| `destino` | `{ lat, lng } \| null` | el punto de la parada; `null` = sin punto ("Navegar" abre ARES). Queda en el teléfono: a Google Maps va solo al navegar |
| `filas` | `BotonParada[][]` | `botonesDeParada` |
| `aviso` | `{ texto: string, deshacer: boolean } \| null` | `deshacer` / `confirmacion` de `use-acciones-parada` |
| `nueva` | `boolean` | cambió la parada desde la última vista: la burbuja se abre |

Validación: `titulo` no vacío; `filas` puede ser vacía (parada en ARES sin paso); el nativo
ignora un `id` que no conoce.

### `ToqueBurbuja` (nativo → web)

`{ id: IdBoton }`. La web lo traduce a la misma función que el botón de la tarjeta:

| `id` | Función (hoy en `pantalla.tsx`) |
|---|---|
| `llamar` | `onLlamar(activa)` |
| `escanear` | `setEscaneando(true)` (ARES ya adelante) |
| `telefono` | `setFormPedido(activa.pedido)` |
| `entregado`, `finalizado` | `onPedidoFinalizado()` |
| `no_se_pudo` | `setDandoResultadoDe(id)` |
| `contesto` / `no_contesto` | `onContesto()` / `onNoContesto()` |
| `pendiente` / `no_entregado` | `onSalida(SALIDAS[…])` |
| `volver` | `setDandoResultadoDe(null)` |
| `deshacer` | `onDeshacer()` |
| `navegar` | con punto: nada (lo abrió lo nativo); sin punto: abrir la parada para ubicarla |
| `ares` | nada (ARES ya adelante) |

### Burbuja en curso (web, `_hooks/use-burbuja.ts`, memoria)

| Campo | Tipo | Regla |
|---|---|---|
| `enCurso` | `boolean` | `true` al primer toque a los km con permiso; `false` sin parada activa |
| `paradaNavegada` | `string \| null` | id del pedido al que se mandó Google Maps; si la activa cambia y tiene punto → `navegarA` |
| `permisoPedidoHoy` | `string` (fecha) | en `localStorage`; R10 |

Transiciones:

```
(sin burbuja) ──toque a los km, con permiso──▶ en curso ──activa cambia──▶ navegarA(nueva)
      ▲                                           │
      └──────────── sin parada activa ────────────┘  (terminarBurbuja)
```

### `BurbujaServicio` (nativo, memoria)

`vista` (la última), `abierta | achicada`, `posición del círculo`, `enAres`, `aresAdelante`.
Visible = vista ∧ permiso ∧ ¬aresAdelante ∧ ¬enAres.

## Tramos de la línea del día

### `RutaCalles.tramos` (`lib/geo/ors/direcciones.ts`)

`{ desde: number; hasta: number; metros: number; segundos: number }[]`, uno por punto pedido
menos el primero, en el mismo orden. `desde`/`hasta` son índices en `trazado` (el tramo k llega
al punto k+1). Sale de `segments` y `way_points` de ORS, que hoy ya se leen.

### `TramoDelDia` (`almacen/tipos.ts`)

| Campo | Tipo | Nota |
|---|---|---|
| `pedidoId` | `string \| null` | el pedido al que llega; `null` = la vuelta a la central |
| `desde`, `hasta` | `number` | índices en `Ruta.trazado` |
| `metros`, `segundos` | `number` | de ORS, para ese tramo |

Validación: `0 ≤ desde < hasta < trazado.length`; si no, se ignora el tramo (cae a línea recta).
Una ruta guardada antes de la 020 no tiene `tramos`: todo en línea recta hasta que se rehaga.

### `HaciaParada` (`lib/geo/hacia-parada.ts`, puro)

`haciaParada(posicion, destino, ruta): HaciaParada`

| Campo | Tipo | Por el tramo | Fuera del tramo |
|---|---|---|---|
| `metros` | `number` | lo que falta del tramo (`metrosRestantes` sobre el recorte) | línea recta |
| `segundos` | `number \| null` | `segundos × metros / metros del tramo` | `null` |
| `porTramo` | `boolean` | `true` | `false` |
| `pegado` | `PosicionPegada \| null` | `ajustarATrazado` (≤ 90 m) | `null` |
| `porDelante` | `Trazado \| null` | `recortarTrazado` hasta la parada | `null` |
| `rumbo` | `number \| null` | `rumboDelCamino` | `null` (la pantalla usa el del GPS) |

`seAproximaSinContacto` = `activa.hayQueContactar && metros ≤ 300` (como hoy; fuera del tramo,
en línea recta: llega antes, nunca tarde).
