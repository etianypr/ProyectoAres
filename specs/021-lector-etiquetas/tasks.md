# Tareas 021 · Lector de etiquetas en el teléfono

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md). En orden; [P] = se puede hacer en paralelo con
la anterior.

## Preparación
- [x] T001 Crear la rama `021-lector-etiquetas` desde `main`
- [~] T002 Pasar los ejemplos anonimizados del dueño a
  `pruebas/fixtures/lectura/etiqueta-<formato>.txt`:
  - revisar uno por uno que no quede ningún dato real;
  - completar la tabla «Formatos conocidos» de `spec.md` y el diccionario de `formatos.ts`;
  - si los ejemplos son fotos, el texto sale de US3 (T009), así que hacer T009 antes.
  - 2026-11-07: una Lion real (vista en una foto, sin copiar datos) → `etiqueta-lion-renglones.txt`,
    armado a mano con valores inventados. Falta confirmar el orden real de ML Kit con «Copiar
    anonimizado» y sumar los demás formatos.
  - 2026-11-08: Starken normal real con «Copiar anonimizado» → `etiqueta-starken-normal.txt` (la OF, el
    código, el teléfono y el RUT, cambiados por inventados). Falta el texto real de la Lion y una EXPRES.

## US2 · El lector (primero las pruebas)
- [x] T003 `pruebas/lectura-etiqueta.test.mjs` con los casos de `plan.md` §6: tienen que fallar
  contra el `leerEtiqueta` actual
- [x] T004 Escribir `src/lib/encomiendas/lectura/etiqueta/` (`index`, `formatos`, `normalizar`,
  `zonas`, `campos`) y borrar `etiqueta.ts`. T003 tiene que quedar en verde. Mover la sección de
  etiqueta de `pruebas/lectura.test.mjs`

## US1 · Sin red y sin IA
- [x] T005 `local/lectura-cliente.ts`: `leerFotoEtiqueta` solo con `textoDeFoto` y el lector, sin
  `/api/lectura` ni `/api/texto`. Agregar la prueba estática de privacidad (SC-001)
  - Hecho 2026-11-07. Además de la estática, `etiqueta-en-el-telefono.test.mjs` corre el lector real
    en una APK simulada con el `fetch` reemplazado (falla si la etiqueta vuelve a la nube).
- [~] T006 Pantalla (hecho 2026-11-07, salvo la maqueta):
  - sacar `lecturaIA` de `escanear-etiqueta`, `resultado-escaneo` y `ventanas-pantalla`;
  - foto solo en la APK;
  - **maqueta primero**: ¿el selector de tres toques se abre solo después de la foto?;
  - Ayuda, si cambia el nombre de un botón
- [x] T007 Servidor (hecho 2026-11-07; el dueño aprobó borrar `descripcion-etiqueta.test.mjs`):
  - `/api/lectura` solo acepta la guía;
  - borrar `EtiquetaIA`, `etiquetaDesdeIA`, `conDescripcion` y `MODELO_POR_DEFECTO`;
  - adaptar `lectura-servidor.test.mjs`;
  - **preguntar** antes de borrar `descripcion-etiqueta.test.mjs`

## US3 · Probar etiqueta (Diagnóstico)
- [x] T008 [P] `etiqueta/anonimizar.ts` y sus pruebas (`anonimizar-etiqueta.test.mjs`)
- [x] T009 Diagnóstico → «Probar etiqueta»: foto → texto de ML Kit + lo que entendió el lector +
  «Copiar anonimizado». No guarda nada

## Cierre
- [~] T010 Docs, en el mismo cambio (hechos 2026-11-07: `AGENTS.md`, `PRIVACIDAD.md` §2–§3,
  `ARQUITECTURA.md` §1, `CLASES.md` §4, `HOJA-DE-RUTA.md` y `.env.example`; falta la spec 005
  y quitar el *Pendiente* cuando esté el lector):
  - `AGENTS.md` («Foto de la etiqueta»: sin IA, ML Kit + lector Starken; descripción con tres
    toques; quitar el *Pendiente* de la 021);
  - `docs/PRIVACIDAD.md` §3 (Anthropic y Cloud Vision ya no reciben etiquetas);
  - `docs/ARQUITECTURA.md` §1 (y el árbol de carpetas);
  - `docs/CLASES.md` §4;
  - `docs/HOJA-DE-RUTA.md`;
  - spec 005 (T030 ya no elige modelo);
  - `.env.example` (sin `LECTURA_MODELO`)
- [ ] T011 `npm test`, `npm run lint` y `npm run build` en 0. Hacer el recorrido de `plan.md` §7 en
  la APK, a 360 px y en modo prueba
- [ ] T012 Terreno: ~50 etiquetas reales (junto con la T030 de la 005). Contar cuántas quedan
  completas sin pegar ni escribir (SC-004). Cada falla vuelve como fixture vía «Copiar anonimizado»
- [ ] T013 Dueño: borrar `LECTURA_MODELO` en Vercel. Si los ejemplos lo piden, decidir el plan B
  (`plan.md` §5, toca `android/`)
