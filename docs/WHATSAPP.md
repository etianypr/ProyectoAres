# WhatsApp: plantilla y despliegue

Lo que la app necesita de Meta y de Supabase para el aviso al receptor (specs 010 y 004). Código:
`src/lib/whatsapp/meta.ts` (envío), `src/app/api/whatsapp/*` (rutas), `local/replanificar.ts`
(qué hace cada respuesta con la ruta).

**Estado (2026-10-24): en pausa.** Falta el número propio (chip) y el token de Meta. Sin
`WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` la app funciona **sin WhatsApp** (spec 013): no
manda avisos ni consulta respuestas, y el conductor llama.

**Pausa (2026-10-28):** además, los avisos están pausados en el código mientras se prueba con
etiquetas reales: un pedido de prueba con teléfono no puede terminar en un WhatsApp a un cliente
de verdad. Con la pausa el servidor se comporta como sin WhatsApp. Para reactivar, cargar
`WHATSAPP_EN_PAUSA=no` en Vercel (además del token y el número) y volver a publicar.

## El aviso de hoy: confirmar la dirección (spec 004)

Mientras tanto (dueño, 2026-11-09) el teléfono manda **solo este aviso**, en cuanto el pedido
tiene teléfono y nombre (al leer la etiqueta). El de disponibilidad (abajo) queda en el código,
sin pedirse. Código: `lib/whatsapp/confirmar-direccion.ts` (envío), `leerFormularioDireccion` en
`lib/encomiendas/config.ts` (respuesta), `local/aplicar-respuestas.ts` (qué hace en el pedido).

**1. El formulario (Flow).** Meta > WhatsApp Manager > Flows > Crear: nombre `confirmar_direccion`,
categoría «Otro», sin endpoint. Se pega este JSON (si el editor pide otra `version`, se usa la que
proponga) y se publica. Los `name` (`confirma`, `texto`) y los `id` (`si`, `no`) los lee el webhook:
no se cambian.

```json
{
  "version": "6.0",
  "screens": [
    {
      "id": "DIRECCION",
      "title": "Tu dirección",
      "terminal": true,
      "success": true,
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "RadioButtonsGroup",
            "name": "confirma",
            "label": "¿Es correcta la dirección del mensaje?",
            "required": true,
            "data-source": [
              { "id": "si", "title": "Sí, es correcta" },
              { "id": "no", "title": "No, es otra" }
            ]
          },
          {
            "type": "TextArea",
            "name": "texto",
            "label": "Referencia o dirección correcta",
            "helper-text": "Si es correcta: cómo encontrar tu casa. Si es otra: escríbela.",
            "required": false,
            "max-length": 300
          },
          {
            "type": "Footer",
            "label": "Enviar",
            "on-click-action": {
              "name": "complete",
              "payload": { "confirma": "${form.confirma}", "texto": "${form.texto}" }
            }
          }
        ]
      }
    }
  ]
}
```

Un solo campo de texto para los dos casos, a propósito: es la forma que acepta cualquier versión
de Flows. Cambiar su nombre según el Sí o el No (`If`) se puede probar después en la vista previa
del editor de Meta.

**2. La plantilla.**

| Campo | Valor |
|---|---|
| Nombre | `confirmar_direccion` (= `WHATSAPP_PLANTILLA_DIRECCION`) |
| Categoría · idioma | Utilidad · Español (`es`) |
| Cuerpo | `Hola {{1}}, somos Dashund y hoy te llevamos tu pedido de Starken. ¿Tu dirección es {{2}}?` |
| Ejemplos para la revisión | `{{1}}` = Ana · `{{2}}` = Pasaje Los Aromos 1234, Arica |
| Botón | Uno, de tipo **Flow**: `Confirmar dirección` → el Flow `confirmar_direccion` |

**Qué hace cada respuesta** (en el teléfono; la disponibilidad no cambia):

| Respuesta | Pedido |
|---|---|
| Sí, es correcta | «Dirección confirmada por el receptor» y su referencia, en la parada |
| No, es otra | ⚠ «El receptor dice otra dirección»: el conductor elige «Usar la del receptor» o «Dejar la de la guía» |
| (no contesta) | nada cambia |

El código viaja como `flow_token` y vuelve en `nfm_reply.response_json`: la respuesta se resuelve
sin guardar el teléfono. Lo que escribe se guarda en `respuesta_texto` (migración 0008) hasta que
el teléfono lo baja (excepción del dueño: `docs/PRIVACIDAD.md` §2).

## Plantilla de disponibilidad (spec 010, apagada por ahora)

Meta > WhatsApp Manager > Plantillas de mensajes. Si `aviso_encomienda` ya existe, se edita;
si no, se crea con esto.

| Campo | Valor |
|---|---|
| Nombre | `aviso_encomienda` (= `WHATSAPP_PLANTILLA_AVISO`) |
| Categoría · idioma | Utilidad · Español (`es`, = `WHATSAPP_PLANTILLA_IDIOMA`) |
| Cuerpo | `Hola {{1}}, tu encomienda llega {{2}}. ¿Estarás en tu domicilio para recibirla?` |
| Ejemplos para la revisión | `{{1}}` = Ana · `{{2}}` = hoy |
| Botones (respuesta rápida), **en este orden** | 1. `Sí, estaré` · 2. `Mañana` · 3. `Otro horario` |

El orden de los botones no se puede comprobar desde el código: el payload se manda por
posición (`BOTONES_DISPONIBILIDAD` en `catalogos.ts`). Si se reordenan en Meta, las respuestas
llegan cambiadas.

"Otro horario" no necesita otra plantilla: tocarlo abre la ventana de 24 h y el servidor
manda la lista de bloques (08–10 … 16–18, los que el jefe dejó activos).

## Qué hace cada respuesta

| Botón | Pedido | Ruta en curso |
|---|---|---|
| Sí, estaré | `disponibilidad = confirmado` | no cambia |
| Mañana | `disponibilidad = manana`, `resultado = no_entregado` + evento de omisión | deja de ser parada; aviso al conductor |
| Otro horario → bloque | `disponibilidad = horario_indicado` | pasa al lugar con llegada estimada dentro del bloque; aviso |
| (no contesta) | sigue `pendiente_respuesta` | no cambia; al acercarse, "llámalo" |

El teléfono baja las respuestas cada 30 s con la app abierta.

## Diseño (por qué funciona así)

- **El teléfono busca las respuestas; el servidor no las empuja.** La respuesta llega al
  servidor (Meta solo hace webhooks a una URL pública) y el pedido vive en el teléfono. Al
  enviar el aviso, el servidor guarda una fila `Aviso` (`encomienda_whatsapp_correlaciones`)
  con un **código opaco** que viaja en el payload del botón; el webhook la resuelve sin ningún
  dato personal y guarda ahí la respuesta. El teléfono consulta `GET /api/whatsapp/status`,
  aplica en IndexedDB y **recién después** confirma con un `POST` (si se queda sin batería en
  medio, la respuesta vuelve a bajar). Push o Realtime se descartaron: en la periferia de Arica
  hay red que no llega a ningún lado, y una respuesta empujada sin nadie escuchando se pierde.
- **Por qué un código y no el teléfono del receptor:** guardar el número (aunque sea hasheado)
  convertiría la tabla en un registro de destinatarios. El código es aleatorio y no revela nada;
  tampoco se le manda a Meta el id interno del pedido.
- **Idempotencia:** el webhook descarta respuestas repetidas por el id del mensaje con un índice
  único (Meta reintenta); el teléfono lleva `aviso.respuestasAplicadas` por pedido.
- **Qué no se guarda:** nombre y teléfono viajan en el `POST /api/whatsapp/send`, se usan para
  llamar a Meta y no se persisten.
- **El horario es un segundo paso:** el primer mensaje tiene que ser una plantilla aprobada, que
  admite como máximo **3 botones**. Tocar "Otro horario" abre la ventana de 24 h y recién ahí se
  manda la lista de bloques (mensaje interactivo); la disponibilidad sigue en
  `pendiente_respuesta` hasta que elige uno.
- **Payload de los botones** (`payloadBoton` en `config.ts`): `CONFIRMAR:<código>`,
  `MANANA:<código>`, `HORARIO:<código>` y, en la lista, `HORARIO_<bloque>:<código>`. El
  `RECHAZAR` de antes de la spec 010 se lee como `MANANA`.

## Orden de despliegue

1. **Supabase**: `supabase/migrations/0004_aviso_manana.sql` (acepta `MANANA`; compatible
   con el código anterior). **Aplicada el 2026-10-21.**
2. **Desplegar** el código.
3. **Meta**: crear o editar la plantilla de arriba y esperar la aprobación. Editar una
   plantilla aprobada la devuelve a revisión, y Meta limita cuántas ediciones se pueden hacer.

El paso 3 puede ir antes o después del 2 sin romper nada: el botón "Mañana" ocupa la posición
del antiguo "No podré recibirlo". El código anterior lo lee como rechazo; el nuevo, como
"Mañana" (también las respuestas a avisos enviados antes del cambio).

**Spec 004 (confirmar la dirección):**
1. **Supabase**: `0008_confirmar_direccion.sql` (acepta `DIRECCION_SI`/`DIRECCION_NO` y agrega
   `respuesta_texto`), antes de desplegar: sin ella, el webhook no puede guardar la respuesta.
2. **Meta**: el Flow y la plantilla de arriba, y esperar la aprobación.
3. **Desplegar** el código y, para activarlo, `WHATSAPP_EN_PAUSA=no` con el token y el número.
   Para probar antes de tener el chip: el número de prueba de Meta escribe gratis hasta a 5
   teléfonos registrados en la app de Meta.

## Variables (Vercel y `.env.local`)

`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PLANTILLA_AVISO`,
`WHATSAPP_PLANTILLA_DIRECCION` (spec 004, `confirmar_direccion` si falta),
`WHATSAPP_PLANTILLA_IDIOMA`. Descripción de cada una en `.env.example`. Sin ellas la app
funciona igual: no sale ningún aviso y todos quedan "sin respuesta". `WHATSAPP_EN_PAUSA`: sin
ella (o con cualquier valor que no sea `no`), los avisos quedan en pausa.
