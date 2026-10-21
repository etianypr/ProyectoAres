---

description: "Tareas de número y referencia de cada paquete"
---

# Tasks: Número y referencia de cada paquete

**Input**: Documentos de diseño de `specs/003-referencia-paquete/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/almacen-paquete.md`, `quickstart.md`. **Spec 002 Fase 1–2 + US1 terminadas.**

**Tests**: Incluidos (constitución III): unicidad y fijeza del número, migración de la base
local, borrado de fotos y que nada nuevo viaje al servidor.

**Organization**: Por historia de usuario. El orden de las fases sigue las dependencias:
describir el paquete (US2) → numerar y cargar (US3) → verlo en la parada (US1). Las tres
forman el MVP.

**Actualizado 2026-10-20**: el número es la posición en la ruta optimizada (no una
secuencia propia) y todo se borra al cerrar el día (spec 007).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin dependencias)
- **[Story]**: historia de usuario (US1–US4)

---

## Phase 1: Setup

- [ ] T001 Comprobar el prerrequisito (spec 002 Fase 1–2 + US1: existe `pruebas/arquitectura.test.mjs`, los componentes del conductor están en `src/app/(conductor)/conductor/encomiendas/_componentes/`) y registrar la línea base (`npm test`, `npm run lint`, `npm run build`) en `specs/003-referencia-paquete/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Ninguna historia empieza antes de cerrar esta fase.

- [ ] T002 [P] Agregar a `src/lib/encomiendas/config.ts` las constantes `TIPOS_PAQUETE` (caja, bolsa, sobre, otro), `TAMANOS_PAQUETE` (chico, mediano, grande), `COLORES_PAQUETE` (café, blanco, negro, gris, amarillo, azul, rojo, verde, transparente) y el tipo `ReferenciaPaquete` de `data-model.md` §1
- [ ] T003 Subir `src/lib/encomiendas/local/idb.ts` a la siguiente `VERSION` libre con el store `fotos` (agregarlo a `STORES_DEL_DIA` si la 007 ya existe) (clave `id`, índice `por_pedido`), con el patrón "si no existe, crear" de `onupgradeneeded` (si la spec 007 se implementa a la vez, agregar también su store de resumen diario); escribir `pruebas/idb-version.test.mjs`: una base v2 con pedidos, rutas, cola y whatsapp abre en v3 sin perder nada y con el store nuevo
- [ ] T004 [P] Crear `src/lib/encomiendas/local/paquete.ts` con `asignarNumeros`, `describirPaquete`, `buscarPorNumero` y `ordenDeCarga` según `contracts/almacen-paquete.md`, y `pruebas/paquete.test.mjs`: primera numeración = posiciones 1…N; reoptimización con números existentes los conserva y da mayor + 1 a los nuevos en orden de ruta; nunca repite ni cambia un número; textos de `describirPaquete` con partes faltantes y sin referencia; búsqueda solo entre activos; orden de carga inverso al orden de visita
- [ ] T005 Extender `src/lib/encomiendas/local/almacen/`: campos `numero`, `referencia`, `fotoId` en `Pedido` (`referencia` y `fotoId` también en `DatosPedido`; **`numero` no**, lo asigna el almacén); `cargados` en `Ruta`; valores por defecto en `alDia()` y `rutaAlDia()`; `guardarRuta()` numera con `asignarNumeros()` dentro de `enFila()`, conserva `cargados` y devuelve qué pedidos recibieron número nuevo; `guardarPedido()` conserva `numero` y `fotoId` al editar; `restaurarPedido()` conserva el número. Pruebas en `pruebas/3-almacen.test.mjs`: primera confirmación numera 1…N, dos confirmaciones en paralelo no repiten números, reoptimizar no cambia números, pedido tardío recibe N+1, editar y restaurar conservan, pedidos v2 se numeran en la siguiente confirmación

**Checkpoint**: `npm test` en verde con las pruebas nuevas.

---

## Phase 3: User Story 2 - Describir el paquete en pocos toques (Priority: P1) 🎯 MVP

**Goal**: Cada pedido sale del formulario con referencia y, si se quiere, foto.

**Independent Test**: Cargar un pedido con referencia de tres toques, nota y foto; reabrirlo y editar.

- [ ] T006 [P] [US2] Crear `src/app/(conductor)/conductor/encomiendas/_componentes/paquete-chips.tsx`: selector de tipo, tamaño y color con botones grandes; cada color lleva su nombre escrito (no depende solo del color, constitución); un segundo toque deselecciona
- [ ] T007 [P] [US2] Crear `src/lib/encomiendas/local/fotos.ts` (`comprimirFoto`, `guardarFoto`, `leerFoto`, `borrarFoto`, `purgarFotos`) y `pruebas/fotos.test.mjs`: guardar y leer, reemplazar la foto de un pedido, purgar huérfanas, purgar las de pedidos entregados o rechazados y conservar las de activos
- [ ] T008 [US2] Crear `src/app/(conductor)/conductor/encomiendas/_componentes/foto-paquete.tsx`: tomar con `<input type="file" accept="image/*" capture="environment">`, miniatura, ver ampliada, quitar; si no hay espacio, avisa y el pedido se guarda sin foto
- [ ] T009 [US2] Crear `src/app/(conductor)/conductor/encomiendas/_componentes/seccion-paquete.tsx` (`paquete-chips`, nota de hasta 40 caracteres, `foto-paquete`, y el número solo si el pedido ya lo tiene) y montarla en `pedido-form-local.tsx` pasando `referencia` y `fotoId` a `guardarPedido()`; la sección vive en su propio archivo para no agrandar `pedido-form-local.tsx` (617 líneas)
- [ ] T010 [P] [US2] Agregar en `pruebas/4-envio.test.mjs` la comprobación de que los eventos que salen de la cola tienen exactamente las claves de hoy (`id`, `chofer_id` —o `conductor_id` si ya corrió 002-US2—, `fecha`, `tipo`, `hora`; ver `aFila()` en `src/lib/encomiendas/local/enviar.ts`): ni número, ni referencia, ni foto (FR-010)

---

## Phase 4: User Story 3 - Numerar y cargar en el orden de la ruta (Priority: P1) 🎯 MVP

**Goal**: Al confirmar la ruta, cada paquete recibe su posición como número, que se escribe con rotulador siguiendo la lista de carga.

**Independent Test**: Ruta de cinco paradas → lista 5, 4, 3, 2, 1 con número grande; marcar; agregar un pedido y rehacer: números y marcas siguen, el nuevo es el 6.

- [ ] T011 [US3] Agregar `marcarCargado(fecha, pedidoId, cargado)` en `src/lib/encomiendas/local/almacen/` con pruebas en `pruebas/3-almacen.test.mjs` (persiste, idempotente, sobrevive a rehacer la ruta)
- [ ] T012 [US3] Crear `_componentes/lista-carga.tsx` con `ordenDeCarga()` y `marcarCargado()`: número en lo más grande ("escríbelo en el paquete"), referencia y marca; abrirla automáticamente después de la primera confirmación de ruta del día (`vista-previa-ruta.tsx` / `generar-ruta-local.tsx`) y dejarla accesible desde la hoja de la pantalla principal
- [ ] T013 [US3] Cuando `guardarRuta()` informa pedidos con número nuevo después de la primera numeración (pedidos tardíos), mostrar el aviso "Escribe el #N en este paquete" con la pila de avisos existente (`_componentes/avisos.tsx`)

---

## Phase 5: User Story 1 - Ver en la parada qué paquete buscar (Priority: P1) 🎯 MVP

**Goal**: La tarjeta de la parada empieza con "#12 · Bolsa gris grande · cinta roja".

**Independent Test**: Tres pedidos con referencia, ruta confirmada, avanzar parada por parada: cada tarjeta muestra número y referencia antes que la dirección.

- [ ] T014 [US1] Sacar la tarjeta de la parada activa de `src/app/(conductor)/conductor/encomiendas/pantalla.tsx` a `_componentes/parada-activa.tsx` **sin cambiar su comportamiento** (suite en verde); anotar en `specs/002-reestructuracion-codigo/tasks.md` (T037) que esta parte ya está hecha
- [ ] T015 [US1] En `_componentes/parada-activa.tsx`, mostrar primero "#N" y `describirPaquete()` en el tamaño de letra más grande de la tarjeta, la miniatura de la foto (se amplía con un toque) y "sin referencia" en pequeño cuando falta
- [ ] T016 [P] [US1] Mostrar el número del pedido en las filas de la lista de la ruta (en `pantalla.tsx` o en el componente de fila que exista después de 002-US1)
- [ ] T017 [US1] Al abrir la app (`_hooks/use-dia-trabajo.ts`), correr `purgarFotos()`

**Checkpoint**: MVP completo (US2 + US3 + US1). Se puede medir SC-001 en terreno.

---

## Phase 6: User Story 4 - Encontrar a qué parada pertenece un paquete (Priority: P3)

- [ ] T018 [US4] Crear `_componentes/buscar-numero.tsx` (teclado numérico, resultado con nombre, dirección y lugar en el orden de visita) con `buscarPorNumero()`, accesible desde la hoja de la pantalla principal

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T019 [P] Actualizar `docs/ARQUITECTURA.md` §2 (Teléfono) y `docs/CLASES.md` (IndexedDB: store `fotos`, campos nuevos, borrado diario) y el estado de la 003 en `docs/HOJA-DE-RUTA.md`
- [ ] T020 Ajustar `pruebas/arquitectura.test.mjs` si algún archivo nuevo o tocado lo requiere (ninguno debe pasar de 400 líneas)
- [ ] T021 Correr `quickstart.md` completo (automático, teléfono, sin conexión, revisión de red) y registrar el resultado; dejar anotado que SC-001 y SC-003 se miden en la primera semana de uso real

---

## Dependencies & Execution Order

```text
Phase 1 (T001)
   │
Phase 2 (T002–T005)   T002 ∥ T004; T003 → T005; T004 → T005
   │
US2 (T006–T010)       T006 ∥ T007 ∥ T010; T007 → T008 → T009
   │
US3 (T011–T013)       T011 → T012; T013 después de T012
   │
US1 (T014–T017)       T014 → T015; T016 y T017 después de T014
   │
US4 (T018)            ← puede empezar después de Phase 2
   │
Polish (T019–T021)
```

## Parallel Opportunities

- Phase 2: T002 y T004 en paralelo; T003 y T004 antes de T005.
- US2: T006, T007 y T010 en paralelo.
- US4 depende solo de Phase 2.

## Implementation Strategy

### MVP

Phases 1–5 (US2 + US3 + US1): referencia al cargar, número escrito al confirmar la ruta,
visibles en la parada. Con eso ya se mide en terreno si baja el tiempo de búsqueda (SC-001).

### Incremental Delivery

1. Base de datos local y lógica pura (Phase 2), con pruebas.
2. Describir (US2) → numerar y cargar (US3) → ver en la parada (US1) → **probar en una
   día real**.
3. Búsqueda por número (US4) según lo que muestre el día real.

Cada tarea es un commit; ninguna se commitea hasta que el responsable del producto lo pida.
