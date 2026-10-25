---
description: "Tareas: ubicar las direcciones de la guía sin corregirlas a mano"
---

# Tasks: Spec 016

**Reglas**: sin commits salvo pedido; `npm test`, `npm run lint`, `npm run build` en verde.
Las pruebas usan nombres de calle reales y números inventados (ninguna dirección de un
destinatario entra al repo).

## US1 · La dirección con tipeo se ubica sola

- [x] T001 [US1] `geo/geocoding/consulta.ts`: mover la limpieza y la comparación de nombres desde `index.ts`; agregar ceros a la izquierda, número marcado (`#`, `N°`), letra o subnúmero, lugar tras el número, edificio con su número, ", Arica"
- [x] T002 [US1] `coincidenciaCalle` con corrección acotada (Damerau-Levenshtein, topes por largo), grados opcionales y números exactos
- [x] T003 [US1] `scripts/generar-calles.mjs` (`npm run calles`) → `geo/geocoding/calles-arica.ts` (generado; A7 lo reconoce por su primera línea)
- [x] T004 [US1] `geo/geocoding/calles.ts`: `callesParecidas`, `largoDeCalle`, carga diferida
- [x] T005 [US1] `index.ts`: aceptar `street: unmatched` cuando el nombre es el escrito; `callesAProbar` (proveedores + catálogo, mejor grupo, máx. 3); puertas a ≤ 300 m no son ambiguas; tramos de una calle sin número no son ambiguos
- [x] T006 [P] [US1] `pruebas/ubicar-direcciones.test.mjs`: limpieza, coincidencia, catálogo y `ubicarDireccion` con proveedores simulados

## US2 · Calle corta sin numerar

- [x] T007 [US2] `ubicarDireccion`: solo calle y la calle escrita mide ≤ 300 m → aproximada con aviso; si no, la calle escrita primero en la lista
- [x] T008 [P] [US2] Pruebas de calle corta y calle larga en `pruebas/ubicar-direcciones.test.mjs`

## US3 · Google como último recurso

- [x] T009 [US3] Decisión del dueño (2026-10-25): conectar Google, sabiendo lo de los términos con mapa Mapbox; clave con facturación; registrado en `docs/PRIVACIDAD.md`
- [x] T010 [US3] `geo/geocoding/google.ts` + `src/app/api/geocodificar/route.ts` (la clave `GOOGLE_MAPS_KEY` solo en el servidor): se pregunta cuando el resultado no es exacto ni ambiguo y la dirección trae número; la puerta tiene que ser de la calle escrita (`esLaCalleEscrita`), con ese número y dentro de Arica; ROOFTOP = exacta, RANGE_INTERPOLATED = aproximada (no reemplaza una aproximada de Mapbox); 4 pruebas con `fetch` simulado

## Cierre

- [x] T011 Medir con la guía real del 2026-10-24 (22 direcciones, sin guardarlas): 13 → 19 ubicadas sin intervención, sin regresiones en las 13
- [x] T012 Docs: `docs/ARQUITECTURA.md`, `docs/CLASES.md`, README, `specs/README.md`, `docs/HOJA-DE-RUTA.md`
- [ ] T013 SC-003 en un día real (≤ 3 a corregir)
