# Feature Specification: Indicadores del negocio

**Branch**: `006-indicadores-negocio` · **Created**: 2026-10-20 · **Status**: Draft · **Input**: medir si las specs 003–005 ayudan al negocio (`docs/HOJA-DE-RUTA.md`).

**Decisiones**
- "Entregas al primer intento" se reemplazó por "entregas sobre lo asignado": el borrado diario (spec 007) impide seguir un paquete entre días.
- Facturación por períodos e ingresos reales: prioridad mínima, fuera de esta spec.
- Todo se calcula con datos que ya están en el servidor + un conteo diario sin datos personales.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rendimiento del reparto (Priority: P1)

Responsable del negocio: ver por día, semana y mes cómo se trabajó, comparado con el período anterior.

**Why this priority**: es la medición que justifica (o no) cada funcionalidad nueva.

**Independent Test**: 2 semanas de actividad de prueba → las cifras coinciden con el cálculo manual sobre los eventos.

**Acceptance Scenarios**:

1. **Given** días cerrados, **When** abre indicadores, **Then** ve entregas, intentos del día, tasa de entrega, no entregas, duración media del día y entregas por hora.
2. **Given** un período, **When** lo compara, **Then** cada cifra muestra la diferencia con el período anterior de igual largo, con signo (no solo color).
3. **Given** días abiertos, **When** se calcula, **Then** quedan fuera de duración y entregas/hora, y la pantalla lo dice.

### User Story 2 - Entregas sobre lo asignado (Priority: P1)

Responsable del negocio: saber qué parte de lo asignado en la guía se entregó.

**Why this priority**: cada paquete no entregado es una visita perdida; mide el efecto de los avisos (004).

**Independent Test**: 25 asignados, 22 entregados → 88 %.

**Acceptance Scenarios**:

1. **Given** día cerrado con asignados, **When** se calcula, **Then** muestra entregados / asignados del día y del período.
2. **Given** días sin asignados (anteriores a esta spec), **When** se calcula, **Then** quedan fuera y se indica desde qué fecha hay datos.

### User Story 3 - Margen del día (Priority: P2)

Responsable del negocio: ver cuánto deja cada día: ingreso estimado menos pago al conductor.

**Why this priority**: con un mandante y un conductor, es la cifra de negocio más directa.

**Independent Test**: 40 entregas a $950 y pago de $25.000 → margen $13.000.

**Acceptance Scenarios**:

1. **Given** días valorados, **When** ve el período, **Then** ve ingreso estimado, pago y margen por día y total.
2. **Given** un día con tarifa congelada anterior, **When** se calcula, **Then** usa la tarifa de ese día.

### User Story 4 - Meta del bono en el teléfono (Priority: P3)

Conductor: ver cuántas entregas lleva y cuántas faltan para el bono del día.

**Why this priority**: motiva y ayuda a decidir, pero no mide ni ahorra por sí sola.

**Independent Test**: meta 45, 38 entregas → "38 de 45 · faltan 7".

**Acceptance Scenarios**:

1. **Given** regla con meta, **When** entrega, **Then** el contador avanza al momento, aun sin conexión.
2. **Given** regla sin meta, **When** trabaja, **Then** no se muestra nada del bono.

### Edge Cases

- Días cargados a mano (origen manual): cuentan en entregas y margen; no en duración, entregas/hora ni asignados.
- Día cerrada por el cron de las 00:30: duración hasta el último evento, no hasta medianoche.
- Período sin datos: vacío con explicación, no ceros.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El panel MUST mostrar por período: entregas, intentos, tasa de entrega, no entregas, duración media del día, entregas por hora.
- **FR-002**: Cada indicador MUST compararse con el período anterior de igual largo.
- **FR-003**: Al cerrar el día, el teléfono MUST enviar la cantidad de paquetes asignados del día (un número, sin datos de destinatarios).
- **FR-004**: Entregados / asignados MUST calcularse solo con días que traen asignados, indicando desde qué fecha.
- **FR-005**: El panel MUST mostrar ingreso estimado, pago y margen por día y período con la tarifa congelada de cada día.
- **FR-006**: La app del conductor MUST mostrar el avance hacia la meta diaria cuando la regla la tiene, sin exponer el resto de la tarifa.
- **FR-007**: MUST NOT requerir datos de destinatarios.
- **FR-008**: Las cifras MUST distinguirse sin depender solo del color.

### Key Entities

Día (+ `asignados`) · Indicador (cálculo, no se guarda). Detalle en `data-model.md`.

## Success Criteria *(mandatory)*

- **SC-001**: Responder "¿entregamos más y más de lo asignado que el mes pasado?" en <1 min desde el panel.
- **SC-002**: Indicadores = cálculo manual sobre eventos individuales (100 %, pruebas automáticas).
- **SC-003**: Los criterios SC-007 a SC-009 de la feature 001 quedan medibles.

## Assumptions

- Asignados = pedidos del día en el teléfono (guía de la spec 005 o carga manual), enviados antes del borrado diario (007).
- Ingreso por entrega = tarifa de la regla de pago (hoy $950), un solo mandante.
- Se implementa después de 002-US2 (agrega una columna a `encomienda_jornadas`).
