# Fallas de la base del teléfono: qué mirar

Primero se mira, después se toca código (skill `systematic-debugging`). En la APK la base se ve en
`chrome://inspect` → Application → IndexedDB → `dashund-encomiendas` (skill `apk-local`). Fuera de
la APK, las DevTools del navegador. Lo que se vea ahí son datos de destinatarios: no se copian al
chat, a un log ni al repo.

## «No abre el día» (la pantalla muestra un error en vez de la ruta)
| Mensaje | Causa | Qué hacer |
|---|---|---|
| «Este navegador no puede guardar la ruta en el teléfono. Abre la app instalada…» | No hay `indexedDB` o `open()` lanzó: ventana privada, WebView sin almacenamiento | Abrir la app instalada (APK o PWA) fuera del modo privado |
| «La app quedó abierta en otra pestaña con una versión anterior…» | `onblocked`: otra pestaña con una conexión vieja que no se cierra | Cerrar las otras pestañas. El código actual cierra solo su conexión (`onversionchange`) |
| `VersionError` (el texto cambia según el navegador) | El código pide una versión menor que la del teléfono: se revirtió un deploy después de subir `VERSION` | Publicar hacia adelante con la misma versión. No se baja nunca |
| Error de `AbortError` al abrir, justo después de un deploy | La subida de versión lanzó (`onupgradeneeded` o la migración) y se canceló | La base sigue entera en la versión anterior. Arreglar la migración y publicar; probarla antes con una base armada a mano (`references/agregar-store.md` §5) |

La pantalla muestra el `message` tal cual (`_hooks/use-dia-trabajo.ts`).

## «No se guardó» o «no se marcó»
| Mensaje o síntoma | Causa |
|---|---|
| «Falló el guardado local.» / «El guardado local se canceló.» u otro texto de `tx.error` | La transacción de `escribir()` falló o se abortó. Si el teléfono está sin espacio, el error es de cuota (spec 026) |
| `TransactionInactiveError` intermitente | Un `await` dentro de una transacción. El callback sincrónico de `escribir()` lo impide: si aparece, alguien abrió una transacción por fuera de `escribir()` |
| «Ese pedido ya no existe en este teléfono.» · «No hay una ruta para ese día.» · «Ese pedido no está en la ruta del día.» | Mensajes de `almacen/` cuando lo leído ya no está: se borró, se cerró el día o la ruta no lo incluye |
| Un «entregado» que se pierde o una entrega contada dos veces | Una operación que lee, decide y escribe sin `enFila()` |
| Marcar no hace nada | `marcarResultado` devuelve `null` si el pedido ya no estaba pendiente: es el guardia del doble toque |

## «Quedaron registros sin enviar»
- «Tu día» muestra «N registros sin enviar» y el botón «Reintentar». El contador sale de
  `leerCola()`, que no cuenta lo retenido (la ventana para deshacer) ni lo rechazado.
- «Se envía solo con señal.»: error de red. La cola reintenta sola (al abrir, al volver la señal o
  la app, y cada 60 s). No se borra nada.
- «El servidor no lo aceptó: … Avisa a la oficina.» y «registros rechazados por el servidor»: un
  evento con error del servidor se apartó (`rechazado`) para no trabar a los demás (spec 017,
  E8). Queda en la cola; se revisa del lado del servidor (RLS, sesión, la fila), sin borrarlo
  del teléfono.
- Si el servidor rechaza **todos** los eventos (sesión vencida, permisos), no se aparta ninguno:
  se informa y se reintenta.
- Mientras quede algo en la cola, el día no se manda a `encomienda_jornadas`.
- Con algo en la cola (aunque sea retenido o rechazado) no se entra al modo prueba: «Hay
  actividad sin enviar a la oficina…».

## «Se perdió lo guardado»
Antes de suponer un bug, descarta lo que borra a propósito:
| Qué borró | Dónde |
|---|---|
| «Listo, borrar del teléfono» al cerrar el día | `cerrarYBorrarDia` (queda el resumen en `dias`) |
| Abrir la app otro día con un día anterior sin cerrar: se muestra y no se puede saltar | `use-cierre-dia.ts` + `diasPorBorrar` (spec 007, FR-003) |
| Cerrar sesión | `borrarDatosDestinatarios` (quedan `cola` y `dias`) |
| Cuenta sin ficha o desactivada, con respuesta del servidor | `borrado-local.tsx` |
| «Salir y borrar» del modo prueba | `salirDelModoPrueba` (vacía también la `cola`) |
| La foto de un pedido cerrado, al vencer el deshacer | `purgarFotosCerradas` |
| Un pedido de ayer que no aparece hoy | Así es: un pedido es de un día, sin arrastre (specs 009 y 012) |

Si no es nada de eso:
- **Otro origen, otra base.** Producción, un preview de Vercel y `localhost` tienen bases
  distintas. La APK `cl.dashund.ares` es otra app que la anterior: no ve lo que guardó aquella.
- **El renombrado del 2026-10-30.** Al crear `dashund-encomiendas` se borró `pucarani-encomiendas`
  sin copiarla, con su `cola`.
- **El navegador desalojó la base** por falta de espacio: hoy no se pide almacenamiento
  persistente (spec 026). En iOS, un sitio no instalado pierde lo guardado tras 7 días sin uso
  (comentario de `idb.ts`).
- **Datos borrados por el usuario** (Ajustes → Apps → Almacenamiento, o borrar datos del sitio).
