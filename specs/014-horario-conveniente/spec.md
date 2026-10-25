# Feature Specification: ¿Conviene ir al pedido con horario?

**Feature Branch**: `014-horario-conveniente` · **Created**: 2026-10-24 · **Status**: Draft
(fase WhatsApp: los horarios solo llegan por el aviso, en pausa hasta tener el chip)

**Input**: "'Otro horario' mueve el pedido al bloque de tiempo estimado. El sistema debe saber
si, al momento de acercarse la entrega del pedido que se marcó para otro horario, es
conveniente ir a entregarlo o solamente descartarlo." · Decisión: la app sugiere y el
conductor confirma con un toque.

**Decisiones**:
- Hoy (spec 010) el pedido con bloque se ubica donde se llega dentro del bloque y, si no se
  alcanza, va al final con el aviso "llámalo". Esta spec agrega la pregunta **en el momento**:
  cuando ese pedido pasa a ser la próxima parada, la app vuelve a estimar y sugiere.
- **Sugerir, no decidir**: la app propone "Ir" o "Descartar"; el conductor confirma. Descartar
  = **no entregado** (spec 012), sin motivo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sugerencia al llegar el turno del pedido con horario (Priority: P1)

Como conductor, cuando la próxima parada es un pedido con horario, quiero que la app me diga
si conviene ir, para no perder tiempo en una visita que no va a resultar.

**Independent Test**: ruta simulada con un pedido de 14–16; a las 15:20 y cerca → "Ir"; a las
16:30 → "Descartar"; a las 13:00 con otras paradas pendientes → "Dejar para después".

1. **Given** llegada estimada dentro del bloque (± 15 min), **When** es la próxima parada, **Then** la app sugiere "Ir" y no interrumpe.
2. **Given** llegada estimada después del fin del bloque, **When** es la próxima parada, **Then** sugiere "Descartar" (no entregado) con un toque para confirmar o "Ir igual".
3. **Given** llegada estimada antes del inicio del bloque y otras paradas pendientes, **When** es la próxima parada, **Then** sugiere "Dejar para después" (pasa detrás de las paradas que caben antes del bloque).
4. **Given** el desvío para llegar supera el máximo en tiempo o en distancia (FR-003), **When** es la próxima parada, **Then** sugiere "Descartar" aunque el horario calce, mostrando los minutos y los km de desvío.

### Edge Cases

- El receptor cambia de bloque mientras tanto: se recalcula con el bloque nuevo.
- Sin señal: se estima con la velocidad y la distancia del planificador (spec 010), sin consulta.
- Varias paradas con horario seguidas: una sugerencia a la vez, en orden.

## Requirements *(mandatory)*

- **FR-001**: Al pasar a próxima parada un pedido con bloque, la app MUST estimar la llegada (mismo modelo que `planificar.ts`) y clasificarla: dentro, antes o después del bloque.
- **FR-002**: La app MUST sugerir "Ir", "Dejar para después" o "Descartar"; MUST NOT cerrar el pedido sin confirmación del conductor.
- **FR-003**: Desvío máximo para "Ir" (decidido 2026-10-24): **10 min** de manejo extra **y** **3 km** extra, comparando la ruta que queda pasando por el pedido contra la misma ruta sin él. Si se pasa de cualquiera de los dos, se sugiere "Descartar". Ambos valores son constantes ajustables.
- **FR-004**: "Descartar" registra no entregado (spec 012) y lo saca de la ruta; "Ir igual" no pregunta de nuevo por ese pedido.

## Success Criteria *(mandatory)*

- **SC-001**: Ninguna visita a un pedido con horario llega después del fin de su bloque sin que la app lo haya advertido.
- **SC-002**: La sugerencia aparece en ≤ 1 s, también sin señal.

## Assumptions

- Depende de la fase WhatsApp (los horarios llegan por el aviso, spec 010) y del planificador existente.
- Tolerancia de 15 min, igual a `MIN_TOLERANCIA_BLOQUE`.
- Con la velocidad de ciudad del planificador (25 km/h), 10 min ≈ 4 km: el límite de 3 km hace que la
  distancia cuente aunque el tiempo alcance; con el trazado real de Mapbox, tiempo y distancia se
  miden por separado.
