# Data Model: Menos visitas fallidas (confirmar la dirección)

Modelo completo en `docs/CLASES.md` y `docs/ARQUITECTURA.md` §2.

## Teléfono (IndexedDB v6, store `pedidos`, se borra al cerrar el día)

| Campo | Tipo | Qué |
|---|---|---|
| `Pedido.direccionConfirmada` | `boolean \| null` | true = «Sí, es correcta»; false = «No, es otra»; null = sin respuesta. Vuelve a null si el conductor cambia la dirección o reinicia el teléfono |
| `Pedido.referenciaReceptor` | `string \| null` | Lo que escribió al confirmar (≤ 300). Solo para el conductor, no para ubicar |
| `ProblemaGuardado` `receptor_otra_direccion` | `{ direccion: string \| null }` | La dirección que dio al decir que no. Es ⚠ de lugar: cambiar la dirección lo quita |

Sin versión nueva de la base: los pedidos de antes reciben los campos en `alDia`.

## Servidor (Postgres, migración 0008)

`encomienda_whatsapp_correlaciones`:

| Columna | Cambio |
|---|---|
| `respuesta_accion` | acepta además `DIRECCION_SI`, `DIRECCION_NO` |
| `respuesta_texto` | nueva, `text`, ≤ 300. Se borra con la fila: al confirmar el teléfono o a las 72 h |

## Contrato (`contrato-whatsapp.ts`)

- `PedidoEnvio` `{ tipo: "direccion", pedidoId, fecha, nombre, telefono, direccion }`.
- `RespuestaPendiente.texto: string | null`.

## Formulario (Meta)

`response_json` = `{ flow_token, confirma: "si" | "no", texto }`. El JSON del Flow está en
`docs/WHATSAPP.md`.
