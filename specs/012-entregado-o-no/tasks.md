---
description: "Tareas: entregado o no entregado"
---

# Tasks: Entregado o no entregado

**Regla**: tras cada fase, `npx tsc --noEmit` + `npm test`; al final, lint y build.

## Phase 1: Dominio y teléfono

- [x] T001 `estados.ts`: `ResultadoVisita` = pendiente · entregado · no_entregado; sin `motivoDeEntrega`, `esReintentable`, `resultadoReintentable`, `resultadoOmitido`, `RESULTADO_POR_MANANA`. `catalogos.ts` sin `MOTIVOS_NO_ENTREGA`
- [x] T002 `migrar.ts` convierte los resultados viejos; `terreno.ts`, `cola.ts`, `disponibilidad.ts`, `enviar.ts` sin motivo; `ResumenDia.noEntregadas`

## Phase 2: Pantallas

- [x] T003 `pantalla.tsx`: salidas "Dejar como pendiente" · "No entregado"; lista y "Tu día" sin desglose; `menu-lateral.tsx`
- [x] T004 Panel: `actividad-dia.tsx`, `page.tsx` (sin tarjeta ni columna de rechazos), `dia/page.tsx`; `pago.ts` sin `ConteoMotivos`

## Phase 3: Pruebas y docs

- [x] T005 Pruebas: almacén, entrega, envío, resumen, rutas, migración, replanificar
- [x] T006 Docs, constitución 1.4.0, specs 004/006/007; borrar la columna `motivo` → 002 T051
- [x] T007 `npm test`, `npm run lint`, `npm run build`
