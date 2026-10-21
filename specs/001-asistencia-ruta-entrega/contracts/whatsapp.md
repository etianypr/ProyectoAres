# Contract: WhatsApp de disponibilidad

> **Reemplazado en parte por la spec 010**: botones "Sí, estaré" · "Mañana" · "Otro horario"
> (RECHAZAR → MANANA) y la ruta en curso se reordena con las respuestas. Vigente: `docs/WHATSAPP.md`.

## Objetivo

Definir el contrato entre ARES y Meta WhatsApp Cloud API sin exponer la ruta
completa ni depender de mensajes de texto libres.

## Mensaje saliente: son DOS, no uno

Al implementarlo aparecieron dos límites de la Cloud API que obligan a partir el
intercambio en dos mensajes. Están acá y no en una nota al pie porque cambian el
contrato:

1. Una **plantilla admite como máximo tres botones** de respuesta rápida. Los
   seis bloques horarios no entran.
2. Un **mensaje interactivo de lista solo se puede mandar dentro de la ventana de
   24 horas** que abre una respuesta del cliente. El primer contacto con alguien
   que nunca escribió a la empresa tiene que ser una plantilla aprobada.

Ver la Decisión 8 de [research.md](../research.md) para el detalle y las
alternativas descartadas.

### Mensaje 1 — la plantilla

ARES solicita el envío de una plantilla aprobada por Meta con:

- teléfono normalizado del receptor;
- nombre de presentación del receptor;
- identificador externo de correlación opaco;
- fecha o contexto de entrega permitido por la plantilla;
- exactamente tres botones de respuesta rápida.

Los tres botones, en este orden:

| Índice | Payload | Significado |
|---|---|---|
| 0 | `CONFIRMAR:<correlationId>` | podrá recibir el pedido |
| 1 | `RECHAZAR:<correlationId>` | no recibirá el pedido |
| 2 | `HORARIO:<correlationId>` | quiere indicar un horario |

⚠️ El **orden importa y no se puede verificar desde el código**: el payload se
manda por índice de botón. Si alguien reordena los botones en el panel de Meta,
el "sí" de un receptor llega como rechazo, y no hay forma de detectarlo.

`HORARIO` a secas **no es una disponibilidad**. El pedido sigue en
`pendiente_respuesta` hasta que el receptor elija un bloque concreto.

### Mensaje 2 — la lista de horarios

Se manda **solo** después de recibir `HORARIO`, porque ese toque es lo que abre la
ventana de 24 horas. Es un mensaje interactivo de tipo lista, con una fila por
bloque activo:

- `id` de la fila: `HORARIO_<bloqueId>:<correlationId>`;
- `title` de la fila: la etiqueta del bloque (`08:00 - 10:00`).

Mandarlo antes de tiempo lo rechaza Meta con el código `131047`, que por eso está
en la lista de errores que no se reintentan.

### Límites de tamaño

| Campo | Límite de Meta | Lo que usamos |
|---|---|---|
| payload de un botón | 128 caracteres | `HORARIO_18-20:` + 22 = 36 |
| `title` de una fila | 24 caracteres | 13 (`08:00 - 10:00`) |
| botones por plantilla | 3 | 3 |
| filas por lista | 10 | 6 |

### Lo que NO sale

El adaptador no envía dirección, orden de ruta ni datos de otros receptores. El
servidor conserva únicamente la correlación opaca necesaria para procesar la
respuesta: conductor, id local del pedido, día e identificador aleatorio. No
guarda el teléfono ni el nombre — se usan para armar la llamada a Meta y no se
persisten. Esa correlación se elimina inmediatamente después del cierre de la
jornada o, si no se cierra, 72 horas después de su creación.

## Webhook entrante

`POST /api/whatsapp/webhook` debe:

1. Validar la firma `X-Hub-Signature-256` (HMAC-SHA256 con el secreto de la app)
   **sobre el cuerpo crudo**. Tiene que ser byte por byte como llegó: un
   `JSON.stringify(JSON.parse(x))` reordena claves y cambia el escapado, así que
   el HMAC no coincidiría nunca y todos los eventos se descartarían en silencio.
   La comparación va en tiempo constante.
2. Sin secreto configurado, **rechazar todo**. Fallar cerrado: un webhook sin
   verificar deja que cualquiera que conozca la URL invente respuestas de
   receptores.
3. Aceptar eventos de estado del mensaje sin cambiar disponibilidad.
4. Aceptar respuestas interactivas y resolver el `correlation_id` desde el
   payload del botón. Vía de respaldo: `messages[].context.id`, que trae el wamid
   del mensaje contestado.
5. Rechazar respuestas duplicadas por el wamid de la RESPUESTA, con un índice
   único en la base y no con una comprobación en código: Meta reintenta el mismo
   evento y dos reintentos en paralelo pasarían los dos por un `if`.
6. Dejar la respuesta disponible para que el teléfono la baje y la aplique. El
   webhook **no** escribe en IndexedDB — no puede — así que no "actualiza la
   disponibilidad": la deja en la correlación.
7. Responder 200 en todos los casos salvo firma inválida (403) y servidor sin
   configurar (500). Un evento que no se entiende se descarta con 200: Meta
   reintenta durante horas lo que no recibe 200, y un mensaje irrelevante no
   puede convertirse en una tormenta de reintentos.

La respuesta no incluye datos personales. Un mensaje de texto libre del receptor
se descarta sin guardar ni una palabra de su contenido.

### Lo que Meta no garantiza

- **El orden de los eventos.** Un `sent` puede llegar después de un `delivered`.
  El estado guardado no puede retroceder, y menos aún pisar `respondido`.
- **Una sola entrega por evento.** El mismo evento llega varias veces si no
  recibe el 200 a tiempo. De ahí la idempotencia del punto 5.
- **Que la respuesta traiga `context`.** Por eso la vía principal es el payload.

## Estados externos

Los estados `sent`, `delivered`, `read` y `failed` describen el mensaje, no la
entrega física. Un `failed` deja el pedido como pendiente de contacto y ofrece
contacto manual; nunca lo marca como rechazo ni como sin respuesta.

## Errores

- `400`: payload inválido o correlación ausente.
- `401/403`: credencial o firma inválida; registrar alerta sin revelar token.
- `409`: evento duplicado; responder idempotentemente.
- `429`: reintentar con backoff respetando límites del proveedor.
- `5xx`: conservar la solicitud pendiente y mostrar estado de reintento.
