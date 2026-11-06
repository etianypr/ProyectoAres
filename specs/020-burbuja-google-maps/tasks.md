# Tareas · Spec 020

Plan: [plan.md](plan.md) · contrato: [contracts/burbuja.md](contracts/burbuja.md) · datos:
[data-model.md](data-model.md). Las pruebas van porque la constitución (III) las pide para
estados de entrega, rutas y privacidad. `E` = `src/app/(conductor)/conductor/encomiendas`.

## Fase 1 · Preparación

- [x] T001 Spec, plan y tareas en `specs/020-burbuja-google-maps/`

## Fase 2 · Base (bloquea a las historias)

- [x] T002 [P] Botones de la parada en un solo lugar: `botonesDeParada(activa, fase)` y `estadoDeParada(activa, whatsapp)` en `E/_hooks/botones-parada.ts` (tabla de data-model); `E/_componentes/parada-activa.tsx` los dibuja (íconos y clases por `id`/`tono`) sin cambiar lo que se ve; pruebas de todas las fases en `pruebas/burbuja.test.mjs`
- [x] T003 [P] Tramos de la línea del día: `obtenerRutaCalles` devuelve `tramos` en `src/lib/geo/ors/direcciones.ts`; `TramoDelDia` y `Ruta.tramos?` en `src/lib/encomiendas/local/almacen/tipos.ts`; `fijarTrazado` los guarda en `almacen/ruta.ts`; `generar-ruta/index.ts`, `replanificar.ts` y `sumar-a-ruta.ts` les ponen el pedido al que llegan; pruebas en `pruebas/2-rutas.test.mjs`
- [x] T004 `haciaParada(posicion, destino, ruta)` en `src/lib/geo/hacia-parada.ts` (por el tramo / línea recta, segundos proporcionales, pegado, por delante, rumbo); pruebas en `pruebas/hacia-parada.test.mjs` (incluye: fuera del tramo el aviso de 300 m nunca llega tarde)

## Fase 3 · US1 (P1) La burbuja acompaña al pedido abierto

Prueba sola: 3 paradas inventadas; los km abren Google Maps con la burbuja; salir de Google Maps
no la quita; "Navegar" vuelve; cerrar las 3 la quita.

- [x] T005 [P] [US1] Burbuja nativa: `BurbujaVista.java` (tarjeta y círculo, colores Dashund), `BurbujaServicio.java` (primer plano `specialUse`, ventana sobre otras apps, mostrar/ocultar, arrastrar, abrir ARES y Google Maps, `onTaskRemoved`) y `BurbujaPlugin.java` (`permiso`, `pedirPermiso`, `mostrar`, `terminar`, `enAres`, `navegar`, evento `toque`) en `android/app/src/main/java/cl/dashund/ares/`; permisos y servicio en `android/app/src/main/AndroidManifest.xml`; registro en `MainActivity.java`
- [x] T006 [P] [US1] Fuera el kit de Google: `NavegacionActivity.java`, `NavegacionPlugin.java`, su actividad y `meta-data` del manifiesto, `navigation:7.9.0`, desugaring y `MAPS_API_KEY` de `android/app/build.gradle`, el secreto de `.github/workflows/apk.yml`, `src/lib/nativo/navegacion.ts`, `E/_hooks/use-navegando-con-google.ts`, `pruebas/nativo-navegacion.test.mjs`
- [x] T007 [US1] `src/lib/nativo/burbuja.ts` según el contrato; `src/lib/nativo/mapas.ts` abre por `Burbuja.navegar` en la APK; respaldo fuera de la APK probado en `pruebas/burbuja.test.mjs`
- [x] T008 [US1] `E/_hooks/use-burbuja.ts`: `vistaDeBurbuja` (pura), en curso desde el primer toque a los km con permiso, permiso pedido una vez al día (R10), "cambió la activa → navegarA", terminar sin parada activa; los km de `E/_componentes/parada-activa.tsx` lo usan; la regla probada en `pruebas/burbuja.test.mjs`
- [x] T009 [US1] Sin GPS con ARES atrás: `E/_hooks/use-ubicacion-actual.ts` corta y retoma `watchPosition` con `alIrAlFondo` / `alVolverAPrimerPlano`

## Fase 4 · US2 (P1) Los botones de la parada en la burbuja

Prueba sola: recorrer 3 paradas solo desde la burbuja deja lo mismo que hacerlo en ARES.

- [x] T010 [US2] Toques de la burbuja → las mismas funciones de la tarjeta (tabla de data-model) en `E/_hooks/use-burbuja.ts` y `E/pantalla.tsx`; aviso y "Deshacer" en la vista; `burbujaEnAres(true)` mientras el escáner o la cámara están abiertos
- [x] T011 [US2] "Colgó" sin volver a ARES: `TelefonoPlugin.java` observa el registro de llamadas tras `llamar` y emite `llamadaRegistrada`; `alRegistrarLlamada` en `src/lib/nativo/telefono.ts`; `E/_hooks/use-llamada-nativa.ts` lo usa además de volver a primer plano; prueba en `pruebas/nativo-llamada.test.mjs`

## Fase 5 · US3 (P2) ARES muestra la ruta, no guía

Prueba sola: en ARES se ven la línea del día, las paradas, la posición y los km; no habla ni
muestra cartel.

- [x] T012 [US3] `E/_hooks/use-guia-navegacion.ts` pasa a `E/_hooks/use-hacia-parada.ts` con `haciaParada` (km, aviso de 300 m, pegado, rumbo, línea naranja, GPS simulado por el tramo o en línea recta); `E/pantalla.tsx` y `E/_mapa/ruta-mapa.tsx` al día
- [x] T013 [US3] Fuera la navegación propia: `E/_hooks/use-navegacion.ts`, `src/lib/geo/ors/navegacion.ts`, `src/lib/geo/recorrido.ts`, `E/_hooks/use-voz.ts`, `E/_hooks/voz.ts`, `E/_componentes/instruccion-navegacion.tsx` (`CAJA_CARRIL` a `carril-superior.tsx`), el botón de voz de `E/_componentes/controles-mapa.tsx`, la voz de `src/lib/nativo/telefono.ts` y de `TelefonoPlugin.java`; `pruebas/6-voz.test.mjs`, `pruebas/7-navegacion.test.mjs` y la sección de navegación de `pruebas/2-rutas.test.mjs`
- [x] T014 [P] [US3] Textos: `E/_componentes/ayuda.tsx` (navegar con Google Maps, la burbuja, el permiso, el vivo), `E/_componentes/tarjeta-parada.tsx` ("Navegar"), `src/app/(conductor)/conductor/diagnostico/page.tsx` (GPS simulado)

## Fase 6 · Cierre

- [x] T015 [P] Documentos: `docs/ARQUITECTURA.md`, `docs/CLASES.md`, `docs/PRIVACIDAD.md`, `README.md`, `specs/015-app-android/contracts/nativo.md`, `specs/019-sin-mapbox/` (US1, T005, T015, T016 reemplazados), `pruebas/README.md`, `.env.example`, `specs/README.md`
- [x] T016 `npm test`, `npm run lint`, `npm run build` en verde
- [ ] T017 APK de depuración y quickstart en el emulador del PC (Android 15 con Google Play y Google Maps). Probada en el vivo con la APK de depuración contra el PC (2026-11-05): Google Maps navega solo en auto, burbuja achicada sobre la velocidad, se abre al llegar (≤ 50 m) y con «Deshacer», «Teléfono» y vuelta a Google Maps. En el emulador quedó el día de 68 paradas y `scripts/simular-recorrido.mjs`
- [ ] T018 Quickstart en el vivo con la APK 1.5.0; el dueño sube `APK_VERSION_MINIMA` a 1.5.0
- [ ] T019 Día real: SC-004 (8 de cada 10 sin volver a ARES), SC-001 y SC-008 en las consolas

## Dependencias

- T002–T004 antes de las historias. T002 y T003 en paralelo; T004 usa los tipos de T003.
- US1: T005, T006 y T007 en paralelo; T008 después de T002 y T007.
- US2 después de US1 (usa la burbuja). US3 solo necesita T003–T004: puede ir en paralelo a US1/US2.
- T016 al final; T017 necesita T005–T013.

## Estrategia

MVP = Fase 2 + US1 (Google Maps con la burbuja y "Navegar"). Después US2 (los botones) y US3
(sacar la navegación de ARES). Todo sin commits hasta que el dueño lo pida. Hecho hasta T016 el 2026-11-05.
