---
description: "Tareas de indicadores del negocio"
---

# Tasks: Indicadores del negocio

**Input**: `specs/006-indicadores-negocio/` · **Prerrequisitos**: 002 Fase 1–2 + US1 y 002-US2; 005/007 para `asignados` real.
**Tests**: incluidos. Cada tarea = un commit; suite + lint + build en verde al cerrar cada fase.

## Phase 1: Setup
- [ ] T001 Registrar línea base en `specs/006-indicadores-negocio/quickstart.md`

## Phase 2: Foundational
- [ ] T002 Crear la próxima migración libre `supabase/migrations/000N_indicadores.sql`: `encomienda_jornadas.asignados int null check (asignados >= 0)` y función `encomienda_meta_entregas_dia()` (`security definer`, `stable`, `grant execute` a `authenticated`); re-ejecutable con `select` de verificación
- [ ] T003 [P] Actualizar `src/types/db.ts` (`asignados`) y `pruebas/esquema.mjs`
- [ ] T004 [P] Crear `src/lib/encomiendas/indicadores.ts` (`calcularIndicadores`, `periodoAnterior`, `compararPeriodos`) y `pruebas/indicadores.test.mjs`: tasa, no entregas, duración hasta el último evento, días abiertos fuera, días manuales sin duración, asignados null fuera, margen con tarifa congelada

## Phase 3: US1 - Rendimiento del reparto (P1) 🎯 MVP
- [ ] T005 [US1] En `src/app/(app)/encomiendas/_datos.ts` cargar período actual y anterior (actividad, días, pagos) sin consultas duplicadas
- [ ] T006 [US1] Crear `src/app/(app)/encomiendas/_componentes/indicadores.tsx` (cifras + diferencia con signo y texto, no solo color) y montarla en `page.tsx`; reutilizar `_resumen.ts` donde ya calcula KPIs
- [ ] T007 [US1] Avisos de "días abiertos fuera del cálculo" y "período sin datos"

## Phase 4: US2 - Entregas sobre lo asignado (P1) 🎯 MVP
- [ ] T008 [US2] En `src/lib/encomiendas/local/enviar.ts`, `sincronizarJornada()` envía `asignados` (pedidos del día) al cerrar; prueba en `pruebas/4-envio.test.mjs` (solo un número, ningún dato de destinatario)
- [ ] T009 [US2] Mostrar entregados/asignados y "datos desde DD-MM" en `_componentes/indicadores.tsx`

## Phase 5: US3 - Margen del día (P2)
- [ ] T010 [US3] Columna margen (ingreso − pago) en `src/app/(app)/encomiendas/_componentes/tabla-dias.tsx` y total del período en `indicadores.tsx`
- [ ] T011 [P] [US3] Extender `pruebas/base.mjs`: margen del panel = `ingresos_totales − pago_total` de la base

## Phase 6: US4 - Meta del bono (P3)
- [ ] T012 [US4] Llamar `encomienda_meta_entregas_dia()` en `src/app/(conductor)/conductor/encomiendas/page.tsx` y pasar la meta a la pantalla
- [ ] T013 [US4] Crear `_componentes/meta-bono.tsx` ("N de M · faltan K"; oculto si no hay meta), alimentado por las entregas del día en `Ruta`, offline

## Phase 7: Polish
- [ ] T014 [P] Actualizar `docs/ARQUITECTURA.md` (días.asignados, función), `docs/CLASES.md` y estado en `docs/HOJA-DE-RUTA.md`
- [ ] T015 Correr `quickstart.md` completo y registrar resultados

## Dependencies
```text
T001 → T002 → T003 ∥ T004 → US1 (T005–T007) → US2 (T008–T009) → US3 (T010–T011) → US4 (T012–T013) → Polish
```
- [P]: T003 ∥ T004; T011; T014.
- MVP: US1 + US2.
