# Research: App Android del conductor (015)

## R1 · Contenedor: Capacitor 8 cargando la app publicada (`server.url`)

- **Decision**: Capacitor 8 (Node ≥ 22, Android ≥ 7 / API 24; objetivo Android 10+). La APK carga
  `https://proyecto-ares-five.vercel.app/conductor` con `server.url`; los plugins nativos se usan
  desde esa página por el puente de Capacitor.
- **Rationale**: la app es Next.js con páginas de servidor, Server Actions y rutas `/api`: no se
  puede empaquetar como archivos estáticos sin reescribir la app del conductor como SPA. Con
  `server.url` cada cambio publicado llega solo (FR-002).
- **Alternatives**: empaquetar un build estático con Live Updates (Capawesome/Capgo): obliga a
  separar la app del conductor del servidor (trabajo del tamaño de la 002) → queda como evolución
  si el modo remoto falla. TWA (Trusted Web Activity): no da llamada directa ni registro de
  llamadas.
- **Riesgo aceptado**: la guía de Capacitor no recomienda `server.url` en producción porque sin
  red la app no abre en frío. Se mitiga con R2 y con `server.errorPath`.

## R2 · Abrir sin señal (FR-003)

- **Decision**: service worker propio (`public/sw.js`, sin dependencias) con alcance `/conductor`:
  red primero con respaldo en caché para la navegación del conductor; caché primero para
  `/_next/static/*` (inmutable). No intercepta `/api/*` ni Supabase. `errorPath` local
  (`capacitor/www/sin-senal.html`) para el primer arranque sin señal.
- **Rationale**: los pedidos ya viven en IndexedDB; solo falta el "cascarón" (HTML + JS). En
  Android el WebView es Chromium y soporta service workers en orígenes https; Capacitor enruta las
  peticiones del service worker por su servidor local (`ServiceWorkerControllerCompat`), que es lo
  que inyecta el puente nativo.
- **A verificar primero (T003, prueba de concepto)**: que una página servida desde la caché del
  service worker siga teniendo `window.Capacitor` y los plugins. Si no: la caché guarda la página
  y el puente se pide al recargar con señal; sin señal, la app abre en modo web (llamar con
  marcador, sin detección).
- **Resultado (T004, 2026-10-24, vivo V2430, Android 15, WebView 127)**: con la app servida desde
  la copia del service worker y el servidor inaccesible, la APK arrancó en frío en "Ruta del día"
  con la pantalla completa y `Capacitor.isNativePlatform() === true` y los plugins disponibles. El
  camino de R2 queda confirmado; no hace falta la alternativa.
- **Alternatives**: Serwist/next-pwa (depende del bundler webpack; el proyecto compila con
  Turbopack) · sin service worker (la app queda en negro sin red).

## R3 · Llamada directa y registro de llamadas (FR-004, FR-005)

- **Decision**: plugin local `Telefono` en Java dentro de `android/` (sin dependencia de
  terceros): `llamar(numero)` con `Intent.ACTION_CALL` (permiso `CALL_PHONE`);
  `llamadasDesde(numero, desdeMs)` lee `CallLog.Calls` (permiso `READ_CALL_LOG`) y devuelve solo
  `{ duracionS, tipo }` de las salientes a ese número; `pantallaEncendida(bool)` con
  `FLAG_KEEP_SCREEN_ON` (FR-010).
- **Regla (pura, en TypeScript, con pruebas)**: al volver la app a primer plano (`App` resume), se
  busca la saliente más reciente al número (comparando los últimos 8 dígitos) hecha después del
  toque; `duracionS ≥ 5` → `contesto`, si no `no_contesto`. Android escribe el registro al colgar:
  hasta 4 reintentos cada 800 ms. Sin entrada → no se marca y se pregunta como hoy.
- **Rationale**: no hay plugin mantenido para el registro de llamadas; son ~80 líneas de Java. La
  distribución por archivo evita la restricción de Google Play sobre `READ_CALL_LOG`.
- **Alternatives**: `@capacitor-community/call-number` (solo llamar, sin registro) · preguntar
  siempre (lo que hay hoy).
- **Resultado (2026-10-24, vivo V2430, Android 15, llamadas reales a un número propio)**: una
  llamada contestada de 15 s quedó marcada "contestó" sola, sin preguntar. La prueba destapó tres
  cosas, ya corregidas:
  1. Al lanzar la llamada Android devuelve la app al frente 0,4 s antes de mostrar la pantalla de
     llamada: ese "resume" falso hacía buscar antes de colgar y preguntar. Ahora, si la app vuelve
     al fondo mientras busca (evento `pause`), se espera la vuelta de verdad.
  2. `PluginCall.getDouble` devuelve el valor por defecto cuando el número llega como entero
     largo (una hora en ms siempre): el filtro por hora buscaba desde 1970. Se lee cualquier
     `Number`.
  3. Un segundo toque en "Llamar" corría la hora de inicio y dejaba la llamada real fuera de la
     búsqueda: dentro de 5 s, otro toque al mismo pedido se ignora.

## R4 · Escáner (FR-009)

- **Decision**: `@capacitor-mlkit/barcode-scanning` con `scan()` (Google code scanner): UI lista
  de Google Play services, **sin permiso de cámara**, procesamiento en el teléfono; formatos Code
  128 e ITF. La 005 consume `escanearCodigo()`; fuera de la APK devuelve `null` y la 005 ofrece
  escribir el código.
- **Alternatives**: cámara propia con ML Kit (`startScan`, más control, pide `CAMERA`) · zxing-wasm
  (plan original de la 005, pensado para Safari).

## R5 · Ubicación (FR-011)

- **Decision**: se mantiene `navigator.geolocation` del código actual; el WebChromeClient de
  Capacitor pide el permiso de Android. Manifiesto con `ACCESS_FINE_LOCATION`, sin permiso de
  segundo plano.

## R6 · Versión mínima y distribución (FR-001, FR-013)

- **Decision**: GitHub Actions (`.github/workflows/apk.yml`, manual o con tag `apk-v*`): Node 22,
  JDK 21, `npx cap sync android`, `./gradlew assembleRelease`, firma con keystore en secretos de
  GitHub, APK como artefacto y en un Release. La página del conductor recibe del servidor
  `APK_VERSION_MINIMA` y `APK_URL` (variables de Vercel) y compara con `App.getInfo()`.
- **Rationale**: no hace falta Android Studio en el PC del dueño; la firma es siempre la misma (una
  APK nueva se instala encima).

## R7 · Privacidad

- Registro de llamadas: se lee en el teléfono y solo sale el resultado que ya existe
  (`Pedido.llamada`); número y duración no se guardan ni se envían.
- Google code scanner: procesa la imagen en el teléfono (Play services); se anota en
  `docs/PRIVACIDAD.md` como procesamiento local, no como proveedor que recibe datos.

Fuentes: [Capacitor 8](https://capgo.app/blog/upgrade-capacitor-app-to-capacitor-8/) ·
[server.url en producción](https://capawesome.io/blog/the-right-way-to-update-your-capacitor-app-remotely) ·
[Google code scanner](https://developers.google.com/ml-kit/code-scanner) ·
[ServiceWorkerWebSettingsCompat](https://developer.android.com/reference/androidx/webkit/ServiceWorkerWebSettingsCompat).
