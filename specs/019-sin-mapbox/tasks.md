# Tasks: Spec 019

- [x] T001 Spec, plan y tareas (`specs/019-sin-mapbox/`)
- [x] T002 [US2] Matriz de distancias con ORS (`lib/geo/matriz.ts`, 686c9a0)
- [x] T003 [US1/US2] Cliente de ORS y tipo de calle (`lib/geo/ors/cliente.ts`, `lib/geo/ors/vuelta.ts`)
- [x] T004 [US2] Línea del día con ORS y sin reversa en calles estrechas (`lib/geo/ors/direcciones.ts`)
- [x] T005 [US1] *(sale con la 020)* Navegación con ORS: pasos, cartel, voz armada y "Da la vuelta" (`lib/geo/ors/navegacion.ts`)
- [x] T006 [US1] `recorrido.ts` a `lib/geo/` y pantallas apuntando a `lib/geo/ors/`
- [x] T007 [US1/US2] Pruebas (`pruebas/2-rutas.test.mjs`, `pruebas/7-navegacion.test.mjs`) y prueba con la API real (puntos inventados)
- [x] T015 [US1] *(sale con la 020)* Navegación de Google dentro de la APK: `NavegacionActivity` + plugin `Navegacion` (Navigation SDK 7.9, AGP 8.13.2, desugar), `lib/nativo/navegacion.ts`, la de ARES se pausa mientras guía Google, prueba `nativo-navegacion`
- [x] T016 [US1] *(reemplazada por la 020: sin kit de Google ni clave; la APK nueva es la 1.5.0)* Clave de Google con Navigation SDK (dueño) y prueba en el teléfono: APK 1.4.0
- [ ] T008 [US2] Calle cercana con OpenStreetMap (`lib/geo/acceso.ts`)
- [x] T009 [US3] Mapa con MapLibre 6 + OpenFreeMap "Positron" con tonos Dashund (`_mapa/*`, `lib/geo/estilo-mapa.ts`); el worker se copia a `public/` antes de dev y build (`scripts/copiar-worker-mapa.mjs`); fuera `mapbox-gl`
- [x] T010 [US3] Vista previa del punto: foto del mismo mapa, dibujada fuera de pantalla y destruida (`components/direccion/estampilla-mapa.ts`, `mapa-punto.tsx`)
- [ ] T011 [US4] Sugerencias y ubicación sin Mapbox; IA de la 018 sin herramienta Mapbox (`lib/geo/geocoding/*`, `lib/geo/direccion-ia/*`)
- [ ] T012 [US4] Google con tope diario (clave del dueño)
- [ ] T013 [US5] Mapbox fuera: dependencia, token, A10, PRIVACIDAD, README, `.env.example`, Vercel
- [ ] T014 Día real: SC-001 a SC-004
