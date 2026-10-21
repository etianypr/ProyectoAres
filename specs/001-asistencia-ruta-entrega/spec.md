# Feature Specification: Asistencia de ruta y entrega

**Feature Branch**: `001-asistencia-ruta-entrega`

**Created**: 2026-08-20

**Status**: Implementada (2026-08). 44/49 tareas; 5 bloqueadas por requerir teléfono, base real o medición en terreno (ver `tasks.md`). Histórica: el comportamiento vigente está en `docs/`.

**Input**: User description: "Asistir al conductor de encomiendas para localizar clientes, ahorrar tiempo mediante comunicación por WhatsApp, generar la mejor ruta posible y registrar entregas para que el jefe conozca el resultado de la jornada."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar pedidos y confirmar ubicaciones (Priority: P1)

Como conductor, quiero ingresar rápidamente los pedidos y confirmar que cada dirección corresponde a la ubicación correcta, para comenzar una ruta sin perder tiempo buscando domicilios incorrectos.

**Why this priority**: Una ubicación incorrecta impide la entrega y afecta todas las decisiones posteriores de la ruta.

**Independent Test**: Se puede probar cargando pedidos con teléfonos, nombres y direcciones válidas, ambiguas y no encontradas, y verificando que cada pedido quede confirmado, corregible o advertido antes de incorporarse a una ruta.

**Acceptance Scenarios**:

1. **Given** un pedido con nombre, teléfono y dirección, **When** el conductor lo guarda, **Then** el teléfono queda normalizado con formato chileno y la aplicación muestra el resultado de la búsqueda de ubicación.
2. **Given** una dirección con varias coincidencias, **When** el conductor revisa el pedido, **Then** puede comparar las coincidencias y seleccionar o corregir la ubicación correcta.
3. **Given** una dirección que no puede resolverse automáticamente, **When** el conductor la revisa, **Then** puede editar el texto y confirmar manualmente un punto sin que la aplicación lo incorpore silenciosamente como una ubicación confiable.
4. **Given** un pedido con un dato equivocado, **When** el conductor lo edita antes de iniciar la ruta, **Then** la información corregida reemplaza el dato anterior y queda disponible para la comunicación y el reparto.

---

### User Story 2 - Avisar al receptor y generar la ruta (Priority: P1)

Como conductor, quiero que la aplicación avise al receptor cuando su pedido quede ubicado y me ayude a elegir la mejor ruta, para saber con anticipación quién podrá recibirlo y reducir el tiempo de reparto.

**Why this priority**: La comunicación anticipada permite ordenar la ruta según disponibilidad real y evita viajes fallidos.

**Independent Test**: Se puede probar con un conjunto de pedidos ubicados, respuestas simuladas de receptores y distintas alternativas de orden, verificando que los avisos, estados y rutas resultantes respeten las reglas del producto.

**Acceptance Scenarios**:

1. **Given** un pedido con ubicación confirmada que fue incorporado a una ruta, **When** queda listo para planificarse, **Then** el receptor recibe inmediatamente un mensaje con las opciones de disponibilidad.
2. **Given** un receptor que responde que sí puede recibir, **When** llega su respuesta, **Then** el pedido queda marcado como confirmado y visible como tal para el conductor.
3. **Given** un receptor que selecciona un bloque horario, **When** llega su respuesta, **Then** el bloque queda asociado al pedido y se considera al ordenar la ruta.
4. **Given** un receptor que responde que no recibirá el pedido, **When** llega su respuesta, **Then** el pedido queda rechazado, se excluye de futuros intentos automáticos y se destaca para el jefe.
5. **Given** pedidos confirmados y pedidos sin respuesta, **When** el conductor solicita una ruta, **Then** la aplicación puede incluir ambos, identifica los pendientes de contacto y prioriza las disponibilidades compatibles.
6. **Given** una única ruta claramente mejor, **When** termina la planificación, **Then** la aplicación muestra esa ruta sin obligar al conductor a comparar alternativas innecesarias.
7. **Given** más de una ruta útil, **When** termina la planificación, **Then** la aplicación muestra como máximo tres alternativas con tiempo, distancia, cantidad de pedidos y advertencias relevantes.

---

### User Story 3 - Ejecutar el reparto y registrar resultados (Priority: P1)

Como conductor, quiero recibir indicaciones sobre el próximo cliente y registrar el resultado con pocos toques, para entregar más pedidos y dejar información confiable al finalizar la jornada.

**Why this priority**: El registro del resultado es el dato operativo que permite medir las entregas y calcular el pago del conductor.

**Independent Test**: Se puede probar ejecutando una ruta de prueba y marcando cada resultado, incluyendo clientes confirmados, pendientes, no encontrados, sin respuesta y rechazos.

**Acceptance Scenarios**:

1. **Given** una ruta seleccionada, **When** el conductor inicia el reparto, **Then** ve el orden de las paradas y la próxima acción sin tener que reconstruir la ruta manualmente.
2. **Given** una parada cuyo receptor no respondió, **When** el conductor se aproxima, **Then** la aplicación identifica que debe llamar o contactar al receptor.
3. **Given** un pedido que fue entregado, **When** el conductor marca la entrega, **Then** queda registrado como entregado y la aplicación avanza al siguiente pedido.
4. **Given** que el conductor no encuentra a la persona, **When** registra el resultado, **Then** el pedido queda como persona no encontrada y no como entregado.
5. **Given** que no obtiene respuesta al intentar contactar al receptor, **When** registra el resultado, **Then** el pedido queda como sin respuesta y se conserva para revisión.
6. **Given** que el receptor rechaza la entrega, **When** el conductor registra el resultado, **Then** el pedido queda como rechazo y no se propone automáticamente para otra jornada.
7. **Given** que el conductor cometió un error en un dato o estado, **When** lo corrige con permiso, **Then** el resultado actualizado queda visible para el jefe.

---

### User Story 4 - Revisar el resultado de la jornada (Priority: P2)

Como jefe de conductores, quiero ver un resumen confiable de cada jornada, para conocer cuántos pedidos se entregaron y calcular el pago según las reglas vigentes.

**Why this priority**: El jefe necesita el resultado de las entregas, pero este escenario depende de que el conductor haya podido ejecutar y registrar la ruta.

**Independent Test**: Se puede probar con una jornada que contenga resultados mixtos y verificar que los totales y motivos coincidan con los registros individuales.

**Acceptance Scenarios**:

1. **Given** una jornada con pedidos registrados, **When** el jefe abre el resumen, **Then** ve totales separados de entregadas, persona no encontrada, sin respuesta y rechazo.
2. **Given** pedidos con rechazo, **When** el jefe revisa la jornada, **Then** puede identificarlos para informarlos al volver a la central y no confundirlos con pedidos reintentables.
3. **Given** una jornada cerrada, **When** el jefe consulta sus resultados, **Then** obtiene los datos necesarios para aplicar bonos y reglas de pago sin que el sistema tenga que convertirse en un módulo contable.

### Edge Cases

- Un teléfono ya contiene `+569`; la aplicación no debe duplicar el prefijo.
- Un número no tiene suficientes dígitos o no puede normalizarse; el pedido debe quedar advertido y no enviarse a un destinatario equivocado.
- Una dirección devuelve varias coincidencias, una coincidencia de baja confianza o ninguna coincidencia.
- Un proveedor de mapas no responde durante la revisión de una dirección.
- Un pedido se incorpora a la ruta después de que ya se generó una alternativa.
- WhatsApp no puede enviar el mensaje o el receptor responde fuera del periodo de planificación.
- El receptor confirma un bloque horario incompatible con el resto de la ruta.
- Un receptor confirma por WhatsApp, pero luego no es encontrado en el domicilio.
- El receptor responde que no recibirá el pedido; el estado no debe convertirse en una entrega pendiente de otro día.
- El conductor pierde conexión durante el reparto y recupera la aplicación después.
- El conductor intenta cerrar la jornada con pedidos todavía sin resultado.
- Un mismo pedido recibe respuestas o actualizaciones duplicadas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir al conductor crear un pedido con nombre, teléfono y dirección del receptor.
- **FR-002**: El sistema MUST normalizar teléfonos chilenos y agregar `+569` cuando el número no lo incluya, sin duplicarlo.
- **FR-003**: El sistema MUST validar que los datos mínimos del pedido estén presentes antes de incorporarlo a una ruta.
- **FR-004**: El sistema MUST buscar la dirección y mostrar su nivel de confianza o advertir cuando el resultado sea ambiguo o insuficiente.
- **FR-005**: El sistema MUST permitir al conductor corregir la dirección y confirmar manualmente la ubicación del pedido.
- **FR-006**: El sistema MUST permitir más de una fuente de búsqueda de direcciones o una recuperación equivalente cuando la fuente principal falle o no encuentre el domicilio.
- **FR-007**: El sistema MUST enviar un aviso al receptor inmediatamente después de que el pedido quede correctamente ubicado dentro de una ruta.
- **FR-008**: El aviso MUST ofrecer las respuestas predefinidas de confirmar disponibilidad, rechazar la recepción o seleccionar un bloque horario.
- **FR-009**: El sistema MUST ofrecer inicialmente los bloques `08:00-10:00`, `10:00-12:00`, `12:00-14:00`, `14:00-16:00`, `16:00-18:00` y `18:00-20:00`.
- **FR-010**: El sistema MUST permitir al jefe configurar los bloques horarios disponibles.
- **FR-011**: El sistema MUST conservar por separado la respuesta de disponibilidad y el resultado real del reparto.
- **FR-012**: El sistema MUST impedir que un rechazo sea propuesto automáticamente para otra jornada.
- **FR-013**: El sistema MUST generar la mejor ruta disponible según tiempo, distancia, disponibilidad, cantidad de entregas posible y calidad de las ubicaciones.
- **FR-014**: El sistema MUST mostrar una única ruta cuando las alternativas no aporten una diferencia útil.
- **FR-015**: El sistema MUST mostrar como máximo tres alternativas cuando existan diferencias útiles, incluyendo sus tiempos, distancias, cantidad de pedidos y advertencias.
- **FR-016**: El sistema MUST identificar durante el reparto los pedidos confirmados, con horario indicado y pendientes de respuesta.
- **FR-017**: El sistema MUST avisar al conductor cuando se aproxime a un pedido pendiente de respuesta para que pueda contactar al receptor.
- **FR-018**: El sistema MUST permitir registrar como mínimo los resultados entregada, persona no encontrada, sin respuesta y rechazo.
- **FR-019**: El sistema MUST permitir al conductor corregir un dato o estado de su ruta activa y debe mostrar la actualización al jefe.
- **FR-020**: El sistema MUST impedir cerrar la jornada sin informar el resultado de cada pedido o dejar explícitamente un pedido pendiente de revisión.
- **FR-021**: El sistema MUST mostrar al jefe totales separados por resultado y el detalle de los rechazos.
- **FR-022**: El sistema MUST proporcionar los datos de entregas y reglas aplicables necesarios para calcular bonos o pagos, sin incluir un proceso contable completo.
- **FR-023**: El sistema MUST limitar el acceso a pedidos y datos de receptores según el rol del usuario.
- **FR-024**: El sistema MUST ofrecer una recuperación accionable cuando falle un proveedor externo de mapas o mensajería.

### Key Entities *(include if data involves)*

- **Encomienda**: Pedido individual con receptor, teléfono, dirección, ubicación confirmada, disponibilidad y resultado de entrega.
- **Respuesta de disponibilidad**: Respuesta del receptor al aviso, con tipo de respuesta, fecha y bloque horario cuando corresponda.
- **Bloque horario**: Intervalo configurable que el receptor puede elegir como disponibilidad.
- **Ruta**: Orden propuesta y seleccionada de paradas, con tiempo, distancia, advertencias y pedidos incluidos.
- **Parada**: Posición de una encomienda dentro de una ruta y su estado operativo durante el reparto.
- **Jornada**: Conjunto de pedidos y resultados de un conductor durante una operación de reparto.
- **Conductor**: Usuario que prepara y ejecuta una ruta.
- **Jefe**: Usuario que consulta resultados y administra reglas operativas.
- **Regla de pago**: Configuración que permite calcular el pago o bono a partir del resultado de una jornada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de los pedidos incluidos en una ruta debe tener una ubicación confirmada o una advertencia visible antes de iniciar el reparto.
- **SC-002**: El conductor debe poder cargar un pedido completo, incluyendo teléfono normalizado, en menos de 30 segundos en condiciones normales.
- **SC-003**: El aviso de disponibilidad debe enviarse dentro de un minuto desde que el pedido queda correctamente incorporado a la ruta, cuando el servicio de mensajería está disponible.
- **SC-004**: Al menos el 90% de los pedidos que tengan un número válido debe recibir un estado explícito de disponibilidad, ya sea respuesta del receptor o ausencia de respuesta registrada.
- **SC-005**: El conductor debe poder registrar el resultado de una entrega en un máximo de tres acciones principales desde la vista de la parada.
- **SC-006**: El resumen de la jornada debe coincidir con el detalle individual de pedidos en el 100% de los casos de prueba.
- **SC-007**: Tras medir una línea base de tres jornadas sin la aplicación, la operación debe aumentar en al menos 15% la cantidad promedio de pedidos entregados por conductor en jornadas comparables.
- **SC-008**: Tras medir una línea base de tres jornadas sin la aplicación, la operación debe reducir en al menos 15% el tiempo promedio de preparación y reparto en jornadas comparables.
- **SC-009**: En una prueba con direcciones ambiguas o incompletas, ningún pedido debe incorporarse sin una advertencia o confirmación visible de su ubicación.

## Assumptions

- El conductor dispone de un teléfono con conexión a internet durante la preparación y la mayor parte del recorrido.
- El servicio de WhatsApp permite enviar mensajes interactivos y recibir las respuestas predefinidas del receptor.
- El jefe configura bloques horarios que representan ventanas reales de atención de los receptores.
- La aplicación existente de autenticación, conductores, vehículos, reglas de pago y jornadas se reutilizará cuando sea compatible con estos requisitos.
- Los proveedores de mapas pueden devolver resultados diferentes; la decisión final sobre una ubicación corresponde al conductor cuando existe ambigüedad.
- Los datos completos del receptor deben exponerse únicamente a los usuarios y proveedores estrictamente necesarios para ejecutar la entrega.
- La medición de los criterios SC-007 y SC-008 comenzará con una línea base operativa acordada antes de activar la funcionalidad para producción.
- El seguimiento GPS permanente, gastos, historial detallado de viajes y contabilidad de pagos no forman parte de esta feature.
