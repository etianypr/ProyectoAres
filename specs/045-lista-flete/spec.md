# 045 · Escanear la lista de la app de Starken

Terreno (dueño, 2026-11-19): además de la boleta de papel, la app de Starken del conductor muestra
«Ruta» → «Lista de Ordenes de Flete», una tarjeta por encargo. «Se deberían usar las dos.» Rama de
trabajo encima de la 044 (sin commit hasta que el dueño lo apruebe).

## Decisiones del dueño (2026-11-19)
- La OF va igual que en la boleta (9 dígitos).
- Se usan **las dos**: la boleta y la lista, incluso en un mismo escaneo.
- «PxP» en verde es **por pagar**.
- El número de 8 dígitos de cada tarjeta es el del conductor: se ignora.

## La tarjeta (medida con la lista real, Diagnóstico → «Copiar anonimizado»)
```
282000001                 ← OF, sola en su renglón            → se lee
PxP                       ← ícono                              → se ignora
<nombre>                  ← destinatario                       → NO se lee (spec 021)
CALLE 123 ARICA COD       ← dirección + comuna (+ ícono COD)    → se lee, sin «ARICA» ni el ícono
27000001                  ← número del conductor               → se ignora
Hoy
```
37 cuadros en 13 s (2,8 por segundo, ML Kit 310 ms): la cámara lee la pantalla; cada cosa sale en su
renglón y la tarjeta de arriba entra cortada bajo la cabecera.

## Qué cambia
- `lectura/lista-flete.ts` (nuevo, puro), `bloquesListaFlete`: una tarjeta es la OF de 9 dígitos sola
  en su renglón, íconos, el nombre (que se salta) y la dirección que termina en «ARICA». Sin el
  nombre antes no hay tarjeta; un número que sale dos veces en el cuadro (el del conductor) no es OF;
  una tarjeta cortada no se toma; un cuadro con algo de la boleta (títulos o pie) no se lee aquí.
  La dirección pasa por `limpiarDestino` (con la limpieza de la 044).
- `barrido-nomina.ts` (`sumarCuadroNomina`): un tercer lector junto a la boleta y la guía, con la
  misma salida (OF, dirección y bultos sin leer = 1). Votos, rango, flechas y pantalla, iguales.
- `cajas-nomina.ts` (`cajasDelCuadro`): las tarjetas se marcan enteras sobre la cámara.
- Sin cambios en `android/`, en la base del teléfono ni en Supabase.

## Lo que no hace (todavía)
- **PxP en verde:** ML Kit lee texto, no colores, y la lista no trae el monto. Leerlo es tocar
  `android/` (medir el color bajo «PxP» en `LectorCuadros.java`), APK nueva y `APK_VERSION_MINIMA`; el
  pedido quedaría «por pagar, monto por leer en la etiqueta» (nunca $0). Lo decide el dueño.
- El «51» del pie (total de órdenes) no se usa como total: el de la boleta es de **bultos** y se
  mezclarían.

## Verificación
- `pruebas/045-lista-flete.test.mjs` (8); la prueba dorada de la boleta (100 OF) queda **idéntica**;
  `npm test` (1131), `npm run lint`, `npm run build`.
- **Falta (dueño):** en el V2430, «Cargar guía» → «Escanear nómina» apuntando a la lista de Starken,
  bajando hasta el final; comparar las OF y direcciones con la lista. Después, una boleta y la lista en
  el mismo escaneo.
