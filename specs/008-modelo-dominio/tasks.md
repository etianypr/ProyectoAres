---
description: "Tareas del pulido del modelo de clases"
---

# Tasks: Pulido del modelo de clases

**Regla**: tras cada fase, `npx tsc --noEmit` + `npm test`; al final, lint y build.

## Phase 1: US1 - Un solo lugar por concepto (P1)

- [x] T001 [US1] `src/lib/encomiendas/catalogos.ts`: TIPOS_EVENTO, MOTIVOS_NO_ENTREGA, ORIGENES, TIPOS_PAGO, DISPONIBILIDADES, ACCIONES_WHATSAPP, ESTADOS_MENSAJE con sus tipos; `db.ts` y `config.ts` los usan
- [x] T002 [US1] `src/lib/encomiendas/estados.ts`: tipos de estado local, `motivoDeEntrega`, `tipoEventoDe`, `estadoPedidoTras`, `esReintentable`, `paradaReintentable`, `paradaCerrada`, `estaConfirmado`, `rechazoPendiente`, `respuestaDeAccion`
- [x] T003 [US1] Reemplazar condiciones sueltas en `use-jornada.ts`, `generar-ruta.ts`, `almacen`, `local/whatsapp.ts`, `pantalla.tsx`, `actividad-dia.tsx` (+ `paradaOmitida`)
- [x] T004 [US1] Reescribir pruebas contra las funciones canónicas

## Phase 2: US3 - Nombres únicos y código muerto (P2)

- [x] T005 [US3] Renombres de `plan.md` (`MarcaParada`, `ResultadoEnvioCola/Meta`, `esErrorReintentable`, `METROS_*`)
- [x] T006 [US3] Eliminar código muerto de `plan.md` y sus pruebas; corregir comentarios rotos (`pago.ts:2`, `geocoding.ts:1043`, `importar.ts`)

## Phase 3: US3 - Tipos derivados y geo (P2)

- [x] T007 [US3] `TarifaPago`, `EventoActividad`, `EventoDia`, `DatosPedido` derivados; un solo conteo de motivos en `pago.ts`
- [x] T008 [US3] `src/lib/geo/coordenada.ts` (Coordenada, PuntoLngLat, Trazado, CENTRO_ARICA, RECUADRO_ARICA, distanciaMetros); actualizar geocoding, rutas, plus-code, marcar, openrouteservice, ruta-mapa, mcp, pruebas (adelanta 002 T003)

## Phase 4: US2 - Fronteras tipadas (P1)

- [x] T009 [US2] `src/lib/encomiendas/contrato-whatsapp.ts`; usarlo en `api/whatsapp/send`, `status` y `local/whatsapp.ts`
- [x] T010 [US2] `idb.ts` tipado por store (`FilaDe[S]`; formas en `almacen/tipos.ts`)
- [x] T011 [US2] `Database` en `src/types/db.ts`; genérico en `lib/supabase/{client,server,admin}.ts`; quitar casts
- [x] T012 [US3] Dividir `local/almacen.ts` en `local/almacen/` por agregado con `index.ts` (adelanta 002 T031): `tipos`, `fila`, `migrar`, `pedidos`, `ruta`, `terreno`, `disponibilidad`, `cola`; máx. 216 líneas

## Phase 5: US4 - Diagrama esencial (P2)

- [x] T013 [US4] Regenerar `docs/CLASES.md` esencial con el modelo nuevo y republicar la página
- [x] T014 Actualizar `docs/ARQUITECTURA.md`, `specs/002/tasks.md` (T003, T031 adelantadas), `specs/README.md`
- [x] T015 `npm test`, `npm run lint`, `npm run build`
