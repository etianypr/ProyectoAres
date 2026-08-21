# Research: Asistencia de ruta y entrega

## Decisión 1: Mantener pedidos y rutas en el teléfono

- **Decisión**: Extender IndexedDB y los módulos de `src/lib/encomiendas/local/` para guardar pedidos, respuestas de disponibilidad, bloques horarios y estados de la ruta.
- **Rationale**: El diseño actual evita custodiar datos personales de destinatarios en PostgreSQL y ya resuelve trabajo sin conexión, reintentos e idempotencia de eventos.
- **Alternativas consideradas**: Mover los pedidos a Supabase facilitaría la coordinación entre dispositivos, pero aumentaría la superficie de datos personales y contradice la decisión vigente del proyecto.

## Decisión 2: Introducir una excepción mínima para WhatsApp

- **Decisión**: Crear un adaptador de servidor para Meta WhatsApp Cloud API. Enviar únicamente el identificador de correlación, teléfono, nombre, bloque horario, fecha estimada y texto estrictamente necesario; no enviar la ruta completa ni guardar el detalle de pedidos en PostgreSQL.
- **Rationale**: El mensaje no puede salir desde IndexedDB directamente sin exponer credenciales de Meta. El servidor debe poder recibir el webhook y asociar la respuesta a un pedido sin convertir Supabase en el almacén de destinatarios.
- **Alternativas consideradas**: Enviar WhatsApp desde el navegador expondría el token permanente. Guardar todos los pedidos en la base simplificaría el webhook, pero viola el límite de datos mínimos.
- **Retención adoptada**: La correlación opaca se elimina inmediatamente después del cierre de la jornada, o como máximo 72 horas después de su creación si la jornada no se cierra. Si una respuesta se procesa antes, la correlación puede eliminarse en ese momento. No se guarda el cuerpo de conversación ni la dirección; Meta aplica su propia política al mensaje externo.

## Decisión 3: Usar Mapbox y OSM como proveedores complementarios

- **Decisión**: Conservar `geocoding.ts` como punto único de consulta, mostrando resultados combinados de Mapbox y Nominatim. Mantener Mapbox para matriz, trazado e indicaciones; permitir un proveedor adicional detrás del mismo contrato cuando sea necesario.
- **Rationale**: El proyecto ya comprobó que Mapbox encuentra mejor números de casa y OSM aporta nombres de calles y puntos locales. La aplicación ya tiene límites y cola para respetar Nominatim.
- **Alternativas consideradas**: Sustituir OSM por un único proveedor comercial reduciría la coordinación, pero empeoraría los casos locales que motivaron la funcionalidad.

## Decisión 4: Ajustar el modelo de estados sin romper la liquidación

- **Decisión**: Separar en el dominio local `disponibilidadDelReceptor` de `resultadoEntrega`. Traducir los resultados relevantes a los eventos existentes de actividad para que el servidor siga calculando entregas y omisiones. El rechazo tendrá una marca terminal local que impide reintento automático.
- **Rationale**: La base actual calcula pagos desde eventos anónimos y no conoce los pedidos. Cambiar esa fuente de verdad rompería las liquidaciones existentes.
- **Alternativas consideradas**: Crear tablas server-side por pedido permitiría informes más detallados, pero contradice la privacidad local-first y no es necesario para el dato que el jefe necesita.

## Decisión 5: Una ruta por defecto, alternativas solo si aportan valor

- **Decisión**: Reutilizar `calcularRutaLocal()` como propuesta principal y añadir comparación de alternativas solo cuando cambie materialmente tiempo, distancia, cantidad entregable o cumplimiento de bloques horarios. El resultado visible será de una a tres propuestas.
- **Rationale**: El límite evita complejidad y consultas innecesarias. La ruta debe optimizar entregas y ventanas, no producir tres opciones artificiales.
- **Alternativas consideradas**: Siempre generar tres rutas multiplicaría consultas de matriz/trazado y aumentaría la carga cognitiva del conductor.

## Decisión 6: Operación degradada explícita

- **Decisión**: Si falla el trazado, conservar puntos y orden; si falla la geocodificación, dejar el pedido fuera con advertencia; si falla WhatsApp, mostrar reintento y permitir contacto manual. Todos los estados locales siguen funcionando sin conexión.
- **Rationale**: El reparto no puede bloquearse por un proveedor, pero tampoco puede ocultar una ubicación dudosa.
- **Alternativas consideradas**: Bloquear toda la jornada ante cualquier fallo protege la precisión, pero reduce entregas incluso cuando el conductor tiene información suficiente para continuar.

## Decisión 7: cómo llega la respuesta del webhook al IndexedDB del teléfono

Esta decisión se validó ANTES de escribir una línea de la integración, porque
condiciona la migración, el contrato del webhook y el dominio local. El problema
es que las dos puntas no se pueden hablar: la respuesta del receptor llega al
SERVIDOR (Meta solo sabe hacer webhooks a una URL pública) y el pedido vive solo
en el TELÉFONO. El servidor no sabe a qué pedido corresponde y el teléfono no
sabe que llegó una respuesta.

- **Decisión**: el teléfono va a BUSCAR las respuestas; el servidor no las
  empuja. Al enviar el aviso, el servidor crea una correlación opaca
  `(correlation_id, chofer_id, pedido_id_local, external_message_id)`. El
  `correlation_id` viaja dentro del payload del botón de la plantilla, así que la
  respuesta del receptor lo trae de vuelta y el webhook lo resuelve sin consultar
  ningún dato personal. El webhook guarda la respuesta en esa misma fila. El
  teléfono consulta `GET /api/whatsapp/status`, recibe solo las respuestas de su
  propio `chofer_id`, las escribe en IndexedDB y las confirma con un `POST`.

- **Por qué tirar y no empujar**. Se descartó Web Push y se descartó Realtime de
  Supabase, y no por complejidad: por el modo de uso. El conductor reparte en la
  periferia de Arica, donde el caso común no es quedarse sin red sino tener red
  que no llega a ningún lado (es el mismo motivo por el que la cola de actividad
  reintenta cada minuto en vez de escuchar el evento `online`, ver
  `enviar.ts`). Una respuesta que se empuja mientras el teléfono no está
  escuchando se pierde, y el receptor no la va a repetir. Entonces el servidor
  tiene que poder ACUMULAR las respuestas hasta que el teléfono aparezca, y en
  cuanto existe ese buzón, tirar de él es suficiente. Push o Realtime quedan como
  una optimización de latencia después, nunca como el único canal.

- **Por qué el `correlation_id` y no el teléfono**. Para empatar la respuesta con
  el pedido hay tres candidatos: el número del receptor, el `context.id` que Meta
  manda con la respuesta (el wamid del mensaje al que contesta) y un identificador
  propio dentro del payload del botón. Se eligió el tercero como vía principal y
  el segundo como respaldo, y el primero se descartó: guardar el teléfono
  —incluso hasheado— convertiría la tabla en un registro de destinatarios, que es
  exactamente lo que el principio de datos mínimos prohíbe. Un `correlation_id`
  aleatorio no se deriva de ningún dato del receptor, así que no hay nada que
  revertir por fuerza bruta. Se descartó también meter directamente el
  `pedido_id_local` en el payload: funcionaría, pero le entrega a Meta un
  identificador interno nuestro sin necesidad.

- **Idempotencia, en las dos puntas**. El webhook descarta una respuesta repetida
  por `respuesta_mensaje_id` (el wamid de la respuesta, único por mensaje) con un
  índice único en la base, no con una comprobación en código: Meta reintenta el
  mismo evento cuando no recibe el 200 a tiempo, y dos reintentos en paralelo
  pasarían los dos por un `if`. El teléfono, por su lado, lleva en IndexedDB la
  lista de `respuestasAplicadas` por pedido, así que volver a bajar la misma
  respuesta —porque el `POST` de confirmación se cortó— no la aplica dos veces.

- **Por qué el teléfono confirma en un paso aparte**. El servidor podría marcar
  la respuesta como entregada en el mismo `GET`, y sería una consulta menos. No
  se hizo: si el teléfono se queda sin batería entre recibir la respuesta y
  escribirla en IndexedDB, esa respuesta quedaría marcada como entregada y no
  volvería a bajar nunca. El receptor confirmó y el conductor no lo sabría. El
  `POST` va DESPUÉS de la escritura local, igual que `quitarDeCola` va después de
  la confirmación del servidor en la cola de actividad.

- **Qué NO se guarda**. La fila de correlación no lleva nombre, teléfono,
  dirección, cuerpo de conversación ni orden de paradas. El nombre y el teléfono
  los manda el teléfono en el cuerpo del `POST /api/whatsapp/send`, se usan para
  armar la llamada a Meta y no se persisten: quedan en memoria del proceso el
  tiempo que dura la consulta. La única cosa personal que sale del sistema es lo
  que la plantilla aprobada necesita, y sale hacia Meta, no hacia Postgres.

## Decisión 8: la plantilla tiene tres botones, y el horario es un segundo paso

Al validar la Decisión 7 contra las reglas reales de la Cloud API apareció un
límite que cambia el flujo descrito en el documento principal, así que queda
anotado acá antes de implementarlo.

- **El límite**. El primer mensaje a un receptor que nunca escribió a la empresa
  tiene que ser una PLANTILLA aprobada por Meta; los mensajes interactivos de
  lista solo se pueden mandar dentro de la ventana de 24 horas que abre una
  respuesta del cliente. Y una plantilla admite como máximo TRES botones de
  respuesta rápida. Los seis bloques horarios no entran.

- **Decisión**: la plantilla lleva exactamente los tres botones del documento
  principal —`CONFIRMAR`, `RECHAZAR` y `HORARIO` ("indicar un horario
  disponible")—, que es justo el máximo. Tocar el tercero es en sí una respuesta
  del receptor: abre la ventana de 24 horas, y ahí sí se le puede mandar un
  mensaje de lista con los bloques que el jefe dejó activos. La disponibilidad
  queda en `pendiente_respuesta` hasta que elija uno; recibir el `HORARIO` a
  secas no confirma nada todavía.

- **Rationale**: es el único orden que respeta las reglas de Meta sin recortar las
  opciones que el producto promete. La alternativa era ofrecer tres bloques en
  vez de seis para que entraran como botones, y eso deja fuera la mitad del día.

- **Alternativas consideradas**: pedir el horario como texto libre (obliga a
  interpretar lenguaje natural y contradice la decisión de no depender de
  mensajes libres, ver el contrato); o mandar seis plantillas distintas, una por
  bloque (absurdo y carísimo en créditos de Meta).

- **Consecuencia para el estado local**: `whatsapp` en el pedido necesita
  distinguir "aviso enviado" de "lista de horarios enviada", porque son dos
  mensajes salientes distintos y cada uno puede fallar por su cuenta.
