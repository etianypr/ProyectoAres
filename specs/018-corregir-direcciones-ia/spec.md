# Spec 018 · Corregir direcciones con IA

**Creada**: 2026-10-27 · **Estado**: hecha (falta día real) · **Pedido del dueño**: "sería
interesante si la misma IA pudiera corregir las direcciones que requieren corrección utilizando
las herramientas de Google Maps, Mapbox y otras".

Moneda: **tiempo del conductor y aparición de errores**. Hoy, de una guía de ~22 direcciones,
unas 3 quedan "Sin ubicar" (spec 016) y el conductor las corrige a mano, una por una.

## US1 (P1) · Las direcciones sin ubicar se corrigen solas

| Hoy | Debe |
|---|---|
| Al cargar la guía, las que el buscador no ubicó quedan "Sin ubicar" | La IA las intenta corregir con Mapbox, OpenStreetMap, Google y el catálogo de calles de Arica |
| Corregir es escribir la dirección de nuevo | Se aplica sola la que el buscador de siempre también aceptaría (la puerta, o la cuadra con el número); las dudosas quedan como sugerencia a la vista |
| — | "Corregir con IA" también en "Pedidos fuera de la ruta", para las de etiquetas o cargadas a mano |

## Reglas

- La IA **no escribe coordenadas**: elige un candidato que devolvió un buscador, por su id.
- Su confianza nunca supera a la del candidato (un barrio no es una puerta).
- El texto original queda en las notas del pedido.
- A Anthropic va solo la dirección y lo que devolvieron los buscadores; sin nombre ni teléfono.

## Pantalla "Cargar la guía" (mismo pedido)

Sacar foto y Galería, grandes y al centro; "Pegar el texto de Google Lens" es un botón aparte.

## Criterios

- SC-001: en una guía real, la mitad o más de las "Sin ubicar" quedan ubicadas sin tocarlas.
- SC-002: ninguna corrección aplicada sola cae en otra calle.
