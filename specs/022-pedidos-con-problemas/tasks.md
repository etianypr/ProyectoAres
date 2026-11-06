# Tareas 022 · Pedidos con problemas (⚠) dentro de la ruta

- [x] T001 `Pedido.problemas` + `alDia`; `guardarPedido` y `crearDesdeGuia` lo llevan; `cambiarDireccion` quita los del lugar
- [x] T002 `problemasDelPedido` con guardados y revisados; la OF de otro largo deja de ser ⚠ (fuera `ofDistinta` y su ⚠ en la guía, el formulario y la parada) + pruebas
- [x] T003 Dirección en duda con opciones: entra con la primera (`lugarProvisorio`, `ubicarConDuda`) al leer la guía, al rehacer la ruta y con la dirección de la etiqueta
- [x] T004 `almacen/problemas.ts`: `elegirLugar`, `marcarRevisado`, `quitarProblema`, `fijarProblemasDeRuta` + pruebas
- [x] T005 Al usar la ruta: lejana y horario quedan en el pedido (`problemasDelArmado`, `fueraDeHorarioIds`); la ruta del caché no pierde avisos + pruebas
- [x] T006 Escaneo: la etiqueta con otra dirección queda como ⚠; el paquete fuera de la guía con origen «etiqueta» y ⚠; bultos incompletos en «Faltan» + pruebas
- [x] T007 Arriba del formulario: `ProblemasPedido` (opciones con su mapa, «Va igual», «Es así», qué dirección vale)
- [x] T008 Aviso dos paradas antes: `avisoAdelante` + franja en la cabecera + ⚠ en la tarjeta + línea de la burbuja + pruebas
- [x] T009 Docs: `AGENTS.md` (OF y ⚠), `CLASES.md`, `ARQUITECTURA.md`, `pruebas/README.md`
- [x] T010 Recorrido a 360 px en modo prueba (2026-11-06): OF de 8 y 10 sin ⚠, lejana con «Va igual», aviso «En 2 paradas» con «Ver», fuera de la guía con «Es así», etiqueta con otra dirección con «Dejar la de la guía». Sin ver en pantalla (cubierto por pruebas): calle en varios lugares y bultos 1 de 2
- [ ] T012 En la APK: la línea de la burbuja y un día real
- [ ] T011 En `main`: la fila de la 022 en `specs/README.md` («en curso», rama) — el índice se edita solo ahí
