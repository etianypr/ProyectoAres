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
| `navegarA(destino, paso?): Promise<"maps" \| "navegador">` | `Burbuja.navegar`: Google Maps navegando, pasando por el punto de paso si lo hay y el interruptor de Diagnóstico está encendido; sin Google Maps, el enlace en el navegador. Con una APK anterior a la 1.14.0 y punto de paso, la web abre el enlace `maps/dir` ella misma | `mapas.ts` (enlace en otra pestaña, con `waypoints`) |

`alRegistrarLlamada` y el evento `llamadaRegistrada` del plugin `Telefono` salieron el
2026-11-06: ya no se lee el registro de llamadas (FR-007).

## Plugin `Burbuja` (Java, `android/`)

| Método | Entrada | Salida |
|---|---|---|
| `permiso` | — | `{ estado: "dado" \| "falta" }` |
| `pedirPermiso` | — | `{ estado: "dado" \| "falta" }` (al volver del ajuste) |
| `mostrar` | `{ vista: VistaBurbuja }` (ver data-model) | `{}`; la primera vez arranca `BurbujaServicio` |
| `terminar` | — | `{}` |
| `enAres` | `{ valor: boolean }` | `{}` |
| `navegar` | `{ lat: number, lng: number, pasos?: { lat, lng }[] }`. Con `pasos` (APK 1.14.0) abre `maps/dir` con `waypoints` y `dir_action=navigate`, con la misma limpieza de tarea; sin ellos, `google.navigation:` | `{ via: "maps" \| "navegador" }` |

| Evento | Datos | Cuándo |
|---|---|---|
| `toque` | `{ id: IdBoton }` | el conductor tocó un botón de la burbuja. Si el botón abre ARES, ARES ya está adelante cuando llega |

- **Visible** solo si: hay vista, hay permiso, ARES no está adelante (`handleOnStop` la muestra,
  `handleOnResume` la oculta) y `enAres` es `false`.
- **Fijos** (los dibuja siempre, no vienen en `filas`): título, detalle, estado, aviso con
  "Deshacer", "Navegar" y "Volver a ARES", y el control para achicar. Desde la APK 1.8.0
  (diseño B, dueño 2026-11-12): el número de parada, la OF y los íconos de Navegar, Volver a
  ARES y Achicar en la cabecera; debajo, `paquete` con `porPagar` y `detalle` en un renglón
  cada uno. Manrope, IBM Plex Mono para la OF e íconos de lucide (`res/font/`,
  `res/drawable/ic_burbuja_*`; licencias en `assets/licencias/`).
- **Desde la APK 1.11.0 (spec 046):** si la vista trae `calle`, la cabecera es la dirección
  (`calle` + `numero`, la calle se corta y el número no) con `nombre` debajo, sin Navegar; debajo,
  la `foto` (miniatura JPEG en base64) con las fichas `of` y `pago`; y, bajo los botones, la barra
  «Siguientes paradas» con `siguientes`. Abierta, la lista reemplaza la tarjeta (estado del
  servicio, se cierra con `nueva`, al achicar y al llamar). Sus toques: `llamar:<id>` y
  `escanear:<id>` (este abre ARES antes de avisar). Sin `calle` (una web anterior), dibuja `titulo`
  y `detalle`.
- **Abre ARES antes de avisar**: `ares`, `escanear`, `telefono`, y `navegar` si la parada no tiene
  punto. `navegar` con punto abre Google Maps desde lo nativo y además avisa (la web no hace nada).
- Dos toques en menos de 600 ms al mismo botón: uno solo.
- `BurbujaServicio`: *foreground service* `specialUse`; aviso fijo "ARES · Parada N" que trae
  ARES al tocarlo; `onTaskRemoved` → se apaga; `START_NOT_STICKY`.
- Permisos del manifiesto: `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_SPECIAL_USE`.

## Sale

- Plugin `Navegacion` y `NavegacionActivity` (spec 019).
- `navegarConGoogle`, `navegandoConGoogle`, `alCambiarNavegacion` (`lib/nativo/navegacion.ts`).
