# Data Model: App Android del conductor (015)

Modelo completo: `docs/CLASES.md`. Esta spec **no agrega tablas ni stores**.

## Teléfono

| Objeto | Campos | Regla |
|---|---|---|
| `Pedido.llamada` (existe) | `pendiente` · `contesto` · `no_contesto` | La detección automática escribe lo mismo que hoy los botones, vía `marcarLlamada` (la primera del día sigue generando el evento `llamada`) |
| `LlamadaEnCurso` (memoria, no se guarda) | `pedidoId`, `numero`, `desdeMs` | Se crea al tocar "Llamar" en la APK; se resuelve al volver a primer plano o se descarta a los 30 min |
| `EntradaRegistro` (la devuelve el plugin, no se guarda) | `duracionS`, `tipo` (`saliente`…), `fechaMs` | Solo salientes al número llamado, posteriores a `desdeMs` |

**Regla de la llamada** (`resultadoDeLlamada`, pura):
1. Se comparan los **últimos 8 dígitos** de los números (con o sin `+56`, espacios o guiones).
2. Se toma la saliente más reciente con `fechaMs ≥ desdeMs − 2 s`.
3. `duracionS ≥ 5` → `contesto`; si no → `no_contesto`.
4. Sin entrada tras 3 intentos (cada 700 ms) → `null`: no se marca y se pregunta como hoy.
5. Ya marcada por el conductor → no se pisa.

## Servidor (Vercel)

| Variable | Ejemplo | Uso |
|---|---|---|
| `APK_VERSION_MINIMA` | `1.0.0` | Si la instalada es menor, aviso con enlace (FR-013); sin variable, no hay aviso |
| `APK_URL` | enlace al Release | Destino del aviso |

## Caché del service worker

`ares-conductor-v1`: respuestas de navegación de `/conductor/**` (red primero) y `/_next/static/*`
(caché primero). Nunca `/api/*`, Supabase ni Mapbox. Se borra al cambiar la versión de la caché.
