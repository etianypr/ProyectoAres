# 047 — Navegación en ARES (sin voz)

**Estado:** borrador (dueño, 2026-11-26). Rama `047-navegacion-ares`.

## Qué pidió el dueño
- «Que ARES se encargue de la navegación»: vista desde arriba del mapa, calles que se distingan y que
  se vaya acercando a medida que avanza. Sin voz ni «a la derecha / a la izquierda».
- Google Maps queda de respaldo con un enlace «Abrir en Google Maps» en la hoja (calle cortada,
  taco: ARES no sabe de tráfico).
- Probarlo en el PC y en el V2430, y dejar un artefacto con lo hecho y las pruebas para decidir si
  pasa a `main`.

## Por qué
- Google Maps no llega como planeó ARES (dueño, 2026-11-25): el punto de paso lo mitiga, pero
  siguiendo la línea de ARES el problema desaparece.
- Cuesta US$0: MapLibre + OpenFreeMap sin clave ni cuota, la línea sale de la red de calles propia
  (spec 031) y el GPS es del teléfono.

## Alcance
1. «Navegar» (los km de la parada) se queda en ARES; «Abrir en Google Maps» abre Google Maps con la
   burbuja, como hoy.
2. Cámara desde arriba: el auto y ~1,2 km de línea por delante, girada al camino y acercándose sola
   (zoom 15 a 17).
3. Si el auto se sale de la línea, se traza de nuevo desde el auto con la red propia, sin consultas.
4. El mapa de Arica queda guardado en el teléfono para verse sin conexión.
5. Los nombres de las calles se leen encima de la línea naranja.

Fuera: voz, maniobras, tráfico, `android/`, Supabase, IndexedDB y el orden de la ruta.
