# Feature Specification: El aviso replanifica la ruta en curso

**Feature Branch**: `010-aviso-replanifica` · **Created**: 2026-10-21 · **Status**: Implementada; migración 0004 aplicada el 2026-10-21 (pendiente: desplegar y plantilla en Meta)

**Input**: "Siento que la lógica del contacto está muy complicada." · "El WhatsApp se envía a
cada cliente cuando empieza el reparto: el conductor ya eligió una ruta, así que las respuestas
tienen que ir actualizándola en tiempo real: si un pedido es para mañana, sacarlo de la ruta; si
eligen otro horario, moverlo según la hora de llegada estimada." · "Mañana = no morador. No
morador y no estaba es lo mismo; deja No morador." · "Sigue lo de las 3 rutas: es el selector
inicial."

**Decisiones**:
- Botones del aviso: **Sí, estaré** · **Mañana** · **Otro horario** (este orden respeta los
  índices de la plantilla anterior: el código viejo sigue funcionando durante el cambio).
- **Mañana** cierra el pedido como **No morador** (`persona_no_encontrada`) y genera su
  evento de omisión, sin intervención del conductor. Cambio deliberado de la regla de la 001
  ("una respuesta de WhatsApp nunca cierra un pedido sola"). `disponibilidad` (lo que dijo) y
  `entrega` (el resultado) siguen siendo campos separados.
- **Otro horario** con bloque elegido: el pedido sale de su lugar y entra donde la llegada
  estimada cae dentro del bloque; si ningún lugar sirve, donde menos se aleja y con aviso.
- Se elimina el rechazo por WhatsApp (botón RECHAZAR, rechazo suelto, bloqueo del cierre) y el
  estado "sin respuesta". El rechazo queda solo en la puerta.
- El selector inicial de hasta 3 rutas se mantiene; "respeta horarios" usa el mismo cálculo
  de llegada y cuenta también llegar ANTES del bloque.
- "Tiempo real" = sondeo cada 30 s con la app abierta (sin push).
- Etiqueta "Persona no encontrada" / "No estaba" → **No morador** en la app y el panel. Valor
  guardado sin cambios.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - "Mañana" saca el pedido de la ruta (Priority: P1)

**Independent Test**: con la ruta en curso, llega "Mañana" de un pedido pendiente: queda No
morador, con su evento, y deja de ser una parada por visitar.

1. **Given** un pedido pendiente en la ruta, **When** el receptor toca "Mañana", **Then** el pedido queda No morador, sale un evento `omision · persona_no_encontrada` y la ruta sigue con el siguiente.
2. **Given** un pedido ya entregado, **When** llega "Mañana", **Then** no cambia nada.
3. **Given** un mensaje enviado antes del cambio, **When** llega el botón viejo RECHAZAR, **Then** se trata como "Mañana".

### User Story 2 - "Otro horario" lo reubica (Priority: P1)

**Independent Test**: con la ruta en curso, un pedido elige 16–18: pasa al lugar donde la
llegada estimada cae en ese bloque; el resto mantiene su orden.

1. **Given** una ruta de 10 paradas desde las 10:00, **When** la parada 2 elige 16–18, **Then** sale de su lugar y queda donde se llega entre 16:00 y 18:15, o al final con aviso si no alcanza.
2. **Given** pedidos sin horario, **When** se reubica uno con horario, **Then** los demás conservan su orden relativo y lo cerrado no se mueve.
3. **Given** cada cambio, **When** se aplica, **Then** el conductor ve un aviso ("Ana pidió mañana: No morador", "Pedro (16–18) pasa a la parada 7").

### User Story 3 - Contacto simple (Priority: P2)

**Independent Test**: no existe rechazo por WhatsApp ni "sin respuesta"; quien no contesta
sigue en la ruta y al acercarse se pide llamar.

### Edge Cases

- "Otro horario" sin bloque elegido todavía: el pedido no se mueve.
- Varios con horario: se ubican en orden de bloque y ninguno empeora a los ya ubicados.
- Sin señal: los cambios se aplican al volver; el trazado gris se pide de nuevo si hay red.

## Requirements *(mandatory)*

- **FR-001**: `AccionWhatsApp` = `CONFIRMAR` · `MANANA` · `HORARIO`; RECHAZAR legado → MANANA.
- **FR-002**: `Disponibilidad` = `pendiente_respuesta` · `confirmado` · `horario_indicado` · `manana`.
- **FR-003**: "Mañana" MUST cerrar el pedido (No morador + evento) en una transacción.
- **FR-004**: Al aplicar respuestas con horario o mañana, la ruta pendiente MUST reordenarse: cerrados primero, sin horario en su orden, con horario por llegada estimada.
- **FR-005**: La llegada estimada MUST contar como fuera de horario llegar antes o después del bloque (tolerancia 15 min).
- **FR-006**: Cada cambio MUST mostrarse al conductor.
- **FR-007**: Migración: `respuesta_accion` acepta `MANANA` (conserva `RECHAZAR` para filas viejas).
- **FR-008**: Documentar la plantilla nueva de Meta y el orden de despliegue.

## Success Criteria *(mandatory)*

- **SC-001**: `rechazoPendiente`, `registrarRechazo`, `disponibilidad_sin_respuesta` y `RECHAZAR` (salvo el alias legado) no existen en `src/`.
- **SC-002**: Pruebas de reubicación por horario, cierre por "Mañana" y alias legado; suite, lint y build en verde.
