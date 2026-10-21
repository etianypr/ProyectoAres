# Feature Specification: Entregado o no entregado

**Feature Branch**: `012-entregado-o-no` · **Created**: 2026-10-21 · **Status**: Implementada (la columna `motivo` de la base se borra en 002 T051)

**Input**: "No hay respuesta es lo mismo que no morador." · "¿Qué significa que vuelva al hub?" ·
"La opción dejar pendiente está bien, pero debería estar la opción de se entregó o no
solamente, porque no quiero meterme en si el pedido hay que descartarlo para siempre o si es
temporal. Solamente no lo entregaré ese día, se tacha y si sale al otro día se verá cuando
escaneo la orden de flete."

**Decisiones**:
- `Pedido.resultado` = `pendiente` · `entregado` · `no_entregado`. Sin motivo: se van No morador,
  No hay respuesta y Rechazo, en la puerta y en el panel.
- "No se pudo" ofrece dos salidas: **Dejar como pendiente** (al final de la ruta) y **No
  entregado** (se tacha por hoy).
- "Mañana" por WhatsApp deja el pedido no entregado; `disponibilidad = manana` sigue diciendo
  qué contestó el receptor.
- Sin "hub": lo no entregado se tacha; si vuelve a salir, se escanea de nuevo (OF, spec 005).
- El evento de no entrega sale como `omision` sin motivo. El panel muestra entregados y no
  entregados, sin desglose ni tarjeta de rechazos.
- Lo guardado antes se lee como no entregado: teléfono (`persona_no_encontrada`,
  `entrega_sin_respuesta`, `rechazo`, `omitido`), cola (el motivo no se envía) y base (las
  filas con motivo cuentan igual). La columna `motivo` se borra en 002 T051.
- Specs futuras: la lista "Devolver al hub (OF + motivo)" de 004 y 007 pasa a "No entregados
  (OF)"; 006 cuenta no entregas sin motivo.

## Requirements *(mandatory)*

- **FR-001**: `ResultadoVisita` MUST ser `pendiente` · `entregado` · `no_entregado`.
- **FR-002**: "No se pudo" MUST ofrecer solo "Dejar como pendiente" y "No entregado".
- **FR-003**: La no entrega MUST salir sin motivo; el panel MUST mostrar solo entregados y no entregados.
- **FR-004**: Lo guardado con los valores anteriores MUST leerse como no entregado en el teléfono, la cola y el panel.

## Success Criteria *(mandatory)*

- **SC-001**: `persona_no_encontrada`, `entrega_sin_respuesta`, `rechazo` como resultado y `MOTIVOS_NO_ENTREGA` no existen en `src/`, salvo la conversión de `migrar.ts`.
- **SC-002**: Suite, lint y build en verde.
