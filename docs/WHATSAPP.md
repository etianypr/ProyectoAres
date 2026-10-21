# WhatsApp: plantilla y despliegue

Lo que la app necesita de Meta y de Supabase para el aviso al receptor (spec 010). Código:
`src/lib/whatsapp.ts` (envío), `src/app/api/whatsapp/*` (rutas), `local/replanificar.ts`
(qué hace cada respuesta con la ruta).

## Plantilla del aviso

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
posición (`ACCIONES_WHATSAPP` en `catalogos.ts`). Si se reordenan en Meta, las respuestas
llegan cambiadas.

"Otro horario" no necesita otra plantilla: tocarlo abre la ventana de 24 h y el servidor
manda la lista de bloques (08–10 … 18–20, los que el jefe dejó activos).

## Qué hace cada respuesta

| Botón | Pedido | Ruta en curso |
|---|---|---|
| Sí, estaré | `disponibilidad = confirmado` | no cambia |
| Mañana | `disponibilidad = manana`, `resultado = no_entregado` + evento de omisión | deja de ser parada; aviso al conductor |
| Otro horario → bloque | `disponibilidad = horario_indicado` | pasa al lugar con llegada estimada dentro del bloque; aviso |
| (no contesta) | sigue `pendiente_respuesta` | no cambia; al acercarse, "llámalo" |

El teléfono baja las respuestas cada 30 s con la app abierta.

## Orden de despliegue

1. **Supabase**: `supabase/migrations/0004_aviso_manana.sql` (acepta `MANANA`; compatible
   con el código anterior). **Aplicada el 2026-10-21.**
2. **Desplegar** el código.
3. **Meta**: crear o editar la plantilla de arriba y esperar la aprobación. Editar una
   plantilla aprobada la devuelve a revisión, y Meta limita cuántas ediciones se pueden hacer.

El paso 3 puede ir antes o después del 2 sin romper nada: el botón "Mañana" ocupa la posición
del antiguo "No podré recibirlo". El código anterior lo lee como rechazo; el nuevo, como
"Mañana" (también las respuestas a avisos enviados antes del cambio).

## Variables (Vercel y `.env.local`)

`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PLANTILLA_AVISO`,
`WHATSAPP_PLANTILLA_IDIOMA`. Descripción de cada una en `.env.example`. Sin ellas la app
funciona igual: no sale ningún aviso y todos quedan "sin respuesta".
