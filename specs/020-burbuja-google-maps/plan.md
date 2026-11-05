# Implementation Plan: Navegar con Google Maps y la burbuja de ARES

**Branch**: `019-sin-mapbox` (sin rama propia) | **Date**: 2026-11-01 | **Spec**: [spec.md](spec.md)

**Input**: `specs/020-burbuja-google-maps/spec.md`

## Summary

ARES deja de guiar: salen el kit de navegación de Google (APK) y la navegación propia (cartel,
voz y la ruta tramo a tramo de ORS). Los km de la parada abren la app Google Maps con un intent y
encima queda una **burbuja nativa** (ventana sobre otras apps, sostenida por un servicio en primer
plano) que dibuja lo que la web le manda: la parada y los botones de su paso. Cada toque vuelve a
la web, que lo atiende con las mismas funciones de la tarjeta. La burbuja dura mientras haya un
pedido abierto y siempre tiene "Navegar". Los km a la parada se miden sobre el tramo de la línea
del día, que ahora se guarda por parada (cero consultas nuevas). Detalle en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5 (Next.js 16.4, React 19) · Java 17 (plugins de Capacitor 8.5)

**Primary Dependencies**: Capacitor 8 (`@capacitor/core`, `@capacitor/app`), MapLibre 6,
OpenRouteService (línea del día), app Google Maps (por intent, sin SDK). Sale
`com.google.android.libraries.navigation:navigation:7.9.0` y el desugaring.

**Storage**: IndexedDB del teléfono; solo `Ruta.tramos` (campo opcional, sin versión nueva).

**Testing**: `node --test` (`pruebas/*.test.mjs`, sin APIs reales) · prueba en el vivo (quickstart).

**Target Platform**: APK Android 10+ (minSdk 29, target 36), probada en vivo V2430 / Android 15 ·
PWA en el navegador (sin burbuja: los km abren Google Maps como hoy).

**Project Type**: web (Next.js en Vercel) + APK Capacitor que la abre.

**Performance Goals**: la burbuja refleja un toque en < 1 s con ARES atrás; 1 toque para cerrar
y salir a la siguiente (SC-002).

**Constraints**: US$0 (SC-001); sin GPS con ARES atrás (FR-016); a Google Maps solo el punto
(FR-014); ningún archivo nuevo de más de ~400 líneas.

**Scale/Scope**: 1 conductor, ~100 paradas al día.

## Constitution Check

| Principio | Cómo se cumple | Antes | Después |
|---|---|---|---|
| I. Conductor primero | 1 toque para cerrar y salir; sin cambiar de app en cada puerta; "Deshacer" igual que en ARES | ✅ | ✅ |
| II. La verdad de la entrega | Los botones salen de un solo lugar (`botonesDeParada`) y cada toque llama a la misma función de la tarjeta; la burbuja no tiene reglas | ✅ | ✅ |
| III. Probar lo crítico | Pruebas de `botonesDeParada`, `vistaDeBurbuja`, la regla "cambió la activa → navegar", `haciaParada`, los tramos de la línea del día, el respaldo sin APK; quickstart en el vivo | ✅ | ✅ |
| IV. Proveedores falibles | Sin permiso → Google Maps sin burbuja; sin Google Maps → enlace en el navegador; ARES cerrado por Android → los km la reabren; sin tramo → línea recta | ✅ | ✅ |
| V. Datos mínimos | A Google Maps solo el punto; la burbuja y su aviso fijo ("ARES · Parada N", sin nombre) en el teléfono; ORS deja de recibir la posición tramo a tramo; `PRIVACIDAD.md` al día | ✅ | ✅ |
| VI. Arquitectura verificable | Diagrama y tabla de datos abajo; `ARQUITECTURA.md` y `CLASES.md` en el mismo cambio | ✅ | ✅ |
| Restricción: sin GPS permanente | El servicio es `specialUse`, no `location`; el GPS se corta al ir al fondo (R14) | ✅ | ✅ |
| Capas `app → components → lib` | Lo nativo solo en `lib/nativo/`; `hacia-parada.ts` en `lib/geo/`; botones y burbuja en `_hooks/` de la app | ✅ | ✅ |

Sin violaciones: no hay tabla de complejidad.

## Límites afectados

```
                 ANTES (019)                                   DESPUÉS (020)
ARES (web) ─ tramo ORS cada parada ─▶ cartel + voz     ARES (web) ─ línea del día + tramos guardados ─▶ km, aviso 300 m
     │ km                                                   │ km · toques
     ▼                                                      ▼
NavegacionActivity (kit Google,                       lib/nativo/burbuja.ts ──vista──▶ plugin Burbuja
  cuota ~32/día, clave)                                     ▲                              │
                                                            └────────── toque ◀────────────┤
                                                                                           ▼
                                                                       BurbujaServicio (primer plano, specialUse)
                                                                         ├─ ventana sobre otras apps (tarjeta / círculo)
                                                                         ├─ abre ARES (Volver, Escanear, Teléfono)
                                                                         └─ intent google.navigation:lat,lng ──▶ app Google Maps
TelefonoPlugin: llamar · registro · voz              TelefonoPlugin: llamar · registro (+ avisa al colgar) · sin voz
```

## Datos

| Dato | Dónde | Crea / cambia / lee / sale |
|---|---|---|
| `Ruta.tramos` (`TramoDelDia[]`) | store de la ruta (IndexedDB, ya en `STORES_DEL_DIA`) | **cambia**: campo opcional; lo escriben `generar-ruta`, `replanificar`, `sumar-a-ruta` |
| `RutaCalles.tramos` | `lib/geo/ors/direcciones.ts` | **cambia**: devuelve los tramos que hoy se pegan |
| `HaciaParada` | `lib/geo/hacia-parada.ts` | **crea** (reemplaza a `Navegacion`) |
| `BotonParada`, `estadoDeParada` | `_hooks/botones-parada.ts` | **crea** (sale del JSX de `parada-activa.tsx`) |
| `VistaBurbuja`, `ToqueBurbuja` | `lib/nativo/burbuja.ts` ↔ plugin | **crea** (memoria) |
| Burbuja en curso, marca de permiso del día | `_hooks/use-burbuja.ts`, `localStorage` | **crea** |
| Pedidos, eventos, cola | IndexedDB | **lee/escribe igual que hoy** (los toques usan las mismas funciones) |
| `Navegacion`, `PasoNavegacion`, `AvisoVoz`, `Voz` | — | **salen** |

Detalle de campos y validaciones: [data-model.md](data-model.md). Contrato web ↔ APK:
[contracts/burbuja.md](contracts/burbuja.md).

## Datos que salen del teléfono

| Proveedor | Recibe | Antes | Después |
|---|---|---|---|
| Google Maps (app) | punto de la parada activa | solo si fallaba la navegación | **cada parada** (navegación principal) |
| Google Navigation SDK | punto + ubicación del auto | navegación dentro de la APK | **sale** |
| OpenRouteService | coordenadas de paradas y partida | línea del día + posición y parada en cada tramo | **solo la línea del día** |

## Project Structure

### Documentation (this feature)

```text
specs/020-burbuja-google-maps/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/burbuja.md
└── checklists/requirements.md
```

### Source Code

```text
android/app/src/main/java/cl/dashund/ares/
├── BurbujaPlugin.java        nuevo: permiso, mostrar, terminar, enAres, navegar; evento toque
├── BurbujaServicio.java      nuevo: servicio en primer plano, ventana, mostrar/ocultar, abrir ARES y Google Maps
├── BurbujaVista.java         nuevo: tarjeta y círculo con los colores Dashund (sale de la franja del kit)
├── TelefonoPlugin.java       sin voz; observa el registro tras llamar → evento llamadaRegistrada
├── MainActivity.java         registra Burbuja (no Navegacion)
└── NavegacionActivity.java, NavegacionPlugin.java    salen
android/app/src/main/AndroidManifest.xml    + SYSTEM_ALERT_WINDOW, FOREGROUND_SERVICE(_SPECIAL_USE), servicio; − actividad y clave del kit
android/app/build.gradle · .github/workflows/apk.yml    − kit, desugaring, MAPS_API_KEY

src/lib/nativo/
├── burbuja.ts                nuevo (contrato)
├── mapas.ts                  en la APK abre por Burbuja.navegar (sirve con ARES atrás)
├── telefono.ts               − voz; + alRegistrarLlamada
└── navegacion.ts             sale
src/lib/geo/
├── hacia-parada.ts           nuevo (puro)
├── ors/direcciones.ts        + tramos
└── ors/navegacion.ts, recorrido.ts    salen
src/lib/encomiendas/local/
├── almacen/tipos.ts · almacen/ruta.ts    TramoDelDia; fijarTrazado guarda los tramos
├── generar-ruta/index.ts · replanificar.ts · sumar-a-ruta.ts    pasan los ids de cada tramo
└── gps-simulado.ts           sin cambio de API (sigue lo que le pasen)
src/app/(conductor)/conductor/encomiendas/
├── _hooks/botones-parada.ts  nuevo (puro): botonesDeParada, estadoDeParada
├── _hooks/use-burbuja.ts     nuevo: en curso, vista, toques → funciones de la tarjeta, cambió la activa → navegar
├── _hooks/use-guia-navegacion.ts → use-hacia-parada.ts    con haciaParada; sin voz ni Google
├── _hooks/use-llamada-nativa.ts    + "colgó" por llamadaRegistrada
├── _hooks/use-ubicacion-actual.ts  corta el GPS al ir al fondo
├── _hooks/use-navegacion.ts, use-voz.ts, voz.ts, use-navegando-con-google.ts    salen
├── _componentes/parada-activa.tsx  dibuja botonesDeParada; km → use-burbuja
├── _componentes/tarjeta-parada.tsx · carril-superior.tsx · controles-mapa.tsx · ayuda.tsx    sin cartel ni voz; textos
├── _componentes/instruccion-navegacion.tsx    sale (CAJA_CARRIL a carril-superior)
└── pantalla.tsx              usa use-hacia-parada y use-burbuja (no crece)
src/app/(conductor)/conductor/diagnostico/page.tsx    texto del GPS simulado

pruebas/
├── burbuja.test.mjs          nuevo: botonesDeParada (todas las fases), vistaDeBurbuja, regla de navegar, respaldo sin APK
├── hacia-parada.test.mjs     nuevo: por el tramo, fuera del tramo, sin tramos, aviso 300 m nunca tarde
├── 2-rutas.test.mjs          + tramos de obtenerRutaCalles; − sección de navegación
├── nativo-llamada.test.mjs · modo-prueba.test.mjs    ajustes
└── 6-voz, 7-navegacion, nativo-navegacion    salen
```

**Structure Decision**: la de siempre. Web en `src/` por capas, lo nativo detrás de
`src/lib/nativo/`, plugins Java en `android/…/ares/`. Tres archivos Java en vez de uno para no
pasar las ~400 líneas.

### Documentos en el mismo cambio

- `docs/ARQUITECTURA.md`: diagrama (sin voz ni kit; burbuja), `_hooks`, `lib/geo`, `lib/nativo`.
- `docs/CLASES.md`: GPS simulado, fila de navegación (sale), `TramoDelDia`, `HaciaParada`,
  `BotonParada`, `VistaBurbuja`, plugin `Burbuja`.
- `docs/PRIVACIDAD.md`: Google Maps (app) principal; sale el kit; ORS sin la navegación.
- `README.md`: sale `MAPS_API_KEY` y "GPS y voz"; la APK 1.5.0 y los dos ajustes del vivo.
- `specs/015-app-android/contracts/nativo.md`: voz y `navegarConGoogle` salen; enlace a
  `contracts/burbuja.md`.
- `specs/019-sin-mapbox/`: US1, T005, T015 y T016 reemplazados por la 020; SC-001 sin "navegarlo".
- `pruebas/README.md`, `.env.example` (línea vieja de Mapbox), `specs/README.md`.

## Riesgos

| Riesgo | Qué se hace |
|---|---|
| El vivo cierra ARES atrás aunque haya servicio | Ayuda: "consumo alto en segundo plano"; si pasa, la burbuja se va y los km la reabren (SC-009) |
| Android 15 bloquea abrir ARES o Google Maps desde la burbuja | La excepción es por ventana visible con `SYSTEM_ALERT_WINDOW`; se prueba primero en el vivo (quickstart, paso 2) |
| La web atrás tarda en responder un toque | Eventos nativos sin temporizadores; se mide en el quickstart (< 1 s) |
| Una ruta vieja sin tramos | Línea recta hasta que se rehaga la ruta |
