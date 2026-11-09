# Spec 023 · Paradas cercanas en cada parada

**Creada**: 2026-11-05 · **Estado**: en curso (hecha y recorrida en la APK; falta un día real) · **Rama**:
`023-paradas-cercanas` · **Pedido del dueño** (`AGENTS.md`, «Navegación»): "es importante que en
cada parada también te muestre qué paradas tienes cerca (esto por si tenemos un pedido pendiente o
agendamos una entrega que la aplicación no sabe)".

## Hoy
- La parada abierta muestra solo su pedido. Para saber qué otras paradas hay cerca, el conductor
  tiene que mirar el mapa o la lista.

## Decidido (dueño, 2026-11-08)
- **Sola, no dentro de la 020:** solo en ARES. La burbuja es nativa y sumarla obligaría a tocar
  `android/` y a otra APK.
- **Qué es cerca:** a ≤ 300 m de la parada activa en línea recta, sin red ni cupo
  (`METROS_CERCA`).
- **Cuáles:** las pendientes de la ruta salvo las 2 que siguen, que ya vienen, y los pedidos
  pendientes fuera de la ruta con punto. Las cerradas no. Hasta 3, de la más cercana a la más
  lejana.
- **Dónde:** una píldora «N cerca» sobre el mapa, abajo a la derecha, a la izquierda de «Centrar»
  (dueño, 2026-11-09: primero "esquina inferior derecha"; encima de «Centrar» "no queda estético").
  Se ve solo recorriendo (paso «reparto»). Al tocarla se abre la lista.
- **La lista, compacta y marcada en el mapa** (dueño, 2026-11-09: "menos invasivo"): una línea por
  parada (número, OF y metros; sin OF, la dirección), sin título, 📞 y «Ahora» con borde. Abierta,
  esas paradas se marcan en el mapa (pastilla invertida; la de fuera de la ruta con «+»). Tocar la
  fila lleva el mapa a ella y suelta el seguimiento; «Centrar» lo devuelve.
- **«Ahora»** (antes «Hacer ahora»): la deja como la próxima parada, justo después de la activa; si
  estaba fuera de la ruta, entra. Como «Dejar como pendiente», no vuelve a pedir el trazado: no gasta cupo de ORS y
  la línea del mapa queda la de antes. Google Maps va a ella al cerrar la activa.
- **Costo: ninguno** (el dueño lo preguntó dos veces, 2026-11-09): ni tokens, ni ORS, ni Google Maps,
  ni IA. Todo se calcula en el teléfono con los puntos ya guardados; marcar y enfocar el mapa usa las
  teselas de OpenFreeMap que ya están bajadas (gratis, sin clave ni cupo).

## De paso (dueño, 2026-11-09)
- Se quitó «Llámalo antes de bajar» (FR-017) de la parada: consejo obvio, y la pantalla no lleva
  instrucciones. Llamar sigue en el botón redondo y en la burbuja (`parada-activa.tsx`,
  `use-hacia-parada.ts`).

## Dónde
- `_hooks/paradas-cercanas.ts` (`paradasCercanas`, puro) · `_componentes/paradas-cercanas.tsx`
  (`ParadasCercanas`) · `_componentes/controles-mapa.tsx` (al lado de «Centrar») ·
  `lib/encomiendas/local/sumar-a-ruta.ts` (`hacerAhora`) · `DiaEnCurso.hacerAhora` · Ayuda.
- Sin tablas, stores, versión de IndexedDB ni proveedores nuevos. Nada sale del teléfono.
- Pruebas: `pruebas/paradas-cercanas.test.mjs`.

## Tareas
- [x] T001 `paradasCercanas` y sus pruebas.
- [x] T002 `hacerAhora` y sus pruebas.
- [x] T003 Píldora, lista y Ayuda.
- [x] T004 Recorrerla en modo prueba. Se hizo en la APK de prueba (V2430, 384 px de ancho) contra el
  PC, 2026-11-09, con 7 pedidos inventados con Plus Code y uno más fuera de la ruta:
  - sin cercanas no sale nada, y con ellas «1 cerca» y «2 cerca» (entonces encima de «Centrar»; el
    dueño la pidió después a su izquierda);
  - la lista va de la más cercana a la más lejana («+» y «fuera de la ruta» para la de afuera, 📞
    solo con teléfono) y tocar fuera la cierra;
  - «Hacer ahora» la deja próxima con su aviso (también la de fuera: 3/7 → 3/8);
  - el recorrido destapó que, sin cercanas, «Centrar» quedaba a la izquierda: arreglado.
  - El 📞 no se tocó (llamaría a un número inventado; es el mismo `onLlamar` de la tarjeta). Un
    primer toque real cerró la lista sin mover nada; el segundo funcionó. Puede que la lista se
    corriera con la cabecera: mirarlo en terreno.
- [x] T006 Lista compacta y marcada en el mapa (dueño, 2026-11-09).
- [ ] T005 Un día real: ¿sirve en terreno?, ¿300 m es la medida?

## Recorrerla (quickstart)
1. Modo prueba, GPS simulado en la central. Pedidos inventados con Plus Code: la activa, dos que
   siguen a < 300 m, uno más adelante en la ruta a < 300 m y uno fuera de la ruta a < 300 m.
2. Armar la ruta, salir a repartir: abajo a la derecha, a la izquierda de «Centrar», «2 cerca» (no
   salen las dos que siguen).
3. Tocarla: la lista con su número, la OF, los metros, 📞 y «Ahora», y esas paradas marcadas en el
   mapa. Tocar una fila lleva el mapa a ella. Tocar fuera la
   cierra.
4. «Ahora» en la de más adelante: aviso «La N queda como la próxima parada» y la lista de la
   ruta la muestra segunda. Con la de fuera: «Entró a la ruta como la próxima parada».
5. 360 px: nada se corta, botones de ≥ 40 px, la píldora no tapa «Centrar» y sin cercanas «Centrar»
   sigue en su lugar.

## Cruces
020 (burbuja y parada abierta) · 017 («Dejar como pendiente» y «Sumar a la ruta») · 022 (⚠ dos
paradas antes).
