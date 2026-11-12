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
| Ruta propuesta sin aceptar (paradas como id y punto, trazado y avisos; store `propuestas`) | teléfono | al usarla o descartarla, y al cierre del día |
| Cuadros del escáner en vivo (spec 028, APK 1.6.0): la etiqueta en cámara y su texto | memoria del teléfono, mientras está abierto; la captura en alta queda como foto del paquete | se olvidan al pasar a la siguiente; la foto, con el día |
| Cuadros al barrer la nómina («Cargar la guía» → «Barrer la nómina», 2026-11-11): la nómina en cámara, con el nombre del destinatario | memoria del teléfono, mientras está abierto; solo la OF y la dirección pasan a las líneas de la guía (el nombre no se lee) | se olvidan al terminar; las líneas, como las de la guía |
| Coordinación WhatsApp | teléfono · servidor (correlación sin datos personales) | cierre del día (servidor: máx. 72 h) |
| Burbuja sobre Google Maps (OF, nombre, dirección de la parada activa), APK | memoria del teléfono; su aviso fijo dice solo «ARES · Parada N», porque se ve con el teléfono bloqueado. Para abrirse al llegar compara en el teléfono la ubicación del auto (la que ya pide Google Maps) con el punto de la parada; no la guarda ni la envía | mientras haya una parada activa (spec 020) |
| Actividad (entrega/no entrega, hora) | servidor | sin datos del destinatario |

Solo sobreviven conteos (asignados, entregados, no entregados).

**Qué sale del teléfono** (dueño, 2026-11-07):
- La etiqueta, nunca: el nombre, el teléfono y su foto se leen con ML Kit dentro de la APK, sin red
  (spec 021). `/api/lectura` rechaza la etiqueta antes de mirar la clave (prueba en
  `privacidad.test.mjs` y `etiqueta-en-el-telefono.test.mjs`).
- La guía sí va a la IA y a Cloud Vision para leerla: el dueño la considera sin datos personales,
  porque trae solo la OF y el destino, sin nombre ni teléfono. Igual figura en §3, para que Starken
  la autorice junto con los demás proveedores (§6.2).

## 3. Subencargados

| Proveedor | Recibe | Desde | País | Retención | Autorización Starken |
|---|---|---|---|---|---|
| OpenRouteService (HeiGIT, en uso desde 2026-10-30; desde la spec 031 es solo el respaldo: la ruta se arma con la red de calles que la app lleva adentro, en el teléfono, y ORS recibe coordenadas solo si esa red no bajó, si un punto queda fuera de ella o si el conductor lo elige en Diagnóstico; la matriz de distancias por calle con que se ordena la ruta, y el trazado del día (spec 019). Desde la spec 020 ya no recibe la posición del auto tramo a tramo: los km a la parada se miden en el teléfono sobre la línea del día; lo que contesta queda en memoria del teléfono y se olvida al cerrar el día, spec 017) | coordenadas de las paradas y de la partida (sin nombre, teléfono ni dirección) | teléfono | Alemania (UE) | a verificar | pendiente |
| OpenStreetMap/Nominatim (en uso) | dirección | teléfono | UK/UE | a verificar | pendiente |
| Google Cloud Vision (en uso; spec 005; lee el texto de la foto de la guía. Desde la spec 021 ya no recibe etiquetas) | fotos de la guía (OF y destino, sin nombre ni teléfono) | servidor (tránsito, `/api/texto`) | EE.UU. | según términos de Google Cloud | pendiente |
| Google Maps (app) (en uso desde 2026-10-29; desde la spec 020 es la navegación: los km de la parada, «Navegar» en la burbuja de ARES y, con la burbuja en curso, cada parada nueva abren Google Maps navegando. La burbuja, con la OF y a quién, es una ventana de ARES en el teléfono: Google no la ve) | coordenadas de ESA parada (sin nombre, teléfono ni dirección) | teléfono (abre la app de Google Maps o su enlace en el navegador) | EE.UU. | según términos de Google Maps | pendiente |
| Google Geocoding (en uso; spec 016; desde la spec 019, toda dirección con número: es el que da el número de casa) | dirección (sin nombre ni teléfono) | servidor (tránsito, `/api/geocodificar`) | EE.UU. | según términos de Google Maps Platform | pendiente |
| Meta WhatsApp Cloud API (inactivo) | teléfono, nombre, id correlación | servidor | EE.UU. | según Meta | pendiente |
| Anthropic (en uso, piloto; spec 005: las fotos de la guía; spec 018: las direcciones que no se ubicaron. Desde la spec 021 ya no recibe etiquetas; antes, desde 2026-10-28, recibía todas para describir el paquete) | fotos de la guía (OF y destino, sin nombre ni teléfono); direcciones y lo que devolvieron los buscadores (sin nombre ni teléfono) | servidor (tránsito, `/api/lectura`, `/api/direccion-ia`) | EE.UU. | ≤30 días API; cero retención a solicitar | pendiente |

No reciben datos de destinatarios: Supabase (solo actividad y fichas de conductores),
OpenFreeMap (el mapa del conductor desde la spec 019: recibe solo los pedidos de los trozos de
mapa de la zona que se mira y, al armar la ruta, de la zona de cada parada —unos 2 km, para ver
qué calles tiene alrededor—, sin puntos, nombres ni direcciones). Mapbox ya no recibe nada: salió
en la spec 019 (2026-11-06), el escáner de Google de la APK (ML Kit: lee la
etiqueta en el teléfono; según Google, la imagen no sale de ahí) y el lector de texto de la APK
(ML Kit con el modelo dentro de la APK: la foto de la guía y de la etiqueta se lee sin red). El WhatsApp propio del conductor se incluye en
la autorización para dejarlo explícito.

## 4. Seguridad

- Destinatarios solo en el teléfono, borrados cada día · RLS por rol · secretos solo en
  servidor (`server-only`) · servidor sin fotos ni cuerpos en logs.
- Día cerrado → la app muestra "No entregados" y borra pedidos y ruta; un día anterior con datos
  se borra al abrir · cerrar sesión borra todo (con aviso) · cuenta sin ficha o desactivada → la
  app borra al abrir con señal (spec 007) · teléfono con bloqueo.
- La APK de **depuración** (solo para probar contra el PC) registra en el log de Android lo que pasa
  por el puente de Capacitor, incluido el texto de una etiqueta; la firmada no. Se usa solo en el
  teléfono del dueño (spec 028).
- APK firmada con una clave que no entra al repositorio · permisos: cámara para el escáner en vivo
  (desde la 1.6.0, spec 028; se pide al abrirlo) · llamar y ubicación con la app
  abierta; sin registro de llamadas desde el 2026-11-06 (spec 020). La burbuja escucha la ubicación
  pasiva solo mientras navega, para abrirse al llegar.

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
