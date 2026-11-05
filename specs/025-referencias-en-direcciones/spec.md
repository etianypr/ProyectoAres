# Spec 025 · Referencias en las direcciones

**Creada**: 2026-11-05 · **Estado**: borrador (falta definirla) · **Rama**: sin empezar ·
**Pedido del dueño** (`AGENTS.md`, «Direcciones en Arica» → «Referencias»).

## Hoy
- Muchos pedidos traen, además de la dirección, una referencia para encontrar la casa: «calle X con
  calle Y», «frente a…», «al lado de…».
- La limpieza de la consulta (`geo/geocoding/consulta.ts`) no quita las referencias con «con».
- La IA de la spec 018 (`geo/direccion-ia/servidor.ts`, `SISTEMA`) no conoce esta regla.

## Debe
- Para ubicar el pedido se usa solo la calle con su número. Eso vale para los buscadores y para la
  IA.
- La referencia queda en el pedido, para el conductor.

## Por definir
- Dónde queda la referencia. En el código, `referencia` es la **descripción del paquete** (spec
  003), así que no se puede reusar ese nombre. ¿Va en `notas`, que ya existe en `pedidos`, o en un
  campo nuevo? Un campo nuevo cambia el formato de datos y se pregunta antes.
- Qué formas de referencia se reconocen. Ejemplos inventados, nunca de pedidos reales.
- Cómo se mide: correr `npm run sondear` antes y después (gasta: avisar primero).

## Cruces
016 (ubicar direcciones) · 018 (IA de direcciones) · 022 (dirección en duda).
