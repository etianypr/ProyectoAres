---

description: "Tareas de implementación para la asistencia de ruta y entrega"
---

# Tasks: Asistencia de ruta y entrega

**Input**: Documentos de diseño de `specs/001-asistencia-ruta-entrega/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Organization**: Las tareas están agrupadas por historia de usuario para permitir
entregas incrementales y pruebas independientes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar contratos, configuración y una línea base antes de tocar el flujo del conductor.

- [x] T001 Confirmar la línea base ejecutando `npm test`, `npm run lint` y `npm run build`, y registrar cualquier fallo previo en `specs/001-asistencia-ruta-entrega/quickstart.md`
- [x] T002 [P] Crear fixtures de respuestas de geocodificación y WhatsApp en `pruebas/fixtures/` para pruebas deterministas sin red
- [x] T003 [P] Crear dobles de Meta WhatsApp y reloj en `pruebas/dobles/` siguiendo el patrón de `pruebas/dobles/supabase-client.mjs`
- [x] T004 [P] Definir constantes compartidas de bloques horarios, estados de disponibilidad y motivos de entrega en `src/lib/encomiendas/config.ts`

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Construir las invariantes de dominio y persistencia que necesitan todas las historias.

- [x] T005 Extender `PedidoLocal`, `ParadaLocal`, `RutaLocal` y los estados relacionados en `src/lib/encomiendas/local/almacen.ts` según `specs/001-asistencia-ruta-entrega/data-model.md`
- [x] T006 Implementar escritura serializada e idempotente de disponibilidad, rechazo terminal y resultado de entrega en `src/lib/encomiendas/local/almacen.ts`
- [x] T007 [P] Agregar tipos y validadores de dominio para respuestas interactivas en `src/lib/encomiendas/local/whatsapp.ts`
- [x] T008 Crear la migración `supabase/migrations/0003_asistencia_ruta.sql` para ampliar actividad con un motivo no personal y crear correlaciones temporales de WhatsApp con `chofer_id`, `pedido_id_local` opaco, `external_message_id`, estado, fecha de expiración y política de eliminación documentada
- [x] T009 Actualizar los tipos derivados de base y constantes de actividad en `src/types/db.ts` para aceptar motivos de no entrega sin alterar el cálculo existente
- [x] T010 [P] Agregar pruebas de invariantes locales e idempotencia en `pruebas/asistencia-local.test.mjs`
- [ ] T011 Validar la migración y sus políticas con `pruebas/base.mjs` y `pruebas/esquema.mjs`, manteniendo prohibido guardar el pedido completo en Supabase — **BLOQUEADA: sin credenciales de Supabase en este entorno.** Los dos arneses quedaron extendidos y listos para correr; las invariantes de privacidad se comprueban sin credenciales en `pruebas/asistencia-local.test.mjs`. Ver "Qué NO se pudo validar" en quickstart.md

## Phase 3: User Story 1 - Preparar pedidos y confirmar ubicaciones (Priority: P1)

**Goal**: El conductor puede cargar pedidos rápido, normalizar teléfonos y confirmar o corregir ubicaciones antes de rutear.

**Independent Test**: Crear pedidos válidos, ambiguos y no encontrados; comprobar normalización, advertencias, selección de sugerencia, corrección manual y persistencia offline.

- [x] T012 [P] [US1] Actualizar el formulario de carga rápida en `src/app/(conductor)/conductor/encomiendas/pedido-form-local.tsx` para aplicar `+569`, reducir escritura y mostrar errores accionables
- [x] T013 [P] [US1] Extender `src/components/ui/direccion-input.tsx` para mostrar fuente, coincidencia de número, nivel de confianza y confirmación manual
- [x] T014 [US1] Ajustar `src/lib/geocoding.ts` para normalizar consultas, combinar Mapbox/OSM y distinguir dirección exacta, calle sola y resultado ambiguo
- [x] T015 [US1] Integrar reintentos de dirección y advertencias en `src/lib/encomiendas/local/generar-ruta.ts` sin incluir pedidos sin coordenadas confirmadas
- [x] T016 [US1] Mostrar estado de ubicación y acción de corrección en `src/app/(conductor)/conductor/encomiendas/pantalla.tsx`
- [x] T017 [US1] Agregar pruebas de normalización, ranking de sugerencias y direcciones ambiguas en `pruebas/asistencia-direcciones.test.mjs`
- [ ] T018 [US1] Ejecutar el escenario de carga y ubicación de `specs/001-asistencia-ruta-entrega/quickstart.md` en PWA instalada y documentar resultado — **BLOQUEADA: requiere teléfono con la PWA instalada y token de Mapbox.** Cubierto por dobles en `pruebas/asistencia-direcciones.test.mjs`

## Phase 4: User Story 2 - Avisar al receptor y generar la ruta (Priority: P1)

**Goal**: Cada pedido ubicado dispara un aviso de WhatsApp y sus respuestas influyen en una a tres propuestas de ruta.

**Independent Test**: Simular confirmación, bloque horario, rechazo y ausencia de respuesta; comprobar estados, envío idempotente, correlación y selección de ruta.

- [x] T019 [P] [US2] Implementar el adaptador saliente de Meta en `src/lib/whatsapp.ts` con plantillas, botones, timeouts y backoff sin exponer tokens al navegador
- [x] T020 [US2] Implementar `src/app/api/whatsapp/send/route.ts` para autenticar al conductor, validar el payload mínimo, crear una correlación limitada a su `chofer_id` y enviar el aviso al incorporar un pedido ubicado
- [x] T021 [US2] Completar la validación de firma, estados del mensaje y respuestas interactivas en `src/app/api/whatsapp/webhook/route.ts` según `specs/001-asistencia-ruta-entrega/contracts/whatsapp.md`
- [x] T022 [US2] Implementar `src/app/api/whatsapp/status/route.ts` para que el teléfono autenticado consulte solo respuestas de su `chofer_id` y sus `pedido_id_local` opacos
- [x] T023 [P] [US2] Implementar sincronización local de disponibilidad e idempotencia de mensajes en `src/lib/encomiendas/local/whatsapp.ts`
- [x] T024 [US2] Conectar el envío inmediato, estado de respuesta y reintento manual en `src/app/(conductor)/conductor/encomiendas/use-jornada.ts`
- [x] T025 [US2] Añadir selección y configuración de bloques horarios en `src/app/(app)/configuracion/` y exponer los seis bloques iniciales
- [x] T026 [US2] Extender el cálculo en `src/lib/encomiendas/local/generar-ruta.ts` para ponderar confirmados, bloques, pendientes y rechazo terminal, devolviendo una a tres propuestas útiles
- [x] T027 [US2] Actualizar la previsualización de ruta en `src/app/(conductor)/conductor/encomiendas/vista-previa-ruta.tsx` con comparación de tiempo, distancia, pedidos y advertencias
- [x] T028 [P] [US2] Agregar pruebas de contrato de WhatsApp y respuestas duplicadas en `pruebas/whatsapp-contract.test.mjs`
- [x] T029 [P] [US2] Agregar pruebas de ordenamiento con bloques, rechazo y alternativas en `pruebas/asistencia-rutas.test.mjs`
- [x] T030 [US2] Ejecutar los escenarios de aviso y planificación de `specs/001-asistencia-ruta-entrega/quickstart.md` usando dobles y registrar cualquier limitación de Meta

## Phase 5: User Story 3 - Ejecutar el reparto y registrar resultados (Priority: P1)

**Goal**: El conductor puede contactar pendientes y registrar resultados diferenciados sin duplicar actividad ni perder trabajo offline.

**Independent Test**: Ejecutar una ruta de prueba, registrar entregada, persona no encontrada, sin respuesta y rechazo con y sin conexión, y verificar la cola.

- [x] T031 [US3] Ampliar `EstadoEntregaLocal`, `ParadaLocal` y transiciones en `src/lib/encomiendas/local/almacen.ts` para distinguir los cuatro resultados y marcar reintentabilidad
- [x] T032 [US3] Actualizar acciones `marcarEntrega`, `marcarLlamada`, `deshacer` y `dejarParaElFinal` en `src/app/(conductor)/conductor/encomiendas/use-jornada.ts` con guardas contra doble toque
- [x] T033 [US3] Mostrar próxima parada, confirmación, pendiente de contacto y resultados en `src/app/(conductor)/conductor/encomiendas/pantalla.tsx`, incluyendo la validación que impide cerrar la jornada con pedidos sin resultado o pendientes explícitos
- [x] T034 [P] [US3] Añadir acción de llamada/contacto y advertencia de aproximación en `src/app/(conductor)/conductor/encomiendas/pantalla.tsx`
- [x] T035 [US3] Actualizar el puente de sincronización en `src/lib/encomiendas/local/enviar.ts` para enviar motivos no personales y cerrar jornada solo después de vaciar eventos
- [x] T036 [US3] Ajustar `src/lib/encomiendas/local/generar-ruta.ts` y `src/lib/encomiendas/local/almacen.ts` para conservar paradas cerradas al regenerar y excluir rechazos de futuros días
- [x] T037 [P] [US3] Agregar pruebas de transiciones, doble toque, offline y reintento en `pruebas/asistencia-entrega.test.mjs`
- [ ] T038 [US3] Ejecutar los escenarios de reparto y resiliencia de `specs/001-asistencia-ruta-entrega/quickstart.md` en teléfono con conexión intermitente — **BLOQUEADA: requiere el teléfono y cortarle la red a mano.** Cubierto con reloj controlado en `pruebas/asistencia-entrega.test.mjs`

## Phase 6: User Story 4 - Revisar el resultado de la jornada (Priority: P2)

**Goal**: El jefe ve conteos confiables y distingue motivos, especialmente rechazos no reintentables.

**Independent Test**: Sincronizar una jornada con resultados mixtos y comprobar que el panel coincide con los eventos individuales y el cálculo de pago.

- [x] T039 [US4] Extender consultas y tipos de actividad en `src/app/(app)/encomiendas/page.tsx` para agrupar entregada, persona no encontrada, sin respuesta y rechazo
- [x] T040 [US4] Actualizar el detalle diario en `src/app/(app)/encomiendas/dia/page.tsx` para mostrar motivos y marcar rechazos como no reintentables
- [x] T041 [P] [US4] Ajustar componentes de resumen en `src/app/(app)/encomiendas/` para mostrar totales, advertencias y estados sin depender solo del color, respetando el acceso de jefe/operador y ocultando datos de receptor al conductor
- [x] T042 [US4] Verificar que `src/lib/encomiendas/pago.ts` y `supabase/migrations/0002_encomiendas.sql` sigan contando únicamente eventos de entrega y no modifiquen pagos históricos
- [x] T043 [P] [US4] Agregar pruebas de agregación y consistencia de pago en `pruebas/asistencia-resumen.test.mjs`
- [ ] T044 [US4] Ejecutar el escenario de cierre y revisión del jefe de `specs/001-asistencia-ruta-entrega/quickstart.md` — **BLOQUEADA: requiere el panel contra una base con actividad real.** Cubierto por `pruebas/asistencia-resumen.test.mjs`

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cerrar calidad, accesibilidad, privacidad y documentación antes de implementación completa.

- [x] T045 [P] Revisar identidad naranja, contraste, estados y acciones táctiles en `src/app/globals.css` y componentes de encomiendas
- [x] T046 [P] Revisar mensajes de error, carga, ausencia de red y recuperación en las pantallas de `src/app/(conductor)/conductor/encomiendas/`
- [x] T047 [P] Documentar en `docs/DOCUMENTO-PRINCIPAL.md` los datos enviados a Meta, la eliminación de correlaciones al cerrar la jornada (72 horas máximas sin cierre) y el acceso por rol
- [x] T048 Ejecutar `npm test`, `npm run lint` y `npm run build`, y corregir regresiones directamente relacionadas con esta feature
- [ ] T049 Ejecutar `specs/001-asistencia-ruta-entrega/quickstart.md` completo y registrar resultados de la línea base de tres jornadas — **BLOQUEADA: es una medición operativa, no de programación.** Hay que repartir tres jornadas sin la funcionalidad y tres con ella. SC-007, SC-008 y SC-009 quedan sin medir hasta entonces

## Dependencies & Execution Order

### Dependency Graph

```text
T001-T004 (setup)
    |
T005-T011 (fundational local domain + schema)
    |
    +--> US1: T012-T018
    |        |
    |        +--> US2: T019-T030
    |                    |
    |                    +--> US3: T031-T038
    |                                |
    |                                +--> US4: T039-T044
    |
    +--> Polish: T045-T049 (after affected stories)
```

### Story Completion Order

1. **US1**: Carga y ubicación; habilita pedidos confiables.
2. **US2**: Comunicación y planificación; necesita el pedido local de US1.
3. **US3**: Reparto; necesita la ruta y estados de US2.
4. **US4**: Resumen; necesita eventos emitidos por US3.

### Parallel Opportunities

- Setup: `T002`, `T003` y `T004` pueden ejecutarse en paralelo después de T001.
- Fundacionales: `T007` y `T010` pueden ejecutarse en paralelo con T005/T006; T011 espera T008/T009.
- US1: `T012`, `T013` y `T017` pueden avanzar en paralelo; T014/T015 conectan después.
- US2: `T019`, `T023`, `T028` y `T029` pueden avanzar en paralelo tras T008/T009; las rutas de UI esperan los contratos de dominio.
- US3: `T034` y `T037` pueden avanzar en paralelo después de T031; T035/T036 esperan el dominio.
- US4: `T041` y `T043` pueden avanzar en paralelo después de T039/T040.
- Polish: `T045`, `T046` y `T047` pueden avanzar en paralelo; T048/T049 son finales.

## Implementation Strategy

### MVP

Entregar primero US1 completa y una versión mínima de US3: carga rápida,
confirmación de direcciones, una ruta confiable, registro offline de entregas y
resumen básico. Esto permite medir si el conductor puede trabajar mejor incluso
antes de activar WhatsApp.

### Incremental Delivery

1. Completar dominio local y migración compatible.
2. Entregar carga y ubicación (US1) con pruebas.
3. Entregar comunicación y planificación (US2) detrás de dobles antes de Meta real.
4. Entregar resultados diferenciados y resiliencia (US3).
5. Completar resumen del jefe y pago (US4).
6. Activar integración real de Meta después de validar privacidad, plantillas y
   retención.

Cada fase debe pasar sus pruebas enfocadas antes de iniciar la siguiente. No se
implementa WhatsApp real antes de que el flujo local pueda funcionar con dobles y
sin red.
