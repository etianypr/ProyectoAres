# Spec 022 · Pedidos con problemas (⚠) dentro de la ruta

**Creada**: 2026-11-05 · **Definida**: 2026-11-06 · **Estado**: en curso · **Rama**:
`022-pedidos-con-problemas` (sale de `027-hoja-por-paso`) · **Pedido del dueño**: `AGENTS.md`, «El
flujo del conductor» (paso 2) y «Pedidos con problemas (⚠)».

## Lo que ya hizo la 027 (no se repite)
- La hoja muestra con ⚠ lo que se deduce del pedido, cada uno con su problema en palabras.
- «Resolver los N ⚠» abre los pedidos de a uno, antes o después de armar la ruta; «Armar la ruta
  igual» está en la cabecera y al terminar de cargar la guía.
- Maquetas aprobadas: la franja «En 2 paradas» (caso F) y los ⚠ del escaneo (caso E):
  https://claude.ai/artifact/3oXR2pjwVGLvsCnYS7jJxz

Decidido con el dueño (2026-11-06):
- **La OF de otro largo deja de ser ⚠.** Hay OF de distintos largos y valen si están en el paquete
  o en la orden de flete. Sigue con ⚠ solo la línea de la guía **sin** OF (no se puede enlazar con
  su etiqueta). Cambia la regla «OF» de `AGENTS.md`.
- El ⚠ se guarda en el pedido: campo nuevo y opcional `Pedido.problemas` (store `pedidos`, sin
  subir la versión de `idb.ts`; se borra con el día; no sale del teléfono).
- El aviso dos paradas antes va en ARES (la franja de la maqueta F) y en la burbuja, en su línea de
  aviso, sin tocar `android/`. En la burbuja se ve solo con la tarjeta abierta.
- Lo que no se arregla se marca a mano: «Va igual» (parada lejana, horario que no alcanza) y «Es
  así» (paquete que no estaba en la guía). Deja de contar en «Resolver» y en el aviso.
- Al resolver, el problema va arriba del formulario del pedido, con su salida (maqueta elegida:
  «Arriba del formulario»).

## US1 (P1) · La dirección en duda entra a la ruta con ⚠

| Hoy | Debe |
|---|---|
| Una calle que existe en dos o más lugares queda «Sin ubicar» y fuera de la ruta; sus opciones se pierden | Entra con la **primera opción** de la búsqueda y ⚠ «Calle en N lugares»; las opciones quedan guardadas en el pedido |
| Solo la calle, sin el número: queda fuera | Entra con el punto de la calle y ⚠ «Sin número: va a mitad de cuadra» |
| Para elegir hay que volver a buscar | Arriba del formulario: las opciones guardadas, con su mapa. Elegir una no consulta a nadie |
| — | Una dirección sin ninguna opción sigue fuera: no hay punto adonde ir |

Pasa al leer la guía y al rehacer la ruta (`reintentarUbicar`). Corregir la dirección a mano o
elegir una opción quita el ⚠.

## US2 (P1) · Aviso dos paradas antes

| Hoy | Debe |
|---|---|
| Nada avisa que viene un pedido en duda | Si una de las **dos paradas siguientes** tiene ⚠, la cabecera muestra «⚠ En 2 paradas: la 14 · Calle en 3 lugares» con «Llamar» (o «Ver» sin teléfono) |
| La parada activa con ⚠ no lo dice | La tarjeta de la parada dice su ⚠ |
| La burbuja no sabe | La misma línea va en el aviso de la burbuja cuando no hay un «Deshacer» o una confirmación |

Cuentan para el aviso: calle en varios lugares, sin número, lejana, horario que no alcanza y
dirección distinta de la etiqueta. No cuentan: sin OF y fuera de la guía.

## US3 (P2) · ⚠ al armar la ruta, guardados en el pedido

| Hoy | Debe |
|---|---|
| La parada lejana y el horario que no alcanza son solo texto en «Revisar antes de seguir» | También ⚠ en el pedido: «Queda a 6,2 km del resto», «No alcanza su horario», con «Va igual» |
| Si la ruta salía del caché, esos avisos se perdían | Se conservan |

## US4 (P2) · ⚠ del escaneo, guardados en el pedido

| Hoy | Debe |
|---|---|
| La dirección distinta de la etiqueta se olvida al cerrar el escáner | ⚠ «La etiqueta dice otra dirección», con «Usar la de la etiqueta» o «Dejar la de la guía» |
| El paquete que no estaba en la guía queda como «manual», sin marca | Origen «etiqueta» y ⚠ «No estaba en la guía», con «Es así» |
| Un envío con bultos incompletos (1 de 2) no está en «Faltan» | Aparece en «Faltan» con «Bultos 1 de 2» |

## Requisitos
- **FR-001** `problemasDelPedido` junta lo que se deduce y lo guardado, sin lo revisado; dice si
  avisa dos paradas antes. Pura, con pruebas.
- **FR-002** Editar el pedido conserva sus ⚠; cambiar la dirección o el punto quita los de lugar.
- **FR-003** Rehacer la ruta reemplaza los ⚠ de lejana y horario, y conserva lo marcado «Va igual».
- **FR-004** El aviso dos paradas antes sale de una función pura, con pruebas.
- **FR-005** Nada de esto sale del teléfono; la burbuja recibe solo el texto del aviso.

## Criterios de éxito
- **SC-001** Ningún pedido con una opción de lugar queda fuera de la ruta por estar en duda.
- **SC-002** Elegir una de las opciones guardadas no hace ninguna consulta a Google, OSM ni ORS.
- **SC-003** Recorriendo, el aviso aparece cuando el pedido con ⚠ está a 2 paradas o menos.

## Fuera de alcance
- Que la burbuja se abra sola o cambie de color (toca `android/`).
- Paradas cercanas (023) y criterios de ruta (024).
