# Research · Spec 020

Cada decisión: qué se eligió, por qué y qué se descartó.

## R1. Cómo se dibuja la burbuja encima de otra app

- **Decisión**: ventana de Android `TYPE_APPLICATION_OVERLAY` (permiso `SYSTEM_ALERT_WINDOW`,
  "Mostrar sobre otras apps"), puesta por un servicio de ARES (`BurbujaServicio`) con vistas
  nativas armadas en código, como la franja de la `NavegacionActivity` que se borra (colores
  Dashund, fuente del sistema). `FLAG_NOT_FOCUSABLE`: no le quita el teclado ni el botón atrás a
  Google Maps.
- **Por qué**: es la única forma de dibujar sobre otra app; las burbujas de Android 11
  (`Notification.BubbleMetadata`) son solo para conversaciones de mensajería.
- **Descartado**: un segundo WebView dentro de la ventana (pesado, otro ciclo de vida y otra
  copia del estado del día); pantalla dividida (la mitad de un teléfono no sirve para manejar);
  incrustar Google Maps (Android no lo permite).

## R2. ARES vivo con la app atrás

- **Decisión**: el servicio de la burbuja es un *foreground service* de tipo `specialUse`
  (`FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE`), arrancado cuando el conductor toca
  los km (ARES adelante, sin restricción de Android 15). Su aviso fijo dice solo "ARES · Parada N"
  (sin nombre ni dirección: el aviso se ve con el teléfono bloqueado). Tocar el aviso trae ARES.
  `onTaskRemoved` (cerrar ARES desde recientes) apaga el servicio y quita la burbuja.
  `START_NOT_STICKY`: sin la web no hay qué mostrar.
- **Por qué**: sin servicio en primer plano el vivo cierra la app atrás en minutos, y con la app
  muere el WebView que decide los botones. `specialUse` porque no hay otro tipo que calce:
  `location` exige usar el GPS atrás (prohibido, FR-016), `dataSync` tiene tope de 6 h al día en
  Android 15 y `shortService`, de 3 minutos. La APK no va a la tienda, así que la justificación
  de `specialUse` es solo el comentario del manifiesto.
- **Descartado**: confiar en que una ventana superpuesta visible sube la prioridad del proceso
  (es cierto en Android puro, pero la burbuja se oculta con ARES adelante y el vivo no lo respeta).

## R3. Web ↔ burbuja con ARES atrás

- **Decisión**: plugin `Burbuja`. La web manda la vista completa (`mostrar(vista)`) cada vez que
  cambia algo; lo nativo dibuja y devuelve cada toque como evento `toque` (`notifyListeners`).
  La web atiende el toque con las MISMAS funciones de la tarjeta (`onLlamar`,
  `onPedidoFinalizado`, …). La burbuja no decide nada.
- **Por qué**: Capacitor 8 no pausa el WebView al ir al fondo (`KeepRunning` por defecto,
  `Bridge.onPause` → `handlePause(true)`), así que el JavaScript sigue corriendo y escribiendo en
  IndexedDB mientras viva el proceso (R2). Los eventos nativos → web no dependen de temporizadores.
  Una sola fuente de verdad: `faseDeParada` (FR-006).
- **Descartado**: repetir las fases en Java (dos copias de las reglas, constitución II);
  guardar la vista en el teléfono (no hace falta: vive mientras vive el proceso).
- **Cuidado**: con la página oculta Chromium junta los temporizadores a 1 por segundo; el
  "Deshacer" (8 s) y los reintentos de la llamada (800 ms) quedan en ~1 s. Nada depende de
  `requestAnimationFrame`.

## R4. Volver a ARES desde la burbuja

- **Decisión**: el servicio abre `MainActivity` con `FLAG_ACTIVITY_NEW_TASK |
  FLAG_ACTIVITY_REORDER_TO_FRONT` (ya es `singleTask`). "Volver a ARES", "Escanear la etiqueta",
  "Teléfono" y "Navegar" en una parada sin punto lo hacen; después la web recibe el toque y abre
  lo pedido.
- **Por qué**: Android 15 permite abrir una pantalla desde atrás a una app con
  `SYSTEM_ALERT_WINDOW` que tiene una ventana visible: la burbuja tocada lo es.

## R5. Abrir Google Maps navegando, también desde atrás

- **Decisión**: lo abre lo nativo (`Burbuja.navegar({ lat, lng })`), no el WebView:
  `Intent.ACTION_VIEW` con `google.navigation:q=lat,lng&mode=d` y
  `setPackage("com.google.android.apps.maps")`, `FLAG_ACTIVITY_NEW_TASK`. Si no hay Google Maps
  (`ActivityNotFoundException`), el enlace `https://www.google.com/maps/dir/?api=1&destination=…`
  en el navegador (FR-013). Fuera de la APK, `mapas.ts` como hoy.
- **Por qué**: desde la burbuja ARES está atrás y el WebView no puede navegar a otro esquema;
  el servicio sí (misma excepción que R4). Reabrir con el mismo punto retoma la navegación; con
  otro, la cambia. A Google va solo el punto (FR-014).

## R6. Saber si contestó cuando se llamó desde la burbuja

- **Decisión**: mientras haya una llamada en curso, lo nativo observa el registro de llamadas
  (`ContentObserver` sobre `CallLog.Calls.CONTENT_URI`, mismo permiso `READ_CALL_LOG`) y avisa a
  la web con el evento `registroCambio`. `use-llamada-nativa.ts` lo toma como otra señal de
  "colgó", además de volver a primer plano; el cálculo (`resultadoDeLlamada`) es el mismo.
- **Por qué**: al colgar, Android vuelve a Google Maps, no a ARES, así que el "volver a primer
  plano" de hoy nunca llega. Android escribe la llamada en el registro al colgar: es justo la
  señal. Sin permiso nuevo (`READ_PHONE_STATE` sería otro permiso a pedir).
- **Descartado**: preguntar siempre "¿Contestó?" en la burbuja (un toque más en cada llamada);
  sondear el registro con temporizadores desde la web (con la página oculta Chromium los frena a
  uno por minuto pasados 5 minutos).

## R7. Ocultar la burbuja con ARES adelante

- **Decisión**: el plugin avisa al servicio en `handleOnResume` (ocultar) y `handleOnStop`
  (mostrar). Excepción: mientras ARES abre una pantalla suya (escáner de la etiqueta, cámara del
  paquete), la web la marca `enAres: true` y la burbuja no aparece encima.
- **Por qué**: con ARES adelante la burbuja repite la tarjeta; sobre el escáner molesta. Encima
  de la pantalla de llamada sí puede aparecer: al colgar se vuelve a ARES y se oculta.

## R8. Abierta, achicada y arrastrable

- **Decisión**: abierta = tarjeta a lo ancho, pegada abajo, máximo un tercio del alto (SC-007);
  achicada = círculo naranja de 56 dp con el número de parada, arrastrable, que recuerda dónde
  quedó mientras viva el servicio. Aparece abierta al empezar y con cada parada nueva (FR-010).
  No hay gesto para quitarla (FR-002).

## R9. Cuándo empieza y termina la burbuja

- **Decisión**: la maneja la web (`use-burbuja.ts`): empieza con el primer toque a los km (con el
  permiso dado) y termina cuando no queda parada activa (día terminado o cerrado). Mientras está
  en curso, **cada vez que cambia la parada activa** (cerrar, "Deshacer", "Dejar como pendiente")
  se manda a Google Maps la nueva si tiene punto (FR-008). Cerrar en ARES también la manda: Google
  Maps viene adelante (borde de la spec).
- **Por qué**: una regla sola cubre cerrar, deshacer y reordenar; la burbuja depende del pedido
  abierto, no de Google Maps (FR-004), así que ARES no necesita leer nada de Google Maps.

## R10. Permiso "Mostrar sobre otras apps"

- **Decisión**: `Burbuja.permiso()` → `Settings.canDrawOverlays`. Sin él, el primer toque a los km
  del día abre `ACTION_MANAGE_OVERLAY_PERMISSION` con el paquete de ARES; al volver, con o sin
  permiso, se abre Google Maps (sin permiso, sin burbuja). Los siguientes toques del día no
  vuelven a pedirlo (marca del día en `localStorage`, conveniencia del teléfono).
- **vivo**: en algunos vivo ese ajuste se llama "Ventanas flotantes" y la batería necesita
  "Consumo alto en segundo plano" permitido. Va en la Ayuda y se verifica en el quickstart.

## R11. Los km a la parada sin pedir el tramo a ORS

Hoy casi todo lo que se ve manejando sale de la ruta tramo a tramo (`use-navegacion.ts` →
`obtenerNavegacion`): los km y la hora de llegada de la tarjeta, el aviso de 300 m, el punto
pegado a la calle, el rumbo de la cámara, la línea naranja de lo que falta y el auto del GPS
simulado. La línea del día (`RutaCalles`) es una sola, sin cortes por parada.

- **Decisión**: la línea del día guarda sus tramos. `obtenerRutaCalles` ya los tiene (de
  `segments` y `way_points`) y hoy los pega y los bota: ahora devuelve también
  `tramos: { desde, hasta, metros, segundos }[]` (índices en `trazado`, uno por punto pedido
  menos el primero). Quien guarda la ruta (`generar-ruta`, `replanificar`, `sumar-a-ruta`) le
  pone a cada tramo el pedido al que llega y lo guarda en `Ruta.tramos` (mismo store, campo
  opcional: sin versión nueva de la base). Un módulo puro, `lib/geo/hacia-parada.ts`, toma la
  posición y el tramo de la parada activa y da: metros que faltan, segundos (proporcionales al
  tramo), el punto pegado, el trazado por delante y el rumbo.
- **Fuera del tramo** (más de 90 m, o una ruta guardada antes de la 020 sin `tramos`, o el orden
  cambió con "Dejar como pendiente", que no vuelve a trazar): metros **en línea recta**, sin
  segundos ni línea naranja, punto sin pegar y rumbo del GPS.
- **Aviso de 300 m** (spec 017): sobre el tramo como hoy; en línea recta fuera de él. La línea
  recta siempre es menor o igual que por calle, así que fuera del tramo el aviso puede llegar
  antes, **nunca tarde**.
- **Por qué**: cero consultas nuevas (SC-008) y la misma información que hoy cuando el auto va
  por la ruta del día, que es casi siempre.
- **Descartado**: una consulta por parada sin recalcular (sigue gastando ORS y contradice
  SC-008); solo línea recta (en Arica una quebrada hace que 200 m en recta sean 800 por calle);
  sacar los km (el dueño quiere ver la ruta en ARES y los km son el botón para navegar).

## R12. GPS simulado (modo prueba)

- **Decisión**: el auto simulado sigue el trazado por delante del tramo de la parada activa
  (R11), como hoy sigue el de ORS, y se detiene al llegar. Sin tramo, va en línea recta hasta la
  parada. Google Maps no se puede simular: navega con la ubicación real (borde de la spec).

## R13. Qué sale

| Sale | Por qué |
|---|---|
| `NavegacionActivity.java`, `NavegacionPlugin.java`, su registro en `MainActivity`, la actividad y el `meta-data` de la clave en el manifiesto | kit de Google (FR-015) |
| `build.gradle`: `navigation:7.9.0`, `coreLibraryDesugaring` y `desugar_jdk_libs_nio`, `MAPS_API_KEY` (variable y `manifestPlaceholders`); `apk.yml`: secreto `MAPS_API_KEY` | solo los usaba el kit. Se quedan `abiFilters` (ML Kit también trae librerías nativas; la APK es más chica) y AGP 8.13.2 (no molesta) |
| `lib/nativo/navegacion.ts`, `_hooks/use-navegando-con-google.ts` | kit |
| `_hooks/use-navegacion.ts`, `lib/geo/ors/navegacion.ts`, `lib/geo/recorrido.ts` | ruta tramo a tramo (FR-012) |
| `_hooks/use-voz.ts`, `_hooks/voz.ts`; `hablarNativo`, `callarNativo`, `hayVozNativa` de `telefono.ts`; la voz de `TelefonoPlugin.java` (TextToSpeech, foco de audio) | la voz era solo para navegar; no hay otros avisos hablados en la app |
| `_componentes/instruccion-navegacion.tsx` (`CAJA_CARRIL` pasa a `carril-superior.tsx`); el botón de voz de `controles-mapa.tsx` | cartel y voz |
| `pruebas/7-navegacion.test.mjs`, `6-voz.test.mjs`, `nativo-navegacion.test.mjs`; la sección de navegación de `2-rutas.test.mjs` | prueban lo que sale. `fixtures/tramo-arica.json` se queda: lo usa `15-ruteo-ch` |

Se queda: `lib/geo/trazado.ts` (geometría que usa `hacia-parada.ts`), `ors/cliente.ts`,
`ors/vuelta.ts`, la línea del día, `use-punto-en-ruta.ts` (ahora con el tramo de la línea del
día), `señalDebil`, `usePantallaEncendida`.

## R14. ARES sin GPS atrás (FR-016)

- **Decisión**: `use-ubicacion-actual.ts` corta su `watchPosition` al ir al fondo y lo retoma al
  volver (`alIrAlFondo` / `alVolverAPrimerPlano`). Android ya lo impide (el servicio es
  `specialUse`, no `location`, y no hay permiso de ubicación en segundo plano), pero así no
  quedan pedidos colgados ni errores.

## R15. Orden de despliegue

- **Decisión**: la web y la APK nueva (1.5.0) se pueden publicar en cualquier orden.
  - Web nueva + APK vieja: sin plugin `Burbuja` → los km abren Google Maps como hoy (sin
    burbuja); sin voz, porque la voz sale de la web.
  - Web vieja + APK nueva: el plugin `Navegacion` no existe → `UNIMPLEMENTED` → abre Google Maps;
    `Telefono.hablar` no existe → la web usaba `speechSynthesis`.
  - Instalada la 1.5.0 en el vivo, el dueño sube `APK_VERSION_MINIMA` a 1.5.0 en Vercel.
