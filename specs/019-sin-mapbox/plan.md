# Plan · Spec 019

> La navegación (US1: `ors/navegacion.ts`, cartel, voz y el kit de Google) salió con la spec 020.
> Lo de abajo queda como registro.

## Límites afectados

```
                    ANTES (Mapbox)                         DESPUÉS (sin tarjeta, US$0)
Teléfono ─┬─ ordenar la ruta ───── Mapbox Matrix      →  ORS Matrix          lib/geo/matriz.ts (hecho)
          ├─ línea del día ─────── Mapbox Directions  →  ORS Directions      lib/geo/ors/direcciones.ts
          ├─ navegar (cartel/voz)─ Mapbox Directions  →  ORS Directions      lib/geo/ors/navegacion.ts
          ├─ calle cercana ─────── Mapbox Tilequery   →  teselas de OpenFreeMap  lib/geo/acceso.ts · teselas.ts
          ├─ dibujar el mapa ───── Mapbox GL + estilo →  MapLibre + OpenFreeMap  _mapa/* · lib/geo/estilo-mapa.ts
          ├─ vista del punto ───── imagen de Mapbox   →  foto de MapLibre    components/direccion/estampilla-mapa.ts
          └─ buscar dirección ──── Mapbox + OSM       →  Google (número, con tope, servidor) + OSM  lib/geo/geocoding/*
```

Las pantallas no cambian: `obtenerRutaCalles`, `obtenerNavegacion`, `PasoNavegacion`,
`RutaCalles` y `CalleDelPunto` conservan su forma; cambia de dónde salen los datos.

## Datos que salen del teléfono

| Proveedor | Recibe | Desde | Límite gratis | Si se pasa |
|---|---|---|---|---|
| OpenRouteService | coordenadas de paradas y partida (orden, línea, navegación) | teléfono | 500 matrices, 2.000 direcciones, 1.000 geocodificaciones al día | rechaza (429): línea recta / sin cartel |
| OpenFreeMap | teselas de la zona que se mira y de la zona de cada parada, ~2 km (nada del destinatario) | teléfono | sin límite | la parada queda donde estaba |
| Nominatim | dirección escrita | teléfono | 1 por segundo | sigue con las otras |
| Google Geocoding | dirección escrita, sin nombre ni teléfono | servidor (de paso) | tope diario que pone el dueño, debajo de 10.000 al mes | rechaza: queda "Sin ubicar" |
| Google Maps (app) | coordenadas de la parada activa | teléfono | — | — |

## Decisiones

1. **Pasos de ORS → `PasoNavegacion`.** ORS da, por paso: `instruction` (español), `name`,
   `type` (0 izquierda … 13 mantener derecha), `exit_number`, `way_points` (tramo de la
   geometría). El `tipo`/`modificador` se traduce al vocabulario que ya usan los íconos; el
   `banner` de un paso es la calle de la maniobra SIGUIENTE (como el de Mapbox).
2. **La voz la arma ARES.** Por cada paso, los avisos de la maniobra que viene: "En 500 metros,
   …" (si el paso es largo), "En 200 metros, …" y la instrucción sola cerca del giro. La salida
   se dice al empezar ("Siga por …": ORS escribe "Camina" al partir, se corrige).
3. **Sin reversa en calles estrechas.** El rumbo en una parada intermedia NO impide dar la vuelta
   en ORS (medido); `continue_straight` sí, pero vale para toda la consulta. Por eso: primero la
   ruta libre; en cada parada donde da la vuelta en una calle estrecha, se pide de nuevo solo ese
   pedazo (parada anterior → parada → siguiente; varias seguidas, juntas) con
   `continue_straight` y se reemplazan esos tramos. Medido con puntos inventados: 2 de 3 pasan
   de frente; la otra no tenía salida.
4. **Tipo de calle.** `extra_info: waytype` de ORS: 1 carretera, 2 calle principal, 3 calle
   (residencial, pasaje). Se puede dar la vuelta en 1 y 2.
5. **ORS acepta 70 puntos por consulta** (verificado): un día de 67 paradas es una consulta.
6. **Clave**: `NEXT_PUBLIC_ORS_KEY`, pública como el token de Mapbox; el peor caso es que alguien
   gaste la cuota del día, nunca un cobro.

## Estructuras

- `lib/geo/ors/cliente.ts`: `claveOrs`, `postOrs` (POST con tope de tiempo; 429 → "cupo").
- `lib/geo/ors/direcciones.ts`: `obtenerRutaCalles`, `RutaCalles`, `CalleDelPunto`.
- `lib/geo/ors/navegacion.ts`: `obtenerNavegacion`, `elegirSalida`, `PasoNavegacion`, `pasosDeOrs`.
- `lib/geo/ors/vuelta.ts`: `claseDeTipo`, `permiteDarLaVuelta`.
- `lib/geo/recorrido.ts` (sale de `mapbox/`, no depende de ningún proveedor).
