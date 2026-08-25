# Ares — gestión de encomiendas

Sistema de reparto de encomiendas: la app del conductor en el teléfono y el panel
de la oficina para liquidar. Next.js 16 (App Router) + Supabase.

Salió del sistema de gestión general de Transportes Pucarani, del que se quedó
solo con encomiendas. Lo que no está —cotizaciones, viajes, facturas, taxis,
flota, SII— no está pendiente de portar: es de la otra empresa.

## Correr

```bash
npm install
cp .env.example .env.local     # y completar con el proyecto Supabase de ares
npm run dev
```

Sin `.env.local` la app arranca pero no puede leer nada: todas las pantallas
muestran el error de datos.

Para probar la app del conductor **desde el teléfono** hace falta HTTPS —el GPS y
la síntesis de voz no funcionan sobre HTTP— así que se usa un túnel:

```bash
npx ngrok http 3000
```

El dominio `*.ngrok-free.app` ya está permitido en `next.config.ts`.

## Comandos

| | |
| --- | --- |
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción |
| `npm run lint` | eslint |
| `npm test` | 486 pruebas, sin red ni base de datos (~34 s) |
| `npm run test:base` | el esquema de encomiendas contra la base real (solo lectura) |
| `npm run test:esquema` | el esquema completo contra los tipos de `src/types/db.ts` |
| `npm run sondear` | mide los proveedores de direcciones contra direcciones reales de Arica |
| `npm run mcp` | el servidor MCP de datos geoespaciales (ver `mcp/`) |
| `npm run migrar` | traslado de datos desde el sistema anterior (ver abajo) |
| `npm run respaldo` | guarda la flota de reparto en `respaldo/` (solo lectura) |

## Cómo está armado

Dos grupos de rutas que **no comparten layout**, a propósito:

- **`src/app/(app)`** — el panel de la oficina, con sidebar. `/` redirige a
  `/encomiendas`, que es el inicio real: el reparto es el único negocio.
- **`src/app/(conductor)`** — la app del conductor, mobile-first e instalable
  desde el teléfono ("Agregar a inicio"). El manifest tiene `scope: "/conductor"`,
  así que cualquier herramienta nueva del conductor debe vivir bajo ese prefijo.

**Los datos del destinatario nunca llegan al servidor.** Nombre, teléfono,
dirección y el orden de la ruta viven en el teléfono del conductor (IndexedDB,
`src/lib/encomiendas/local/`). Al servidor sube solo el HECHO de que la entrega
ocurrió: `encomienda_actividad`. Es una decisión de diseño, no una limitación —
son datos personales de clientes del mandante que esta empresa no necesita
custodiar (Ley 21.719).

**El campo de dirección acepta un Plus Code**, y es el atajo al problema de fondo
de Arica: acá las casas no tienen numeración estructurada, y está medido — de 23
direcciones reales, Mapbox tiene la puerta exacta en 2 y estima el resto
(`npm run sondear`). Un código como `57HFGMCP+MX` —o el corto `GMCP+MX`, que es
como se dicta por teléfono— se resuelve con **aritmética**: sin red, sin API key,
sin límite de consultas y en menos de un milisegundo. Se guarda siempre el código
completo, porque el corto no significa nada sin saber desde dónde se leyó. Vive
en `src/lib/geo/plus-code.ts` y corta antes que Mapbox y OSM en los tres caminos
de entrada de `lib/geocoding.ts`.

**Y cuando ningún mapa sabe, sabe el conductor.** Debajo del campo de dirección
hay un **«Estoy en la puerta»**: toma el GPS, traduce el radio de error a una de
tres frases —la puerta, la cuadra, o dudosa— y **muestra siempre los metros**,
porque el GPS nunca dice "no sé" y guardar ±80 m como si fuera la puerta sería
el mismo error que veníamos arreglando, con la firma del conductor encima.
Guardar lo decide él. De regalo deja el Plus Code de esa casa, para anotarlo en
el paquete y no volver a buscarla nunca. La lógica está en `src/lib/geo/marcar.ts`
—fuera del componente, para poder probarla— y la pantalla en `marcar-aqui.tsx`.

**La cuenta del pago vive en Postgres**, no en la app: el teléfono escribe directo
contra la base, así que en ese momento no hay TypeScript que pueda correr. Está en
`private.encomienda_congelar_dia()` (`supabase/migrations/0002_encomiendas.sql`).
`src/lib/encomiendas/pago.ts` tiene la misma aritmética en TS **solo** para la
vista previa de "Agregar día". **Son dos copias y hay que tocarlas juntas** —
`pruebas/base.mjs` comprueba que sigan dando lo mismo.

**Un día se valora al CERRAR la jornada**, no a cada entrega. Mientras
`encomienda_jornadas.cerrada_en` sea null el día no tiene cifras. Un trabajo de
`pg_cron` cierra a las 00:30 (hora de Chile) las jornadas que nadie cerró; sin él,
el día que el conductor se olvidó de terminar no se pagaría nunca.

**Cada día conserva la tarifa con la que se calculó** (las columnas `regla_*` de
`encomienda_pagos`). Cambiar la regla de pago rige hacia adelante y no mueve nada
de lo ya registrado. Para mover un día hay que pedirlo explícitamente, de a uno.

## Base de datos

Dos migraciones, en orden, en el SQL Editor de Supabase:

1. `supabase/migrations/0001_base.sql` — empresa, perfiles/roles, conductores, storage
2. `supabase/migrations/0002_encomiendas.sql` — todo lo de encomiendas y la cuenta del pago

Las dos son re-ejecutables y terminan con un `select` de verificación: todas las
columnas tienen que dar `true`.

Requieren las extensiones `pg_cron` y `btree_gist`. Se activan solas; si alguna
falla, se prende a mano en Database → Extensions y se vuelve a correr el archivo.

Roles: `admin` (todo, incluido invitar conductores), `operador` (todo menos crear
cuentas), `chofer` (su ruta y sus propias cifras, nada más). El primer usuario que
se registre queda como admin.

## Traer los datos del sistema anterior

Una sola vez, cuando la base de ares ya tiene las dos migraciones corridas:

```bash
cp .env.migracion.example .env.migracion   # y completar las 4 credenciales
npm run migrar                             # ENSAYO: no escribe, solo informa
npm run migrar -- --aplicar                # de verdad
```

Compara cifra por cifra al terminar. Dos cosas que **no** trae, y que hay que
hacer a mano después:

- **Las cuentas de acceso de los conductores.** No se mueven entre proyectos de
  Supabase. Llegan con su ficha y su correo pero sin cuenta: hay que invitarlos de
  nuevo desde Conductores → "Invitar". Sin eso no pueden salir a repartir.
- **Los datos de la empresa** (nombre, RUT, dirección). Se cargan en Configuración.

### La flota quedó en archivos, no en la base

`npm run respaldo` (solo `ORIGEN_*`, solo lectura) guarda en `respaldo/` la ficha de
la camioneta de reparto y sus gastos, en JSON y CSV.

Va aparte del traslado normal porque **ares no gestiona flota**: no hay tabla de
vehículos ni pantalla que los muestre, así que no había dónde ponerlos. En vez de
levantar un módulo entero por una patente, el dato se guarda tal cual antes de
perder el acceso a la base anterior. Si algún día hace falta, ahí está.

Ya corrido: `VKPW-81`, Daihatsu Hijet 2016, 133.000 km, sin gastos imputados.

Clientes no se trajo ninguno, y no es un olvido: en la base anterior había **un
solo cliente** y era de la operación portuaria, no del reparto. El mandante de
encomiendas nunca estuvo cargado como cliente.

## Contacto con el mundo

- **Mapbox** (`NEXT_PUBLIC_MAPBOX_TOKEN`) — mapa, geocodificación y navegación paso
  a paso del conductor. El token es público por diseño: restringirlo por URL en el
  panel de Mapbox.
- **WhatsApp Business** (Meta Cloud API) — el webhook de `/api/whatsapp/webhook`
  está verificado y responde, pero **el envío del aviso al destinatario todavía no
  está implementado**: falta la verificación de negocio en Meta y un token
  permanente.
- **OpenStreetMap / Nominatim** — segunda opinión sobre las direcciones. Aporta
  los puntos de interés y los nombres de población que Mapbox no tiene, y es lo
  único donde una corrección que haga la empresa aparece en minutos.
- **OpenRouteService** (`ORS_API_KEY`, opcional) — trazado por calles abierto,
  solo para el servidor MCP. **Sin** prefijo `NEXT_PUBLIC_`: esta clave no sale
  al teléfono. La cuenta gratuita se saca en openrouteservice.org; sin ella el
  resto del sistema funciona igual, solo se apaga `get_route_ch`.

### Los proveedores cambian sin avisar

Ya pasó y salió caro: Mapbox recalibró su `match_code`, `lib/geocoding.ts`
decidía con el campo que cambió, y **ningún pedido entró a una ruta** hasta que
se arregló — con las 422 pruebas de entonces en verde, porque los fixtures eran
más viejos que el cambio. La historia completa está en `pruebas/README.md`.

Si el geocodificador se siente raro, lo primero es `npm run sondear`: mide los
tres proveedores contra direcciones reales de Arica y saca la tabla de aciertos.
