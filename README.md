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
| `npm test` | 154 pruebas, sin red ni base de datos (~11 s) |
| `npm run test:base` | el esquema de encomiendas contra la base real (solo lectura) |
| `npm run test:esquema` | el esquema completo contra los tipos de `src/types/db.ts` |
| `npm run migrar` | traslado de datos desde el sistema anterior (ver abajo) |

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

## Contacto con el mundo

- **Mapbox** (`NEXT_PUBLIC_MAPBOX_TOKEN`) — mapa, geocodificación y navegación paso
  a paso del conductor. El token es público por diseño: restringirlo por URL en el
  panel de Mapbox.
- **WhatsApp Business** (Meta Cloud API) — el webhook de `/api/whatsapp/webhook`
  está verificado y responde, pero **el envío del aviso al destinatario todavía no
  está implementado**: falta la verificación de negocio en Meta y un token
  permanente.
