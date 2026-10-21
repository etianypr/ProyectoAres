# Implementation Plan: Asistencia de ruta y entrega

> Histórico (feature implementada). Estructura vigente: `docs/ARQUITECTURA.md`.

**Branch**: `001-asistencia-ruta-entrega` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-asistencia-ruta-entrega/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Extender la app existente de encomiendas para que el conductor pueda cargar y
confirmar pedidos en el teléfono, avisar al receptor por WhatsApp, usar su
respuesta para preparar una ruta y registrar resultados diferenciados de entrega.
La solución conservará el modelo local-first: pedidos, direcciones y orden de
ruta permanecen en IndexedDB; el servidor recibe solo actividad operativa y los
datos mínimos estrictamente necesarios para coordinar WhatsApp.

La implementación se divide en cuatro límites: dominio local de pedidos y
disponibilidad, adaptador de mensajería, planificación de rutas y resumen de
jornada. La ruta existente se reutiliza y se amplía para filtrar rechazos,
considerar bloques horarios y conservar paradas ya cerradas.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5, React 19, Next.js 16 App Router

**Primary Dependencies**: Supabase, IndexedDB, Mapbox Directions/Geocoding,
OpenStreetMap Nominatim, Meta WhatsApp Cloud API, `lucide-react`

**Storage**: IndexedDB para pedidos, disponibilidad y ruta local; PostgreSQL/Supabase
solo para actividad, jornadas, reglas y resultados agregados; proveedor WhatsApp
para entrega de mensajes y recepción de respuestas

**Testing**: Node test runner existente (`npm test`), pruebas unitarias de dominio,
pruebas de contratos de webhook y pruebas manuales de quickstart

**Target Platform**: PWA mobile-first para teléfono del conductor y panel web de
escritorio para jefe/operador; servidor Next.js y Supabase

**Project Type**: Aplicación web full-stack con PWA de conductor

**Performance Goals**: carga de un pedido en menos de 30 segundos; aviso WhatsApp
en menos de 1 minuto después de incorporarlo; vista de la próxima parada en menos
de 2 segundos desde que los datos locales están disponibles

**Constraints**: funcionamiento offline para datos y estados del conductor;
reintentos idempotentes; no guardar destinatarios en PostgreSQL salvo el mínimo
transitorio requerido para correlacionar WhatsApp; no incluir rechazo en futuras
rutas; máximo tres propuestas de ruta

**Scale/Scope**: Una operación de reparto en Arica, aproximadamente hasta 60
pedidos y eventos por jornada; pocos conductores simultáneos; proveedores externos
con límites de consulta y posibles fallos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Estado | Evidencia del plan |
|---|---|---|
| Experiencia primero del conductor | PASS | Estados y acciones locales; interfaz móvil y quickstart de reparto |
| Verdad de la entrega | PASS | Disponibilidad separada del resultado; rechazo terminal y eventos idempotentes |
| Pruebas de operaciones críticas | PASS | Pruebas para estados, normalización, contratos WhatsApp y rutas |
| Servicios externos resilientes | PASS | Adaptadores, fallback de mapas, reintentos y degradación accionable |
| Datos mínimos necesarios | PASS | WhatsApp recibe solo datos de coordinación; PostgreSQL no custodiará pedidos |

No hay violaciones que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-asistencia-ruta-entrega/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```
├── app/
│   ├── (app)/encomiendas/                 # panel de oficina
│   ├── (conductor)/conductor/encomiendas/ # PWA del conductor
│   └── api/whatsapp/                      # webhook y envío
├── components/
├── lib/
│   ├── encomiendas/local/                 # dominio y persistencia local
│   ├── geocoding.ts                       # proveedores de direcciones
│   └── rutas.ts                            # matriz, orden y trazado
└── types/db.ts                            # tipos de persistencia server

pruebas/
├── *.test.mjs                             # dominio y contratos existentes
├── dobles/                                # dobles de Supabase/headers
└── fixtures/                              # respuestas de proveedores
```

**Structure Decision**: Mantener la separación actual entre panel y PWA. Las
operaciones de pedidos, disponibilidad y ruta se implementan junto al dominio
local existente. WhatsApp se agrega como servicio de servidor con webhook, sin
mover la ruta completa ni el detalle del receptor a Supabase. Las pruebas nuevas
se agregan al arnés Node existente y los contratos externos quedan documentados
en `contracts/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| No aplica | No se agrega un proyecto ni una capa general nueva | Se reutilizan los módulos locales y adaptadores existentes |
