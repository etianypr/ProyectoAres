---
description: "Tareas de la reestructuración y el renombrado a conductor"
---

# Tasks: Reestructuración del código y "conductor"

**Input**: `specs/002-reestructuracion-codigo/` · **Tests**: incluidos (constitución III, VI).

**Reglas**: una tarea = un commit (cuando se pidan commits). Cada fase cierra con
`npm test`, `npm run lint`, `npm run build` en verde. Mover un módulo actualiza en la misma
tarea sus importadores en `src/`, `pruebas/` (incl. `loader.mjs`, `dobles/`) y `mcp/`, y
borra su excepción en `pruebas/arquitectura.test.mjs`.

## Phase 1: Setup

- [x] T001 Registrar línea base en `quickstart.md` (501 pruebas, lint, build, 13 archivos > 400 líneas; el mayor, `pantalla.tsx`, 1.699)
- [x] T002 Crear `pruebas/arquitectura.test.mjs` con A1–A10 de `contracts/estructura-modulos.md` y excepciones del estado actual (pasa desde el primer commit)

## Phase 2: Foundational

- [x] T003 (hecha en 008) `src/lib/geo/coordenada.ts`: `Coordenada` (← `geocoding.ts:204`), `CENTRO_ARICA` (← `geo/plus-code.ts:30`, copia en `ruta-mapa.tsx:101`), recuadro (← `geocoding.ts:56`); actualizar importadores. Rompe el ciclo `geocoding ↔ plus-code`
- [x] T004 `src/lib/comun/`: mover `utils`, `uuid`, `format`, `deslizar`; `form-helpers` → `forms.ts` con un solo `FormState` (hoy en 3 `actions.ts`)
- [x] T005 `src/lib/comun/fechas.ts` (`hoyChile`, `sumarDias`, `MESES`, `MESES_CORTOS`); reemplazar copias en `periodo.ts:7`, `encomiendas/periodos.ts:103,108`, `periodo-selector.tsx:8`, `comparar-ingresos.tsx:32`, `encomiendas/page.tsx:42`, `ayerDe` en `pantalla.tsx:130`; centralizar regex `YYYY-MM-DD`

## Phase 3: US1 - Cada cosa en su lugar (P1) 🎯 MVP

- [x] T006 [US1] `lib/auth/`: `auth.ts` → `sesion.ts`; `ROLES_PANEL`/`inicioSegunRol` → `roles.ts`; login/logout de `app/login/actions.ts` → `acciones.ts`; actualizar `app-shell.tsx`, `pantalla.tsx`, `conductor/page.tsx`, `login-form.tsx`; `set-password/page.tsx:106` usa `inicioSegunRol`
- [x] T007 [US1] `lib/api-conductor.ts` → `lib/auth/api-conductor.ts`; `lib/auth/conductor-de-usuario.ts` unifica la búsqueda por `user_id` (`acceso.ts:17`, `api-conductor.ts:46`, `conductor/page.tsx:32`)
- [x] T008 [P] [US1] `supabase/middleware.ts` → `sesion-proxy.ts` (actualizar `proxy.ts`); `set-password/page.tsx:13` usa `lib/supabase/client.ts`
- [x] T009 [P] [US1] `lib/whatsapp/`: `whatsapp.ts` → `meta.ts` (`esReintentable` → `esErrorReintentable`), `telefono.ts`, `correlacion.ts` (← `api-conductor.ts:74`); `telHref` de `pantalla.tsx:123` usa `telefono.ts` **Después (spec 005)**: `telefono.ts` pasó a `lib/comun/` (lo usan el formulario, la etiqueta y WhatsApp; desde `whatsapp/` formaba un ciclo con `encomiendas/`).
- [x] T010 [US1] `lib/geo/mapbox/token.ts` (única lectura del token: `geocoding.ts:260`, `mapa-estatico.ts:92`, `rutas.ts:841,880`, `ruta-mapa.tsx:167`); `mapa-estatico.ts` → `geo/mapbox/`
- [x] T011 [US1] Dividir `rutas.ts` por dominio (`distanciaMetros` ya estaba solo en `geo/coordenada.ts`: sin `geo/distancia.ts`), `geo/trazado.ts`, `geo/mapbox/{direcciones,navegacion}.ts`, `rutas/orden-paradas.ts` + `index.ts`; actualizar `mcp/servidor.ts` y pruebas 2, 7, 8, 15
- [x] T012 [US1] `geocoding.ts` → `geo/geocoding/index.ts` sin cambios de contenido
- [x] T013 [P] [US1] `periodo.ts` → `comun/periodo.ts` (puro + formato de cookie) y `comun/periodo-servidor.ts` (`server-only`); `periodo-selector.tsx:39` usa el formato común
- [x] T014 [P] [US1] `vencimientos.ts` → `lib/conductores/`; `VencimientoBadge` sale de `ui/badge.tsx` a `(app)/conductores/_componentes/`
- [x] T015 [P] [US1] `local/whatsapp.ts` → `local/sincronizar-whatsapp.ts`
- [x] T016 [P] [US1] `ui/direccion-input` y `ui/mapa-punto` → `components/direccion/`; `app-shell`, `page-header`, `periodo-selector`, `notificaciones` → `components/panel/`
- [x] T017 [US1] `components/encomiendas/*` → `(conductor)/…/_componentes/` (`bottom-sheet` → `hoja`); `dia-nav` → `(app)/encomiendas/dia/_componentes/`; `use-*` → `_hooks/`; `ruta-mapa` → `_mapa/`; `elegirVoz` → `_hooks/voz.ts` (puro)
- [x] T018 [US1] Vaciar excepciones A1–A6, A9; actualizar `docs/ARQUITECTURA.md` y `docs/CLASES.md`; prueba manual. Hecha en la APK (vivo V2430, 2026-10-24): ruta, formulario con sugerencias de Mapbox, botón atrás, menú y Diagnóstico, sin errores. El panel solo se comprobó por rutas (redirigen al login): falta mirarlo con la cuenta del jefe

## Phase 4: US2 - Un solo nombre: conductor (P1)

- [x] T019 [P] [US2] Prueba de evento en cola con formato viejo (`choferId`) que se envía una vez con `conductor_id` (`pruebas/asistencia-entrega.test.mjs`) Hecho como `pruebas/renombrado-conductor.test.mjs` (lectura tolerante en `almacen/cola.ts`).
- [x] T020 [P] [US2] Extender `pruebas/base.mjs` y `esquema.mjs` con las invariantes de `data-model.md` y "ningún objeto con chofer" Parcial: `npm run test:esquema` compara la base renombrada con `src/types/db.ts`; las invariantes se verificaron en el ensayo (T029).
- [x] T021 [US2] Migración de renombrado (siguiente número libre) según `data-model.md` Hecho: `supabase/migrations/0006_conductor.sql` (re-ejecutable, se verifica sola).
- [x] T022 [P] [US2] Nota "histórica" en 0001–0003 y sección en `README.md` Hecho: nota al comienzo de 0001–0003.
- [x] T023 [US2] `src/types/db.ts`: `conductor`, `Conductor`, `conductor_id`
- [x] T024 [US2] `(app)/choferes` → `(app)/conductores` (+ modal, enlaces); redirección en `next.config.ts`
- [x] T025 [US2] Identificadores del panel (`.from("conductores")`, `p_conductor_id`, `invitarConductor`, `ConductorAvatar`…)
- [x] T026 [US2] Rol `conductor` en `lib/auth/`; `chofer_id` → `conductor_id` en api y `enviar.ts` (`onConflict: "conductor_id,fecha"`); `ActividadPorEnviar.conductorId` con lectura tolerante
- [x] T027 [P] [US2] Fotos nuevas en `conductores/` (`foto-uploader.tsx:37`)
- [x] T028 [US2] `pruebas/**` y `mcp/**` a nombres nuevos; comentarios de `src/`; A8 solo con excepciones permanentes
- [x] T029 [US2] Ensayo en copia de la base (`quickstart.md`) — **requiere copia y credenciales** Hecho (2026-10-25) en la base real, dentro de una transacción deshecha al final: 1 conductor, 1 perfil y 5 eventos iguales antes y después; permisos de las funciones iguales.
- [x] T030 [US2] Producción en ventana nocturna (aprobado) después de T029 Hecho (2026-10-25): 0006 y 0007 aplicadas en producción; `npm run test:esquema` OK; datos iguales (1 conductor, 1 perfil, 5 eventos).
- [ ] T049 [US2] (spec 011, parte 2) En la misma migración, tablas y columnas al glosario: `encomienda_jornadas` → `dias_trabajo` (`cerrada_en` → `cierre`), `encomienda_actividad` → `actividades`, `encomienda_pagos` → `pagos_dia`, `encomienda_reglas_pago` → `reglas_pago`, `encomienda_whatsapp_correlaciones` → `avisos` (`correlation_id` → `codigo_aviso`), `encomienda_periodos_facturacion` → `periodos_facturacion`, `encomienda_ingresos_reales` → `ingresos_reales` (funciones, triggers, RLS y pg_cron incluidos); nombres a confirmar en el plan
- [ ] T050 [US2] (spec 011, parte 2) `Database` y `.from()` a los nombres nuevos; contrato HTTP `correlationId` → `codigoAviso` en `contrato-whatsapp.ts`, rutas y teléfono
- [ ] T051 [US2] (spec 012) Borrar `encomienda_actividad.motivo`, su check y su índice: nadie la escribe ni la lee; quitarla de `Database` y de `pruebas/base.mjs`

## Phase 5: US3 - Archivos revisables (P2)

- [x] T031 [P] [US3] (hecha en 008) `local/almacen.ts` → `almacen/{fila,tipos,migrar,pedidos,ruta,terreno,disponibilidad,cola,index}.ts`
- [x] T032 [P] [US3] `local/generar-ruta.ts` → `generar-ruta/{partida,ubicar-pedidos,estrategias,index}.ts` Hecho (2026-10-25): `tipos`, `partida`, `ubicar-pedidos`, `estrategias`, `index` (el barril conserva la ruta de importación). Sale de A7
- [x] T033 [P] [US3] `geo/geocoding/index.ts` (1.010 líneas) → `consulta`, `calles` (spec 016), `tipos`, `codigo` (Plus Codes), `mapbox`, `nominatim`, `completar-numero`, `ubicar`; `index.ts` queda como barril con la cabecera (2026-10-25). Sale de las excepciones de A7
- [x] T034 [P] [US3] (adelantada en T011) `rutas/orden-paradas.ts` → `orden-paradas/{exacto,construccion,mejora,perturbacion}.ts`
- [x] T035 [US3] Lo puro de `pantalla.tsx`: `cifrasPantalla` y `faseDeParada` (`_hooks/cifras-pantalla.ts`, `_hooks/fase-parada.ts`, con pruebas en `pruebas/pantalla-conductor.test.mjs`) y los avisos en `_componentes/notificaciones-pantalla.tsx` (`armarNotificaciones`). Hecho (2026-10-27)
- [x] T036 [US3] Hooks de `pantalla.tsx` → `_hooks/`: `use-guia-navegacion`, `use-acciones-parada` (con las ventanas de deshacer), `use-propuesta`, `use-avisos-del-dia`, `use-puntos-mapa`, `use-boton-atras`. Hecho (2026-10-27)
- [x] T037 [US3] Componentes de `pantalla.tsx` → `_componentes/`: `parada-activa`, `cabecera-sin-parada`, `carril-superior`, `controles-mapa`, `contenido-hoja`, `ruta-del-dia`, `pedidos-fuera`, `advertencias-ruta`, `tu-dia`, `ventanas-pantalla`, `estado-pantalla`, `fila-pedido`, `vista-pedido`. `pantalla.tsx` 1.938 → 385 líneas; sale de A7. Hecho (2026-10-27)
- [x] T038 [P] [US3] `_mapa/ruta-mapa.tsx` → `tipos`, `estilo`, `camara`, `marcadores-dom`, `use-camara` (`useCamaraNavegacion`), `use-marcador-conductor`. 904 → 392 líneas; sale de A7. Hecho (2026-10-27)
- [ ] T039 [P] [US3] `(app)/encomiendas/page.tsx` → `_datos.ts`, `_resumen.ts` (con pruebas), `_componentes/{kpis,tabla-dias,tabla-conductores}`
- [ ] T040 [P] [US3] `(app)/encomiendas/actions.ts` → `_tarifa.ts` + `actions/{dia-manual,regla-pago,periodos}.ts`
- [ ] T041 [US3] Dividir o excepcionar `use-dia-trabajo.ts`, `pedido-form-local.tsx` (lo adelanta 003-T009), `direccion-input.tsx`, `actividad-dia.tsx`, `agregar-dia.tsx`, `conductor-panel.tsx`; condensar comentarios narrativos al dividir
- [ ] T042 [US3] Vaciar excepciones A7

## Phase 6: US4 - Documentación igual al código (P3)

- [x] T043 [P] [US4] `specs/001/data-model.md` marcado como superado (2026-10-20)
- [ ] T044 [P] [US4] `docs/ARQUITECTURA.md` y `docs/CLASES.md` con nombres y estructura finales
- [ ] T045 [P] [US4] `README.md`, `AGENTS.md`, `mcp/README.md`, `pruebas/README.md` con rutas nuevas
- [ ] T046 [P] [US4] `docs/DOCUMENTO-PRINCIPAL.md`: rol `conductor`

## Phase 7: Polish

- [ ] T047 Quickstart completo
- [ ] T048 Revisión de SC-001…SC-007 con `arquitectura.test.mjs` y búsqueda de "chofer"

## Dependencias

Setup → Foundational → US1 (MVP) → US2 → US3 → US4 → Polish. US2 antes de US3 para dividir
con nombres definitivos. Producción del renombrado (T030) espera a T029.

**Paralelo**: T004 ∥ T005; en US1 T008, T009, T013–T016; T010 → T011 → T012 en orden; en US3
T031–T034, T038–T040; T035 → T036 → T037.
