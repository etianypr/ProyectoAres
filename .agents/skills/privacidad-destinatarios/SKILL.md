---
name: privacidad-destinatarios
description: Úsala cuando un cambio en ARES pueda mover datos de destinatarios (nombre, teléfono, dirección, OF, fotos) — agregar o cambiar un proveedor o una ruta de src/app/api/, mandar algo nuevo al servidor o a Supabase, escribir logs o mensajes de error, tocar el borrado del día o el cierre de sesión, agregar un store de IndexedDB, escribir pruebas o fixtures con datos de personas, preparar un commit — o cuando se hable de la Ley 21.719, docs/PRIVACIDAD.md, subencargados o Dashund como encargado de Starken. Trae el mapa de datos verificado contra el código, checklists por tipo de cambio y los hallazgos abiertos.
---

# Privacidad de los destinatarios en ARES

Las reglas vienen de `AGENTS.md` («Datos de destinatarios», «Proveedores y ley»), de la
constitución (principio V) y de `docs/PRIVACIDAD.md`. Si este archivo y esos documentos no
coinciden, valen ellos, y hay que avisar la diferencia.

## El marco (solo lo que dicen los docs del repo)
- Los datos de destinatarios son de **Starken** (responsable). Dashund es **encargado**: los trata
  solo por cuenta de Starken y para repartir (Ley 21.719, art. 15 bis, según `docs/PRIVACIDAD.md`
  §1 y la constitución V). Los datos de los conductores son otra cosa: ahí el negocio es responsable.
- Todo proveedor que reciba datos de destinatarios es subencargado y figura en
  `docs/PRIVACIDAD.md` §3. En desarrollo y piloto se puede usar; antes del lanzamiento oficial
  necesita autorización escrita de Starken (§6). **Lo legal no frena el desarrollo.**
- Desde ya rigen: borrado diario, mínimos campos y nada de destinatarios en el servidor.
- Nada legal se inventa: ni artículos, ni plazos, ni obligaciones. Si algo no está en esos tres
  documentos, se anota como duda para el dueño.

## Lo que nunca se hace (y por qué)
- **Datos de destinatarios en el servidor.** Al servidor sube solo el hecho
  (`encomienda_actividad`: quién, qué día, qué tipo y a qué hora). *Por qué:* así la base no es un
  registro de personas, la exposición máxima es el día en curso del teléfono y un reclamo se
  deriva a Starken (`docs/PRIVACIDAD.md` §5).
- **Datos de destinatarios en logs.** Ni `console.*` en el servidor, ni mensajes de error que
  repitan el cuerpo. *Por qué:* los logs de Vercel guardan lo que se imprime y no se borran con el día.
- **Datos reales en el repo** (código, comentarios, docs, specs, pruebas, fixtures, mensajes de
  commit). *Por qué:* el historial de git no se borra; ya se bloqueó un commit con la dirección
  real de un cliente (2026-10-28, `MEMORY.md`).
- **Un proveedor nuevo sin registrarlo** en `docs/PRIVACIDAD.md` §3. *Por qué:* Starken tiene que
  autorizar cada subencargado antes del lanzamiento, y A10 falla.
- **Borrar ante un error de red, o tocar la `cola`.** *Por qué:* el proxy también manda a `/login`
  cuando Supabase no responde, y borrar ahí dejaba al conductor sin ruta en plena calle (spec 007,
  research R3). La `cola` no tiene datos de personas y sin ella el conductor no cobra.
- **Arrastrar pedidos al día siguiente.** Un pedido es de un solo día (spec 009): lo no entregado
  se borra con el día y, si vuelve, se escanea de nuevo.
- **Usar el bucket `fotos` de Supabase para fotos de paquetes.** Es **público** y guarda la foto de
  perfil del conductor (`0001_base.sql`). Las fotos de paquetes viven en el store `fotos` del
  teléfono: mismo nombre, otro mundo.

## Mapa de datos (verificado contra el código, 2026-11-05)
Detalle por archivo, ruta de API y proveedor: [references/mapa-de-datos.md](references/mapa-de-datos.md).

| Dato | Dónde vive | Quién más lo recibe | Se borra |
|---|---|---|---|
| Nombre, teléfono, dirección, coordenadas, notas, OF, POR PAGAR y monto, referencia, llamada y resultado | store `pedidos` | dirección: Nominatim (directo), Google Geocoding (`/api/geocodificar`, toda dirección con número desde la spec 019), Anthropic (`/api/direccion-ia`, sin nombre ni teléfono) · nombre y teléfono: Meta (`/api/whatsapp/send`, **en pausa**) | al cerrar el día, al cerrar sesión, con la cuenta desactivada y al salir del modo prueba |
| Coordenadas de las paradas y de la partida | `pedidos`, `rutas`, matriz en memoria | ORS (matriz y trazado), OpenFreeMap (solo la zona de ~2 km de cada parada, para ver sus calles), Google Maps (app o enlace) y el kit de navegación de Google (APK) | con el día; la matriz con `olvidarMatriz()` |
| Foto de la etiqueta | memoria; la del paquete, store `fotos` | solo ML Kit (en el teléfono) desde la 021; en `main`, hasta el merge, también Cloud Vision y Anthropic Haiku | al cerrarse el pedido y con el día |
| Foto de la guía (OF y destino) | memoria | ML Kit · Cloud Vision · Anthropic Opus | no se guarda |
| Registro de llamadas de Android | Android | nadie: `TelefonoPlugin.java` filtra por los últimos 8 dígitos y devuelve duración, tipo y hora, sin el número | en el pedido queda solo `llamada` |
| `ActividadPorEnviar` (id, conductor, día, tipo, hora) | store `cola` | Supabase `encomienda_actividad` (`enviar.ts`, `aFila`) | al confirmarlo el servidor |
| Inicio, cierre, `asignados`, `contactados` | `rutas`/`dias` | Supabase `encomienda_jornadas` | no (son cifras) |
| `ResumenDia` | store `dias` | nadie | no (solo cifras) |
| Correlación del aviso (código opaco, id local del pedido) | Supabase `encomienda_whatsapp_correlaciones` | Meta ve solo el código | al cierre, al aplicarse o a las 72 h |

No reciben datos de destinatarios: Supabase (solo hechos, cifras y la correlación), OpenFreeMap, el
escáner de Google y el lector de texto de la APK (ML Kit), el `localStorage` (modo prueba, partida,
GPS simulado, voz) y `public/sw.js` (nunca guarda `/api` ni otros orígenes).

## Checklists por tipo de cambio
**Proveedor nuevo, o un dato nuevo a uno que ya está**
- [ ] Preguntar antes al dueño: costo, tope y qué datos recibe (`AGENTS.md`, «Límites»).
- [ ] Mínimo necesario: coordenadas antes que dirección, y dirección sin nombre ni teléfono.
- [ ] Fila en `docs/PRIVACIDAD.md` §3: qué recibe, desde dónde (teléfono o servidor en tránsito),
      país, retención y autorización `pendiente`. Lo que no se sabe va «a verificar», no se inventa.
- [ ] Si el código lleva el `https://host` literal: sumarlo a `PROVEEDORES` en
      `pruebas/arquitectura.test.mjs` con el nombre exacto de la fila. Si va por SDK (como
      Anthropic), A10 no lo ve: el registro es a mano.
- [ ] Clave solo en el servidor (`import "server-only"` y la lista `SERVER_ONLY` de A5).
- [ ] Diagrama de `docs/ARQUITECTURA.md` §1 en el mismo cambio.
- [ ] Prueba con doble de `fetch` que afirme qué sale y qué **no** sale (modelo:
      `whatsapp-contract`, «NO sale la dirección ni las coordenadas del pedido»).

**Ruta de API nueva o cambiada (`src/app/api/`)**
- [ ] `conductorDeLaApi()` primero. La única sin sesión es el webhook de Meta, con firma HMAC.
- [ ] Datos de personas en el cuerpo de un POST, nunca en la URL (la URL queda en los logs).
- [ ] Sin `console.*`, tampoco en el `lib/**/servidor.ts` que llama (la prueba no lo mira).
- [ ] Errores genéricos, sin eco del cuerpo ni del error del proveedor.
- [ ] Nada se persiste: ni Supabase, ni archivos, ni caché. Cabecera: «pasa en tránsito: no se
      guarda ni se registra» y la spec que la pidió. Entrada con tope (`.slice`).
- [ ] La ruta figura en `ARQUITECTURA.md` §1 y §4, y en la columna «Desde» de `PRIVACIDAD.md` §3.

**Algo nuevo que sube a Supabase**
- [ ] Solo hechos y cifras. Ninguna columna `nombre|telefono|direccion|of|destinatario*` en
      `encomienda_*` (`privacidad.test.mjs` lo revisa), ni en otra tabla aunque la prueba no la mire.
- [ ] Ni con hash: guardar el teléfono, aunque sea hasheado, convierte la tabla en un registro de
      destinatarios (`docs/WHATSAPP.md`, «Diseño»). Para cruzar, un código opaco aleatorio.
- [ ] Migración: preguntar antes (hay un solo proyecto y es producción).

**Store nuevo, o un dato de personas en otro lugar del teléfono**
- [ ] Sumarlo a `STORES_DEL_DIA` (`idb.ts`), en la siguiente versión libre (v6), con prueba en
      `idb-version.test.mjs`. Detalle: skill `base-local-idb`.
- [ ] **Ojo:** `STORES_DEL_DIA` solo alcanza al vaciado entero (`borrarDatosDestinatarios`,
      `salirDelModoPrueba`). `cerrarYBorrarDia` borra por fecha, clave por clave: el store nuevo
      necesita un índice por fecha y su borrado explícito ahí, o el cierre del día lo deja vivo.
- [ ] Llenarlo en `privacidad.test.mjs` y comprobar que el cierre y la sesión lo dejan vacío.
- [ ] Nunca en `cola`, `dias` ni `localStorage`. Un campo nuevo de `Pedido` se borra con el pedido;
      revisar que no se copie a `ResumenDia` ni a `ActividadPorEnviar`.

**Pruebas, fixtures, docs y specs**
- [ ] Inventados: `+56912345678`, «Destinatario 1», una calle real de Arica con número inventado
      (`Avenida Diego Portales 1111`). Nunca una guía o etiqueta real, ni una captura con datos.
- [ ] Etiquetas solo como texto anonimizado (spec 021: T002 y «Copiar anonimizado», T008–T009).
- [ ] Una respuesta real de un proveedor se recorta y se revisa: que no traiga la consulta de un
      cliente. El proveedor se sustituye reemplazando el `fetch` global; ninguna prueba sale a la red.

**Commit** (preguntar antes, siempre)
- [ ] Leer el diff y el mensaje. El hook `.claude/hooks/revisar-commit.mjs` avisa teléfonos
      móviles con 56, RUT con puntos, correos, `.env*`, `*.keystore`/`*.jks`, `MEMORY.md` y fotos en
      `pruebas/` o `specs/`. **No ve** direcciones, nombres, OF ni fijos, y pide confirmación en vez
      de bloquear. Límites: [references/verificacion.md](references/verificacion.md).

## Cómo se verifica
- Rápido: `node --import ./pruebas/registrar.mjs --test pruebas/privacidad.test.mjs pruebas/arquitectura.test.mjs`
- Según lo tocado: `4-envio` (columnas exactas de `encomienda_actividad`), `whatsapp-contract`,
  `lectura-servidor`, `vision`, `modo-prueba`, `idb-version`, `nativo-llamada`, `asistencia-local`.
- Siempre: `npm test`, `npm run lint` y `npm run build`. Privacidad lleva pruebas enfocadas
  nuevas (constitución III).
- Qué cubre cada una y qué no: [references/verificacion.md](references/verificacion.md).

## Hallazgos abiertos y pendientes
- **Respaldo de Android** (`MEMORY.md`): `android:allowBackup="true"` sin reglas de exclusión en
  `android/app/src/main/AndroidManifest.xml`. Puede copiar la IndexedDB a la cuenta de Google del
  conductor, y no figura en `PRIVACIDAD.md`. Arreglarlo toca `android/`: preguntar (skills
  `apk-local` y `capacitor-security`).
- **Cloud Vision recibe la foto aunque esté «apagada»** (nuevo, 2026-11-05): con
  `GOOGLE_VISION_KEY` vacía, `vision.ts` usa `GOOGLE_MAPS_KEY`. Si Vision está apagada en esa
  clave, la foto igual viaja a `vision.googleapis.com` y vuelve con error (502), y
  `lectura-cliente.ts` solo deja de intentarlo con un 503 (`nubeApagada`).
- **Anthropic recibía todas las etiquetas** si hay `ANTHROPIC_API_KEY`: resuelto en la rama 021
  (2026-11-07, falta el merge). La guía (OF y destino) sigue yendo a Anthropic y a Vision por decisión
  del dueño: «en la guía de despacho no sale datos personales». Regla en `AGENTS.md`.
- **El modo prueba no corta a los proveedores:** no va nada a la base ni por WhatsApp, pero las
  fotos y direcciones salen igual. Probar con guías reales manda datos reales (skill
  `recorrer-conductor`).
- **Google Geocoding** recibe toda dirección con número desde la spec 019 (antes solo las que
  Mapbox y OSM no ubicaban): el tope diario de la consola lo pone el dueño (019 T012).
- **Spec 007 sin terminar:** modo piloto/oficial, `PROVEEDORES` en `config.ts`,
  `proveedorHabilitado()` y `validarPlantilla()` (T003, T004, T013, T016–T018, T020).
- **Spec 026:** la WebView puede desalojar la IndexedDB por falta de espacio (es pérdida de
  la `cola`, no fuga). Lista para el lanzamiento: `PRIVACIDAD.md` §6 (dueño y abogado).

## Docs que hoy no calzan con el código
- `AGENTS.md` dice que Cloud Vision está apagada y que el kit de navegación se fue. En `main`,
  cada foto pasa por `/api/texto`, y `nativo/navegacion.ts` con `NavegacionActivity` siguen
  (la 020 los saca, en su rama). `PRIVACIDAD.md` §3 los da «en uso» a los dos.
- `ARQUITECTURA.md` §1: «foto que el teléfono no pudo leer → api/lectura». Hoy, con IA, van todas.
  §2 «Borrado» omite `fotos`. §4 no lista `api/direccion-ia`.
- `PRIVACIDAD.md` §3 no tiene a Vercel, que recibe en tránsito fotos, direcciones y nombre con
  teléfono por `/api/*`. Solo aparece en §6.5 (logs del hosting). Es duda para el dueño.
- `idb.ts` habla de un store de lecturas de la 005 que no existe (igual que `lecturasPendientes`
  en el `data-model.md` de la 007), y dice que los pedidos entregados «se conservan como
  historial»: se borran con el día.
- La 007 ubica `PROVEEDORES` en `lib/encomiendas/config.ts`: hoy solo existe en la prueba A10.
- `pruebas/README.md` y `scripts/sondear-proveedores.mjs` llaman «reales» a algunas
  direcciones de prueba. `AGENTS.md` pide números inventados: el dueño confirma si eran de clientes.
