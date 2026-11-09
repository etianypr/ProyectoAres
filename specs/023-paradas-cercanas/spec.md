# Spec 023 · Paradas cercanas en cada parada

**Creada**: 2026-11-05 · **Estado**: en curso (hecha en la rama; falta recorrerla) · **Rama**:
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
- **Dónde:** una píldora «N cerca» sobre el mapa, abajo a la izquierda, frente a «Centrar» (dueño:
  "en esquina inferior izquierda"). Se ve solo recorriendo (paso «reparto»). Al tocarla se abre la
  lista: número de parada (o «+» si está fuera de la ruta), dirección, metros, 📞 si tiene teléfono
  y «Hacer ahora».
- **«Hacer ahora»:** la deja como la próxima parada, justo después de la activa; si estaba fuera de
  la ruta, entra. Como «Dejar como pendiente», no vuelve a pedir el trazado: no gasta cupo de ORS y
  la línea del mapa queda la de antes. Google Maps va a ella al cerrar la activa.

## Dónde
- `_hooks/paradas-cercanas.ts` (`paradasCercanas`, puro) · `_componentes/paradas-cercanas.tsx`
  (`ParadasCercanas`) · `_componentes/controles-mapa.tsx` (esquina izquierda) ·
  `lib/encomiendas/local/sumar-a-ruta.ts` (`hacerAhora`) · `DiaEnCurso.hacerAhora` · Ayuda.
- Sin tablas, stores, versión de IndexedDB ni proveedores nuevos. Nada sale del teléfono.
- Pruebas: `pruebas/paradas-cercanas.test.mjs`.

## Tareas
- [x] T001 `paradasCercanas` y sus pruebas.
- [x] T002 `hacerAhora` y sus pruebas.
- [x] T003 Píldora, lista y Ayuda.
- [ ] T004 Recorrerla a 360 px en modo prueba (abajo).
- [ ] T005 Un día real: ¿sirve en terreno?, ¿300 m es la medida?

## Recorrerla (quickstart)
1. Modo prueba, GPS simulado en la central. Pedidos inventados con Plus Code: la activa, dos que
   siguen a < 300 m, uno más adelante en la ruta a < 300 m y uno fuera de la ruta a < 300 m.
2. Armar la ruta, salir a repartir: abajo a la izquierda, «2 cerca» (no salen las dos que siguen).
3. Tocarla: la lista con su número, la dirección, los metros, 📞 y «Hacer ahora». Tocar fuera la
   cierra.
4. «Hacer ahora» en la de más adelante: aviso «La N queda como la próxima parada» y la lista de la
   ruta la muestra segunda. Con la de fuera: «Entró a la ruta como la próxima parada».
5. 360 px: nada se corta, botones de ≥ 40 px, la píldora no tapa «Centrar».

## Cruces
020 (burbuja y parada abierta) · 017 («Dejar como pendiente» y «Sumar a la ruta») · 022 (⚠ dos
paradas antes).
