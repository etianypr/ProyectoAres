# Spec 019 · Sin Mapbox

**Creada**: 2026-10-30 · **Estado**: en curso · **Pedido del dueño**: "necesito cambiar mapbox
porque no quiero seguir gastar, dame mejores opciones que no cuesten tanto $". La navegación
sigue dentro de ARES con el diseño Dashund ("que siga con el mismo diseño de dashun").

Moneda: **dinero**. Mapbox cobra pasado lo gratis y no tiene tope de gasto: el 2026-10-29 unas
pruebas que pedían su matriz sin el tope de la app dejaron una cuenta de US$66. Debe quedar en
**US$0 al mes** y sin ningún proveedor que pueda cobrar sin tope.

## US1 (P1) · Navegar sin Mapbox

> **Reemplazada por la spec 020** (`020-burbuja-google-maps`): ARES ya no guía. Guía la app
> Google Maps con la burbuja de ARES encima; salen el kit de Google, el cartel y la voz. Queda
> como registro de lo que se decidió en su momento.

| Hoy | Debe |
|---|---|
| Cartel de maniobra, voz y "Da la vuelta" salen de las direcciones de Mapbox | Lo mismo, con el mismo diseño, desde OpenRouteService (ORS). La voz la arma ARES con las instrucciones en español de ORS |
| "Seguir en Google Maps" abre otra app | Los km de la parada abren la **navegación de Google dentro de ARES** (kit de navegación de Google en la APK, colores Dashund, franja con la OF y "Volver a ARES"); al llegar vuelve sola. Elegido por el dueño **sin tope** (~US$15–19 al mes: 1.000 destinos gratis y US$25 cada 1.000). Si Google no puede, sigue la de ARES con ORS |

## US2 (P1) · La ruta por calles sin Mapbox

| Hoy | Debe |
|---|---|
| El orden sale de la matriz de Mapbox | De la matriz de ORS (hecho, 686c9a0) |
| La línea del día y el "sin salir en reversa de un pasaje" salen de Mapbox | De ORS: la ruta pasa de frente por las paradas en calles estrechas (residenciales y pasajes) donde daba la vuelta; en avenidas y calles principales se puede dar la vuelta |
| La calle cercana a una parada pegada a una carretera sale de Mapbox (Tilequery) | De OpenStreetMap |

## US3 (P2) · El mapa sin Mapbox

El mapa se dibuja con MapLibre y las teselas de OpenFreeMap (sin clave ni límite), con las
mismas pastillas, línea, cámara y colores Dashund. La vista previa del punto al escribir una
dirección deja de ser una imagen de Mapbox.

## US4 (P2) · Las direcciones sin Mapbox

Las sugerencias y la ubicación de una dirección salen de OpenStreetMap y ORS; lo que no
encuentren, de Google con **tope diario** debajo de lo gratis (la clave la crea el dueño). La
IA de la spec 018 usa las mismas herramientas, sin Mapbox. Se pierden números de casa que
Mapbox tenía en Arica: quedan el pin, los Plus Codes, el catálogo de calles y Google.

## US5 (P3) · Mapbox fuera

Sin `mapbox-gl`, sin `NEXT_PUBLIC_MAPBOX_TOKEN` y sin `api.mapbox.com` en el código. El dueño
anula el token en su cuenta.

## Reglas

- Ningún proveedor que cobre sin tope. ORS, OpenFreeMap y OpenStreetMap no piden tarjeta;
  Google solo con tope diario debajo de lo gratis.
- Pasado un límite la app se degrada (línea recta, sin cartel, botón de Google Maps), nunca
  cobra ni deja al conductor sin salida (constitución IV).
- Los puntos de destinatarios salen del teléfono directo al proveedor, nunca por el servidor
  (Google Geocoding sigue de paso por `/api/geocodificar`, como en la 016). Cada proveedor va
  en `docs/PRIVACIDAD.md`.
- `npm test` no llama a APIs reales. Una prueba contra una API real usa puntos inventados y
  dice antes cuántas consultas gasta.

## Criterios

- **SC-001**: armar un día de 67 paradas gasta ≤ 50 consultas de ORS (matriz 2, trazado 1 y los pedazos de frente, con tope de tiempo) (desde la spec 020, navegar no consulta ORS). La cuota diaria (2.000) alcanza para unos 30 armados.
- **SC-002**: después de US5, ninguna consulta a `api.mapbox.com` (prueba A10 sin ese host).
- **SC-003**: costo mensual de mapas y rutas: US$0.
- **SC-004**: en un día real el cartel y la voz anuncian cada maniobra.

## Supuestos

- Plan gratis de ORS: 2.000 direcciones, 500 matrices y 1.000 geocodificaciones al día.
- OpenFreeMap: sin clave, sin límite y uso comercial permitido; sin garantía de servicio.
- La deuda con Mapbox es aparte: el dueño pide un crédito de cortesía.
