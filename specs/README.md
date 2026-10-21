# Specs (Spec Kit)

Una carpeta por feature: `spec.md` → `plan.md` (+ `research`, `data-model`, `contracts`,
`quickstart`) → `tasks.md`. Reglas: `.specify/memory/constitution.md`. Orden de trabajo:
`docs/HOJA-DE-RUTA.md`. Comandos en Claude Code: `/speckit-specify`, `/speckit-clarify`,
`/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`. Feature activa:
`.specify/feature.json`.

| Spec | Qué | Estado | Tareas | Abierto |
|---|---|---|---|---|
| [001](001-asistencia-ruta-entrega/spec.md) asistencia de ruta | avisos WhatsApp, ruta con disponibilidad, resultados de entrega | **implementada** (histórica) | 44/49; 5 bloqueadas (teléfono, base real, medición) | — |
| [002](002-reestructuracion-codigo/spec.md) reestructuración | `lib/` por dominio, archivos chicos, chofer → conductor | lista | 3/51 (T003, T031 hechas en 008) | renombrado requiere copia de la base |
| [003](003-referencia-paquete/spec.md) referencia del paquete | número (posición) en el paquete, referencia, orden de carga | lista | 0/21 | — |
| [004](004-menos-visitas-fallidas/spec.md) menos visitas fallidas | WhatsApp propio, "voy llegando", no entregados | lista | 0/21 | entrega a un tercero (caso borde) |
| [005](005-carga-rapida-pedidos/spec.md) carga rápida | guía → ruta → escaneo de etiqueta (+ IA) | lista | 0/31 | verificar `zxing-wasm` en Safari |
| [006](006-indicadores-negocio/spec.md) indicadores | entregas sobre asignado, rendimiento, margen, bono | lista | 0/15 | función para leer solo la meta del bono |
| [007](007-cumplimiento-datos/spec.md) cumplimiento | borrado diario, modo piloto/oficial | lista | 0/20 | — |
| [012](012-entregado-o-no/spec.md) entregado o no | en la puerta: pendiente al final o no entregado; sin motivos ni rechazos | **implementada** | 7/7 | borrar la columna `motivo` → 002 T051 |
| [011](011-lenguaje-dominio/spec.md) un mismo idioma | glosario en código, pantalla y docs; un solo aviso por pedido | **implementada** (parte 1) | 8/8 | parte 2 (base) → 002 T049–T050 |
| [010](010-aviso-replanifica/spec.md) aviso que replanifica | botones Sí, estaré · Mañana · Otro horario; Mañana sale de la ruta; la ruta en curso se reordena | **implementada** (0004 aplicada; falta desplegar y la plantilla: `docs/WHATSAPP.md`) | 13/13 | despliegue + plantilla en Meta |
| [009](009-pedido-del-dia/spec.md) un pedido por día | `ParadaLocal` se funde en `Pedido`; sin arrastre al día siguiente; IndexedDB v3 | **implementada** | 12/12 | borrar días anteriores → 007 |
| [008](008-modelo-dominio/spec.md) modelo de dominio | catálogos y estados únicos, Supabase tipado, almacén partido, diagrama esencial | **implementada** | 15/15 | — |

## Reglas compartidas entre specs

- **Base local (IndexedDB)**: cada spec que agrega un store sube a la **siguiente versión
  libre** de `idb.ts`; si el store tiene datos de destinatarios, se registra en
  `STORES_DEL_DIA` (lo borra el cierre del día, spec 007).
- **Migraciones SQL**: cada una toma el **siguiente número libre** de `supabase/migrations/`.
- **Rutas de archivos**: las tareas asumen la estructura de 002 Fase 1–2 + US1.
- **Cruces**: numeración y referencia del paquete → 003 · borrado y lista "No entregados" →
  007 (la 004 la reusa) · teléfono del receptor → 005 (lo usa la 004) · asignados del día →
  005 (lo usa la 006).
