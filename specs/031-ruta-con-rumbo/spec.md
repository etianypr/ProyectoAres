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
- **R7. En un condominio, siempre por su entrada** (dueño, 2026-11-12): la ruta llega a la entrada
  del condominio y «Navegar» lleva a Google Maps ahí; el número de la parada queda en el edificio.
  En el 10-11, 9 de 88 paradas; la vuelta al Centro Ecuestre (+2,2 km) desaparece. Un pasaje abierto
  con nombre de calle (como Mosa, abierto en las dos puntas) no es condominio: se para frente a la casa.
- **R6. Armar la ruta no necesita señal ni cupo**, y los puntos de las paradas dejan de ir a ORS en el
  camino normal.

## Datos y sistema
- Postgres e IndexedDB: sin cambios (v6). Dato nuevo: `src/lib/geo/red/red-arica.ts` (público, ODbL).
- Paradas → red en el teléfono → matriz con rumbo → orden + sentido → trazado propio.

## Estado (2026-11-12)
- Hecho y con pruebas: la red como dato (`npm run red`), el motor (`geo/red/`), la matriz con rumbo, la
  búsqueda (`orden-paradas/con-rumbo*.ts`), la pasada de bultos, el armado, el trazado propio, la
  puerta con respaldo a ORS, el interruptor de Diagnóstico y la precarga.
- Medido en el PC: motor contra ORS, mediana 0,0 % en metros. Ruta real de 87 paradas, con las
  entradas de condominio: 37,1 km la de hoy, 39,7 la anterior y 39,5 la de Spoke (todas medidas con
  rumbo); armado entero, ~2 s sin red (`npm run medir`).
- **Recorrido en el V2430** (2026-11-12, APK de prueba contra el PC, las 87 paradas del 10-11 solo
  con sus puntos): armar la ruta 6,7 s (antes, 20 s con 53 paradas), la pantalla quieta como mucho
  1,4 s seguidos; «Invertir orden de ruta» +5,0 km; «Usar esta ruta»; «Navegar» en una parada de
  condominio mandó a Google Maps a su entrada (la misma que calcula el PC); Diagnóstico: 0 matrices y
  0 trazados de ORS en el día, «Mapa de calles propio: 2026-11-12».
- Falta: modo avión, el interruptor de ORS y «Sumar a la ruta» en el teléfono; comparar el trazado
  propio con uno de ORS (~10 consultas, con aviso); el día real.
- Supuestos por confirmar con el dueño: segundos de maniobra (U en calle ancha 12, reversa 20,
  portón 45) y que una calle sin clasificar cuenta como ancha (como antes con ORS).
- «Respeta horarios» y «Confirmados primero» (dormidas, sin WhatsApp) siguen ordenando sin rumbo; se
  miden y se dibujan con rumbo.

## Verificación
- El motor contra la matriz real de ORS guardada (`pruebas/fixtures/matriz-tiempo-arica.json`).
- La búsqueda contra fuerza bruta (días chicos) y contra una búsqueda mucho más larga (40–80 paradas).
- «Km en el aire»: el orden de antes medido con rumbo, contra el orden nuevo.
- En el V2430: armar 100 paradas, invertir, sumar, rehacer, modo avión.
