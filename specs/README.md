# Specs (Spec Kit)

Solo las features **pendientes**. Una carpeta por feature: `spec.md` → `plan.md` (+ `research`,
`data-model`, `contracts`, `quickstart`) → `tasks.md`. Reglas: `.specify/memory/constitution.md`.
Orden de trabajo: `docs/HOJA-DE-RUTA.md`. Comandos en Claude Code: `/speckit-specify`,
`/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`.

| Spec | Qué | Estado | Tareas | Abierto |
|---|---|---|---|---|
| [015](015-app-android/spec.md) app Android (APK) | llamar con un toque y resultado automático, abrir sin señal, pantalla encendida, escáner | en curso | 27/30 | probar llamadas con chip (T019) |
| [016](016-ubicar-direcciones/spec.md) ubicar direcciones | tipeo de la guía (ceros, deptos, nombres incompletos o con una letra cambiada) y calles cortas sin numerar | en curso (Google conectado) | 11/13 | clave de Google y prueba de un día real |
| [002](002-reestructuracion-codigo/spec.md) reestructuración | `lib/` por dominio, archivos chicos, nombres del glosario | en curso (US1 y renombrado a conductor hechos) | 34/51 | tablas `encomienda_*` al glosario (T049) |
| [003](003-referencia-paquete/spec.md) OF y referencia del paquete | OF y descripción en cada parada, búsqueda por OF; sin número escrito | hecha (falta día real) | 15/16 | foto con la cámara y SC-001 en terreno |
| [005](005-carga-rapida-pedidos/spec.md) carga rápida | guía → ruta → escaneo de etiqueta (+ IA) | en curso (falta probar en terreno) | 32/34 | probar con ≥ 50 etiquetas reales (T030) y el quickstart (T031) |
| [006](006-indicadores-negocio/spec.md) indicadores | entregas sobre asignado, contactados, rendimiento, margen, bono | hecha (falta quickstart y margen contra la base) | 13/15 | — |
| [007](007-cumplimiento-datos/spec.md) cumplimiento | borrado diario, lista de no entregados, modo piloto/oficial | en curso (MVP hecho) | 13/20 | modo piloto/oficial (P3) y plantillas (con la 004) |
| [004](004-menos-visitas-fallidas/spec.md) menos visitas fallidas | WhatsApp propio, "voy llegando" | **postergada** (fase WhatsApp) | 0/21 | — |
| [014](014-horario-conveniente/spec.md) ¿conviene ir al pedido con horario? | al tocarle el turno, la app sugiere ir, dejar para después o descartar | borrador (fase WhatsApp) | — | — |

**Hechas**: 001 (asistencia de ruta) y 008 a 013. Lo que decidieron está en `docs/`: resumen
por spec en `docs/HOJA-DE-RUTA.md`, modelo en `docs/CLASES.md`, WhatsApp en `docs/WHATSAPP.md`.
Sus carpetas se borraron el 2026-10-24 y siguen en el historial de git. La próxima spec nueva es
la 017.

## Reglas compartidas entre specs

- **Base local (IndexedDB)**: cada spec que agrega un store sube a la **siguiente versión
  libre** de `idb.ts` (hoy v5); si el store tiene datos de destinatarios, se registra en
  `STORES_DEL_DIA` (lo borra el cierre del día, spec 007).
- **Migraciones SQL**: cada una toma el **siguiente número libre** de `supabase/migrations/`
  (hoy 0008).
- **Rutas de archivos**: las tareas asumen la estructura de 002 Fase 1–2 + US1.
- **Cruces**: OF y referencia del paquete → 003 · borrado y lista "No entregados" → 007 ·
  teléfono del receptor → 005 (lo usa la 004) · asignados del día → 005 (lo usa la 006).
