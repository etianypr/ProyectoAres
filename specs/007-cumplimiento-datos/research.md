# Research: Cumplimiento de datos (007)

## R1. Dónde vive el registro de proveedores y el modo

- **Decision**: dos columnas en `empresa`: `modo_operacion text` (`piloto`|`oficial`, defecto `piloto`) y `proveedores_datos jsonb` (`{clave: {estado, autorizadoEn, documento}}`). El catálogo (nombre, datos que recibe, país) es una constante en código: `PROVEEDORES` en `lib/encomiendas/config.ts`, espejo de `docs/PRIVACIDAD.md` §3.
- **Rationale**: `empresa` ya tiene las políticas exactas (lectura autenticados, escritura admin/operador). Una tabla nueva duplicaría RLS y triggers para ≤5 filas.
- **Alternative**: tabla `proveedores_datos` — descartada por costo sin beneficio.

## R2. Dónde corre el borrado del día

- **Decision**: módulo nuevo `lib/encomiendas/local/borrado.ts`: `noEntregadosDelDia(fecha)` (lista de OF), `cerrarYBorrarDia(fecha)` (escribe `ResumenDia` y borra `pedidos`, `rutas`, `whatsapp`, `fotos` del día en **una** transacción de `escribir()`), `diasSinCerrar(hoy)`.
- **Rationale**: una transacción evita estados a medias (resumen escrito sin borrar, o al revés). `cerrarDia()` (almacen.ts) sigue marcando el cierre; el borrado va después de la confirmación.
- Pedidos sin fecha de ruta (cargados sin rutear): se borran con el día de `cargadoEn`.

## R3. Detección de cuenta desactivada

- **Decision**: la página `/login` monta `<BorradoLocal/>` (cliente) que borra los stores con datos de destinatarios. Llegan a `/login`: el cierre de sesión y toda sesión sin rol válido (`private.get_rol()` exige `perfiles.activo`; `exigirConductor()` redirige).
- **Rationale**: un solo punto cubre FR-007 sin consultar el servidor desde el teléfono.
- `cola` y `dias` no se borran (sin datos de destinatarios); la cola solo se envía con la sesión de su conductor (RLS).

## R4. Puerta de proveedores

- **Decision**: función pura `proveedorHabilitado(clave, empresa)` en `lib/encomiendas/config.ts`: piloto → `true`; oficial → `estado === "autorizado"`. Se evalúa en cliente (ocultar la función) **y** en servidor (`api/whatsapp/send`, futuro endpoint de lectura de la 005).
- Mapbox/OSM: en oficial sin autorización se apagan como cualquier otro (no hay excepción).

## R5. Pruebas de privacidad

- `pruebas/privacidad.test.mjs`: cierre simulado con `fake-indexeddb` (stores vacíos, `ResumenDia` correcto, cola intacta); columnas de `encomienda_*` en `supabase/migrations/*.sql` sin `nombre|telefono|direccion|of`; rutas de `src/app/api/**` sin `console.*` del cuerpo.
- `pruebas/arquitectura.test.mjs` (de 002): regla A10 — todo host `https://…` en `src/` figura en `docs/PRIVACIDAD.md` o en una lista blanca justificada (Supabase propio).
