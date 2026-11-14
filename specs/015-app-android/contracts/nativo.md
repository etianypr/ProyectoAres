# Contrato: puente web ↔ APK (015)

La web nunca llama al plugin directo: pasa por `src/lib/nativo/`, que en el navegador cae al
comportamiento actual.

## `lib/nativo` (TypeScript, lo usa la app)

| Función | En la APK | En el navegador |
|---|---|---|
| `esApp(): boolean` | `true` | `false` |
| `versionInstalada(): Promise<string \| null>` | `App.getInfo().version` | `null` |
| `llamar(numero): Promise<"directa" \| "marcador">` | `Telefono.llamar` (pide `CALL_PHONE` la 1.ª vez); sin permiso → `tel:` | abre `tel:` |
| `pantallaEncendida(on): Promise<void>` | `Telefono.pantallaEncendida` | nada (en el navegador lo hace `use-pantalla-encendida.ts` con Screen Wake Lock) |
| `textoDeFoto(foto: Blob): Promise<string \| null>` | `Telefono.leerTexto` (ML Kit, modelo latino dentro de la APK; sin red) | `null` (la 005 sigue con la IA o el texto pegado) |
| `escanearCodigo(): Promise<string \| null>` | ML Kit `scan()` (Code 128, ITF); instala el módulo de Google si falta | `null` (la 005 ofrece escribirlo o suma un lector web) |
| `resultadoDeLlamada(entradas, desdeMs)` | pura: ver data-model (el plugin ya filtró por número) | pura |
| Burbuja sobre Google Maps y `navegarA` (spec 020) | plugin `Burbuja`: [`specs/020-burbuja-google-maps/contracts/burbuja.md`](../../020-burbuja-google-maps/contracts/burbuja.md) | Google Maps por enlace (`mapas.ts`) |

## Plugin `Telefono` (Java, `android/`)

| Método | Entrada | Salida | Permiso |
|---|---|---|---|
| `llamar` | `{ numero: string, altavoz?: boolean }` (`altavoz`: desde la APK 1.8.1, la llamada parte en altavoz; Menú → Accesibilidad) | `{}` | `CALL_PHONE` |
| `pantallaEncendida` | `{ encendida: boolean }` | `{}` | — |
| `leerTexto` | `{ imagen: string }` (JPEG en base64) | `{ texto: string }` (renglones en orden de lectura) | — |
| `checkPermissions` | — | `{ llamadas, ubicacion }` (`granted` · `denied` · `prompt`); `ubicacion` = `ACCESS_FINE_LOCATION`, solo para el diagnóstico (el WebView no trae `navigator.permissions`) | — |

La voz de manejo (`hablar`, `callar`) y el plugin `Navegacion` con el kit de Google (spec 019)
salieron con la spec 020: ARES ya no guía.
El 2026-11-06 salió también el registro de llamadas (`llamadasDesde`, `READ_CALL_LOG`): ya no
se detecta si contestó (spec 020, FR-007).

- Errores: `"permiso_denegado"` · `"sin_soporte"`; la web los trata como "sin APK".
