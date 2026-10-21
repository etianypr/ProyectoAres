# Feature Specification: Menos visitas fallidas

**Branch**: `004-menos-visitas-fallidas` · **Created**: 2026-10-20 · **Status**: Draft · **Input**: segundo dolor del negocio, visitas fallidas (`docs/HOJA-DE-RUTA.md`).

**Decisiones**
- El aviso automático de la 001 (Meta) está construido pero inactivo; esta spec no lo espera.
- Sin historial entre días: todo se borra al cerrar (spec 007). Lo no entregado vuelve en otra guía.
- Autorización de Starken para Meta: solo en modo "lanzamiento oficial" (spec 007 FR-009).
- El teléfono del receptor llega al escanear la etiqueta (spec 005) o se carga a mano.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Avisar desde el WhatsApp del conductor (Priority: P1)

Conductor: avisa a cada receptor con un toque y un mensaje ya escrito, sin esperar a Meta.

**Why this priority**: funciona hoy, sin trámites, y ataca el segundo dolor del negocio.

**Independent Test**: 3 pedidos → "Avisar" abre WhatsApp con número y mensaje correctos → al volver, el pedido dice "avisado HH:MM".

**Acceptance Scenarios**:

1. **Given** pedido con teléfono válido, **When** toca "Avisar por WhatsApp", **Then** abre su WhatsApp con el chat del número y el mensaje prellenado (nombre + franja estimada), editable.
2. **Given** que volvió a la app, **When** ve el pedido, **Then** figura "avisado HH:MM" y el botón pasa a "Avisar de nuevo".
3. **Given** varios sin avisar, **When** usa "Avisar a todos", **Then** la app los recorre de a uno (abrir, volver, siguiente).
4. **Given** que el receptor contestó por WhatsApp, **When** el conductor lo registra, **Then** usa los estados de disponibilidad existentes con un toque.

### User Story 2 - "Voy llegando" (Priority: P1)

Conductor: avisa justo antes de llegar, que es cuando importa.

**Why this priority**: el aviso de la mañana no garantiza que la persona siga ahí al llegar.

**Independent Test**: ruta simulada → a ≤10 min de una parada aparece "Avisar que voy llegando" con el tiempo estimado; se registra.

**Acceptance Scenarios**:

1. **Given** parada a ≤10 min estimados, **When** mira la próxima parada, **Then** ve "Avisar que voy llegando (~N min)".
2. **Given** que ya avisó "llegando" a esa parada, **When** se sigue acercando, **Then** no vuelve a insistir.
3. **Given** receptor sin confirmar, **When** se acerca, **Then** se sugiere primero llamar (comportamiento actual) y el aviso queda como segunda opción.

### User Story 3 - No entregados del día (Priority: P2)

Conductor: termina el día sabiendo qué paquetes no entregó (spec 012: sin motivo).

**Why this priority**: evita paquetes perdidos; depende de los resultados ya registrados.

**Independent Test**: marcar dos pedidos "No entregado" → la lista "No entregados" muestra ambos con su OF.

**Acceptance Scenarios**:

1. **Given** pedidos no entregados, **When** abre "No entregados" (o cierra el día), **Then** ve la OF de cada uno.
2. **Given** un no entregado, **When** se registra, **Then** sale de la ruta del día.

### User Story 4 - Aviso automático sin doble aviso (Priority: P3)

Responsable del producto: cuando Meta habilite el envío automático, la app lo usa sin que nadie reciba dos avisos.

**Why this priority**: depende de un trámite externo; el código ya existe (001).

**Independent Test**: con el automático configurado en prueba → al cargar un pedido sale el aviso; el botón manual dice "ya avisado (automático)".

**Acceptance Scenarios**:

1. **Given** automático no configurado, **When** carga pedidos, **Then** se ofrece el aviso manual (US1) y la app lo dice.
2. **Given** pedido avisado automáticamente, **When** mira el botón manual, **Then** dice "ya avisado" y solo permite reenvío explícito.
3. **Given** el panel, **When** abre Configuración, **Then** ve si el automático está activo y qué falta (verificación Meta, plantilla, token).

### Edge Cases

- Teléfono inválido o sin WhatsApp → ofrecer llamar o SMS.
- No vuelve a la app tras abrir WhatsApp → queda "abierto HH:MM"; la app no afirma que se envió.
- "No estaré hoy" → no disponible; se sugiere sacarlo de la ruta, sin borrarlo.
- Entrega a un tercero (vecino, conserje): [NEEDS CLARIFICATION: ¿Starken lo acepta? Si sí, es un resultado nuevo que cuenta como entregado].
- Varias paradas cerca (pasaje) → "llegando" para cada una dentro del umbral, en orden.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Abrir el WhatsApp del conductor con número y mensaje prellenado en un toque, desde el pedido y la parada.
- **FR-002**: El mensaje MUST incluir nombre del receptor y franja estimada (sin ruta: "durante el día"); editable antes de enviar.
- **FR-003**: Textos base configurables por el jefe en el panel.
- **FR-004**: Cada aviso MUST registrarse en el pedido: tipo (programado · llegando), canal (whatsapp_propio · automatico · llamada), hora.
- **FR-005**: "Avisar a todos" en secuencia.
- **FR-006**: Registrar a mano la respuesta con los estados de disponibilidad existentes.
- **FR-007**: Ofrecer "llegando" cuando el tiempo estimado a la parada sea ≤10 min, una vez por parada.
- **FR-008**: Los no entregados del día MUST estar en "No entregados" (OF); la pantalla de cierre de la spec 007 (FR-002) la usa.
- **FR-009**: Con el automático activo, MUST NOT enviarse un segundo aviso programado a un receptor ya avisado, salvo reenvío explícito.
- **FR-010**: El panel MUST mostrar estado del automático y faltantes técnicos; la autorización de Starken para Meta se exige solo en modo oficial (007 FR-009).
- **FR-011**: Nombre, teléfono, mensajes y respuestas: solo en el teléfono, borrados al cerrar el día. El aviso por WhatsApp propio no pasa por el servidor.
- **FR-012**: Todo mensaje MUST identificar al negocio, el envío de Starken y el motivo; sin contenido ajeno (007 FR-010).

### Key Entities

MensajeEnviado (en `Pedido.mensajes`; el aviso automático es `Pedido.aviso`) · No entregados (vista derivada) · Plantillas (`empresa`). Detalle en `data-model.md`.

## Success Criteria *(mandatory)*

- **SC-001**: ≥90 % de los pedidos del día con un aviso registrado antes de la visita.
- **SC-002**: Visitas fallidas por día −30 % frente a las 2 semanas previas (no entregados del panel o spec 006).
- **SC-003**: Avisar a un receptor ≤5 s (abrir, enviar, volver).
- **SC-004**: 100 % de los no entregados en "No entregados" al cerrar.
- **SC-005**: Ningún receptor recibe dos avisos programados el mismo día sin reenvío explícito.

## Assumptions

- WhatsApp (o Business) instalado en el mismo teléfono que la app; abrirlo con mensaje prellenado no requiere permisos.
- Franja estimada y tiempo a la parada salen de la ruta generada (ver `research.md`).
- Activar el automático (verificación Meta, plantilla, token) es un trámite paralelo; no bloquea US1–US3.
