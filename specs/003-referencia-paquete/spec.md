# Feature Specification: OF y referencia de cada paquete

**Feature Branch**: `003-referencia-paquete` · **Created**: 2026-10-20 · **Status**: Draft
(rehecha el 2026-10-24: sin número escrito en el paquete)

**Input**: "En cada parada se pierde tiempo buscando el paquete; se soluciona con una
referencia de cómo es." · "Importante tener a mano el número de orden (la OF) cuando se va a
entregar a un cliente." · "Ya no se escribe el número con rotulador."

**Decisiones**:
- **No se escribe nada en el paquete** (2026-10-24). La parada se reconoce por su **OF**
  (impresa en la etiqueta) y por la **referencia** (cómo es el paquete). Se van la numeración
  fija del día, la lista para rotular y la búsqueda por número.
- La **OF** se muestra grande en la parada activa al registrar la entrega. Esta spec agrega
  `Pedido.of` (9 dígitos); llega sola desde la guía y el código de barras (spec 005). A mano
  solo en el pedido agregado a mano, para que su etiqueta lo encuentre.
- **El paquete no se describe a mano** (2026-10-24): la descripción y la foto salen del escaneo
  de la etiqueta (spec 005, FR-011); los botones de tipo, tamaño y color son el respaldo dentro
  del escaneo cuando no hay IA. Esta spec aporta los campos, la tarjeta de parada y la búsqueda.
- Todo se borra al cerrar el día (spec 007).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver en la parada qué paquete buscar y su OF (Priority: P1)

Como conductor, al llegar quiero ver en grande "**OF 123 456 789 · Bolsa gris grande** · cinta
roja", para sacar el paquete sin leer etiquetas y tener la OF a mano al entregar.

**Independent Test**: tres pedidos con OF y referencia, ruta confirmada; cada parada muestra
OF y referencia antes que la dirección.

1. **Given** OF 123456789 y referencia bolsa·grande·gris·"cinta roja", **When** es la parada activa, **Then** muestra la OF (en grupos de 3 dígitos) y "Bolsa gris grande · cinta roja" en la letra más grande.
2. **Given** foto del paquete, **When** es la parada activa, **Then** hay miniatura que se amplía con un toque.
3. **Given** sin OF o sin referencia, **When** es la parada activa, **Then** muestra lo que haya ("sin referencia") sin espacio extra.
4. **Given** "Pedido finalizado", **When** se toca, **Then** la OF sigue a la vista en la confirmación (para registrarla donde corresponda).

### User Story 2 - La descripción llega con el escaneo de la etiqueta (Priority: P1)

Como conductor, no quiero escribir cómo es cada paquete: al escanear la etiqueta (spec 005)
la descripción y la foto quedan en el pedido. Si no hay IA, la completo con tres toques (tipo,
tamaño, color) en la misma pantalla del escaneo.

**Independent Test**: con la 005, escanear una etiqueta → la parada muestra la descripción; sin
IA, tres toques la arman.

1. **Given** la lectura de la etiqueta con IA, **When** termina, **Then** la referencia y la foto quedan en el pedido sin escribir nada.
2. **Given** sin IA, **When** termina el escaneo, **Then** "Bolsa", "Grande", "Gris" arman la referencia con tres toques.
3. **Given** la foto, **When** se guarda, **Then** queda solo en el teléfono como miniatura.
4. **Given** un pedido agregado a mano, **When** escribe la OF, **Then** se valida que tenga 9 dígitos.

### User Story 3 - Encontrar la parada de un paquete por su OF (Priority: P3)

Como conductor, con un paquete en la mano quiero escribir los últimos dígitos de la OF y ver
a qué parada pertenece.

1. **Given** la OF 123456789 en la ruta, **When** busca "6789", **Then** ve el pedido y su lugar en la ruta.
2. **Given** dígitos que no coinciden con ningún pedido activo, **When** busca, **Then** la app lo dice.

### Edge Cases

- Eliminado y restaurado el mismo día: conserva OF y referencia.
- Dos pedidos con la misma OF: se avisa al guardar el segundo (posible doble carga).
- Sin espacio para la foto: se descarta con aviso; el pedido se guarda.
- La foto puede mostrar la etiqueta: es dato personal (FR-008, FR-009).

## Requirements *(mandatory)*

- **FR-001**: `Pedido.of`: 9 dígitos, opcional en la carga manual, único entre los pedidos del día (aviso si se repite).
- **FR-002**: referencia con tipo (caja, bolsa, sobre, otro), tamaño (chico, mediano, grande), color (lista corta) y nota ≤ 40 caracteres.
- **FR-003**: referencia opcional.
- **FR-004**: tarjeta de parada: OF y referencia primero, letra más grande; la OF sigue visible al marcar la entrega.
- **FR-005**: agregar, ampliar y quitar foto.
- **FR-006**: búsqueda de pedido activo por los últimos dígitos de la OF.
- **FR-007**: nada se escribe en el paquete; la secuencia de la ruta puede cambiar al reoptimizar.
- **FR-008**: OF, referencia y foto solo en el teléfono.
- **FR-009**: fotos comprimidas; se borran al dejar de estar activo el pedido y al cerrar el día (spec 007).
- **FR-010**: todo funciona sin conexión.

## Success Criteria *(mandatory)*

- **SC-001**: paquete identificado en ≤ 15 s en la parada (20 paradas medidas en terreno).
- **SC-002**: la referencia suma ≤ 5 s por pedido.
- **SC-003**: ≥ 90 % de pedidos con referencia tras la primera semana.
- **SC-004**: la OF está a la vista en el 100 % de las entregas de pedidos que la tienen.
- **SC-005**: ninguna foto sobrevive al cierre del día.

## Assumptions

- Un conductor; ≤ 60 pedidos; la OF va impresa en la etiqueta de Starken.
- Colores iniciales: café, blanco, negro, gris, amarillo, azul, rojo, verde, transparente.
- Requiere spec 002 Fase 1–2 + US1; separa la tarjeta de parada de `pantalla.tsx`.
- Antes de implementar: `/speckit-plan` y `/speckit-tasks` generan el plan y las tareas.
