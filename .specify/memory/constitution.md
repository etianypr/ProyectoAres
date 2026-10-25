<!--
Sync Impact Report
- Version: 1.3.2 -> 1.4.0 (MINOR: principio II, el resultado es entregado o no entregado, sin motivo)
- Historial: 1.1.0 principio VI · 1.2.0 principio V ampliado (borrado diario, rol de
  encargado, subencargados) · 1.3.0 autorizaciones exigidas al lanzamiento oficial, no al
  desarrollo · 1.3.1 redacción condensada · 1.3.2 glosario, "día" por "jornada".
-->

# ARES Encomiendas Constitution

## Core Principles

### I. Conductor-First Experience
El flujo del conductor MUST minimizar escritura, toques y atención fuera del camino. Cada
acción de entrega MUST ser clara, reversible cuando se pueda y usable en pantalla chica.
El panel MAY ser más denso, pero MUST reflejar la misma verdad operativa.

### II. Delivery Truth Over Convenience
Disponibilidad (lo que responde el receptor) y resultado de entrega MUST ser dimensiones
separadas. El resultado es entregado o no entregado, sin motivo; un pedido cerrado MUST NOT
volver a la ruta del día. Los resúmenes de pago MUST derivarse de los
resultados registrados.

### III. Test Critical Operations
Cambios en rutas, direcciones, WhatsApp, estados de entrega, pago o privacidad MUST
incluir pruebas enfocadas. Cada escenario de usuario MUST poder probarse por separado.

### IV. Resilient External Services
Proveedores de mapas y mensajería son falibles. Una dirección ambigua MUST mostrarse como
ambigua; una caída MUST dejar al conductor una salida. Un proveedor MUST NOT redefinir
estados ni reglas del negocio.

### V. Minimum Necessary Data and Legal Compliance
- Se recolecta, guarda y transmite solo lo necesario para repartir.
- **Borrado diario**: los datos de destinatarios en el teléfono MUST borrarse al cerrar
  el día de trabajo; solo conteos MAY sobrevivir.
- **Encargado**: los datos son de Starken (responsable); se tratan solo por su cuenta y
  para repartir (Ley 21.719, art. 15 bis).
- **Subencargados**: todo proveedor que reciba datos de destinatarios MUST figurar en
  `docs/PRIVACIDAD.md`. MAY usarse en desarrollo y piloto; MUST tener autorización escrita
  de Starken antes del lanzamiento oficial. Lo legal pendiente MUST NOT frenar el desarrollo.

### VI. Verifiable Architecture
- Cada `plan.md` MUST incluir un diagrama de los límites afectados y una tabla de los datos
  (tablas, stores, tipos) que crea, cambia o lee.
- `docs/ARQUITECTURA.md` (sistema y datos) y `docs/CLASES.md` (tipos y módulos) son la
  fuente canónica; un cambio de estructura los actualiza en el mismo cambio.
- Un `data-model.md` que no coincide con el código es un defecto: se corrige o se marca
  superado.

## Product Constraints

Solo encomiendas. Fuera de alcance salvo spec explícita: historial de viajes, gastos, GPS
permanente, contabilidad, logística general. App del conductor y panel son experiencias
separadas. Naranja como color principal; ningún estado depende solo del color.

## Development Workflow

- Cada feature: spec (escenarios, requisitos verificables, criterios medibles, supuestos,
  bordes) → plan → tareas. Los planes cumplen el principio VI.
- Terminado = validación enfocada + `npm test`, `npm run lint`, `npm run build` en verde.
- Documentos concisos: viñetas, sin repetir lo que vive en otro documento (se enlaza).

### Architecture Rules

- Capas: `app → components → lib`. `lib` MUST NOT importar de `app` ni `components`;
  `components/ui` sin lógica de dominio.
- Un módulo que lee un secreto MUST `import "server-only"`. El código del teléfono
  (`lib/encomiendas/local/`) MUST NOT importarse desde el servidor.
- Nombres de dominio en castellano; término canónico **conductor** (no agregar "conductor").
- Un archivo de más de ~400 líneas SHOULD dividirse por responsabilidad al tocarlo.

## Governance

Esta constitución rige producto e ingeniería. Una enmienda MUST documentarse, subir versión
y explicar su efecto en las specs. Las revisiones verifican los principios afectados. Una
excepción MUST indicar alcance, motivo y condición de término.

**Version**: 1.4.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-10-21
