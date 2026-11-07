# Tareas 027 · La hoja de ARES, paso por paso

- [x] T001 `Ruta.inicioReparto` + `marcarInicioReparto(fecha)`; `guardarRuta` lo conserva (almacén) + prueba
- [x] T002 `lib/encomiendas/problemas.ts` (`problemasDelPedido`) + prueba
- [x] T003 `_hooks/paso-del-dia.ts` (`pasoDelDia`) + prueba
- [x] T004 `_hooks/use-carga-auto.ts`: avance, faltan con su parada, «Salir a repartir», marca al escanear todo
- [x] T005 Cabeceras: barra de pasos, A–C (`cabecera-sin-parada.tsx`), carga (D), cierre (G); `cabecera-hoja.tsx` elige
- [x] T006 Contenido por paso: A (ayer), B (por resolver + listos plegados), C (pedidos), D (faltan), F (fuera de la ruta solo si hay + enlaces), G (no entregados + ruta plegada)
- [x] T007 B: «Resolver los N ⚠» abre de a uno en la hoja
- [x] T008 G: «Cerrar el día» reabre la pantalla de cierre aplazada (`useCierreDia`)
- [x] T009 Sin la ventana «Ruta lista» (`aviso-cargar-auto.tsx`) ni `progreso-carga.tsx`; resumen de arriba solo al repartir
- [x] T010 Nombres de botones y Ayuda
- [x] T011 Docs: `CLASES.md`, `ARQUITECTURA.md`; `quickstart.md`
- [x] T012 `npm test`, `npm run lint`, `npm run build` en verde; A–G recorridos a 360 px en modo prueba (2026-11-06)
- [x] T013 Bultos: la OF escrita a mano suma uno (primer número libre) y su etiqueta lo reemplaza (`contarBulto`, `LecturaParaAplicar.escaneo`/`reemplazaBulto`) + pruebas
- [x] T014 Fin de la guía con ⚠: «Resolver los N ⚠» + «Armar la ruta igual»; «Por resolver» en la hoja con la ruta armada
- [x] T015 Cabecera de cierre con las cifras de todo el día (`cierreDelDia`) + prueba
- [x] T017 Sin barra de pasos en la cabecera (dueño, 2026-11-06): fuera `barra-pasos.tsx` y `PASOS`
- [ ] T016 Día real en el teléfono (APK): escáner, «Salir a repartir» y volver de Google Maps
