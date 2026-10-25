# Spec 016 · Ubicar las direcciones de la guía sin corregirlas a mano

**Creada**: 2026-10-24 · **Estado**: en curso (US1, US2 y US3 hechas; falta medir un día real)

## Contexto

Con la guía real del 2026-10-24 (22 líneas), **9 direcciones quedaron para corregir a mano**
(41 %). Medido una por una contra Mapbox y OSM, las causas son cinco:

| Causa | Ejemplo (número cambiado) | Qué pasaba |
|---|---|---|
| Ceros a la izquierda | `PUDAHUEL 0123` | Mapbox busca "0123" como texto: no da la puerta |
| Depto o letra tras el número | `… ARATA # 12 3`, `SAN MARCOS 100 B`, `… EDIFICIO 01` | el resto empuja a otra cuadra o tapa el número |
| Nombre incompleto | `SANTIAGO ARATA` (es "Santiago Arata Gandolfo"), `HUMBERTO ARELLANO` | Mapbox contesta otra calle ("Santiago") |
| Una letra cambiada | `BRAULIO MUNIZ` (es "Muñoz") | ningún proveedor la encuentra |
| Calle con dos nombres en Mapbox | `ALEJANDRO AZOLAS 100` | Mapbox da la puerta exacta pero la marca "otra calle" y se descartaba |

Y una sexta que no es de tipeo: **calles que ni Mapbox ni OSM tienen numeradas** (pasajes cortos
y algunas avenidas). Ahí solo se puede dar la calle.

## Historias

### US1 (P1) · La dirección con tipeo se ubica sola

El conductor carga la guía y las direcciones con ceros, deptos, letras de más o de menos y
nombres incompletos se ubican sin que toque nada.

- **Dado** `PUDAHUEL 0123`, **entonces** se consulta `PUDAHUEL 123`.
- **Dado** `BRAULIO MUNIZ 100`, **entonces** se pregunta por "Braulio Muñoz 100" y, si existe,
  queda exacta.
- **Dado** que Mapbox marca "otra calle" una puerta cuyo nombre es el escrito, **entonces** se
  usa; si el nombre es otro (el caso "Diego Portales" → "Palza Corvacho"), se sigue descartando.
- **Dado** el mismo número en dos nombres de la misma calle, a menos de 300 m, **entonces** no
  se pregunta cuál.

### US2 (P1) · Calle corta sin numerar: la parada va a la calle

- **Dado** que solo se encuentra la calle y la calle entera mide ≤ 300 m, **entonces** queda
  "aproximada" con el aviso "la calle es corta (unos N m)…", y entra a la ruta.
- **Dado** una calle más larga, **entonces** sigue "solo la calle" (se corrige a mano), con la
  calle escrita primero en la lista aunque el proveedor haya puesto otra arriba.

### US3 (P2) · Último recurso: Google · **espera decisión del dueño**

Para lo que quede sin ubicar (calles largas sin numerar), preguntar a Google. Bloqueado por
tres cosas que decide el dueño (ver `plan.md` §Google): los términos de Google no permiten usar
sus coordenadas en un mapa que no sea de Google (la app usa Mapbox), requiere cuenta con
facturación, y Google pasa a recibir direcciones (subencargado en `docs/PRIVACIDAD.md`).

## Requisitos

- **FR-001** La consulta se limpia: ceros a la izquierda, número marcado con `#`/`N°` (lo que
  sigue es depto), letra o subnúmero tras el número, lugar tras el número (cerro, villa,
  sector…), edificio/torre con su número, ", Arica". El pedido guarda el texto original.
- **FR-002** Un nombre de calle "es el escrito" si cada palabra que distingue está en él, igual
  o con 1 letra corregida (2 si tiene ≥ 9 letras; las de < 5 letras y los números, exactas).
  Grados (diputado, capitán…) y tipo de vía no hace falta escribirlos.
- **FR-003** Catálogo de calles de Arica (OpenStreetMap) en el código, con el largo de cada
  calle; se regenera con `npm run calles`. Sin red al consultarlo.
- **FR-004** Sin puerta en la primera vuelta, se pregunta a Mapbox por "nombre oficial +
  número" en hasta 3 calles: las de los proveedores y las del catálogo, solo el grupo con menos
  letras corregidas.
- **FR-005** Ambigüedad solo si las coincidencias están a más de 300 m; tramos de una misma
  calle sin número no son ambiguos.
- **FR-006** Calle corta (≤ 300 m) sin número → "aproximada" con aviso (US2).
- **FR-007** Nunca se elige una calle cuyo nombre no es el escrito (principio IV).

## Criterios de éxito

- **SC-001** De las 22 direcciones de la guía del 2026-10-24, ≥ 18 se ubican sin intervención.
  **Medido**: 19 (15 exactas + 4 aproximadas); antes 13.
- **SC-002** Ninguna dirección queda en una calle distinta de la escrita (revisado a mano en
  las 22).
- **SC-003** En un día real, ≤ 3 direcciones de la guía a corregir a mano.

## Fuera de alcance

- Recordar direcciones de un día para otro (choca con el borrado diario, spec 007).
- Corregir el nombre de la calle que se muestra: el pedido conserva lo escrito.
