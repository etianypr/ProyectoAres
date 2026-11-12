# Feature Specification: Menos visitas fallidas

**Branch**: `004-menos-visitas-fallidas` · **Created**: 2026-10-20 · **Retomada**: 2026-11-09 · **Status**: en curso

**Input** (dueño, 2026-11-09): «de mientras será solamente un mensaje de que confirme su dirección
y que nos dé una referencia si es que confirma; la idea es que sea un mensaje interactuable».

## Decisiones (dueño, 2026-11-09)

- **Un solo aviso por pedido, el de la dirección.** Reemplaza por ahora al de disponibilidad de la
  010 (Sí, estaré · Mañana · Otro horario), que queda en el código sin pedirse: la mitad del costo.
- **Formulario de WhatsApp (Flow)**, no botones y texto suelto: el Sí/No y lo escrito vuelven
  juntos, con el código del pedido como `flow_token`, sin guardar nada del teléfono del receptor.
- **Sale solo, al leer la etiqueta**: en cuanto el pedido tiene teléfono y nombre. Sin toques.
- **«No, es otra»**: el receptor escribe la correcta; el pedido queda con ⚠ y el conductor elige.
- **Privacidad:** nombre, teléfono y dirección van a Meta, y lo escrito pasa por el servidor hasta
  que el teléfono lo baja. El dueño lo acepta («cuando lo llamo igual tomo sus datos para hacer
  efectiva la entrega»); falta la autorización de Starken antes del lanzamiento oficial
  (`docs/PRIVACIDAD.md` §2).
- Costo: ~US$0,02 por aviso (plantilla de Utilidad en Chile).

## User Scenarios & Testing

### US1 — El receptor confirma y deja una referencia (P1)

**Independent Test**: un pedido con teléfono → sale la plantilla → el receptor elige «Sí» y
escribe «reja verde» → la parada dice «Dirección confirmada por el receptor» y «reja verde».

1. **Given** un pedido de la guía sin teléfono, **When** se lee su etiqueta, **Then** sale el
   aviso con su nombre y la dirección de la guía (≤ 30 s, en el sondeo).
2. **Given** el aviso, **When** el receptor elige «Sí, es correcta» con o sin referencia,
   **Then** el pedido queda confirmado y la referencia se ve en la parada; la disponibilidad no
   cambia.

### US2 — El receptor dice que es otra dirección (P1)

1. **Given** el aviso, **When** elige «No, es otra» y escribe la correcta, **Then** el pedido queda
   con ⚠ «El receptor dice otra dirección», se avisa en pantalla y la ruta no cambia sola.
2. **Given** ese ⚠, **When** el conductor toca «Usar la del receptor», **Then** se ubica la nueva
   (como la de la etiqueta); con «Dejar la de la guía», se quita el ⚠.
3. **Given** «No» sin texto, **Then** el ⚠ dice «El receptor dice que no es esa dirección» y solo
   ofrece «Dejar la de la guía» (el conductor lo llama).

### Edge Cases

- Sin teléfono o sin nombre: no se avisa ni se gastan intentos (la guía trae los dos vacíos).
- Número fijo o sin WhatsApp: el servidor lo rechaza; tras 3 intentos no se insiste (010).
- La misma respuesta dos veces (Meta reintenta): se aplica una vez.
- Pedido ya cerrado: la respuesta se anota como vista y no lo reabre.
- El conductor corrige la dirección: se quita el ⚠ del receptor y la confirmación de la anterior.
- Teléfono mal escrito («reiniciar»): se borra lo que contestó la otra persona.
- Modo prueba o `WHATSAPP_EN_PAUSA`: no sale nada.

## Requirements

- **FR-001**: Enviar la plantilla `confirmar_direccion` con nombre y dirección de la guía, y un
  botón Flow cuyo `flow_token` es el código de correlación. Sin coordenadas.
- **FR-002**: Avisar solo a pedidos con teléfono, nombre y dirección; una vez por pedido.
- **FR-003**: El webhook lee `nfm_reply` (`confirma` si/no, `texto`), limpia el texto (una línea,
  ≤ 300) y lo guarda en `respuesta_texto` (0008).
- **FR-004**: `/status` entrega el texto; la fila se borra cuando el teléfono confirma (máx. 72 h).
- **FR-005**: «Sí»: `direccionConfirmada = true` y `referenciaReceptor`. «No»: `direccionConfirmada
  = false` y ⚠ `receptor_otra_direccion` con lo escrito. Idempotente por mensaje; no reabre.
- **FR-006**: La parada activa muestra la confirmación y la referencia; el ⚠ se resuelve arriba del
  formulario, como el de la etiqueta. Ningún estado solo con color.
- **FR-007**: Lo escrito por el receptor vive solo en el teléfono (`pedidos`, borrado con el día)
  y en el servidor hasta que se baja.

## Success Criteria

- **SC-001**: ≥ 50 % de los avisos contestados en un día real.
- **SC-002**: Visitas fallidas −30 % frente a las 2 semanas previas (no entregados del panel, 006).
- **SC-003**: Ningún aviso a un pedido sin teléfono; ningún receptor con dos avisos el mismo día.

## Después (fuera de esta etapa)

- El aviso de disponibilidad de la 010 (y la 014, ¿conviene ir al pedido con horario?).
- «Voy llegando» y el aviso desde el WhatsApp propio del conductor (versión anterior de esta spec,
  en el historial de git).
- Cambiar el nombre del campo de texto según el Sí o el No (`If` de Flows), una vez probado en Meta.
