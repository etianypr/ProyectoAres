# Data Model: renombrado `chofer` → `conductor`

No agrega ni quita datos; cambia nombres. Modelo completo: `docs/ARQUITECTURA.md` §2 y
`docs/CLASES.md`.

## Postgres: mapa de nombres

| Tipo | Actual | Nuevo |
|---|---|---|
| tabla | `choferes` | `conductores` |
| columna | `chofer_id` (actividad, días, pagos, whatsapp_correlaciones) | `conductor_id` |
| enum | `rol_usuario.chofer` | `conductor` |
| índices | `choferes_rut_unico`, `choferes_email_unico`, `idx_choferes_user`, `idx_encomienda_actividad_chofer_fecha` | `conductores_*`, `idx_conductores_user`, `idx_encomienda_actividad_conductor_fecha` |
| triggers | `trg_choferes_empresa`, `trg_choferes_updated` | `trg_conductores_*` |
| policies | `choferes_*`, `encomienda_*_chofer_*` | `conductores_*`, `encomienda_*_conductor_*` |
| restricciones únicas generadas | `…_chofer_id_fecha_key` | se buscan en `pg_constraint` y se renombran |
| RPC | `encomienda_repreciar_dia(p_chofer_id, …)`, `encomienda_valorar_dia(p_chofer_id, …)` | `p_conductor_id` |
| funciones internas | 10 (research R5) | mismo nombre, cuerpo nuevo |

## Orden de la migración (siguiente número libre)

1. `begin;` → 2. tabla → 3. columnas → 4. valor del enum (guarda en `pg_enum`) →
5. índices, triggers, restricciones, policies → 6. `drop`/`create` de las 2 RPC + `grant` →
7. `create or replace` de las 10 funciones → 8. `commit;` → 9. `select` de verificación
(nombres nuevos existen, viejos no, policies leen el rol nuevo). Cada paso idempotente.

## Invariantes (antes = después)

`count(*)` por tabla · `sum(pago_total)` y `sum(pedidos_entregados)` por `fecha` · `rol,
count(*)` en `perfiles` · fichas con `user_id` · conductor de prueba: insertar actividad
propia OK, ajena rechazada.

## Teléfono y tipos

- `cola.choferId` → `conductorId`, lectura `conductorId ?? choferId`; base local sin cambio
  de versión ni de nombre.
- `src/types/db.ts`: `RolUsuario` con `conductor`, `Chofer` → `Conductor`, `chofer_id` →
  `conductor_id`. `pruebas/esquema.mjs` lo compara con la base.
