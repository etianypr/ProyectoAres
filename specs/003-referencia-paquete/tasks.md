---
description: "Tareas: OF y referencia del paquete"
---

# Tasks: OF y referencia del paquete

**Input**: `specs/003-referencia-paquete/` (spec, plan, research, data-model, contracts, quickstart)

**Tests**: incluidos (constitución III: datos del pedido y privacidad).

**Prerrequisito**: spec 002 Fase 1–2 + US1 (`_componentes/`, `_hooks/`). Cada fase cierra con
`npm test`, `npm run lint` y `npm run build` en verde. Sin commits salvo pedido.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [x] T001 [P] Agregar `TIPOS_PAQUETE`, `TAMANOS_PAQUETE` y `COLORES_PAQUETE` (con etiqueta, como las demás listas) a `src/lib/encomiendas/catalogos.ts`

---

## Phase 2: Foundational

- [x] T002 En `src/lib/encomiendas/local/almacen/tipos.ts`, agregar a `Pedido` los campos `of`, `referencia` y `fotoId` (tipos de `data-model.md`) y el tipo `Foto`; en `almacen/migrar.ts`, `alDia()` los completa con `null`
- [x] T003 En `src/lib/encomiendas/local/idb.ts`, subir a `VERSION = 5` con el store `fotos` (índice `por_fecha`, para borrar las del día sin cargar imágenes), agregarlo a `STORES`, a `FilaDe` y a `STORES_DEL_DIA` (y borrar sus filas en `almacen/borrado.ts`); la actualización desde v4 solo crea el store
- [x] T004 [P] Crear `src/lib/encomiendas/paquete.ts` con `formatoOf`, `ofValida`, `textoReferencia` y `buscarPorOf` según `data-model.md`
- [x] T005 [P] Crear `pruebas/paquete.test.mjs` para las funciones de T004 (OF con espacios o guiones, 8 y 10 dígitos inválidos, referencia parcial, nota recortada, búsqueda con menos de 3 dígitos, varios resultados) y la migración (quedó en `pruebas/idb-version.test.mjs`: una base v3 abre en v5 sin perder nada, con `dias` y `fotos` vacíos)

**Checkpoint**: dominio y almacenamiento listos.

---

## Phase 3: User Story 1 - Ver en la parada qué paquete buscar y su OF (P1) 🎯 MVP

**Goal**: la parada activa muestra OF y referencia en lo más grande.

**Independent Test**: `quickstart.md` pasos 3–4.

- [x] T006 [US1] Crear `src/app/(conductor)/conductor/encomiendas/_componentes/tarjeta-parada.tsx` (sale de la parte "activa" de `pantalla.tsx`): OF con `formatoOf` y `textoReferencia` arriba en la letra más grande, "sin referencia" sin espacio extra, miniatura de la foto que se amplía con un toque; nombre y dirección debajo
- [x] T007 [US1] En la confirmación de "Pedido finalizado" (`pantalla.tsx` o su componente de la 002), mantener la OF visible hasta que se cierre el aviso de deshacer (US1-4)

---

## Phase 4: User Story 2 - Describir el paquete en pocos toques (P1) 🎯 MVP

**Goal**: OF opcional y referencia en el formulario del pedido; foto solo en el teléfono.

**Independent Test**: `quickstart.md` pasos 2 y 5.

- [x] T008 [US2] En `src/lib/encomiendas/local/almacen/pedidos.ts`, `guardarPaquete(pedidoId, { of, referencia })` según `contracts/almacen-paquete.md` (valida con `ofValida`, devuelve `ofRepetida`); exportarla en `almacen/index.ts`
- [x] T009 [P] [US2] Crear `src/lib/encomiendas/local/foto.ts` con `comprimirFoto(file)` (canvas, lado mayor 1280 px, JPEG 0,7)
- [x] T010 [US2] Crear `src/lib/encomiendas/local/almacen/paquete.ts` (junto con `guardarPaquete`; antes `fotos.ts`) con `guardarFoto`, `leerFoto`, `borrarFoto` y `purgarFotosCerradas` (contrato); la foto del pedido cerrado se borra cuando vence la ventana de deshacer (`purgarFotosCerradas` desde `confirmar` en `use-dia-trabajo.ts`), así deshacer no la pierde; `borrarPedido` la borra solo si no se restaura (dentro de la ventana de deshacer se conserva)
- [x] T011 [US2] **Corregida (2026-10-24)**: el formulario manual solo lleva la OF opcional; la descripción y la foto salen del escaneo (005). `campos-paquete.tsx` (tipo, tamaño, color, nota, foto) queda para la pantalla del escaneo sin IA (005 T024). Texto original: en el formulario del pedido (`_componentes/pedido-form-local.tsx` + `campos-paquete.tsx`): campo OF (numérico, 9 dígitos, opcional) con el aviso de OF repetida; selectores de tipo, tamaño y color (un toque cada uno); nota de hasta 40 caracteres; "Foto del paquete" (cámara del teléfono) con quitar y reemplazar
- [x] T012 [US2] Pruebas en `pruebas/paquete.test.mjs` para el almacén: `guardarPaquete` (válida, inválida, repetida), foto reemplazada borra la anterior, foto borrada al marcar resultado, conservada al restaurar

---

## Phase 5: User Story 3 - Encontrar la parada de un paquete por su OF (P3)

**Goal**: buscar con los últimos dígitos de la OF.

**Independent Test**: `quickstart.md` paso 6.

- [x] T013 [US3] Crear `src/app/(conductor)/conductor/encomiendas/_componentes/buscar-of.tsx` (teclado numérico; resultados con número de parada, nombre y referencia; "ninguno coincide" si no hay) y abrirlo desde el menú lateral del conductor

---

## Phase 6: Polish

- [x] T014 [P] Actualizar `docs/CLASES.md` (Pedido + `of`, `referencia`, `fotoId`; store `fotos`) y `docs/ARQUITECTURA.md` (IndexedDB v4)
- [x] T015 [P] Actualizar `docs/HOJA-DE-RUTA.md` y `specs/README.md` con el estado de la 003
- [ ] T016 `npm test`, `npm run lint`, `npm run build` y `quickstart.md` en el teléfono (incluido el tiempo de SC-001 en terreno). **Parcial (2026-10-24)**: pruebas, lint y build en verde; en la APK, el formulario (OF validada en vivo, tres toques → "Bolsa gris grande · cinta roja"), la tarjeta de la parada con OF, referencia y foto que se amplía, y la búsqueda "6789" → parada 2, con datos cargados directo en el teléfono y sin red. Falta: tomar una foto real con la cámara, el aviso de OF repetida y la OF en "Entrega registrada" en un día real, y SC-001

---

## Dependencies & Execution Order

- Setup → Foundational (T002 antes que T003; T004/T005 en paralelo) → US1 y US2 → US3 → Polish.
- **US1** necesita T002 y T004; **US2** necesita T002–T004; **US3** necesita T004.
- T006, T007 y T011 tocan la pantalla del conductor: en orden, no en paralelo.

### Parallel Opportunities

- T001, T004, T005 y T009 en paralelo (archivos distintos).
- T014 y T015 en paralelo.

## Implementation Strategy

1. **MVP**: US1 + US2 → OF y referencia cargadas a mano y visibles en cada parada.
2. US3 (búsqueda) después.
3. Con la 005, la OF y la referencia llegan solas desde la etiqueta; esta spec no cambia.
