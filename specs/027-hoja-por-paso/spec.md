# Spec 027 · La hoja de ARES, paso por paso

**Creada**: 2026-11-06 · **Estado**: hecha (falta día real) · **Rama**: `027-hoja-por-paso`, en `main` desde 2026-11-06 ·
**Pedido del dueño**: "hagamos cambios en el frontend, en la pestaña desplegable de ARES […]
cuando no se ha escaneado ningún pedido, cuando aparecen pedidos con peligro, cuando la aplicación
parte sin ningún…". Maqueta aprobada el 2026-11-06 (casos A–G, hoy vs. propuesta):
https://claude.ai/artifact/3oXR2pjwVGLvsCnYS7jJxz

La idea: la **cabecera** de la hoja (lo que se ve con la hoja cerrada) dice siempre el paso del día
que toca, con su botón. **Adentro** va solo lo de ese paso, con los ⚠ primero. El paso sale del
flujo del conductor de `AGENTS.md` (1 guía · 2 ⚠ · 3 ruta · 4 auto · 5 recorrer · 6 cerrar).

Decidido con el dueño (2026-11-06):
- Barra de pasos («Paso n de 6 · …») en la cabecera, en todos los pasos menos el 5 (manejando, la
  cabecera es solo la parada).
- «Cargar el auto» termina al escanear todo o al tocar «Salir a repartir», y se recuerda aunque
  Android recargue ARES: campo nuevo y opcional `Ruta.inicioReparto` (store `rutas`, sin subir la
  versión de `idb.ts`, no sale del teléfono).
- Botones: «Generar ruta del día» → «Armar la ruta», «Regenerar ruta» → «Rehacer la ruta»,
  «Escanear los paquetes» → «Escanear paquete». La Ayuda cambia con ellos.
- Lo que necesita guardar el ⚠ en el pedido queda para la **022** (ver «Fuera de alcance»).

## A (P1) · El día parte vacío

| Hoy | Debe |
|---|---|
| «Cargar la guía» en la cabecera **y** adentro | Uno solo, en la cabecera, con ícono de cámara |
| «Agregar pedido a mano» adentro, grande | Enlace chico debajo de «Cargar la guía» |
| Adentro, «Pedidos fuera de la ruta» vacío | Adentro, solo cómo terminó ayer (entregados y no entregados) y lo que falte enviar |

## B (P1) · Guía leída, con pedidos en duda

| Hoy | Debe |
|---|---|
| El botón de la cabecera arma la ruta aunque haya dudas | «Resolver los N ⚠»: abre el primero en la hoja y, al guardarlo, el siguiente |
| Armar es lo único | «Armar la ruta igual» queda como enlace |
| La ventana de la guía termina en «Armar la ruta», que solo la cierra | Con ⚠: «Resolver los N ⚠» y el enlace «Armar la ruta igual» (que la arma); sin ⚠, «Armar la ruta» la arma |
| Armada la ruta, los ⚠ quedan sueltos en la lista | «Por resolver · N» con «Resolver los N ⚠», adentro de la hoja al cargar el auto y al recorrer |
| Los en duda, mezclados entre todos; solo «Sin ubicar» se marca | «Por resolver» primero, cada uno con su problema escrito (sin ubicar, OF con menos o más de 9 dígitos —«OF de 8 dígitos», «OF de 10 dígitos»—, sin OF); después «Listos», plegados en una fila |

## C (P2) · Todo ubicado, falta la ruta

| Hoy | Debe |
|---|---|
| «N pedidos pendientes, sin ruta armada» y la lista se llama «fuera de la ruta» | «N pedidos listos · Todos ubicados» y la lista se llama «Pedidos» |
| «Ubicado» en cada fila | Sin marca: solo aparece un ⚠ cuando lo hay |

## D (P1) · Ruta armada, ningún paquete escaneado

| Hoy | Debe |
|---|---|
| La cabecera ya es la parada 1 con «Pedido entregado», con el auto vacío en la central | La cabecera es «Cargar el auto»: «0 de N paquetes escaneados», barra, «Escanear paquete» y «Salir a repartir» |
| Una ventana «Ruta lista. Ahora carga el auto» que se va con «Más tarde» | Sin ventana: la cabecera pide lo mismo |
| El avance de la carga, adentro (no se ve con la hoja cerrada) | Adentro, «Faltan» con el número de parada de cada uno |
| El resumen de entregadas arriba del mapa | Se muestra al salir a repartir |

- Bultos (decidido con el dueño, 2026-11-06): el código trae el número de bulto; uno nuevo suma y la
  misma etiqueta leída otra vez no (es la misma caja). La **OF escrita a mano** (código dañado) suma
  un bulto cada vez, con el primer número libre, y cuenta para «Cargar el auto». Si después se lee la
  etiqueta de esa caja (foto o texto), su número reemplaza al provisorio. Más bultos escaneados que
  los conocidos suben el total del envío. Sin campo nuevo en el pedido.
- La carga termina al escanear todo, al tocar «Salir a repartir» o al cerrar la primera parada.
  No bloquea: lo no escaneado sigue en «Faltan» (plegado durante el reparto) y, si no viene en el
  auto, queda en «No entregados» al cerrar el día.

## E (P3) · Escaneando, con ⚠ del escaneo

- En esta spec: el mismo contador de D con «Seguir escaneando».
- Los ⚠ del escaneo en la hoja (paquete que no está en la guía, etiqueta con otra dirección) → 022.

## F (P2) · Recorriendo

| Hoy | Debe |
|---|---|
| Adentro, «Pedidos fuera de la ruta» aunque esté vacío, con «Cargar la guía» grande | La sección aparece solo si hay alguno; «Agregar pedido · Sumar guía · Rehacer la ruta» como enlaces al final |
| La parada con OF distinta no se marca en la lista | La fila dice su problema (OF con menos o más de 9 dígitos, sin OF) |

- La parada activa y sus botones no cambian (spec 020).
- El aviso dos paradas antes de un ⚠ → 022.

## G (P1) · Ruta terminada

| Hoy | Debe |
|---|---|
| «¡Ruta completa!» sin botón: si se cerró el cierre con «después», no se vuelve a él | «Cerrar el día» abre la misma pantalla de cierre (spec 007), con las cifras de todo el día como ella |
| Los no entregados, perdidos en la lista de la ruta | Primero «No entregados» (OF, cómo es el paquete y dirección), después lo que falta enviar, y la ruta plegada |
| «Rehacer la ruta» sigue a la vista | Sale |

## Requisitos

- **FR-001** El paso del día se decide en una función pura (`pasoDelDia`), con una prueba por paso.
- **FR-002** La barra de pasos lleva el número y el nombre del paso en texto (no solo color).
- **FR-003** Un ⚠ se muestra con ícono y palabras; ningún estado depende solo del color.
- **FR-004** `Ruta.inicioReparto` se escribe una vez (al salir o al escanear todo) y rehacer la ruta
  no lo borra ni lo mueve. Una ruta guardada antes no lo tiene y se lee como `null`.
- **FR-005** Sin instrucciones en pantalla: estados, datos y botones. El cómo, en la Ayuda.
- **FR-006** Lo derivable del pedido hoy (sin ubicar, OF distinta —toda OF que no tenga exactamente 9
  dígitos, menos o más—, sin OF) sale de una función pura
  de `lib/encomiendas/` que la 022 extiende.

## Criterios de éxito

- **SC-001** Con la hoja cerrada, cada paso muestra su botón principal sin abrirla (A–D, G).
- **SC-002** En la central, con la ruta recién armada, la cabecera nunca muestra «Pedido entregado».
- **SC-003** Resolver 4 pedidos en duda toma 4 guardados, sin volver a la lista entre uno y otro.
- **SC-004** Con la ruta terminada y el cierre aplazado, «Cerrar el día» está a 1 toque.

## Bordes

- Pedidos cargados a mano (sin guía): no hay nada que escanear y se pasa directo a recorrer.
- Un pedido que llega con la ruta andando no devuelve la hoja a «Cargar el auto».
- La OF distinta no se arregla siempre (puede venir así): sigue como ⚠ y nunca bloquea; «Resolver»
  pasa al siguiente y «Armar la ruta igual» siempre está.
- Con el formulario de un pedido abierto y sin ruta, la cabecera sigue siendo el contador de
  pendientes (los pedidos se cargan en tanda).

## Fuera de alcance

- **022**: calle en varios sectores, que los ⚠ entren a la ruta, los ⚠ del escaneo en la hoja (E) y
  el aviso dos paradas antes (F).
- **023**: paradas cercanas. La parada activa, la burbuja, la ruta propuesta, cargar la guía y la
  pantalla de cierre no cambian.
