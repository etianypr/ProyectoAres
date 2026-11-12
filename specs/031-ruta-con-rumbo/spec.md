# 031 · Ruta con rumbo

**Estado:** en curso · **Rama:** `031-ruta-con-rumbo` · **Paso del flujo:** 3 (armar la ruta)

## Por qué (dueño, 2026-11-12)
- El orden supone que en cada parada el auto gira en U gratis. En la calle, si la siguiente parada
  queda «para atrás» en una calle angosta, hay que dar la vuelta a la manzana: esos km no estaban en
  la cuenta.
- Hoy se corrige después de ordenar (trazado sin reversa de ORS y `generar-ruta/sentido.ts`), con un
  costo estimado, y ese paso se salta si el armado lleva más de 25 s. El dueño: «no debería
  reordenarla, debería generar la ruta sin errores sabiendo toda esta información».
- La matriz de ORS es de punto a punto y no acepta el rumbo con que se llega o se sale.

## Qué
- **R1. La red de calles de Arica va dentro de la app** (OpenStreetMap, generada con `npm run red`):
  vías manejables, sentido único, tipo de calle, geometría y restricciones de giro.
- **R2. Motor de rutas propio, en el teléfono y sin red.** Reglas de giro en U (dueño):
  - calle angosta (residencial, pasaje, servicio): no se gira en U, ni a mitad de cuadra ni en la esquina;
  - calle ancha de doble sentido: sí, con un tiempo de maniobra;
  - pasaje sin salida: se sale en reversa, con un tiempo de maniobra;
  - calle privada: solo para llegar a una parada, no de paso.
- **R3. Matriz con rumbo.** Cada parada tiene uno o dos sentidos de paso por su calle; cada tramo se
  mide saliendo en un sentido y llegando en otro.
- **R4. La búsqueda elige el orden y el sentido de paso de cada parada**, con el mismo costo en plata
  (km a $130 y hora a $6.000). Hasta 13 paradas, el óptimo exacto. Con más, se certifica midiendo.
- **R5. El trazado sale de la red propia**, con la misma forma que usa la pantalla. ORS queda de
  respaldo (red sin cargar, parada fuera de la red) y la línea recta como último respaldo.
- **R6. Armar la ruta no necesita señal ni cupo**, y los puntos de las paradas dejan de ir a ORS en el
  camino normal.

## Datos y sistema
- Postgres e IndexedDB: sin cambios (v6). Dato nuevo: `src/lib/geo/red/red-arica.ts` (público, ODbL).
- Paradas → red en el teléfono → matriz con rumbo → orden + sentido → trazado propio.

## Verificación
- El motor contra la matriz real de ORS guardada (`pruebas/fixtures/matriz-tiempo-arica.json`).
- La búsqueda contra fuerza bruta (días chicos) y contra una búsqueda mucho más larga (40–80 paradas).
- «Km en el aire»: el orden de antes medido con rumbo, contra el orden nuevo.
- En el V2430: armar 100 paradas, invertir, sumar, rehacer, modo avión.
