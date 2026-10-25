---
description: "Tareas: carga desde guía y escaneo de etiquetas"
---

# Tasks: Carga del día desde la guía y escaneo de etiquetas

**Input**: `specs/005-carga-rapida-pedidos/` (spec, plan, research, data-model, contracts/lectura.md, quickstart)

**Prerequisites**: spec 015 US3 (escáner); spec 002 Fase 1–2 + US1; spec 003 (OF, referencia, tarjeta de parada); spec 007 US1 (borrado diario).

**Tests**: incluidos (constitución III): parsers, contrato del endpoint, enlace por OF, borrado.

**Format**: `[ID] [P?] [Story] descripción` · un commit por tarea · suite + lint + build en verde por fase.

## Phase 1: Setup

- [x] T001 Verificar prerrequisitos y registrar línea base (`npm test`, `npm run lint`, `npm run build`) en `specs/005-carga-rapida-pedidos/quickstart.md`
- [x] T002 [P] Instalar `@anthropic-ai/sdk` (el escáner ya viene de la 015); agregar `ANTHROPIC_API_KEY` (solo servidor) a `.env.example`
- [x] T003 [P] Crear fixtures anonimizados en `pruebas/fixtures/lectura/`: texto de guía (con repetidos, `&amp;`, total), textos de etiqueta Starken / Lion×Starken / POR PAGAR, códigos de 26 dígitos de ejemplo

## Phase 2: Foundational

- [x] T004 [P] `src/lib/encomiendas/lectura/codigo-barras.ts`: 26 dígitos → `{of, bulto}` (también la OF de 9 dígitos escrita a mano) o null; prueba en `pruebas/lectura.test.mjs` (prefijos vistos, largo inválido, OF en 15–23)
- [x] T005 [P] `src/lib/encomiendas/lectura/guia.ts`: texto → `GuiaLeida` (OF 9 dígitos, limpieza de destino, repetidos, total declarado); prueba en `pruebas/lectura.test.mjs`
- [x] T006 [P] `src/lib/encomiendas/lectura/etiqueta.ts`: texto → campos por palabras clave (`DESTINATARIO`, `Tel`, `DIRECCIÓN`, pago, `Total Monto O.F.`, `Bulto N°`); sin RUT/remitente/correo; prueba en `pruebas/lectura.test.mjs`. Usa `lib/comun/telefono.ts` (se movió de `whatsapp/`: formaba un ciclo con `encomiendas/`)
- [x] T007 [P] `src/lib/encomiendas/lectura/esquemas.ts`: schemas `GuiaIA` y `EtiquetaIA` de `contracts/lectura.md`
- [x] T008 `src/lib/encomiendas/local/almacen/carga.ts`: campos 005 en `Pedido` + defaults en `alDia()` (`bultosEscaneados` es la lista de bultos, para no contar dos veces el mismo); `crearDesdeGuia(lineas, fecha, {folio, origen})`; `aplicarLecturaEtiqueta(fecha, lectura)` → parada "n de N", bultos, dirección distinta; pruebas en `pruebas/carga.test.mjs`
- [x] T009 **Descartada (2026-10-25)**: desde T032 el teléfono lee la foto sin señal, así que no hay lecturas que dejar pendientes; sin señal y sin texto suficiente, se pega el texto. Era: `src/lib/encomiendas/local/idb.ts`: store `lecturasPendientes` (siguiente versión libre; registrarlo en `STORES_DEL_DIA`, spec 007); prueba de migración
- [x] T010 `src/lib/encomiendas/lectura/servidor.ts` (`server-only`): Claude `claude-opus-5` (o `LECTURA_MODELO`) con `@anthropic-ai/sdk` 1.3, salida estructurada (`messages.parse` + `zodOutputFormat`), sin pensamiento y esfuerzo bajo, timeout 25 s + 1 reintento, sin logs de cuerpo; rechazo o salida sin forma → ilegible (422); la salida pasa por las reglas de T005/T006 (`guiaDesdeIA`, `etiquetaDesdeIA`). `ANTHROPIC_WORKSPACE_ID` para claves de usuario (`sk-ant-usr`). Sin `fallbacks` (son de Fable 5.1)
- [x] T011 `src/app/api/lectura/route.ts`: `POST`, conductor autenticado (`lib/auth/api-conductor`), límites 400/413/422/503. Falta: apagado en modo oficial (llega con la 007 US3)
- [x] T012 [P] (como `pruebas/lectura-servidor.test.mjs`, el adaptador contra un doble del `fetch`; la ruta no tiene doble de sesión) `pruebas/lectura-endpoint.test.mjs`: 401 sin sesión, validación de salida, `of` de IA no reemplaza al del código, sin campos excluidos, sin logs (SDK con doble en `pruebas/dobles/`)
- [x] T013 [P] Agregar `lectura/servidor.ts` a la regla A5 de `pruebas/arquitectura.test.mjs`

## Phase 3: US1 - Cargar el día desde la guía (P1) 🎯 MVP

- [x] T014 [US1] `src/lib/encomiendas/local/lectura-cliente.ts`: reducir imagen (guía ≤ 2576 px, etiqueta ≤ 1280 px), `POST /api/lectura`, fallback a `lecturasPendientes` en error de red/503
- [x] T015 [US1] `_componentes/cargar-guia.tsx`: foto (una o varias, "Agregar otra foto") o texto pegado → `GuiaLeida` unida por OF
- [x] T016 [US1] (dentro de `cargar-guia.tsx`, con un paso que ubica cada dirección y muestra el avance) `_componentes/revisar-guia.tsx`: lista con dudosos y avisos (faltantes, repetidos), editar/quitar/agregar, confirmar → `crearDesdeGuia()` → flujo existente de ubicación y ruta

## Phase 4: US2 - Escanear etiqueta y saber dónde va (P1) 🎯 MVP

- [x] T017 [US2] (dentro de `escanear-etiqueta.tsx`, sin hook aparte) `_hooks/use-escaner.ts`: `escanearCodigo()` de `lib/nativo/escaner.ts` (015); si devuelve `null`, ofrecer escribir el código
- [x] T018 [US2] `_componentes/escanear-etiqueta.tsx` (el resultado va en el mismo archivo; "dos etiquetas en la foto" queda para la IA): "PARADA n de N" (posición en la ruta vigente) + descripción en lo más grande; OF impreso solo con confirmación; foto con dos etiquetas → pedir repetir
- [x] T019 [US2] OF fuera de la ruta → crear pedido desde la etiqueta y rehacer la ruta (número N+1, spec 003 FR-003). Hecho: "Agregarlo como pedido" abre el formulario con la OF puesta; rehacer la ruta es el botón de siempre
- [x] T020 [US2] Multi-bulto: conteo escaneados/total en `resultado-escaneo.tsx` y en la parada

## Phase 5: US3 - Completar el pedido desde la etiqueta (P1) 🎯 MVP

- [x] T021 [US3] Aplicar lectura IA: destinatario, teléfono (+569 con `lib/whatsapp/telefono.ts`), pago y monto, descripción → `referencia` (003); dudosos a "por revisar"
- [x] T022 [US3] Dirección de etiqueta ≠ destino de guía → aviso y botón "Usar la dirección de la etiqueta": `cambiarDireccion` (almacen/pedidos) guarda la nueva y su punto (o ninguno si no se ubica: el viejo era de la otra dirección); el orden se arregla rehaciendo la ruta
- [x] T023 **Descartada (2026-10-25)**, igual que T009. Era: reintento automático de `lecturasPendientes` al volver la señal; prueba con fake-indexeddb (sin red → pendiente → con red → aplicado y borrado)
- [x] T024 [US3] Fallback sin IA: pegar texto de etiqueta (copiado con Google Lens) → `etiqueta.ts`; descripción con `_componentes/campos-paquete.tsx` (ya hecho en la 003: tipo, tamaño, color, nota y foto)

## Phase 6: US4 - Saber qué cobrar (P2)

- [x] T025 [US4] `_componentes/parada-activa.tsx`: "POR PAGAR $X" con texto, no solo color
- [x] T026 [US4] Resumen del día: `ResumenDia` suma `porPagar`, `aCobrar` y `cobrado` (POR PAGAR sin monto cuenta 0, no se supone); se ven en "Tus días" del menú y en el cierre del día

## Phase 7: US5 - Paquetes faltantes (P3)

- [x] T027 [US5] Con la ruta armada y hasta la primera parada cerrada, sección "Sin etiqueta escaneada" con las OF de la guía cuya etiqueta no se escaneó (`sinEtiquetaEscaneada`, `_componentes/aviso-sin-etiqueta.tsx`); no bloquea

## Phase 8: Polish

- [x] T028 `ResumenDia.porOrigen` cuenta los pedidos por `origenCarga`; los resúmenes guardados antes se leen con ceros (`diaAlDia`). Los campos 005 viven en el pedido y se borran con él al cerrar el día; `lecturasPendientes` no existe (T009)
- [x] T029 [P] Actualizar `docs/ARQUITECTURA.md` y `docs/CLASES.md` (tipos y endpoint nuevos)
- [x] T032 Costo (2026-10-24): con Claude Opus 5 una etiqueta son ~2.000 tokens de entrada (~US$0,02) y una foto de la guía ~5.000. El texto de la foto ahora se lee EN EL TELÉFONO (ML Kit, `Telefono.leerTexto`, modelo latino dentro de la APK) y pasa por `leerGuia`/`leerEtiqueta`; la IA solo recibe la foto si falta nombre, teléfono o pago (`etiquetaCompleta`) o la guía no dio líneas (`leerImagen` en `local/lectura-cliente.ts`). Origen `guia_foto`. Probado en la APK con imágenes inventadas: etiqueta 1,2 s, guía 0,5 s, sin red; "O.F." leída como "0.F." se acepta. Con `LECTURA_MODELO=claude-haiku-4-5` la IA de respaldo cuesta ~5 veces menos (sin `effort`, que Haiku no acepta)
- [x] T033 Guía (terreno 2026-10-25): cada foto daba una cantidad distinta de líneas (14, 6…) porque el lector del teléfono daba por buena una lectura incompleta. Ahora manda la IA y el teléfono solo controla, gratis. Medido con una foto difícil de 10 líneas (ruido, rayas, inclinada): Haiku, Sonnet y Opus 10/10, a US$0,003, 0,014–0,022 y 0,024–0,036 por foto. Queda Haiku (`LECTURA_MODELO_GUIA`); si el teléfono ve una OF que Haiku no trajo (`faltanEnLaPrimera`), esa foto se relee con Sonnet (`revisar` → `LECTURA_MODELO_GUIA_ALTA`). Foto a 2000 px. Sin IA o sin señal, lo del teléfono. Costo: 3 fotos/día ≈ US$0,30 al mes
- [ ] T030 Prueba con ≥ 50 etiquetas reales: SC-003, SC-005, SC-006; cuántas lee el teléfono solo y, de las que van a la IA, elegir modelo (Opus 5, Sonnet 5 o Haiku 4.5) con costo medido
- [ ] T031 Correr `quickstart.md` completo y registrar resultados

## Dependencies

```text
Setup (T001–T003) → Foundational (T004–T013)
  → US1 (T014–T016) → US2 (T017–T020) → US3 (T021–T024)
  → US4 (T025–T026) · US5 (T027) → Polish (T028–T031)
```

- Paralelo: T004–T007; T012–T013. US4 y US5 en paralelo tras US3.
- MVP: US1 + US2 + US3 (sin IA ya funciona con texto pegado + código de barras).
