# 046 · Burbuja con las siguientes paradas y tarjeta de la parada con foto

Terreno (dueño, 2026-11-20): «¿existe la posibilidad de llamar a los siguientes pedidos? […] la
burbuja no te deja llamar a los siguientes». Se diseñó en una maqueta (`maqueta.html`, datos
inventados, medidas del V2430) hasta que el dueño la aprobó. **La maqueta manda**: su tabla «Qué va
en cada una» dice qué va en la burbuja y qué en la pestaña.

## Decisiones del dueño (2026-11-20)
- **Arriba, la dirección** (no la OF): solo calle y número en la burbuja, con Av./Pje.; la letra baja
  de 18 a 14 para que quepa y, si no cabe, se corta la calle, **nunca el número**. En la pestaña, la
  dirección completa (con el depto) en hasta dos renglones.
- **El nombre bajo la dirección**, «para saber a quién estoy llamando».
- **La foto del paquete** (la del escaneo) en vez de la descripción: fija, a la izquierda, con «mucha
  más prioridad que el POR PAGAR». Sin foto, el mismo espacio con un ícono de paquete.
- **Dos fichas iguales** a la derecha (96 × 36 dp, radio 8, borde 1 dp): **OF arriba** y el **pago**
  abajo. El ancho alcanza para «$100.000», el mayor POR PAGAR posible.
- **El pago**: POR PAGAR en **amarillo** (con el monto, o «Por revisar» sin monto); si no se cobra,
  **«✓ PAGADO» en verde**; sin leer, «PAGO · Sin leer» punteado (nunca se supone pagado, spec 005).
- Sin «Contestó» (el estado del receptor) ni la descripción del paquete. El horario pedido y el ⚠ de
  adelante sí siguen.
- Burbuja **sin «Navegar»** en la cabecera: ARES manda Google Maps a la siguiente al cerrar cada
  parada. En la pestaña sigue el chip de los km (abre Google Maps).
- El círculo de llamar, naranja claro con borde e ícono del mismo trazo (1,5 dp).
- **«Siguientes paradas», solo en la burbuja** («eso es exclusivo de burbuja»): una barra del alto de
  un botón con los números de las 3 pendientes que siguen; un toque abre la lista (dirección, nombre
  y llamar a cada una) y la flecha atrás vuelve a la parada. Sin teléfono, «Escanear» (abre ARES en
  el escáner de esa parada). Al llamar, la lista se cierra y al cortar vuelve Google Maps.
- Todo en la burbuja sale **junto en la APK 1.11.0** (la del «por pagar» por color): con la APK
  anterior la burbuja sigue como hoy (la web le manda también los campos de antes).

## Qué cambia
- `vista-burbuja.ts`: además de lo de antes (para la APK 1.10), `calle`, `numero`, `nombre`, `of`,
  `pago`, `foto` (miniatura JPEG en base64, del teléfono a la burbuja; no sale del teléfono) y
  `siguientes` (las 3 pendientes que siguen). `direccionCorta` arma calle y número.
- `use-burbuja.ts`: los toques `llamar:<pedido>` y `escanear:<pedido>` de la lista.
- `BurbujaVista.java` y una pieza nueva para la lista; `BurbujaServicio.java` guarda si la lista está
  abierta (se cierra con una parada nueva o al llamar).
- `tarjeta-parada.tsx`: la misma tarjeta en la pestaña (sin la lista).
- Sin cambios en la base del teléfono ni en Supabase.

## Verificación
- Pruebas puras de `direccionCorta`, del pago y de las siguientes (`pruebas/046-*.test.mjs`).
- APK de prueba en el V2430: la burbuja cerrada y abierta, llamar a una siguiente (vuelve a Maps),
  «Escanear» sin teléfono, una dirección larga y los cuatro pagos. La pestaña a 384 dp.
