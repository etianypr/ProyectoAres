# Feature Specification: Pulido del modelo de clases

**Feature Branch**: `008-modelo-dominio` · **Created**: 2026-10-21 · **Status**: Implementada

**Input**: "Haz los cambios que me recomendaste para el diagrama; tiene mucha información que
no es importante, optimízalo." Origen: `docs/CLASES.md` §6 (12 observaciones).

**Decisiones**:
- Sin cambios de comportamiento ni de datos guardados: los valores persistidos
  (`entrega_sin_respuesta`, `omision`, `rechazado`…) se conservan; se unifican tipos,
  traducciones y reglas. Cambiar valores obligaría a migrar teléfonos y la base (el pago en
  SQL depende de ellos).
- Las tres escalas de precisión geo (`Confianza`, `TipoUbicacion`, `CalidadMarca`) se
  mantienen: describen cosas distintas (sugerencia, resultado, marca GPS).
- Los estados de mensaje `entregado`/`leido` no se llevan al teléfono (ninguna pantalla los
  usa): se borra el código muerto que los esperaba.
- El diagrama de `docs/CLASES.md` se reduce a lo esencial del modelo resultante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un solo lugar para cada concepto (Priority: P1)

Como programador, quiero que cada lista cerrada y cada regla del negocio tenga una sola
definición, para cambiar una clase sin buscar copias.

**Independent Test**: suite completa en verde; búsqueda de cada concepto devuelve una
definición.

1. **Given** motivos, tipos de evento, acciones y estados de WhatsApp, **When** se buscan, **Then** cada uno está definido una vez (`catalogos.ts`).
2. **Given** las traducciones y predicados de entrega/disponibilidad, **When** se buscan, **Then** viven en `estados.ts` y nadie repite la condición.
3. **Given** "HORARIO sin bloque", **When** se traduce, **Then** hay una sola función y un solo resultado.

### User Story 2 - Tipos honestos en las fronteras (Priority: P1)

Como programador, quiero que el cliente de Supabase, las APIs de WhatsApp y el almacén del
teléfono estén tipados de punta a punta, para que el compilador detecte los errores.

**Independent Test**: `tsc` sin casts a tipos de tabla; contrato de `/status` y `/send`
compartido por servidor y teléfono; el almacén no acepta un objeto en el store equivocado.

1. **Given** los clientes de Supabase, **When** se consultan tablas, **Then** el resultado está tipado por `Database` sin `as Tabla[]`.
2. **Given** `/api/whatsapp/status` y `/send`, **When** cambia el contrato, **Then** servidor y teléfono fallan al compilar juntos.
3. **Given** `escribir()`, **When** se guarda un valor, **Then** su tipo corresponde al store.

### User Story 3 - Módulos con un solo propósito (Priority: P2)

Como programador, quiero el almacén dividido por agregado, un modelo geo propio y tipos
derivados en vez de copiados.

**Independent Test**: `almacen/` con archivos ≤ 400 líneas; sin ciclo `geocoding ↔
plus-code`; `TarifaPago`, `EventoActividad`, `DatosPedido` derivados.

1. **Given** el almacén, **When** se lista, **Then** hay un archivo por agregado y la ruta `@/lib/encomiendas/local/almacen` no cambia.
2. **Given** `Coordenada`, trazados y distancia, **When** se buscan, **Then** viven en `lib/geo/coordenada.ts`.
3. **Given** nombres repetidos (`Marca`, `ResultadoEnvio`, `esReintentable`, `METROS_PUERTA`), **When** se buscan, **Then** cada nombre tiene un solo significado.

### User Story 4 - Diagrama esencial (Priority: P2)

Como responsable del producto, quiero un diagrama de clases corto con solo lo importante.

1. **Given** `docs/CLASES.md`, **When** lo abro, **Then** veo entidades, estados y módulos clave del modelo nuevo, sin campos de auditoría ni tipos transitorios.

### Edge Cases

- Datos guardados en teléfonos con la versión anterior: se leen igual (valores sin cambio).
- Pruebas que usan funciones eliminadas: se reescriben contra la función canónica.

## Requirements *(mandatory)*

- **FR-001**: listas cerradas en `src/lib/encomiendas/catalogos.ts` (una definición).
- **FR-002**: estados, traducciones y predicados en `src/lib/encomiendas/estados.ts`.
- **FR-003**: `Database` en `src/types/db.ts`; clientes de Supabase con ese genérico; sin
  casts a tipos de tabla. Las `interface` de tablas se conservan (las lee `esquema.mjs`).
- **FR-004**: contrato de `/api/whatsapp/send` y `/status` en un módulo compartido.
- **FR-005**: almacén en `local/almacen/` por agregado, con barril `index.ts`; `idb.ts`
  tipado por store.
- **FR-006**: `lib/geo/coordenada.ts` con `Coordenada`, `PuntoLngLat`/`Trazado`, centro y
  recuadro de Arica y `distanciaMetros`; sin ciclo.
- **FR-007**: `TarifaPago`, `EventoActividad`, `EventoDia`, `DatosPedido` derivados de los
  tipos de tabla o del pedido.
- **FR-008**: nombres únicos y sin código muerto (lista en `plan.md`).
- **FR-009**: `docs/CLASES.md` esencial y actualizado.
- **FR-010**: sin cambios de comportamiento: suite, lint y build en verde.

## Success Criteria *(mandatory)*

- **SC-001**: `npm test`, `npm run lint`, `npm run build` en verde.
- **SC-002**: cero casts `as <TipoDeTabla>` en `src/`.
- **SC-003**: cada concepto de FR-001/FR-002 definido una vez.
- **SC-004**: ningún archivo de `local/almacen/` > 400 líneas.
- **SC-005**: `docs/CLASES.md` ≤ 40 % del tamaño anterior.

## Assumptions

- Se hace antes de la spec 002 US1; los módulos nuevos ya nacen en su ubicación objetivo
  (`lib/geo/coordenada.ts`, `local/almacen/`) y adelantan 002 T003, T031.
- Sin commits hasta que el responsable del producto lo pida.
