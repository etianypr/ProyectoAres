---
description: "Tareas: carga desde guía y escaneo de etiquetas"
---

# Tasks: Carga del día desde la guía y escaneo de etiquetas

**Input**: `specs/005-carga-rapida-pedidos/` (spec, plan, research, data-model, contracts/lectura.md, quickstart)

**Prerequisites**: spec 002 Fase 1–2 + US1; spec 003 (referencia, numeración, `parada-activa.tsx`); spec 007 US1 (borrado diario).

**Tests**: incluidos (constitución III): parsers, contrato del endpoint, enlace por OF, borrado.

**Format**: `[ID] [P?] [Story] descripción` · un commit por tarea · suite + lint + build en verde por fase.

## Phase 1: Setup

- [ ] T001 Verificar prerrequisitos y registrar línea base (`npm test`, `npm run lint`, `npm run build`) en `specs/005-carga-rapida-pedidos/quickstart.md`
- [ ] T002 [P] Instalar `zxing-wasm` y `@anthropic-ai/sdk`; agregar `ANTHROPIC_API_KEY` (solo servidor) a `.env.example`
- [ ] T003 [P] Crear fixtures anonimizados en `pruebas/fixtures/lectura/`: texto de guía (con repetidos, `&amp;`, total), textos de etiqueta Starken / Lion×Starken / POR PAGAR, códigos de 26 dígitos de ejemplo

## Phase 2: Foundational

- [ ] T004 [P] `src/lib/encomiendas/lectura/codigo-barras.ts`: 26 dígitos → `{of, bulto, agencia}` o null; prueba `pruebas/lectura-codigo-barras.test.mjs` (prefijos vistos, largo inválido, OF en 15–23)
- [ ] T005 [P] `src/lib/encomiendas/lectura/guia.ts`: texto → `GuiaLeida` (OF 9 dígitos, limpieza de destino, repetidos, total declarado); prueba `pruebas/lectura-guia.test.mjs`
- [ ] T006 [P] `src/lib/encomiendas/lectura/etiqueta.ts`: texto → campos por palabras clave (`DESTINATARIO`, `Tel`, `DIRECCIÓN`, pago, `Total Monto O.F.`, `Bulto N°`); sin RUT/remitente/correo; prueba `pruebas/lectura-etiqueta.test.mjs`
- [ ] T007 [P] `src/lib/encomiendas/lectura/esquemas.ts`: schemas `GuiaIA` y `EtiquetaIA` de `contracts/lectura.md`
- [ ] T008 `src/lib/encomiendas/local/almacen/`: campos 005 en `Pedido` + defaults en `alDia()`; `crearDesdeGuia(lineas, folio)`; `aplicarLecturaEtiqueta(lectura)` (enlace por `of`, bultos, origen); pruebas en `pruebas/3-almacen.test.mjs` (OF único, multi-bulto, OF inexistente → null)
- [ ] T009 `src/lib/encomiendas/local/idb.ts`: store `lecturasPendientes` (siguiente versión libre; registrarlo en `STORES_DEL_DIA`, spec 007); prueba de migración
- [ ] T010 `src/lib/encomiendas/lectura/servidor.ts` (`server-only`): Claude `claude-opus-5` con `@anthropic-ai/sdk`, salida estructurada (`output_config.format`), `fallbacks` de rechazo, timeout + 1 reintento, sin logs de cuerpo; valida salida con T005/T006
- [ ] T011 `src/app/api/lectura/route.ts`: `POST`, conductor autenticado (`lib/auth/api-conductor`), límites 413/422/503, apagado en modo oficial sin autorización (spec 007 FR-009)
- [ ] T012 [P] `pruebas/lectura-endpoint.test.mjs`: 401 sin sesión, validación de salida, `of` de IA no reemplaza al del código, sin campos excluidos, sin logs (SDK con doble en `pruebas/dobles/`)
- [ ] T013 [P] Agregar `lectura/servidor.ts` a la regla A5 de `pruebas/arquitectura.test.mjs`

## Phase 3: US1 - Cargar el día desde la guía (P1) 🎯 MVP

- [ ] T014 [US1] `src/lib/encomiendas/local/lectura-cliente.ts`: reducir imagen (guía ≤ 2576 px, etiqueta ≤ 1280 px), `POST /api/lectura`, fallback a `lecturasPendientes` en error de red/503
- [ ] T015 [US1] `_componentes/cargar-guia.tsx`: foto (una o varias) o texto pegado → `GuiaLeida` unida por OF
- [ ] T016 [US1] `_componentes/revisar-guia.tsx`: lista con dudosos y avisos (faltantes, repetidos), editar/quitar/agregar, confirmar → `crearDesdeGuia()` → flujo existente de ubicación y ruta

## Phase 4: US2 - Escanear etiqueta y saber dónde va (P1) 🎯 MVP

- [ ] T017 [US2] `_hooks/use-escaner.ts`: cámara + `zxing-wasm` (Code 128), alternativa por foto; `BarcodeDetector` solo si existe
- [ ] T018 [US2] `_componentes/escanear-etiqueta.tsx` + `resultado-escaneo.tsx`: "PARADA n de N" (número de spec 003) + descripción en lo más grande; OF impreso solo con confirmación; foto con dos etiquetas → pedir repetir
- [ ] T019 [US2] OF fuera de la ruta → crear pedido desde la etiqueta y rehacer la ruta (número N+1, spec 003 FR-003)
- [ ] T020 [US2] Multi-bulto: conteo escaneados/total en `resultado-escaneo.tsx` y en la parada

## Phase 5: US3 - Completar el pedido desde la etiqueta (P1) 🎯 MVP

- [ ] T021 [US3] Aplicar lectura IA: destinatario, teléfono (+569 con `lib/whatsapp/telefono.ts`), pago y monto, descripción → `referencia` (003); dudosos a "por revisar"
- [ ] T022 [US3] Dirección de etiqueta ≠ destino de guía → aviso y opción de reemplazar y reubicar la parada
- [ ] T023 [US3] Reintento automático de `lecturasPendientes` al volver la señal; prueba con fake-indexeddb (sin red → pendiente → con red → aplicado y borrado)
- [ ] T024 [US3] Fallback sin IA: pegar texto de etiqueta (Texto en vivo) → `etiqueta.ts`; selectores de 003 para la descripción

## Phase 6: US4 - Saber qué cobrar (P2)

- [ ] T025 [US4] `_componentes/parada-activa.tsx`: "POR PAGAR $X" con texto, no solo color
- [ ] T026 [US4] Resumen del día: total a cobrar y cantidad de pedidos por pagar

## Phase 7: US5 - Paquetes faltantes (P3)

- [ ] T027 [US5] Al iniciar la ruta, aviso con OF de la guía sin etiqueta escaneada (sin bloquear)

## Phase 8: Polish

- [ ] T028 Conteo por `origenCarga` en el resumen del día (spec 007); verificar que el borrado diario limpia campos 005 y `lecturasPendientes`
- [ ] T029 [P] Actualizar `docs/ARQUITECTURA.md` y `docs/CLASES.md` (tipos y endpoint nuevos)
- [ ] T030 Prueba con ≥ 50 etiquetas reales: SC-003, SC-005, SC-006; elegir modelo (Opus 5 vs Sonnet 5) con costo medido
- [ ] T031 Correr `quickstart.md` completo y registrar resultados

## Dependencies

```text
Setup (T001–T003) → Foundational (T004–T013)
  → US1 (T014–T016) → US2 (T017–T020) → US3 (T021–T024)
  → US4 (T025–T026) · US5 (T027) → Polish (T028–T031)
```

- Paralelo: T004–T007; T012–T013. US4 y US5 en paralelo tras US3.
- MVP: US1 + US2 + US3 (sin IA ya funciona con texto pegado + código de barras).
