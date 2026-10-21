# Feature Specification: Cumplimiento de datos personales (Ley 21.719)

**Feature Branch**: `007-cumplimiento-datos` | **Created**: 2026-10-20 | **Status**: Draft

**Input**: "Se borra la información del pedido una vez que se termina el día. Quiero que
todo vaya en regla, pero lo legal no debe frenar el desarrollo."

## Contexto

- Starken = responsable de los datos de destinatarios; el negocio = encargado (art. 15 bis).
  Registro, proveedores y lista de lanzamiento: `docs/PRIVACIDAD.md`.
- Esta spec es la parte de software del cumplimiento. Los trámites (§6 de PRIVACIDAD) no
  son código y no bloquean desarrollo ni piloto (constitución v1.3.0, principio V).
- Hoy el teléfono nunca borra pedidos: los entregados quedan y los pendientes pasan al día
  siguiente. Esta spec lo cambia.

## User Scenarios & Testing *(mandatory)*

### US1 - Todo se borra al cerrar el día (P1)

Como dueño, quiero que al cerrar el día el teléfono borre los datos de destinatarios y
deje solo conteos, para que la exposición nunca supere un día.

**Independent Test**: 5 pedidos, 3 entregados, 2 no; cerrar → no queda nombre, teléfono,
dirección, OF, ruta ni foto; solo el resumen (3 entregados, 2 no entregados).

1. **Given** día con entregados y no entregados, **When** se cierra, **Then** se muestra "No entregados" (OF) y, al confirmar, se borra todo.
2. **Given** día sin cerrar, **When** la app se abre otro día, **Then** muestra "No entregados" de ese día, cierra y borra antes del día nuevo.
3. **Given** días anteriores, **When** el conductor los revisa, **Then** ve solo conteos.
4. **Given** eventos sin enviar, **When** se borra el día, **Then** la cola se conserva hasta enviarse (no tiene datos de destinatarios).
5. **Given** pedidos no entregados, **When** se borra el día, **Then** no pasan al día siguiente.

### US2 - Borrado al perder el acceso (P1)

Como dueño, quiero desactivar la cuenta de un conductor y que la app borre lo local.

**Independent Test**: datos cargados → desactivar cuenta en el panel → abrir la app con
conexión → datos borrados y se pide iniciar sesión.

1. **Given** cuenta desactivada, **When** la app se abre con conexión, **Then** borra los datos de destinatarios antes de mostrar nada.
2. **Given** cierre de sesión, **When** se confirma, **Then** se borran los datos de destinatarios (aviso previo si hay eventos sin enviar).

### US3 - Modo piloto / oficial y registro de proveedores (P3)

Como dueño, quiero ver qué proveedores reciben datos y si Starken los autorizó, y un
interruptor "lanzamiento oficial" que solo deje funcionar lo autorizado.

**Independent Test**: en piloto, IA y WhatsApp automático funcionan aunque estén pendientes;
en oficial se apagan con explicación; al registrar la autorización vuelven.

1. **Given** el panel, **When** se abre "Privacidad", **Then** lista proveedores (datos que reciben, estado, fecha, documento) y el modo actual.
2. **Given** modo piloto (por defecto), **When** se usa un proveedor pendiente, **Then** funciona y el panel muestra cuántos faltan.
3. **Given** modo oficial, **When** se usa un proveedor pendiente, **Then** la función se apaga y explica por qué.

### US4 - Mensajes que dicen quién escribe (P2)

1. **Given** una plantilla de aviso, **When** se guarda, **Then** exige nombre del negocio y mención del envío de Starken.
2. **Given** un mensaje, **When** se envía, **Then** no contiene publicidad ni contenido ajeno a la entrega.

### US5 - Verificación automática (P2)

1. **Given** la suite, **When** corre, **Then** falla si la cola, las tablas o los endpoints guardan o registran datos de destinatarios.
2. **Given** el código, **When** corre la prueba de arquitectura, **Then** todo dominio externo contactado figura en `docs/PRIVACIDAD.md`.
3. **Given** un cierre de día simulado, **When** termina, **Then** las pruebas verifican que no queda ningún dato de destinatarios.

### Edge Cases

- Cierre sin conexión: se borra igual; la cola sale después.
- El día cierra por acción explícita o primera apertura de otro día, no a medianoche.
- La lista "No entregados" se puede revisar hasta confirmar el cierre.
- Reclamo posterior al cierre: ARES no tiene el dato; se consulta a Starken.
- Fotos de la spec 003: se borran con el día.
- Cola con eventos de otro conductor (teléfono compartido): no se envían con otra sesión; se conservan.

## Requirements *(mandatory)*

- **FR-001**: Al cerrar el día MUST borrarse: pedidos, ruta, referencias y fotos, coordinación de avisos.
- **FR-002**: Antes de borrar MUST mostrarse "No entregados" (OF) y pedirse confirmación.
- **FR-003**: Un día sin cerrar MUST cerrarse y borrarse en la primera apertura de otro día.
- **FR-004**: Después del borrado solo MAY quedar `ResumenDia` (conteos, sin datos de personas).
- **FR-005**: La cola de eventos MUST conservarse hasta enviarse y MUST NOT tener datos de destinatarios.
- **FR-006**: Los pedidos no entregados MUST NOT pasar al día siguiente.
- **FR-007**: Cuenta desactivada o cierre de sesión MUST borrar los datos de destinatarios del teléfono.
- **FR-008**: El panel MUST mostrar proveedores, datos que reciben y estado de autorización.
- **FR-009**: Modos **piloto** (defecto; todo funciona, se indica lo pendiente) y **oficial** (proveedor pendiente = función apagada). Lo legal MUST NOT bloquear el piloto.
- **FR-010**: Las plantillas MUST identificar al negocio y el envío de Starken, sin contenido ajeno.
- **FR-011**: Pruebas automáticas MUST verificar FR-001, FR-005, FR-007 y que todo dominio externo esté en `docs/PRIVACIDAD.md`.

### Key Entities

- **ResumenDia** (teléfono): fecha, asignados, entregados, noEntregadas, cierre.
- **Registro de proveedores** (servidor, en `empresa`): clave, estado, fecha y documento de autorización.
- **Modo de operación** (servidor, en `empresa`): `piloto` | `oficial`.

Ver `data-model.md` y `docs/CLASES.md`.

## Success Criteria *(mandatory)*

- **SC-001**: Tras el cierre, cero datos de destinatarios en el teléfono (prueba automática).
- **SC-002**: Cero eventos de actividad perdidos por el borrado.
- **SC-003**: En modo oficial, ninguna función con proveedor pendiente activa; en piloto, ninguna bloqueada.
- **SC-004**: Al pasar a oficial, todos los proveedores en uso tienen autorización registrada.

## Assumptions

- Starken reasigna lo no entregado en guías posteriores.
- El servidor ya cierra a las 00:30 los días abiertos; el teléfono borra al cerrar o en la primera apertura posterior.
- Afecta a 003 (fotos), 004 (sin historial entre días), 005 (proveedor de lectura), 006 (asignados).
- `dias` entra en la misma versión de IndexedDB que la 003 si se implementan juntas (v4; la v3 la tomó la 009); si no, la siguiente libre.
- Desde la 009 un pedido es de un solo día: la 007 solo borra, no tiene que cortar ningún arrastre.
- Prerrequisito: spec 002 Fase 1–2 + US1.
