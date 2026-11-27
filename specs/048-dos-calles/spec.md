# 048 — Dos calles en la dirección: vale la que tiene el número

**Estado:** borrador (dueño, 2026-11-27). Rama `048-dos-calles`.

## Qué pidió el dueño
- «LINDEROS CON NEGHME 2480»: hoy la app busca siempre la calle que va junto al número (Neghme).
  No siempre es así: la gente escribe la dirección de distintas formas.
- Comparar si existe «Linderos 2480» o «Neghme 2480»: si existe una, quedarse con esa; si existen
  las dos con esa numeración, que elija el conductor. La IA también tiene que saberlo.

## Cómo
- Con una calle que cruza («X con Y 2480», «Y 2480 con X»), se pregunta también por «X 2480» a
  Google (1 consulta más, dentro del tope diario; ~US$0,005).
- Solo una tiene ese número → esa; la otra queda como referencia. Las dos, a más de una cuadra →
  ⚠ con las dos opciones (el conductor elige). Ninguna → como hoy, y la IA la revisa.
- La IA deja de suponer que la calle con el número es la casa cuando hay dos calles.
