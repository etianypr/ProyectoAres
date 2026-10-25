# Contrato: puente web ↔ APK (015)

La web nunca llama al plugin directo: pasa por `src/lib/nativo/`, que en el navegador cae al
comportamiento actual.

## `lib/nativo` (TypeScript, lo usa la app)

| Función | En la APK | En el navegador |
|---|---|---|
| `esApp(): boolean` | `true` | `false` |
| `versionInstalada(): Promise<string \| null>` | `App.getInfo().version` | `null` |
| `llamar(numero): Promise<"directa" \| "marcador">` | `Telefono.llamar` (pide `CALL_PHONE` la 1.ª vez); sin permiso → `tel:` | abre `tel:` |
| `llamadasDesde(numero, desdeMs): Promise<EntradaRegistro[] \| null>` | `Telefono.llamadasDesde` (pide `READ_CALL_LOG`); sin permiso → `null` | `null` |
| `pantallaEncendida(on): Promise<void>` | `Telefono.pantallaEncendida` | nada (en el navegador lo hace `use-pantalla-encendida.ts` con Screen Wake Lock) |
| `textoDeFoto(foto: Blob): Promise<string \| null>` | `Telefono.leerTexto` (ML Kit, modelo latino dentro de la APK; sin red) | `null` (la 005 sigue con la IA o el texto pegado) |
| `escanearCodigo(): Promise<string \| null>` | ML Kit `scan()` (Code 128, ITF); instala el módulo de Google si falta | `null` (la 005 ofrece escribirlo o suma un lector web) |
| `resultadoDeLlamada(entradas, desdeMs)` | pura: ver data-model (el plugin ya filtró por número) | pura |

## Plugin `Telefono` (Java, `android/`)

| Método | Entrada | Salida | Permiso |
|---|---|---|---|
| `llamar` | `{ numero: string }` | `{}` | `CALL_PHONE` |
| `llamadasDesde` | `{ numero: string, desdeMs: number }` | `{ llamadas: { duracionS: number, tipo: "saliente" \| "entrante" \| "perdida" \| "otra", fechaMs: number }[] }` (solo ese número, máx. 5, más recientes primero) | `READ_CALL_LOG` |
| `pantallaEncendida` | `{ encendida: boolean }` | `{}` | — |
| `leerTexto` | `{ imagen: string }` (JPEG en base64) | `{ texto: string }` (renglones en orden de lectura) | — |
| `checkPermissions` | — | `{ llamadas, registro, ubicacion }` (`granted` · `denied` · `prompt`); `ubicacion` = `ACCESS_FINE_LOCATION`, solo para el diagnóstico (el WebView no trae `navigator.permissions`) | — |

- El plugin filtra por número en el teléfono y **no devuelve otros números** del registro.
- Errores: `"permiso_denegado"` · `"sin_soporte"`; la web los trata como "sin APK".
