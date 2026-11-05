# Feature Specification: Navegar con Google Maps y la burbuja de ARES

**Feature Branch**: `020-burbuja-google-maps`

**Created**: 2026-11-01

**Status**: Draft

**Input**: pedido del dueño (2026-11-01): "me gustaria que se vea reflejada la ruta en ares pero
la navegacion entre paradas recae en google maps con la burbuja de ares". Después: "quita el kit
que tenga que ver con la navegacion porque ahora tiene otro enfoque ares […] la burbuja aparece
abierta en la navegacion de google y no debe cerrarse […] digamos que estan ligadas las dos", y
"el riesgo del plan se elimina si definimos que siempre tenga un boton para ir a navegacion
porque el pedido no esta cerrado". Eligió: burbuja con **todos los botones**, ARES **no vuelve
sola** al llegar, fuera también la navegación propia de ARES, y la burbuja **se achica** pero no
se quita mientras haya un pedido abierto.

Moneda: **dinero y toques**. El kit de navegación de Google dentro de ARES (spec 019) cobra cada
destino pasado los 1.000 gratis al mes; con ~100 destinos al día obliga a una cuota diaria de ~32
y a cambiar de navegación a mitad del día. La app Google Maps navega gratis y sin límite.

ARES cambia de enfoque: **muestra la ruta y maneja las paradas; no guía**. Guiar es de Google Maps.
La burbuja va ligada al **pedido abierto**, no a lo que haga Google Maps: mientras la parada no se
cierre, la burbuja está y siempre tiene **Navegar**.

| Hoy (019) | Debe (020) |
|---|---|
| ARES guía con su cartel de maniobras y su voz (ORS) | ARES no guía: mapa con la línea del día, la posición, las paradas y los km a la activa |
| Los km de la parada abren el kit de Google dentro de ARES (cuota ~32 al día) | Abren la app **Google Maps** navegando, con la **burbuja de ARES** encima |
| Al llegar, el kit se cierra y ARES vuelve sola | No vuelve sola: el conductor cierra la parada en la burbuja |
| Cerrar la parada y salir a la siguiente: volver a ARES, finalizar, tocar los km | Un toque en la burbuja: la parada se cierra y Google Maps navega a la siguiente |
| Kit de Google en la APK, con clave y cuota | Fuera. Costo de navegación: US$0 sin cuota |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - La burbuja acompaña al pedido abierto (Priority: P1)

Como conductor, quiero que los km de la parada abran Google Maps navegando con ARES encima, y
que mientras el pedido no esté cerrado la burbuja siga ahí con un botón para volver a navegar,
para nunca quedar sin el paquete a la vista ni sin cómo llegar.

**Why this priority**: es el cambio que deja la navegación en US$0; sin esto no hay burbuja.

**Independent Test**: con 3 paradas inventadas, tocar los km de la primera: Google Maps abre
navegando y la burbuja abierta muestra la parada. Salir de la navegación en Google Maps y abrir
otra app: la burbuja sigue; "Navegar" vuelve a Google Maps navegando a la misma parada. Achicarla
y abrirla. Cerrar las 3 paradas: la burbuja se va.

**Acceptance Scenarios**:

1. **Given** una parada activa con punto y el permiso dado, **When** el conductor toca sus km, **Then** Google Maps abre navegando hacia ese punto y encima aparece la burbuja **abierta** con la OF, a quién y dónde.
2. **Given** la burbuja, **When** el conductor toca "Navegar", **Then** Google Maps abre navegando hacia la parada activa, esté como esté (guiando, llegado, cerrado u otra app adelante).
3. **Given** la burbuja con la parada abierta, **When** el conductor sale de la navegación en Google Maps, llega, o cambia de app, **Then** la burbuja sigue ahí con "Navegar".
4. **Given** la burbuja abierta, **When** la achica, **Then** queda un círculo con el número de parada que se puede arrastrar; tocarlo la abre. No hay forma de quitarla mientras quede un pedido abierto.
5. **Given** la burbuja, **When** toca "Volver a ARES", **Then** ARES viene adelante en la misma parada y la burbuja se oculta; al salir de ARES vuelve a aparecer.
6. **Given** la última parada del día, **When** se cierra, **Then** la burbuja se va y ARES queda adelante.
7. **Given** que falta el permiso, **When** toca los km, **Then** ARES abre el ajuste de Android para darlo; al volver, Google Maps abre navegando igual (sin permiso, sin burbuja).

---

### User Story 2 - Los botones de la parada en la burbuja (Priority: P1)

Como conductor, quiero llamar, marcar si contestó y cerrar la parada desde la burbuja, para no
salir de Google Maps en cada puerta.

**Why this priority**: es lo que el dueño eligió ("todos los botones") y lo que ahorra toques en
las ~100 paradas del día.

**Independent Test**: con 3 paradas inventadas (una con teléfono y sin respuesta, una confirmada,
una sin teléfono), recorrer cada una solo desde la burbuja y comparar lo guardado con hacer lo
mismo en ARES: queda igual.

**Acceptance Scenarios**:

1. **Given** una parada en cualquier paso, **When** la burbuja la muestra, **Then** tiene los mismos botones que la tarjeta de ARES en ese paso (tabla de abajo), con el mismo texto y color.
2. **Given** una parada con teléfono, **When** toca "Llamar" en la burbuja, **Then** la llamada sale directo y, al colgar, la burbuja ya muestra el paso siguiente (contestó o no) sin volver a ARES; si no se pudo saber, pregunta "Contestó / No contestó".
3. **Given** una parada lista para entregar, **When** toca "Pedido finalizado" (o "Entregado"), **Then** queda guardada igual que en ARES, la burbuja muestra el aviso con "Deshacer" y pasa a la siguiente parada, y Google Maps navega hacia ella sin otro toque.
4. **Given** el aviso con "Deshacer" en la burbuja, **When** lo toca, **Then** la parada vuelve como estaba, igual que en ARES, y Google Maps vuelve a navegar hacia ella.
5. **Given** una parada sin teléfono, **When** toca "Escanear la etiqueta" o "Teléfono", **Then** ARES viene adelante y abre el escáner o el pedido; la burbuja vuelve al salir de ARES.

| Paso de la parada | Botones en la burbuja (los de la tarjeta de ARES) |
|---|---|
| Hay que contactarlo, con teléfono | Llamar |
| Hay que contactarlo, sin teléfono | Escanear la etiqueta (abre ARES) · Teléfono (abre ARES) · Entregado · No se pudo |
| Se llamó: ¿contestó? | Contestó · volver a llamar · No contestó |
| Contestó o confirmó por WhatsApp | Pedido finalizado · Llamar · No se pudo |
| No se pudo | Dejar como pendiente · No entregado · Volver |

Siempre: OF, a quién y dónde; **Navegar**; "Volver a ARES"; achicar.

---

### User Story 3 - ARES muestra la ruta, no guía (Priority: P2)

Como conductor, quiero que ARES me muestre la ruta del día y cuánto me falta a la parada, sin
cartel de maniobras ni voz propia, para que la única que me guíe sea Google Maps.

**Why this priority**: lo pidió el dueño ("otro enfoque"); saca la voz que se pisaba con la de
Google y las consultas a ORS de cada tramo.

**Independent Test**: con un día de 3 paradas inventadas, en ARES: se ven la línea del día, las
paradas en orden, las cerradas, la activa, la posición y los km a la activa; ARES no habla ni
muestra cartel de maniobras.

**Acceptance Scenarios**:

1. **Given** un día con ruta, **When** el conductor mira ARES, **Then** ve la línea del día, las paradas en orden, las cerradas, la activa, su posición y los km que faltan a la activa.
2. **Given** cualquier momento del día, **When** ARES está adelante, **Then** no habla ni muestra cartel de maniobras.
3. **Given** ARES adelante, llegando a una parada sin contactar, **When** faltan ~300 m por la ruta, **Then** sigue el aviso "llámalo antes de bajar" (spec 017).
4. **Given** que Google Maps no está o no abre, **When** toca los km o "Navegar", **Then** se abre Google Maps en el navegador, navegando hacia la parada.

---

### Edge Cases

- **Sin permiso de la burbuja** ("Mostrar sobre otras apps"): Google Maps abre navegando, sin
  burbuja, como hoy; el conductor vuelve a ARES a mano.
- **"Volver a ARES" con Google Maps guiando**: Google Maps sigue guiando atrás (es la única que
  guía) y termina sola al llegar; ARES no la corta.
- **Android cierra ARES en segundo plano** (el vivo es agresivo con la batería): la burbuja se va;
  al abrir ARES, el día sigue donde estaba (todo vive en el teléfono) y los km la vuelven a abrir.
- **Llamada desde la burbuja**: al colgar, Android vuelve a Google Maps, no a ARES; igual se
  detecta si contestó.
- **Aviso "llámalo antes de bajar"**: con ARES atrás no se da (no usa el GPS en segundo plano).
  Lo cubre la burbuja, que en ese paso muestra "Llamar".
- **Cerrar la parada en ARES con la burbuja en curso** (después de escanear, por ejemplo):
  Google Maps navega a la siguiente, con la burbuja. Antes del primer toque a los km, se sigue
  con los km.
- **Modo prueba (GPS simulado)**: Google Maps navega desde la ubicación real; la burbuja y sus
  botones se prueban igual.
- **Parada sin punto** ("Sin ubicar"): no hay a dónde navegar. En la burbuja, "Navegar" trae ARES
  adelante con esa parada para ubicarla.
- **Dos toques seguidos** en un botón de la burbuja: cuentan como uno (como en ARES).
- **APK vieja** (sin burbuja): los km abren Google Maps como hoy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Tocar los km de una parada con punto MUST abrir la app Google Maps navegando en auto hacia ese punto.
- **FR-002**: Desde el primer toque a los km, mientras quede un pedido abierto, la burbuja MUST estar encima de lo que haya adelante (salvo ARES). Aparece abierta y MUST NOT poder quitarse.
- **FR-003**: La burbuja MUST tener siempre "Navegar", que abre Google Maps navegando hacia la parada activa, sin importar lo que esté haciendo Google Maps.
- **FR-004**: La burbuja MUST NOT depender de lo que haga Google Maps: salir de su navegación, llegar o cambiar de app no la quita.
- **FR-005**: La burbuja MUST mostrar la OF (o "Parada N"), a quién, dónde y los mismos botones que la tarjeta de ARES para el paso en que va; cada toque MUST tener el mismo efecto que en ARES (mismo guardado, mismo aviso, mismo "Deshacer").
- **FR-006**: El paso de la parada y qué botones van MUST decidirse en un solo lugar para ARES y la burbuja; la burbuja no tiene reglas propias.
- **FR-007**: "Llamar" en la burbuja MUST llamar directo y detectar solo si contestó al colgar, aunque ARES siga atrás; si no se puede saber, la burbuja pregunta.
- **FR-008**: Con la burbuja en curso, al cerrar una parada (en la burbuja o en ARES) Google Maps MUST navegar a la siguiente sin otro toque; con "Deshacer", vuelve a la anterior. Al cerrar la última, la burbuja se va y ARES queda adelante.
- **FR-009**: "Volver a ARES", "Escanear la etiqueta" y "Teléfono" MUST traer ARES adelante en la misma parada (y abrir lo pedido); con ARES adelante la burbuja se oculta y vuelve al salir de ARES.
- **FR-010**: La burbuja MUST poder achicarse a un círculo con el número de parada y arrastrarse; aparece abierta con cada parada nueva.
- **FR-011**: Sin el permiso, ARES MUST llevar al ajuste de Android para darlo y abrir Google Maps igual; nunca deja al conductor sin navegar.
- **FR-012**: ARES MUST NOT guiar: sin cartel de maniobras, sin voz de navegación y sin pedir rutas tramo a tramo. Muestra la línea del día, la posición, las paradas y los km a la activa medidos sobre el tramo de la línea del día que llega a ella (en línea recta si el auto no va por ese tramo).
- **FR-013**: Si Google Maps no se puede abrir, ARES MUST abrir Google Maps en el navegador hacia la parada.
- **FR-014**: A Google Maps MUST ir solo el punto de la parada; la OF, el nombre y la dirección se muestran en la burbuja, en el teléfono.
- **FR-015**: La APK MUST quedar sin el kit de navegación de Google y sin su clave.
- **FR-016**: ARES MUST NOT usar el GPS mientras está atrás (constitución: sin GPS permanente).
- **FR-017**: Cómo dar el permiso va en la Ayuda, corto; la burbuja muestra solo la parada y sus botones.

### Key Entities

- **Burbuja en curso**: empieza con el primer toque a los km y sigue mientras quede un pedido
  abierto; no depende de Google Maps. Vive en memoria; no se guarda.
- **Vista de la burbuja**: lo que ARES le pasa a la burbuja: número de parada, OF, a quién,
  dónde, si tiene punto, los botones del paso (id, texto, tono, si abre ARES) y el aviso con
  "Deshacer".
- **Toque de la burbuja**: qué botón tocó el conductor (id). ARES lo atiende igual que el de su
  tarjeta.
- Sin tablas ni stores nuevos: el día ya vive en el teléfono.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Costo de navegación con ~100 paradas al día: **US$0 al mes**, sin cuota que cuidar.
- **SC-002**: Cerrar una parada entregada y salir hacia la siguiente toma **1 toque** en la burbuja (hoy: volver a ARES, finalizar y tocar los km).
- **SC-003**: Recorrer 3 paradas solo desde la burbuja deja **exactamente lo mismo** guardado que hacerlo en ARES.
- **SC-004**: En un día real, **al menos 8 de cada 10** paradas se cierran sin volver a ARES.
- **SC-005**: Mientras quede un pedido abierto, volver a navegar hacia la parada toma **1 toque** desde cualquier app (0 casos sin "Navegar"), salvo que Android cierre ARES.
- **SC-006**: Las llamadas desde la burbuja quedan marcadas solas (contestó / no contestó) en al menos 9 de cada 10, como desde ARES (spec 015).
- **SC-007**: Abierta, la burbuja ocupa como mucho el tercio de abajo de la pantalla; achicada, un círculo de ~1,5 cm (la yema de un dedo).
- **SC-008**: ARES no pide ninguna ruta tramo a tramo durante el día (solo la línea del día).
- **SC-009**: Sin permiso, sin Google Maps o con ARES cerrado por Android, el conductor **siempre** tiene cómo navegar a la parada (0 casos sin salida).

## Assumptions

- Teléfono del conductor: vivo V2430, Android 15, con Google Maps instalada. Es propio, no
  compartido (spec 015), así que la burbuja con el nombre del receptor no la ve otra persona.
- ARES no lee nada de Google Maps: solo le manda el punto y la abre. Abrirla con el mismo punto
  otra vez retoma la navegación; con otro, la cambia.
- Android pide un aviso fijo de ARES en la barra mientras la burbuja está; es lo que evita que
  cierre ARES en segundo plano. En el vivo puede hacer falta permitir "consumo en segundo plano"
  para ARES: se verifica en terreno y va en la Ayuda.
- La APK se instala desde un archivo (spec 015), sin tienda: "Mostrar sobre otras apps" lo da el
  conductor una vez en los ajustes.
- Lo que sale con la navegación de ARES (spec 019 US1 y T005; voz de la 017) se reemplaza por
  esta spec. La línea del día sigue saliendo de ORS (019 US2).
- Google Maps (app) ya figura en `docs/PRIVACIDAD.md`; pasa a navegación principal. El kit de
  navegación sale de esa tabla y ORS deja de recibir el tramo de cada parada.
