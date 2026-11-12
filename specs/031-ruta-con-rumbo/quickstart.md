# 031 · Recorrido a mano

Modo prueba, en el V2430 (skill `recorrer-conductor`). Con la red propia nada de esto gasta cupo de
ORS; el contador de Diagnóstico tiene que quedar igual.

1. **La red baja sola.** Con señal, abrir el día con pedidos. En Diagnóstico: «Mapa de calles propio:
   <fecha>».
2. **Armar.** «Armar la ruta» con 80 a 100 pedidos. Anotar los segundos hasta la propuesta (antes:
   20 s con 53 pedidos). Diagnóstico: «La última ruta la dibujó el mapa propio» y los contadores de
   OpenRouteService sin cambio.
3. **Mirar la línea.** En ninguna parada de pasaje o calle residencial la línea se devuelve por donde
   llegó, salvo en un pasaje sin salida. En las avenidas de doble sentido sí puede.
4. **Invertir, quitar, sumar, rehacer.** «Invertir orden de ruta», 🗑 a una parada, «Sumar a la ruta»
   y «Rehacer la ruta → Desde: Mi ubicación»: todas dibujan sin consultar.
5. **Modo avión.** Con la red ya bajada, cerrar y abrir la app sin señal y armar la ruta: sale
   completa, con su línea.
6. **El respaldo.** Diagnóstico → «Armar la ruta con OpenRouteService»: la ruta se arma como antes
   y los contadores suben. Quitar la marca al terminar.
7. **Día real.** El conductor recorre la ruta y anota cada lugar donde la app lo hizo girar donde no
   se puede, o dar una vuelta que no hacía falta: esas calles se corrigen en OpenStreetMap o en las
   reglas (`geo/red/caminos.ts`).
