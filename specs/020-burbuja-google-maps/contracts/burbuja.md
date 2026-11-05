# Contrato: burbuja (020)

Reemplaza la sección "Plugin `Navegacion`" de `specs/015-app-android/contracts/nativo.md`, que
sale con el kit. Como siempre, la web no llama al plugin directo: pasa por `src/lib/nativo/`, que
fuera de la APK cae al comportamiento de hoy.

## `lib/nativo/burbuja.ts` (TypeScript, lo usa la app)

| Función | En la APK | En el navegador / APK vieja |
|---|---|---|
| `permisoBurbuja(): Promise<"dado" \| "falta" \| "no_disponible">` | `Burbuja.permiso()` (`Settings.canDrawOverlays`) | `"no_disponible"` |
| `pedirPermisoBurbuja(): Promise<boolean>` | abre "Mostrar sobre otras apps" de ARES; resuelve al volver con si quedó dado | `false` |
| `iniciarBurbuja(vista)` · `actualizarBurbuja(vista)` | arranca el servicio con su aviso fijo / redibuja | nada |
| `terminarBurbuja()` | quita la burbuja y apaga el servicio | nada |
| `burbujaEnAres(valor: boolean)` | `true` mientras ARES abre una pantalla suya (escáner, cámara): no aparece encima | nada |
| `alTocarBurbuja(cb: (id: IdBoton) => void): () => void` | evento `toque` | nunca llama |
| `navegarA(destino): Promise<"maps" \| "navegador">` | `Burbuja.navegar`: Google Maps navegando; sin Google Maps, el enlace en el navegador | `mapas.ts` (enlace en otra pestaña) |

`lib/nativo/telefono.ts` suma `alRegistrarLlamada(cb): () => void` (evento `llamadaRegistrada`
del plugin `Telefono`, ver abajo). Fuera de la APK nunca llama.

## Plugin `Burbuja` (Java, `android/`)

| Método | Entrada | Salida |
|---|---|---|
| `permiso` | — | `{ estado: "dado" \| "falta" }` |
| `pedirPermiso` | — | `{ estado: "dado" \| "falta" }` (al volver del ajuste) |
| `mostrar` | `{ vista: VistaBurbuja }` (ver data-model) | `{}`; la primera vez arranca `BurbujaServicio` |
| `terminar` | — | `{}` |
| `enAres` | `{ valor: boolean }` | `{}` |
| `navegar` | `{ lat: number, lng: number }` | `{ via: "maps" \| "navegador" }` |

| Evento | Datos | Cuándo |
|---|---|---|
| `toque` | `{ id: IdBoton }` | el conductor tocó un botón de la burbuja. Si el botón abre ARES, ARES ya está adelante cuando llega |

- **Visible** solo si: hay vista, hay permiso, ARES no está adelante (`handleOnStop` la muestra,
  `handleOnResume` la oculta) y `enAres` es `false`.
- **Fijos** (los dibuja siempre, no vienen en `filas`): título, detalle, estado, aviso con
  "Deshacer", "Navegar" y "Volver a ARES", y el control para achicar.
- **Abre ARES antes de avisar**: `ares`, `escanear`, `telefono`, y `navegar` si la parada no tiene
  punto. `navegar` con punto abre Google Maps desde lo nativo y además avisa (la web no hace nada).
- Dos toques en menos de 600 ms al mismo botón: uno solo.
- `BurbujaServicio`: *foreground service* `specialUse`; aviso fijo "ARES · Parada N" que trae
  ARES al tocarlo; `onTaskRemoved` → se apaga; `START_NOT_STICKY`.
- Permisos del manifiesto: `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_SPECIAL_USE`.

## Plugin `Telefono`: evento nuevo

| Evento | Datos | Cuándo |
|---|---|---|
| `llamadaRegistrada` | `{}` | después de un `llamar` directo, la primera vez que cambia el registro de llamadas (Android escribe la llamada al colgar). Se deja de observar ahí o a los 30 minutos |

`llamadasDesde` no cambia: la web la consulta al recibir el evento, igual que al volver a primer
plano.

## Sale

- Plugin `Navegacion` y `NavegacionActivity` (spec 019).
- `navegarConGoogle`, `navegandoConGoogle`, `alCambiarNavegacion` (`lib/nativo/navegacion.ts`).
