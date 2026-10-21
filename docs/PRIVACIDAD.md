# Privacidad y cumplimiento (Ley 21.719)

Registro de tratamiento. No reemplaza revisión legal. Regla: constitución, principio V.

**Fase actual: desarrollo y piloto.** Lo pendiente de §6 no frena el desarrollo; se cierra
antes del lanzamiento oficial. Desde ya rigen: borrado diario, mínimos campos, nada de
destinatarios en el servidor. *Riesgo aceptado por el negocio*: piloto con datos reales
antes de las autorizaciones (el contrato con Starken aplica desde ya; la ley desde el
1-dic-2026).

## 1. Roles

| Datos de | Responsable | El negocio es |
|---|---|---|
| Destinatarios (nombre, teléfono, dirección, OF) | Starken | **Encargado** (art. 15 bis): solo por cuenta de Starken y para repartir |
| Conductores y usuarios del panel | El negocio | Responsable |

## 2. Datos de destinatarios

| Dato | Dónde | Hasta |
|---|---|---|
| OF, destino, nombre, teléfono, por pagar, monto | teléfono | cierre del día |
| Descripción y foto del paquete, ruta | teléfono | cierre del día |
| Coordinación WhatsApp | teléfono · servidor (correlación sin datos personales) | cierre del día (servidor: máx. 72 h) |
| Actividad (entrega/no entrega, hora) | servidor | sin datos del destinatario |

Solo sobreviven conteos (asignados, entregados, no entregados).

## 3. Subencargados

| Proveedor | Recibe | Desde | País | Retención | Autorización Starken |
|---|---|---|---|---|---|
| Mapbox (en uso) | dirección, coordenadas | teléfono | EE.UU. | a verificar | pendiente |
| OpenStreetMap/Nominatim (en uso) | dirección | teléfono | UK/UE | a verificar | pendiente |
| Meta WhatsApp Cloud API (inactivo) | teléfono, nombre, id correlación | servidor | EE.UU. | según Meta | pendiente |
| Anthropic (spec 005) | fotos de guía y etiquetas | servidor (tránsito) | EE.UU. | ≤30 días API; cero retención a solicitar | pendiente |

No reciben datos de destinatarios: Supabase (solo actividad y fichas de conductores),
OpenRouteService (solo MCP de desarrollo). El WhatsApp propio del conductor se incluye en
la autorización para dejarlo explícito.

## 4. Seguridad

- Destinatarios solo en el teléfono, borrados cada día · RLS por rol · secretos solo en
  servidor (`server-only`) · servidor sin fotos ni cuerpos en logs.
- Cuenta desactivada → la app borra lo local al abrirse (spec 007) · teléfono con bloqueo.

## 5. Incidentes y titulares

- Pérdida del teléfono: desactivar la cuenta → exposición máxima: el día en curso → avisar
  a Starken sin demora (decide notificar a la Agencia) → registrar aquí.
- Solicitudes de titulares: derivar a Starken (ARES no guarda días anteriores).

## 6. Lista para el lanzamiento oficial

1. Contrato con Starken con lo del art. 15 bis (objeto, duración, finalidad, datos,
   titulares, obligaciones); si falta, anexo. *(dueño + abogado)*
2. Autorización escrita de Starken para cada subencargado en uso de §3. *(dueño)*
3. Mecanismo de transferencia internacional por proveedor (cláusulas tipo, DO 19-12-2025, u
   otro del art. 28). *(abogado)*
4. Anthropic: aceptar Términos Comerciales (incluyen DPA) y pedir cero retención. *(dueño)*
5. Hosting: confirmar que los logs no guardan cuerpos de solicitudes. *(desarrollo)*
6. Informar a los conductores qué datos suyos se tratan. *(dueño)*
7. Registrar las autorizaciones en el panel y activar modo "oficial" (spec 007). *(dueño)*

## Fuentes

Ley 21.719 (BCN): https://www.bcn.cl/leychile/navegar?idNorma=1209272 ·
Cláusulas tipo (DO): https://www.diariooficial.interior.gob.cl/publicaciones/2025/12/19/44328/01/2742586.pdf ·
Encargados: https://blog.hackmetrix.com/proveedores-y-transferencia-internacional-en-la-ley-21-719/ ·
DPA Anthropic: https://www.anthropic.com/legal/data-processing-addendum ·
Retención API: https://platform.claude.com/docs/en/manage-claude/api-and-data-retention
