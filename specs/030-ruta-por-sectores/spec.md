# 030 · Ruta por sectores

**Estado:** en curso · **Rama:** `030-ruta-por-sectores` · **Paso del flujo:** 3 (armar la ruta)

## Por qué (dueño, 2026-11-12, en terreno)
- Hubo que rehacer la ruta 4 veces: desde Linderos la app mandó a Santiago Arata cuando quedaban
  muchos pedidos en la población 11 de Septiembre.
- Los conductores reparten por sectores: terminan uno y pasan al siguiente. La app solo conocía
  barrios de ~900 m (`generar-ruta/zonas.ts`), y una ruta cerrada deja parte de un sector «para la
  vuelta».

## Qué
- **R1. Sectores.** La app conoce los 7 sectores del plano de poblaciones de la Municipalidad de
  Arica (2025): Lluta, Norte, Borde Costero, San José, Centro, Sur y Azapa. El sector de un pedido
  sale de su punto, en el teléfono y sin red.
- **R2. Un sector entero y después el otro.** La ruta no vuelve a un sector que ya dejó. Dentro del
  sector sigue mandando el costo (km y tiempo) con los barrios de 900 m. Vale también sin matriz
  (sin señal o sin cupo de ORS).
- **R3. El conductor elige por cuál empieza, viendo los km.** Con pedidos en dos o más sectores, la
  app arma la ruta empezando por cada uno de los dos sectores más cercanos a la partida y muestra
  las dos propuestas con sus km. Con un solo sector, una propuesta, como hoy.
- **R4. La lista dice el sector.** En la propuesta, un separador con el nombre del sector cada vez
  que cambia (texto, no color).

## Medido antes de empezar (matriz real del fixture, sin consultas)
- Día solo en el norte (47 paradas, 3 sectores): hoy 38,4 km y vuelve 3 veces a un sector; con
  sectores 38,9 km (+1,3 %) y 0 veces. Empezando por otro sector: +8 a +11 %.
- Día en toda Arica (80 paradas, 7 sectores): hoy 63,2 km y vuelve 15 veces; con sectores 69,5 km
  (+10 %). No baja km: ordena la ruta como trabaja el conductor. El dueño lo aceptó.

## Datos y sistema
- Postgres: sin cambios. IndexedDB: sin store ni versión nueva (campos opcionales en la propuesta
  guardada). Proveedores: ninguno nuevo; el plano es público y nada nuevo sale del teléfono.
- Pedidos con punto → sector de cada uno → matriz ORS → costo + barrio + sector → una propuesta por
  sector de inicio → trazado de la elegida.

## Verificación
- Pruebas: `pruebas/rutas-030-sectores.test.mjs`. Recorrido: `quickstart.md`.
