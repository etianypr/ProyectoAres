# Feature Specification: Un pedido por día

**Feature Branch**: `009-pedido-del-dia` · **Created**: 2026-10-21 · **Status**: Implementada

**Input**: "¿Por qué `ParadaLocal` y `PedidoLocal` son clases distintas si podrían ser lo
mismo? Lo considero redundante." · "Da lo mismo que pase para el otro día porque se puede
volver a escanear; pasar pedidos al día siguiente es más un problema que una solución."

**Decisiones**:
- Un pedido pertenece a **un solo día**. Lo no entregado no se arrastra: al día siguiente se
  vuelve a cargar o escanear.
- Sin arrastre, un pedido tiene a lo sumo una visita: `ParadaLocal` se funde en
  `PedidoLocal`, y `estado` y `entrega` pasan a ser un solo campo (`entrega`).
- `disponibilidad` (lo que dijo el receptor por WhatsApp) sigue aparte de `entrega` (lo que
  pasó en la puerta): principio II.
- La ruta guarda solo el orden de visita. Fuera de alcance: borrar los días anteriores (es
  la spec 007, con "Devolver al hub"). Servidor y valores persistidos sin cambios.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cada día empieza limpio (Priority: P1)

Como conductor, quiero ver y rutear solo los pedidos de hoy, para no arrastrar paquetes que
ya devolví al hub.

**Independent Test**: un pedido cargado ayer (entregado o no) no aparece hoy ni entra en la
ruta de hoy.

1. **Given** un pedido no entregado ayer, **When** abro la app hoy, **Then** no aparece en la lista ni en la ruta.
2. **Given** pedidos cargados hoy, **When** armo la ruta, **Then** entran solo los de hoy que siguen pendientes.

### User Story 2 - Un solo registro por paquete (Priority: P1)

Como programador, quiero que el pedido lleve su llamada y su resultado, para no mantener dos
clases que describen el mismo paquete.

**Independent Test**: marcar llamada, entrega, deshacer, dejar para el final, eliminar y
restaurar, rechazo suelto y cierre de jornada se comportan igual que antes; marcar una
entrega escribe en 2 stores (pedidos, cola), no en 3.

1. **Given** un pedido en la ruta, **When** marco "entregado", **Then** el pedido queda `entregado` y sale un evento `entrega`.
2. **Given** un rechazo que llegó por WhatsApp y se registró, **When** corrijo el teléfono, **Then** el pedido vuelve a pendiente; un rechazo en la puerta no se reabre.
3. **Given** la ruta rehecha a media jornada, **When** se guarda, **Then** lo cerrado queda primero y la llamada ya hecha se conserva.

### User Story 3 - Actualizar sin perder el día en curso (Priority: P2)

Como conductor, quiero actualizar la app a mitad de jornada sin perder lo marcado.

**Independent Test**: una base v2 con ruta y paradas marcadas abre como v3 con los mismos
resultados en los pedidos.

1. **Given** una base v2 con paradas marcadas, **When** abre la app nueva, **Then** cada pedido trae la llamada y el resultado de su última parada, y la ruta conserva el orden.
2. **Given** la migración falla, **When** abre, **Then** la base queda en v2 intacta (transacción de versión).

### Edge Cases

- Pedido pendiente sin ruta al migrar: queda con fecha de hoy (sigue visible).
- Pedido eliminado: sale del orden; restaurarlo lo devuelve a su lugar.
- Resumen de días anteriores (menú, "ayer"): se calcula de los pedidos de ese día y su orden.

## Requirements *(mandatory)*

- **FR-001**: `PedidoLocal` MUST tener `fecha`, `llamada`, `entrega`, `horaLlamada`, `horaEntrega`; sin `estado`.
- **FR-002**: `RutaLocal` MUST guardar `orden: pedidoId[]` en lugar de `paradas`.
- **FR-003**: Leer pedidos, pendientes y armar la ruta MUST filtrar por `fecha`.
- **FR-004**: Marcar llamada o entrega MUST escribir pedido (+ cola) en una transacción, sin tocar la ruta.
- **FR-005**: Deshacer, dejar para el final, eliminar/restaurar, rechazo suelto y cierre de jornada MUST conservar su comportamiento.
- **FR-006**: Corregir el teléfono MUST reabrir solo el rechazo que vino por WhatsApp.
- **FR-007**: IndexedDB v3 MUST migrar v2 en la apertura, de forma atómica: resultados de la última parada al pedido, `fecha` del pedido, `orden` de la ruta; quita el índice `por_estado`.
- **FR-008**: `docs/CLASES.md` y `docs/ARQUITECTURA.md` MUST reflejar el modelo nuevo.

## Success Criteria *(mandatory)*

- **SC-001**: `ParadaLocal`, `EstadoPedidoLocal` y `estadoPedidoTras` no existen en `src/`.
- **SC-002**: Suite completa, lint y build en verde; pruebas nuevas para fecha, migración y rechazo.
- **SC-003**: Ningún archivo de `local/almacen/` > 400 líneas.
