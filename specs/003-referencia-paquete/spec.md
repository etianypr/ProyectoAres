# Feature Specification: Número y referencia de cada paquete

**Feature Branch**: `003-referencia-paquete` · **Created**: 2026-10-20 · **Status**: Draft

**Input**: "En cada parada se pierde tiempo buscando el paquete; se soluciona con una
referencia de cómo es. Se escribe con rotulador la posición del pedido en la ruta
optimizada."

**Decisiones**: número = posición en la ruta optimizada, fijo en el día · todo se borra al
cerrar el día (spec 007) · con la spec 005, el escaneo de etiqueta muestra el número y llena
la referencia; esta spec aporta campos, numeración, tarjeta de parada y carga manual.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver en la parada qué paquete buscar (Priority: P1)

Como conductor, quiero ver en grande "**#12 · Bolsa gris grande** · cinta roja" al llegar,
para sacar el paquete sin leer etiquetas.

**Independent Test**: tres pedidos con referencia, ruta confirmada; cada parada muestra
número y referencia antes que la dirección.

1. **Given** número 12 y referencia bolsa·grande·gris·"cinta roja", **When** es la parada activa, **Then** muestra "#12" y "Bolsa gris grande · cinta roja" en la letra más grande.
2. **Given** foto del paquete, **When** es la parada activa, **Then** hay miniatura que se amplía con un toque.
3. **Given** sin referencia, **When** es la parada activa, **Then** muestra número y "sin referencia" sin espacio extra.

### User Story 2 - Describir el paquete en pocos toques (Priority: P1)

Como conductor, quiero describir el paquete tocando tipo, tamaño y color, escribiendo solo
si hace falta.

**Independent Test**: referencia con tres toques, nota y foto; reabrir y corregir.

1. **Given** el formulario, **When** toca "Bolsa", "Grande", "Gris", **Then** la referencia queda armada sin escribir.
2. **Given** algo distintivo, **When** escribe una nota (≤ 40 caracteres), **Then** se guarda con la referencia.
3. **Given** "Foto del paquete", **When** la toma, **Then** queda solo en el teléfono como miniatura.
4. **Given** un pedido numerado, **When** edita la referencia, **Then** el número no cambia.

### User Story 3 - Numerar y cargar en orden (Priority: P1)

Como conductor, al confirmar la ruta quiero cada paquete con su posición para escribirla, en
una lista al revés (último primero) que voy marcando.

**Independent Test**: ruta de 5 → lista 5…1 con número grande; marcar; agregar un pedido y
rehacer: números y marcas siguen, el nuevo es el 6.

1. **Given** la primera confirmación del día, **When** termina, **Then** cada pedido recibe su posición (1…N) y se abre "Orden de carga".
2. **Given** la lista, **When** marca "cargado", **Then** persiste aunque cierre la app.
3. **Given** paquetes numerados, **When** se reoptimiza, **Then** los números no cambian y el orden de visita muestra los números escritos (1, 2, 6, 3…).
4. **Given** un pedido agregado después, **When** se confirma la ruta, **Then** recibe N+1 y la app avisa que hay que escribirlo.

### User Story 4 - Encontrar la parada de un paquete (Priority: P3)

Como conductor, quiero escribir un número y ver a quién pertenece.

1. **Given** el pedido activo #12, **When** busca "12", **Then** ve el pedido y su lugar en la ruta.
2. **Given** un número inexistente, **When** lo busca, **Then** la app lo dice.

### Edge Cases

- Eliminado y restaurado el mismo día: conserva número y referencia.
- Pedido sin ruta (sin ubicar): sin número hasta entrar a una ruta confirmada.
- Pedidos de la versión anterior: se numeran en la próxima confirmación.
- Sin espacio para la foto: se descarta con aviso; el pedido se guarda.
- La foto puede mostrar la etiqueta: es dato personal (FR-010, FR-011).

## Requirements *(mandatory)*

- **FR-001**: primera confirmación de la ruta del día → número = posición (1…N).
- **FR-002**: el número no cambia en el día (reoptimizar o editar no lo mueve).
- **FR-003**: pedido que entra después → mayor asignado + 1, con aviso de escribirlo.
- **FR-004**: referencia con tipo (caja, bolsa, sobre, otro), tamaño (chico, mediano,
  grande), color (lista corta) y nota ≤ 40 caracteres.
- **FR-005**: referencia opcional.
- **FR-006**: tarjeta de parada: número y referencia primero, letra más grande.
- **FR-007**: agregar, ampliar y quitar foto.
- **FR-008**: lista de carga en orden inverso con número grande y marca persistente en el día.
- **FR-009**: búsqueda de pedido activo por número.
- **FR-010**: número, referencia y foto solo en el teléfono.
- **FR-011**: fotos comprimidas; se borran al dejar de estar activo el pedido y al cerrar el
  día (spec 007).
- **FR-012**: todo funciona sin conexión.

## Success Criteria *(mandatory)*

- **SC-001**: paquete identificado en ≤ 15 s en la parada (20 paradas medidas en terreno).
- **SC-002**: la referencia suma ≤ 5 s por pedido.
- **SC-003**: ≥ 90 % de pedidos con referencia tras la primera semana.
- **SC-004**: cero números repetidos o cambiados en el día (pruebas: reoptimización,
  tardíos, restauración).
- **SC-005**: ninguna foto sobrevive al cierre del día.

## Assumptions

- Rotulador disponible; un conductor (números del teléfono = del vehículo); ≤ 60 pedidos.
- Colores iniciales: café, blanco, negro, gris, amarillo, azul, rojo, verde, transparente.
- Requiere spec 002 Fase 1–2 + US1; separa la tarjeta de parada de `pantalla.tsx`.
