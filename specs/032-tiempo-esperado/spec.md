# 032 · Tiempo esperado

**Estado:** borrador (anotada el 2026-11-12, sin empezar) · **Rama:** — · **Pasos del flujo:** 3, 5 y 6

## Por qué (dueño, 2026-11-12)
- La propuesta de ruta dice «1 h 38 min · tiempo de ruta» (87 paradas del 10-11), pero es solo el
  tiempo manejando: la app no muestra cuánto dura la jornada con las entregas.
- Por dentro la app ya supone 4 minutos por entrega (`MIN_POR_PARADA` en
  `src/lib/encomiendas/local/planificar.ts`), para los horarios y el orden de los bultos, pero no lo
  muestra. Con eso, el 10-11 serían unas 7 h 26 min. Spoke estimó 3 h 59 min para ese mismo día, o sea
  menos de 2 minutos por parada.

## Qué
- **R1. El tiempo esperado de la jornada.** Al armar la ruta, la propuesta informa el tiempo
  manejando, el de las entregas, el total y la hora estimada de término.
- **R2. Un contador de tiempo.** Al empezar la ruta («Salir a repartir»), un contador corre a la
  vista del conductor hasta cerrar el día.
- **R3. Al final del día, lo esperado contra lo real.** En «Cerrar el día», el tiempo esperado al
  armar la ruta junto al que marcó el contador.

## Por aclarar con el dueño
- Cuántos minutos se demora de verdad cada entrega: un número fijo, o el promedio de los días
  anteriores (solo cifras).
- Dónde se ve el contador: la cabecera de ARES, la burbuja sobre Google Maps (APK) o las dos.
- Si el tiempo de manejo debe sumar tráfico y semáforos: hoy sale sin ellos (velocidades ajustadas
  contra OpenRouteService, `src/lib/geo/red/tiempos.ts`, spec 031).
- Si el informe del final del día le llega al jefe. Serían solo cifras, sin datos de personas, pero
  subirlo pide una columna nueva en Postgres (migración, se pregunta antes).

## Datos y sistema (se define en el plan)
- Teléfono: la hora en que empezó la ruta y el tiempo esperado, en la ruta del día (IndexedDB).
- Servidor: solo si el jefe recibe los tiempos.
- Depende de la 031: el tiempo manejando sale del mapa de calles propio.
