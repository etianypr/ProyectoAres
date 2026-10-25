---
description: "Tareas de cumplimiento de datos (007)"
---

# Tasks: Cumplimiento de datos (007)

**Input**: `specs/007-cumplimiento-datos/` · **Prerrequisito**: spec 002 Fase 1–2 + US1.
**Tests**: incluidos (constitución III y V). Un commit por tarea; sin commit hasta que lo pida el responsable.

Formato: `[ID] [P?] [Story] descripción` · [P] = paralelizable.

## Phase 1: Setup

- [x] T001 Verificar prerrequisito (existe `pruebas/arquitectura.test.mjs`; estructura de 002-US1) y registrar línea base (`npm test`, `npm run lint`, `npm run build`) en `specs/007-cumplimiento-datos/quickstart.md`

## Phase 2: Foundational

- [x] T002 En `src/lib/encomiendas/local/idb.ts`: store `dias` (clave `fecha`) en la siguiente `VERSION` libre y lista exportada `STORES_DEL_DIA` (`pedidos`, `rutas` y todo store futuro con datos de destinatarios); tipo `ResumenDia` en `almacen/`; prueba de migración en `pruebas/idb-version.test.mjs`
- [ ] T003 [P] En `src/lib/encomiendas/config.ts`: `PROVEEDORES` (mapbox, osm, meta, anthropic; espejo de `docs/PRIVACIDAD.md` §3), `proveedorHabilitado(clave, empresa)`, `validarPlantilla(texto, nombreEmpresa)`; pruebas en `pruebas/privacidad.test.mjs`
- [ ] T004 [P] Migración `supabase/migrations/000N_cumplimiento.sql` (próxima libre, re-ejecutable): `empresa.modo_operacion`, `empresa.proveedores_datos` (ver `data-model.md`); actualizar `src/types/db.ts`

## Phase 3: US1 - Todo se borra al cerrar el día (P1) 🎯 MVP

- [x] T005 [US1] Crear `src/lib/encomiendas/local/almacen/borrado.ts` (dentro de `almacen/`: solo él toca los stores): `noEntregadosDelDia(fecha)`, `cerrarYBorrarDia(fecha)` (escribe `ResumenDia` y vacía cada store de `STORES_DEL_DIA` en una transacción de `escribir()`), `diasPorBorrar(hoy)`; pruebas en `pruebas/privacidad.test.mjs`: cierre simulado sin datos de destinatarios en ningún store de `STORES_DEL_DIA`, resumen correcto, `cola` intacta, no entregados no pasan al día siguiente
- [x] T006 [US1] En `src/lib/encomiendas/local/almacen/`: `leerDias()` lee `dias` en vez de reconstruir desde `rutas`; quitar el arrastre de pendientes al día siguiente; ajustar `pruebas/3-almacen.test.mjs`
- [x] T007 [P] [US1] Crear `_componentes/lista-no-entregados.tsx` (OF; la reusa la spec 004 desde la hoja) y `_componentes/cierre-dia.tsx` (lista + confirmar), en `src/app/(conductor)/conductor/encomiendas/`
- [x] T008 [US1] (en `_hooks/use-cierre-dia.ts`, no en `use-dia-trabajo.ts`) Tras `cerrarDia()` mostrar `cierre-dia` y al confirmar `cerrarYBorrarDia()`; al abrir, `diasSinCerrar(hoy)` → mostrar la lista de cada día → borrar antes de mostrar el día nuevo
- [x] T009 [US1] Mostrar días anteriores desde `dias` en `_componentes/menu-lateral.tsx` y `pantalla.tsx` (solo conteos)

## Phase 4: US2 - Borrado al perder el acceso (P1) 🎯 MVP

- [x] T010 [US2] `borrarDatosDestinatarios()` en `borrado.ts` (vacía `pedidos`, `rutas`, `fotos`; conserva `cola` y `dias`); prueba en `pruebas/privacidad.test.mjs`
- [x] T011 [US2] ~~`/login`~~ (ver research R3): `src/app/(conductor)/borrado-local.tsx` llama `borrarDatosDestinatarios()` y se monta en las pantallas "Cuenta sin vincular" y "Cuenta desactivada" (`conductor/page.tsx`, `encomiendas/page.tsx`); `conductorDeUsuario` trae `activo` y lanza si la consulta falla; la API rechaza la ficha inactiva
- [x] T012 [US2] En el cierre de sesión (`_componentes/menu-lateral.tsx`, acción `logout` de `lib/auth/acciones.ts`): aviso si `leerCola()` tiene eventos sin enviar

## Phase 5: US4 - Mensajes que dicen quién escribe (P2)

- [ ] T013 [US4] Aplicar `validarPlantilla()` al guardar plantillas de aviso (formulario de la spec 004 en `src/app/(app)/configuracion/`); si la 004 aún no existe, dejar la validación probada y anotarla en `specs/004-menos-visitas-fallidas/tasks.md`

## Phase 6: US5 - Verificación automática (P2)

- [x] T014 [P] [US5] En `pruebas/privacidad.test.mjs`: tablas `encomienda_*` de `supabase/migrations/*.sql` sin columnas `nombre|telefono|direccion|of`; `src/app/api/**` sin `console.*` del cuerpo de la solicitud
- [x] T015 [P] [US5] (hecha en 002 T002) Regla A10 en `pruebas/arquitectura.test.mjs`: todo host `https://…` de `src/` figura en `docs/PRIVACIDAD.md` o en una lista blanca justificada (Supabase propio)

## Phase 7: US3 - Modo piloto / oficial (P3)

- [ ] T016 [US3] Crear `src/app/(app)/configuracion/privacidad-form.tsx` (proveedores con estado, fecha, documento; modo piloto/oficial) y `guardarPrivacidad` en `configuracion/actions.ts` con `puedeOperarPanel()`
- [ ] T017 [US3] En `src/app/api/whatsapp/send/route.ts`: rechazar con mensaje claro si `proveedorHabilitado("meta")` es falso; prueba en `pruebas/whatsapp-contract.test.mjs`
- [ ] T018 [US3] Pasar `modo_operacion` y `proveedores_datos` desde `src/app/(conductor)/conductor/encomiendas/page.tsx` (ya lee `empresa`) a la pantalla, para que 004/005 apaguen sus funciones en modo oficial; indicador de pendientes en el panel

## Phase 8: Polish

- [x] T019 [P] Actualizar `docs/ARQUITECTURA.md` (store `dias`, borrado diario implementado), `docs/CLASES.md` (`ResumenDia`, proveedores) y `docs/PRIVACIDAD.md` §2/§4
- [ ] T020 Correr `quickstart.md` completo y registrar resultado

## Dependencies

```text
T001 → T002, T003, T004
T002 → US1 (T005–T009) → US2 (T010–T012)
T003 → US4 (T013), US3 (T016–T018)
T004 → US3
US1 → US5 (T014–T015)
Todo → Polish (T019–T020)
```

- Paralelo: T003 ∥ T004; T007 ∥ T005; T014 ∥ T015.
- MVP: Phases 1–4 (borrado diario y por acceso). US3 puede esperar hasta antes del lanzamiento oficial.
