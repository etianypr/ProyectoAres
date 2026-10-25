---
description: "Tareas: App Android del conductor (APK)"
---

# Tasks: App Android del conductor (APK)

**Input**: `specs/015-app-android/` (spec, plan, research, data-model, contracts/nativo.md, quickstart)

**Tests**: incluidos: la constitución (III) los exige para llamadas, estados y privacidad.

**Reglas**: sin commits salvo pedido. Cada fase cierra con `npm test`, `npm run lint` y
`npm run build` en verde. Todo lo nativo se usa a través de `src/lib/nativo/`; ningún archivo de
servidor (`page.tsx`, `route.ts`, `"use server"`) importa `@capacitor/*`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (otro archivo, sin dependencias pendientes)
- **[Story]**: historia de usuario de `spec.md` (US1…US5)

---

## Phase 1: Setup

**Purpose**: dejar el proyecto Capacitor creado junto a la web.

- [x] T001 Agregar a `package.json` las dependencias `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor-mlkit/barcode-scanning` y, como dev, `@capacitor/cli` (versiones 8.x); `npm install`; confirmar que `npm run build` sigue verde
- [x] T002 Crear `capacitor.config.ts` (appId `cl.pucarani.ares`, appName `ARES`, `webDir: "capacitor/www"`, `server.url: "https://proyecto-ares-five.vercel.app/conductor"`, `server.errorPath: "sin-senal.html"`, `server.cleartext: false`) y `capacitor/www/index.html` (redirige a `server.url`) y `capacitor/www/sin-senal.html` (mensaje "Abre la app una vez con señal" + botón Reintentar, con los colores de marca)
- [x] T003 Generar `android/` con `npx cap add android`; en `android/variables.gradle` dejar `minSdkVersion = 29`; ícono, pantalla de carga y nombre con `node scripts/generar-iconos.mjs --android`; agregar al `.gitignore` las salidas de build de Android (`android/app/build/`, `android/.gradle/`, `android/local.properties`, `*.keystore`)

---

## Phase 2: Foundational (bloquea todas las historias)

- [x] T004 Prueba de concepto de R2 (`research.md`): APK de depuración con `server.url`; comprobar en `chrome://inspect` que `window.Capacitor.isNativePlatform()` es `true` en `/conductor/encomiendas`; registrar un service worker mínimo, recargar en modo avión y comprobar si el puente sigue. Anotar el resultado en `specs/015-app-android/research.md` (R2, "Resultado"); si el puente se pierde, US1 sigue con la alternativa de R2
- [x] T005 [P] Crear `src/lib/nativo/entorno.ts`: `esApp()` (con `Capacitor.isNativePlatform()`, devuelve `false` en el servidor), `versionInstalada()` (con `App.getInfo()`, `null` fuera de la APK) y `alVolverAPrimerPlano(cb)` (con `App.addListener("resume")` en la APK y `visibilitychange` en la web; devuelve la función para quitarlo)
- [x] T006 Crear `android/app/src/main/java/cl/pucarani/ares/TelefonoPlugin.java` según `contracts/nativo.md` (`llamar` con `Intent.ACTION_CALL`; `llamadasDesde` sobre `CallLog.Calls` filtrando por los últimos 8 dígitos y `DATE >= desdeMs`, máximo 5, más recientes primero, sin devolver otros números; `pantallaEncendida` con `FLAG_KEEP_SCREEN_ON` en el hilo de UI; errores `permiso_denegado` / `sin_soporte`), registrarlo en `MainActivity.java`, y agregar `CALL_PHONE`, `READ_CALL_LOG` y `ACCESS_FINE_LOCATION` a `android/app/src/main/AndroidManifest.xml`
- [x] T007 Crear `src/lib/nativo/telefono.ts` con `registerPlugin("Telefono")` y las funciones `llamar`, `llamadasDesde` y `pantallaEncendida` de `contracts/nativo.md`, cada una con su respaldo web (`tel:`, `null`; la pantalla encendida del navegador sigue en `use-pantalla-encendida.ts`)
- [x] T008 [P] Crear `.github/workflows/apk.yml` (manual y con tag `apk-v*`): Node 22, JDK 21, Android SDK 36, `npm ci`, `npx cap sync android`, `./gradlew assembleRelease` firmando con los secretos `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`; publicar `ares-<versión>.apk` como artefacto y en un Release. Agregar al `specs/015-app-android/quickstart.md` cómo crear el keystore con `keytool` y cargar los 4 secretos

**Checkpoint**: la APK de depuración abre la app y `esApp()` es `true`.

---

## Phase 3: User Story 1 - Instalar la app y repartir como hoy (P1) 🎯 MVP

**Goal**: la APK instalada abre la app del conductor, guarda la sesión y abre sin señal.

**Independent Test**: `quickstart.md` pasos 1–4.

- [x] T009 [US1] Crear `public/sw.js` (sin dependencias) con la caché `ares-conductor-v1`: navegación bajo `/conductor` → red primero con respaldo en caché; `/_next/static/*` → caché primero; todo lo demás (`/api/*`, otros orígenes, métodos distintos de GET) pasa sin tocar. La decisión vive en una función `estrategiaPara(url, modo, metodo)` declarada arriba del archivo, para probarla
- [x] T010 [P] [US1] Crear `pruebas/sw.test.mjs`: carga `public/sw.js` en un `vm` con `self` falso y verifica `estrategiaPara` (navegación del conductor, estáticos, `/api`, Supabase, Mapbox, POST)
- [x] T011 [US1] Crear `src/app/(conductor)/registrar-sw.tsx` (cliente: registra `/sw.js` con `scope: "/conductor"` solo en producción) y montarlo en `src/app/(conductor)/layout.tsx`. `/sw.js` es público en `lib/supabase/sesion-proxy.ts`: con la sesión vencida el navegador recibía el login en vez del script
- [x] T012 [US1] Botón atrás de Android: en `src/lib/nativo/entorno.ts` agregar `alBotonAtras(cb)` (con `App.addListener("backButton")`); en `src/app/(conductor)/conductor/encomiendas/pantalla.tsx` cerrar primero la vista abierta de la hoja y, si no hay nada abierto, no salir de la app con una ruta en curso
- [ ] T013 [US1] Validar en un Android real los pasos 1–4 de `quickstart.md` y anotar el resultado

**Checkpoint**: se reparte un día completo desde la APK.

---

## Phase 4: User Story 2 - Llamar con un toque y que la app sepa si contestó (P1) 🎯 MVP

**Goal**: llamada directa; el resultado de la llamada se marca solo y se corrige con un toque.

**Independent Test**: `quickstart.md` pasos 5–7.

- [x] T014 [P] [US2] Crear `src/lib/nativo/llamada.ts` con `resultadoDeLlamada(entradas, desdeMs)` (el emparejamiento por últimos 8 dígitos lo hace el plugin) según la regla de `data-model.md` (salientes, `fechaMs ≥ desdeMs − 2000`, la más reciente, `duracionS ≥ 5` → `contesto`, si no `no_contesto`, sin entrada → `null`)
- [x] T015 [P] [US2] Crear `pruebas/nativo-llamada.test.mjs`: contestó, no contestó (0 s y 4 s), sin entrada → `null`, número con `+56 9`, con espacios y sin código, ignora entrantes y anteriores al toque, toma la más reciente de varias
- [x] T016 [US2] Crear `src/app/(conductor)/conductor/encomiendas/use-llamada-nativa.ts`: `llamar(parada)` guarda la llamada en curso (`pedidoId`, número, `desdeMs`) y llama a `telefono.llamar`; con `alVolverAPrimerPlano` consulta `llamadasDesde` hasta 3 veces cada 700 ms, aplica `resultadoDeLlamada` y, si no es `null`, llama a `dia.marcarLlamada(pedidoId, resultado)`; descarta la llamada en curso a los 30 min; expone `detectada: { pedidoId, resultado } | null` para la corrección
- [x] T017 [US2] En `src/app/(conductor)/conductor/encomiendas/pantalla.tsx`, `onLlamar`: con `esApp()` usar `use-llamada-nativa` y no abrir la pregunta "¿Contestó?" (`esperandoResultadoDe`); si `llamar` devolvió `"marcador"` (sin permiso) o la detección dio `null`, seguir con la pregunta de siempre (FR-012). Mostrar la notificación "Contestó" / "No contestó" con la acción "Corregir", que marca el valor contrario (FR-006); con "no contestó" ofrecer las salidas de siempre
- [x] T018 [US2] En `src/app/(conductor)/conductor/encomiendas/pantalla.tsx`, `onPedidoFinalizado`: dentro de la APK no llamar al siguiente solo; la parada siguiente queda con "Llamar" como botón principal (FR-008). En el navegador queda como hoy
- [ ] T019 [US2] Validar en un Android real los pasos 5–7 de `quickstart.md` (incluido sin permisos) y anotar el resultado. **Parcial (2026-10-24)**: "contestó" automático con una llamada real (ver research R3, con los tres arreglos que salieron); falta "no contestó" con llamada real, sin permisos y el paso 7

**Checkpoint**: MVP: APK instalada + llamadas de un toque con resultado automático.

---

## Phase 5: User Story 3 - Escanear la etiqueta con el lector del teléfono (P2)

**Goal**: `escanearCodigo()` listo para la 005.

**Independent Test**: 20 etiquetas reales sin señal desde la pantalla de diagnóstico, < 1 s cada una.

**Resultado (2026-10-24)**: el escáner lee en el vivo V2430 códigos Code 128 de 26 dígitos con el formato de la etiqueta de Starken (prueba desde la pantalla del PC). Falta la medición con 20 etiquetas reales (SC-003).

- [x] T020 [P] [US3] Crear `src/lib/nativo/escaner.ts`: `escanearCodigo()` con `BarcodeScanner.scan({ formats: [CODE_128, ITF] })` en la APK (instalar el módulo de Google si falta) y `null` fuera de la APK (la 005 decide si suma un lector web); devuelve solo los dígitos
- [x] T021 [US3] En `android/app/src/main/AndroidManifest.xml`, agregar el `meta-data` `com.google.mlkit.vision.DEPENDENCIES = barcode_ui`; `npx cap sync android`
- [x] T022 [US3] Crear `src/app/(conductor)/conductor/diagnostico/page.tsx` (cliente; enlace "Diagnóstico" en el menú lateral solo dentro de la APK): muestra `esApp()`, la versión instalada, el estado de los permisos y un botón "Probar escáner" que muestra el código leído

---

## Phase 6: User Story 4 - Pantalla encendida y ubicación durante la ruta (P2)

**Goal**: la pantalla no se apaga con la ruta en curso; la ubicación funciona dentro de la APK.

**Independent Test**: `quickstart.md` paso 8 y la navegación siguiendo la posición.

- [x] T023 [US4] `use-pantalla-encendida.ts` (ya lo usa `pantalla.tsx` con la ruta en curso): dentro de la APK llama a `pantallaEncendida(true)` y la suelta al desmontar; en el navegador sigue con Screen Wake Lock
- [x] T024 [US4] Verificar dentro de la APK que `use-ubicacion-actual.ts` recibe la posición (permiso pedido por Capacitor; sin permiso de segundo plano); si el permiso se niega, la navegación muestra el aviso que ya existe. Verificado (2026-10-24, vivo V2430, Android 15): posición con precisión de 5 m. El WebView no trae `navigator.permissions`: el diagnóstico lee el permiso del plugin (alias `ubicacion`)

---

## Phase 7: User Story 5 - Saber cuándo hay que instalar una versión nueva (P3)

**Goal**: aviso no bloqueante cuando la APK es más vieja que la mínima.

**Independent Test**: `quickstart.md` paso 10.

- [x] T025 [P] [US5] Crear `src/lib/nativo/version.ts` con `esMasVieja(instalada, minima)` (versiones `x.y.z`) y `pruebas/nativo-version.test.mjs`
- [x] T026 [US5] En `src/app/(conductor)/conductor/encomiendas/page.tsx`, pasar a la pantalla `apkMinima` (`APK_VERSION_MINIMA`) y `apkUrl` (`APK_URL`); en `pantalla.tsx`, si `esApp()` y `esMasVieja(...)`, notificación "Hay una versión nueva de la app" con el enlace; agregar ambas variables a `.env.example` con comentario

---

## Phase 8: Polish & Cross-Cutting

- [x] T027 [P] Actualizar `docs/ARQUITECTURA.md` (capa APK, service worker, carpeta `android/`, variables de Vercel), `docs/CLASES.md` (módulo `lib/nativo`) y `docs/PRIVACIDAD.md` (registro de llamadas leído en el teléfono; escáner de Google procesado en el teléfono)
- [x] T028 [P] Actualizar `README.md` (sección "App Android": build en Actions, keystore, instalar el archivo) y `AGENTS.md` (mapa: `android/`, `capacitor.config.ts`, `src/lib/nativo/`)
- [x] T029 Actualizar `docs/HOJA-DE-RUTA.md` y `specs/README.md` con el estado de la 015
- [ ] T030 `npm test`, `npm run lint`, `npm run build` en verde y `quickstart.md` completo en el teléfono del conductor

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T008)** → historias.
- **T004** decide el camino de US1 (service worker); US2–US5 no dependen de T004.
- **US1 y US2** (P1) son el MVP; US2 necesita T005–T007 y una APK instalable (T008 o build local).
- **US3** solo necesita la fase 2; la 005 lo consume después.
- **US4** y **US5** tocan `pantalla.tsx`: hacerlas después de US2 para no chocar en el mismo archivo.
- **Polish** al final.

### Parallel Opportunities

- Fase 2: T005 y T008 a la vez; T006 y T007 juntos (contrato fijo).
- US1: T010 junto con T009 (la prueba define la función esperada).
- US2: T014 y T015 a la vez, antes de T016.
- US3 completa en paralelo con US2 (otros archivos).
- US5: T025 en paralelo con cualquier tarea que no sea de `pantalla.tsx`.

```text
# US2 en paralelo
T014 lib/nativo/llamada.ts   ║   T015 pruebas/nativo-llamada.test.mjs
            └──────────── T016 use-llamada-nativa.ts ── T017/T018 pantalla.tsx ── T019 validar
```

## Implementation Strategy

1. **MVP**: fases 1–2 + US1 + US2 → APK instalada y llamadas de un toque con resultado
   automático (lo que el dueño necesita mientras no hay WhatsApp).
2. **Después**: US4 (pantalla encendida), US3 (escáner, deja lista la 005), US5 (aviso de versión).
3. Cada historia se valida en el teléfono con su paso de `quickstart.md` antes de seguir.
