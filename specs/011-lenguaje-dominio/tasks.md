---
description: "Tareas: un mismo idioma para el dominio"
---

# Tasks: Un mismo idioma para el dominio

**Regla**: tras cada fase, `npx tsc --noEmit` + `npm test`; al final, lint y build.

## Phase 1: Un solo aviso

- [x] T001 `almacen/tipos.ts`: `Pedido.aviso`; sin `CoordinacionWhatsApp`; `migrar.ts` funde el store `whatsapp` en la v3
- [x] T002 `idb.ts` sin store `whatsapp`; `disponibilidad.ts`, `pedidos.ts`, `local/whatsapp.ts`, `use-jornada.ts` sobre `pedido.aviso`
- [x] T003 Pruebas de almacén, WhatsApp y migración

## Phase 2: Glosario en el código

- [x] T004 Renombres de tipos, funciones y campos (tabla de `spec.md`), con `geometria` → `trazado`
- [x] T005 Textos de pantalla: "jornada" → "día"
- [x] T006 Pruebas

## Phase 3: Docs y verificación

- [x] T007 `docs/CLASES.md` (+ página), `docs/ARQUITECTURA.md`, `AGENTS.md` (vocabulario), specs futuras 002–007
- [x] T008 `npm test`, `npm run lint`, `npm run build`

