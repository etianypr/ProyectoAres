# Mapa de datos en detalle (verificado 2026-11-05)

Léelo cuando el cambio toca una de estas piezas y necesitas saber exactamente qué entra y qué
sale. Si el código cambió, manda el código: actualiza esta tabla o avisa la diferencia.

## Rutas de `src/app/api/` (servidor en Vercel, en tránsito)

| Ruta | Quién entra | Recibe del teléfono | Lo manda a | Guarda |
|---|---|---|---|---|
| `lectura/route.ts` | `conductorDeLaApi()` | `tipo` (`guia`, `etiqueta`), fotos JPEG/PNG/WebP, `revisar` | Anthropic con el SDK (`lib/encomiendas/lectura/servidor.ts`): etiqueta con Haiku (`LECTURA_MODELO`), guía con Opus (`LECTURA_MODELO_GUIA`) | nada |
| `texto/route.ts` | `conductorDeLaApi()` | una foto (`imagen`) | `vision.googleapis.com` (`lectura/vision.ts`), con `GOOGLE_VISION_KEY` o, si está vacía, `GOOGLE_MAPS_KEY` | nada |
| `geocodificar/route.ts` | `conductorDeLaApi()` | `direccion` (POST, máx. 200 caracteres) | `maps.googleapis.com` (`googleDirecto` en `geo/geocoding/google.ts`) | nada |
| `direccion-ia/route.ts` | `conductorDeLaApi()` | la conversación: dirección escrita y lo que contestaron los buscadores, sin nombre ni teléfono | Anthropic (`geo/direccion-ia/servidor.ts`) | nada |
| `whatsapp/send/route.ts` | `conductorDeLaApi()` | `pedidoId`, `fecha`, `nombre` (máx. 60), `telefono`, `cuando` | `graph.facebook.com` (`lib/whatsapp/meta.ts`); en pausa salvo `WHATSAPP_EN_PAUSA=no` | correlación: código opaco, id local del pedido, fecha, estado |
| `whatsapp/status/route.ts` | `conductorDeLaApi()` | — | — | lee y confirma correlaciones propias |
| `whatsapp/webhook/route.ts` | firma HMAC de Meta, sin sesión (`createAdminClient`) | — | — | botón y bloque; **no** guarda `messages[].from` ni texto libre |

Ninguna tiene `console.*` (lo vigila `privacidad.test.mjs`). Todas contestan errores genéricos. El
único `console.*` de `src/` es el de `lib/supabase/sesion-proxy.ts` (variables faltantes, solo en
desarrollo).

## Lo que sale directo del teléfono

| Desde | A | Qué |
|---|---|---|
| `geo/geocoding/mapbox.ts`, `completar-numero.ts` | Mapbox (`api.mapbox.com`, GET) | la dirección escrita o de la guía, en la URL |
| `geo/geocoding/nominatim.ts` | Nominatim (GET) | la dirección |
| `geo/mapbox/acceso.ts` (desde `generar-ruta/ubicar-pedidos.ts`) | Mapbox Tilequery | el punto de la parada |
| `geo/matriz.ts`, `geo/ors/` | OpenRouteService | coordenadas de paradas y partida, sin texto |
| `nativo/mapas.ts` | Google Maps (app, o `www.google.com/maps` en el navegador) | el punto de esa parada |
| `nativo/navegacion.ts` → `NavegacionActivity.java` (APK) | kit de navegación de Google | el punto; el `Waypoint` lleva el título fijo «Parada». OF, nombre y dirección se muestran solo en la franja local |
| `_mapa/` (MapLibre) | OpenFreeMap | trozos de mapa de la zona que se mira |
| `local/enviar.ts` | Supabase | `encomienda_actividad` (`aFila`: id, conductor, fecha, tipo, hora) y `encomienda_jornadas` (`sincronizarDiaTrabajo`) |
| `local/sincronizar-whatsapp.ts` | `/api/whatsapp/*` | nombre y teléfono solo en el `send` |
| `local/lectura-cliente.ts` | `/api/texto` y `/api/lectura` | ver abajo |

**Lectura de fotos hoy** (`lectura-cliente.ts`):
- Etiqueta sin IA: `textoDeLaFoto` → primero `/api/texto` (Cloud Vision) y, si no responde,
  ML Kit (`nativo/telefono.ts`, `textoDeFoto`).
- Etiqueta con IA (hay `ANTHROPIC_API_KEY`, `lecturaIADisponible()`): `/api/lectura` **siempre**,
  en paralelo con el texto, porque solo la IA describe el paquete.
- Guía: todas las fotos juntas a `/api/lectura` (Opus) y cada una a `/api/texto`, como control.
- `nubeApagada` corta `/api/texto` solo ante un 503 (sin ninguna clave). Un 502 (Google
  rechazó) no lo corta: la foto sale en cada intento.
- Con la spec 021, la etiqueta queda solo con ML Kit y el lector Starken. La guía no cambia.

## El teléfono

| Dónde | Qué | Borrado |
|---|---|---|
| IndexedDB `dashund-encomiendas` v5: `pedidos` | el `Pedido` completo (`almacen/tipos.ts`) | `cerrarYBorrarDia`, `borrarDatosDestinatarios`, `salirDelModoPrueba` |
| `rutas` | orden, trazado, partida, inicio y cierre | lo mismo |
| `fotos` (índice `por_fecha`) | foto del paquete, JPEG ≤ 1280 px | al cerrarse el pedido y con el día |
| `cola` | `ActividadPorEnviar`, sin datos de personas | al confirmarlo el servidor; salir del modo prueba la vacía (solo se entra con la cola vacía) |
| `dias` | `ResumenDia`, solo cifras | no se borra |
| `localStorage` | `ares-modo-prueba`, partida (`generar-ruta/partida.ts`), GPS simulado, voz | sin datos de destinatarios |
| Memoria | matriz (`olvidarMatriz()` al borrar); `yaPreguntado` (`completar-numero.ts`) y `accesosRevisados` (`ubicar-pedidos.ts`), hasta recargar la app | no los limpia el cierre del día |
| `public/sw.js` | páginas y estáticos de `/conductor` | nunca `/api`, Supabase ni otros orígenes |
| Registro de llamadas (Android) | `TelefonoPlugin.java` compara los últimos 8 dígitos y devuelve `duracionS`, `tipo` y `fechaMs`, sin número; `nativo/llamada.ts` decide «contestó» (≥ 5 s) | en el pedido queda `llamada`; a la `cola` va un evento `llamada` sin número (`almacen/terreno.ts`) |

Quién dispara cada borrado:
- **Cierre del día:** `_hooks/use-cierre-dia.ts` muestra «No entregados» (`noEntregadosDelDia`) y,
  al confirmar, `cerrarYBorrarDia`. Al abrir otro día, `diasPorBorrar` primero.
- **Sin acceso:** `BorradoLocal` (`src/app/(conductor)/borrado-local.tsx`) solo se monta en
  «Cuenta sin vincular» y «Cuenta desactivada», a las que se llega con una consulta que respondió.
- **Cerrar sesión:** con aviso si hay `cola` sin enviar (spec 007, T012).

## Supabase (Postgres)
- `encomienda_actividad`: id, empresa, conductor, fecha, tipo (`entrega`, `omision`, `llamada`),
  hora, origen; `motivo` heredado sin uso.
- `encomienda_jornadas`: inicio, `cerrada_en`, `asignados` y `contactados` (conteos, 0007).
- `encomienda_whatsapp_correlaciones`: `correlation_id`, `pedido_id_local`, fecha, estado,
  respuesta. Se borra con el cierre, al aplicarse o a las 72 h (cron y trigger).
- `conductores` (nombre, RUT, teléfono, licencia, foto): datos del **conductor**, no de
  destinatarios; la foto va al bucket público `fotos` (`(app)/conductores/foto-uploader.tsx`).
