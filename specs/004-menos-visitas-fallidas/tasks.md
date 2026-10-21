---
description: "Tareas de menos visitas fallidas"
---

# Tasks: Menos visitas fallidas

**Input**: `specs/004-menos-visitas-fallidas/` · **Prerrequisitos**: spec 002 Fase 1–2 + US1; spec 003 (`_componentes/parada-activa.tsx`).
**Tests**: incluidos (constitución III). Cada tarea = un commit; suite + lint + build en verde al cerrar cada fase.

## Phase 1: Setup
- [ ] T001 Registrar línea base (`npm test`, `npm run lint`, `npm run build`) en `specs/004-menos-visitas-fallidas/quickstart.md`

## Phase 2: Foundational
- [ ] T002 [P] Agregar a `src/lib/encomiendas/config.ts` los textos por defecto de "aviso" y "llegando" y los marcadores `{nombre}` `{franja}` `{minutos}` `{negocio}`
- [ ] T003 [P] Crear `src/lib/encomiendas/avisos.ts` (`construirMensaje`, `enlaceWhatsapp`, `franjaEstimada`, `minutosHastaParada`, `ofrecerLlegando`, `yaAvisado`) y `pruebas/avisos.test.mjs` (codificación del enlace, número sin "+", franja por bloque, umbral 10 min, una vez por parada)
- [ ] T004 En `src/lib/encomiendas/local/almacen/`: tipo `MensajeEnviado`, `Pedido.mensajes` (default `[]` en `alDia()`), `registrarMensaje()` dentro de `enFila()`, `Ruta.tramos` (default `[]`); pruebas en `pruebas/3-almacen.test.mjs`

## Phase 3: US1 - Avisar desde el WhatsApp del conductor (P1) 🎯 MVP
- [ ] T005 [US1] Crear `_componentes/boton-avisar.tsx`: abre `enlaceWhatsapp()`; al volver (`visibilitychange`) registra aviso `programado`/`whatsapp_propio`; muestra "avisado HH:MM"; sin teléfono válido ofrece llamar o SMS
- [ ] T006 [US1] Crear `_componentes/avisar-todos.tsx`: recorre en secuencia los pedidos sin aviso (`yaAvisado` = false)
- [ ] T007 [US1] Crear `_componentes/registrar-respuesta.tsx` con los estados de `DISPONIBILIDADES` usando `registrarDisponibilidad()` (origen manual, sin id de mensaje)
- [ ] T008 [US1] Montar T005–T007 en la lista de pedidos y en `_componentes/parada-activa.tsx`
- [ ] T009 [US1] Leer `empresa.mensaje_aviso` en `src/app/(conductor)/conductor/encomiendas/page.tsx` y pasarlo a la pantalla (null → texto por defecto)

## Phase 4: US2 - "Voy llegando" (P1) 🎯 MVP
- [ ] T010 [US2] Devolver `legs` (distancia, duración) desde `src/lib/geo/mapbox/direcciones.ts` y guardarlos como `Ruta.tramos` en `src/lib/encomiendas/local/generar-ruta/`
- [ ] T011 [US2] En `_componentes/parada-activa.tsx`: botón "Avisar que voy llegando (~N min)" con `minutosHastaParada()` + `ofrecerLlegando()`; registra aviso `llegando`; si el receptor no confirmó, "Llamar" va primero (fase `antes_llamar` actual)
- [ ] T012 [P] [US2] Pruebas de ETA con tramo y sin tramo (20 km/h) en `pruebas/avisos.test.mjs`

## Phase 5: US3 - No entregados del día (P2)
- [ ] T013 [US3] Mostrar desde la hoja, durante el día, `_componentes/lista-no-entregados.tsx` con `noEntregadosDelDia()` de `local/borrado.ts` (ambos los crea la spec 007, T005/T007; si la 007 no está, crearlos aquí con esa misma ubicación)
- [ ] T014 [US3] Verificar que un no entregado sale de la ruta del día (`marcarResultado`) con prueba en `pruebas/asistencia-entrega.test.mjs` (ya cubierto por la spec 012; confirmar)

## Phase 6: US4 - Aviso automático sin doble aviso (P3)
- [ ] T015 [US4] `yaAvisado()` considera el aviso automático (`Pedido.aviso`) (`Pedido.aviso.estado ≠ pendiente`); `boton-avisar.tsx` muestra "ya avisado (automático)" y solo reenvío explícito
- [ ] T016 [US4] Crear `src/app/(app)/configuracion/estado-whatsapp.tsx`: activo/inactivo y faltantes (verificación Meta, plantilla, token) leyendo la configuración de `src/lib/whatsapp/meta.ts` sin exponer valores; en modo oficial muestra la autorización de Starken (spec 007)

## Phase 7: Plantillas (panel, transversal a US1–US2)
- [ ] T017 Crear la próxima migración libre `supabase/migrations/000N_avisos.sql` (`empresa.mensaje_aviso`, `mensaje_llegando`, re-ejecutable, `select` de verificación) y actualizar `src/types/db.ts`
- [ ] T018 Crear `src/app/(app)/configuracion/plantillas-form.tsx` y `guardarPlantillas` en `configuracion/actions.ts` (con `puedeOperarPanel()`; exige `{negocio}` y "Starken")
- [ ] T019 [P] Extender `pruebas/esquema.mjs` con las columnas nuevas

## Phase 8: Polish
- [ ] T020 [P] Actualizar `docs/ARQUITECTURA.md` (empresa, avisos), `docs/CLASES.md` (`MensajeEnviado`, `tramos`) y estado de la 004 en `docs/HOJA-DE-RUTA.md`
- [ ] T021 Correr `quickstart.md` completo y registrar el resultado

## Dependencies
```text
T001 → T002–T004 → US1 (T005–T009) ∥ US2 (T010–T012) → US3 (T013–T014) → US4 (T015–T016) → Polish
Plantillas (T017–T019) antes de T009 en producción; la UI usa el texto por defecto mientras tanto.
```
- [P]: T002 ∥ T003; T012, T019, T020.
- MVP: US1 + US2. US3 se coordina con la pantalla de cierre de la 007.
