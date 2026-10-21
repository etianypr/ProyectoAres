# ARES — reparto de encomiendas

App del conductor (PWA en el teléfono) + panel de oficina. Next.js 16.4 (App Router) +
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
| `npm test` | 490 pruebas sin red ni base (~35 s) |
| `npm run test:base` | esquema de encomiendas contra la base real (solo lectura) |
| `npm run test:esquema` | esquema completo contra `src/types/db.ts` |
| `npm run sondear` | mide proveedores de direcciones con direcciones reales de Arica |
| `npm run mcp` | servidor MCP de datos geoespaciales (`mcp/`) |

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

Roles: `admin` (todo), `operador` (todo menos crear cuentas), `chofer` (su ruta y sus
cifras). El primer usuario registrado es admin.

## Proveedores

| Proveedor | Variable | Uso |
|---|---|---|
| Mapbox | `NEXT_PUBLIC_MAPBOX_TOKEN` (pública; restringir por URL) | mapa, direcciones, navegación |
| OpenStreetMap / Nominatim | — | segunda opinión de direcciones |
| WhatsApp (Meta Cloud API) | ver `.env.example` | webhook listo; envío pendiente de verificación de negocio y token permanente |
| OpenRouteService | `ORS_API_KEY` (servidor) | solo servidor MCP |

## Notas

- `npm audit`: 5 altas aceptadas (`braces` ≤ 3.0.3 vía `eslint-config-next`; solo lint, sin
  versión corregida). **No** correr `npm audit fix --force` (baja a Next 14).
- Migración desde el sistema anterior ya hecha; scripts y respaldo de flota en el historial:
  `git show 001a468:scripts/migrar-datos.mjs`, `git show 001a468:respaldo/vehiculos-encomiendas.json`.
- Un conductor sin cuenta se invita desde Conductores → "Invitar".
