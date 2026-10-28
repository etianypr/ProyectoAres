# ARES — reparto de encomiendas

App del conductor (APK Android o PWA en el teléfono) + panel de oficina. Next.js 16.4 (App Router) +
Supabase. Producto: `docs/DOCUMENTO-PRINCIPAL.md` · arquitectura: `docs/ARQUITECTURA.md` ·
tipos: `docs/CLASES.md` · plan de trabajo: `docs/HOJA-DE-RUTA.md` y `specs/`.

## Correr

```bash
npm install
cp .env.example .env.local   # completar con el proyecto Supabase
npm run dev
```

En el teléfono hace falta HTTPS (GPS y voz): `npx ngrok http 3000` (`*.ngrok-free.app` ya
permitido en `next.config.ts`).

| Comando | |
|---|---|
| `npm run dev` / `build` / `lint` | desarrollo, build, eslint |
| `npm test` | 660 pruebas sin red ni base (~40 s) |
| `npm run test:base` | esquema de encomiendas contra la base real (solo lectura) |
| `npm run test:esquema` | esquema completo contra `src/types/db.ts` |
| `npm run sondear` | mide proveedores de direcciones con direcciones reales de Arica |
| `npm run calles` | regenera el catálogo de calles de Arica desde OpenStreetMap (spec 016) |
| `npm run mcp` | servidor MCP de datos geoespaciales (`mcp/`) |

## App Android (APK)

La APK (Capacitor, `android/`) abre `https://proyecto-ares-five.vercel.app/conductor`: cada
deploy de Vercel le llega solo. Reinstalar hace falta solo si cambia `android/`; entonces se sube
`APK_VERSION_MINIMA` en Vercel y la app avisa con el enlace de `APK_URL`.

- **Build en GitHub**: tag `apk-v1.2.3` (o Actions → APK → Run workflow). Con los 4 secretos de
  firma sale `ares-<versión>.apk` firmada en el Release; sin ellos, una de depuración. Clave y
  secretos: `specs/015-app-android/quickstart.md`. La clave (`*.keystore`) no va al repositorio
  y hay que respaldarla: firmada con otra, la APK nueva no se instala encima.
- **Instalar**: pasar el archivo al teléfono, abrirlo y permitir "instalar apps desconocidas".
- **Build local** (Windows, JDK 21 + Android SDK 36, `android/local.properties` con
  `sdk.dir=C:/…/Android/Sdk`), contra el servidor local:

  ```powershell
  npm run build; npx next start -p 3000      # dejarlo corriendo
  $env:CAP_SERVER_URL="http://localhost:3000/conductor"; npx cap sync android
  $env:JAVA_HOME="<JDK 21>"; cd android
  & "$env:JAVA_HOME\bin\java.exe" "-Dorg.gradle.appname=gradlew" -jar gradle\wrapper\gradle-wrapper.jar assembleDebug
  adb reverse tcp:3000 tcp:3000; adb install -r app\build\outputs\apk\debug\app-debug.apk
  ```

  Sin `CAP_SERVER_URL` apunta a producción. `gradlew.bat` falla con Java 17 en esta PC; el jar
  del wrapper hace lo mismo. Depurar: `chrome://inspect` con el teléfono por USB; en la app,
  Menú → Diagnóstico muestra los permisos y prueba el escáner.

## Decisiones que no se ven en el código

- **Datos del destinatario solo en el teléfono** (IndexedDB, `src/lib/encomiendas/local/`).
  Al servidor sube solo el hecho: `encomienda_actividad`. Ver `docs/PRIVACIDAD.md`.
- **Plus Code primero**: Arica no tiene numeración confiable (Mapbox acierta la puerta en
  2 de 23 direcciones medidas). Un Plus Code se resuelve sin red (`src/lib/geo/plus-code.ts`);
  se guarda siempre el código completo.
- **"Estoy en la puerta"**: el GPS fija el punto y muestra siempre el error en metros
  (`src/lib/geo/marcar.ts`).
- **El pago se calcula en Postgres** (`private.encomienda_congelar_dia()`); `pago.ts` es
  una copia solo para la vista previa. **Tocar ambas juntas** (`pruebas/base.mjs` lo
  verifica).
- **Un día se valora al cerrar el día**; `pg_cron` cierra a las 00:30 las olvidadas.
  Cada día guarda su tarifa (`regla_*` en `encomienda_pagos`); cambiar la regla no mueve
  días anteriores.
- **Los proveedores cambian sin avisar**: si las direcciones fallan, correr
  `npm run sondear` primero (historia en `pruebas/README.md`).

## Base de datos

Migraciones en orden en el SQL Editor de Supabase; todas re-ejecutables y terminan con un
`select` de verificación (todo `true`). Requieren `pg_cron` y `btree_gist`.

1. `0001_base.sql` — empresa, perfiles/roles, conductores, storage
2. `0002_encomiendas.sql` — encomiendas y cálculo del pago
3. `0003_asistencia_ruta.sql` — motivo de no entrega (heredado, spec 012), bloques horarios, correlaciones WhatsApp
4. `0004_aviso_manana.sql` — botón "Mañana" del aviso (spec 010)
5. `0005_pago_solo_jefe.sql` — recalcular o valorar un día solo con rol de jefe; anon sin acceso

En el proyecto de Supabase están aplicadas las cinco (2026-10-21).

Roles: `admin` (todo), `operador` (todo menos crear cuentas), `conductor` (su ruta y sus
cifras). El primer usuario registrado es admin.

## Proveedores

| Proveedor | Variable | Uso |
|---|---|---|
| Mapbox | `NEXT_PUBLIC_MAPBOX_TOKEN` (pública; restringir por URL) | mapa, direcciones, navegación |
| Google Cloud Vision | `GOOGLE_VISION_KEY` o la misma `GOOGLE_MAPS_KEY` (servidor) | texto de las fotos de etiquetas y guía (el lector de Google Lens, spec 005) |
| Google Geocoding | `GOOGLE_MAPS_KEY` (servidor) | último recurso para ubicar direcciones que Mapbox y OSM no numeran (spec 016) |
| OpenStreetMap / Nominatim | — | segunda opinión de direcciones; catálogo de calles (Overpass, solo al regenerarlo) |
| WhatsApp (Meta Cloud API) | ver `.env.example` | webhook listo; envío pendiente de verificación de negocio y token permanente |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` (servidor) · `ANTHROPIC_WORKSPACE_ID` · `LECTURA_MODELO` | respaldo para leer la foto de la guía o de una etiqueta cuando el teléfono no pudo (spec 005; el teléfono lee primero con ML Kit, gratis); sin clave, texto pegado |
| OpenRouteService | `ORS_API_KEY` (servidor) | solo servidor MCP |

## Notas

- `npm audit`: 5 altas aceptadas (`braces` ≤ 3.0.3 vía `eslint-config-next`; solo lint, sin
  versión corregida). **No** correr `npm audit fix --force` (baja a Next 14).
- Migración desde el sistema anterior ya hecha; scripts y respaldo de flota en el historial:
  `git show 001a468:scripts/migrar-datos.mjs`, `git show 001a468:respaldo/vehiculos-encomiendas.json`.
- Un conductor sin cuenta se invita desde Conductores → "Invitar".
