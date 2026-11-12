# Research: Menos visitas fallidas (confirmar la dirección)

## R1. Cómo vuelve lo que escribe el receptor
- **Decision**: formulario de WhatsApp (Flow) abierto desde un botón de la plantilla; el código de
  correlación va como `flow_token` y vuelve en `nfm_reply.response_json` con el Sí/No y el texto.
- **Rationale**: un texto suelto en el chat no trae el código; para saber de qué pedido es habría
  que guardar algo derivado del teléfono del receptor, lo que la 010 descartó a propósito
  (`whatsapp/correlacion.ts`). El formulario además llega en un solo mensaje y sin audios.
- **Alternativas**: botones y después texto (hash con clave del número por ≤ 24 h, un mensaje de
  servicio más por respuesta); WhatsApp del conductor con `wa.me` (gratis, pero la respuesta queda
  en su chat y no en el pedido); SMS desde la APK (gratis con plan ilimitado, sin botones).

## R2. Un campo de texto o dos
- **Decision**: uno («Referencia o dirección correcta»).
- **Rationale**: sin `If`, el JSON funciona en cualquier versión de Flows. El que cambia según el
  Sí/No queda para después, probado en la vista previa de Meta.

## R3. Cuándo sale
- **Decision**: en cuanto el pedido tiene teléfono, nombre y dirección; lo manda el sondeo de 30 s
  (o el aceptar la ruta), como en la 010.
- **Rationale**: el teléfono y el nombre llegan con la etiqueta (paso 4); antes, `pedidosSinAviso`
  gastaba los 3 intentos con pedidos sin teléfono.
