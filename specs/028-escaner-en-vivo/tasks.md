# Tareas 028 · Escáner de etiquetas en vivo

Spec: [spec.md](spec.md) · Plan: [plan.md](plan.md). En orden; [P] = en paralelo con la anterior.

## Preparación
- [x] T001 Rama `028-escaner-en-vivo` desde la 021 (2026-11-08) y fila «en curso» en `main`
- [x] T002 El dueño aprueba el plan (diagrama, datos y plugin nativo) — 2026-11-08

## Medir (antes de la pantalla)
- [x] T003 `EscanerVivoPlugin.java`: `iniciar`, evento `cuadro` (códigos + renglones con caja + ms),
  `detener`; permiso `CAMERA`; versión 1.6.0. `lib/nativo/escaner-vivo.ts` y su prueba
- [x] T004 Diagnóstico → «Probar escáner en vivo» (no guarda nada). Build de la APK de prueba e
  instalación al lado de la firmada
- [x] T005 Medir en el V2430 con las tres etiquetas reales (plan §5) y anotar el resultado en la
  spec: ¿alcanza en vivo o va el plan B? — el dueño (2026-11-08): «quedó muy bueno». Alcanza en
  vivo; no va el plan B. Los números (cuadros, ms) se anotan en el recorrido (T012)

## El escáner
- [x] T006 `lectura/etiqueta/votos.ts` y `pruebas/votos-etiqueta.test.mjs` (primero las pruebas)
- [x] T007 [P] `capturar`, `linterna` y `avisar` en el plugin (`VIBRATE`, `ToneGenerator`); usar la
  lectura nativa del stash para la captura
- [x] T008 **Maqueta primero** del panel sobre la cámara (ya aprobada en la spec; confirmar la
  linterna y el ⚠ en pausa). Después `_componentes/escaner-vivo.tsx`: reemplaza a
  `escanear-etiqueta` en la APK 1.6.0; fuera de ella, lo de hoy
- [x] T009 Los ⚠ en pausa (no está en el día, dirección distinta, más bultos) y la foto del paquete
- [-] T010 Si T005 lo pide: el lector por posición (plan B de la 021) — no hizo falta (T005: en vivo
  alcanza). Queda como mejora si una etiqueta real lo pide

## Cierre
- [x] T011 Docs (2026-11-08): `AGENTS.md` (escaneo en vivo; quitar el *Pendiente* de la 028), `ARQUITECTURA.md`
  §1, `CLASES.md` §4, `PRIVACIDAD.md` (la cámara, el log de la APK de depuración), `ayuda.tsx`
- [~] T012 `npm test`, `npm run lint`, `npm run build` en 0 y el recorrido del plan §7 — 2026-11-08:
  768 pruebas, lint y build en 0. El dueño recorrió el escaneo completo en el V2430 y quedó conforme;
  ninguna foto ni texto salió a la red (vigilante). Sin confirmar uno por uno: linterna, ⚠ en pausa,
  modo avión y sin permiso de cámara
- [~] T013 El dueño: el escaneo completo en el teléfono (la T011 de la 021 va aquí); después, la
  APK 1.6.0 firmada (tag `apk-v1.6.0`), `APK_VERSION_MINIMA=1.6.0` en Vercel y la 021 y la 028 a
  `main` — 2026-11-08: escaneo completo probado; 021 y 028 en `main`; APK 1.6.0 firmada (código 10,
  Release de GitHub) instalada en el V2430. Falta `APK_VERSION_MINIMA=1.6.0` y `APK_URL` en Vercel
  (el dueño)
