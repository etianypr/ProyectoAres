---
description: "Tareas: un pedido por día"
---

# Tasks: Un pedido por día

**Regla**: tras cada fase, `npx tsc --noEmit` + `npm test`; al final, lint y build.

## Phase 1: Modelo y migración (US2, US3)

- [x] T001 [US2] `almacen/tipos.ts`: `PedidoLocal` con `fecha`, `llamada`, `entrega`, horas; sin `estado`; `RutaLocal.orden`; sin `ParadaLocal`
- [x] T002 [US2] `estados.ts`: `entregaCerrada`, `entregaOmitida`, `entregaReintentable`, `rechazoPendiente` sobre `entrega`, `rechazoPorAviso`; quitar `EstadoPedidoLocal`, `estadoPedidoTras`
- [x] T003 [US3] `format.ts` `fechaChile`; `almacen/migrar.ts` `migrarV2` pura; `idb.ts` VERSION 3 con migración y sin índice `por_estado`

## Phase 2: Almacén (US1, US2)

- [x] T004 [US1] `pedidos.ts`: `leerPedidos(fecha)`, `pedidosPendientes(fecha)`, `guardarPedido(datos, fecha, id?)`, `borrarPedido(id)`, `restaurarPedido(eliminado)` con `posicion`
- [x] T005 [US2] `ruta.ts`: `guardarRuta` sobre `orden`, `pedidosEnOrden`, `rutaTerminada(ruta, pedidos)`, `leerDias` desde pedidos
- [x] T006 [US2] `terreno.ts`: llamada y entrega escriben pedido + cola; deshacer y mover al final sobre `orden`
- [x] T007 [US2] `disponibilidad.ts`: rechazo suelto sobre `entrega`; `reiniciarDisponibilidad` con `rechazoPorAviso`

## Phase 3: Consumidores (US1, US2)

- [x] T008 [US1] `generar-ruta.ts`: pendientes de la fecha, sin reconciliar paradas
- [x] T009 [US2] `use-jornada.ts`, `pantalla.tsx`, `pedido-form-local.tsx` (recibe `fecha`)
- [x] T010 Pruebas: reescribir las de almacén, entrega, rutas y WhatsApp; nuevas de fecha, migración y rechazo

## Phase 4: Docs y verificación

- [x] T011 `docs/CLASES.md` (+ página publicada), `docs/ARQUITECTURA.md`, `specs/README.md`, versiones de IndexedDB en 003/007
- [x] T012 `npm test`, `npm run lint`, `npm run build`
