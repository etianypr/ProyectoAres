# Pruebas

```bash
npm test              # 664 pruebas, sin red ni base de datos (~40 s)
npm run test:base     # el esquema de encomiendas contra la base real (solo lectura)
npm run test:esquema  # el esquema completo contra los tipos de src/types/db.ts
```

Las pruebas importan los archivos **reales** de `src/` — no copias ni versiones
portadas. `resolver-ts.mjs` traduce lo que TypeScript resuelve y Node no (el
alias `@/…` y los imports sin extensión), y `loader.mjs` le suma lo único propio
de las pruebas: cambiar por un doble lo que no puede ser real acá adentro, el
cliente de Supabase y `next/headers`. El servidor MCP usa el mismo resolvedor
sin ningún doble (ver `mcp/loader.mjs`).

Los proveedores externos que se consultan con `fetch` (Google, OSM, OpenRouteService,
OpenFreeMap, la Cloud API de Meta) no se sustituyen a nivel de módulo sino **reemplazando el
`fetch` global**.
Es a propósito: así corre el código real que arma la URL, los headers y el cuerpo,
y que interpreta cada error. Un doble a nivel de módulo no probaría nada de eso —
y es justo eso lo que se rompe cuando el proveedor cambia algo.

No hay framework de pruebas: `node:test` viene con Node.

| Archivo | Qué cubre |
| --- | --- |
| `1-pago.test.mjs` | `lib/encomiendas/pago.ts` — la tarifa de cada día, cuánto se paga, cómo se agrupa la actividad. **Es la plata.** |
| `2-rutas.test.mjs` | `lib/rutas/orden-paradas/`, `lib/geo/trazado.ts`, `lib/geo/acceso.ts` y `lib/geo/teselas.ts` — orden de paradas, trazado por tramos, los tramos de la línea del día por parada (spec 020) y la calle por donde se llega a una parada leída de una tesela vectorial armada en la prueba (sin red). |
| `3-almacen.test.mjs` | `lib/encomiendas/local/` — el teléfono del conductor, sobre una IndexedDB real (`fake-indexeddb`). Día completo, regenerar la ruta, doble toque. |
| `4-envio.test.mjs` | La cola offline: nada se borra del teléfono sin confirmación del servidor. |
| `5-periodo.test.mjs` | El filtro de mes/año y las fechas: que ningún día de pago quede fuera de su periodo. |
| `burbuja.test.mjs` | Spec 020: los botones de la parada («Pedido entregado» · llamar · «No se entrega»; sin teléfono, escanear y «Teléfono a mano»), que son los mismos para la tarjeta de ARES y la burbuja sobre Google Maps; cada toque llama a la misma función de la tarjeta; lo que se le manda a la burbuja; cuándo Google Maps va a otra parada; y que fuera de la APK los km abran Google Maps con solo el punto. La ventana nativa se prueba en el teléfono (quickstart de la 020). |
| `hacia-parada.test.mjs` | Spec 020: los km a la parada activa sobre su tramo de la línea del día (sin consultar ORS), en línea recta fuera del tramo, y que el aviso de llamar a 300 m nunca llegue tarde. |
| `8-orden-paradas.test.mjs` | **Calidad** del orden de las paradas, no solo que sea una permutación válida: hasta 9 paradas se compara contra el óptimo real calculado por fuerza bruta (implementación independiente de la del código). Cubre también la matriz de calles asimétrica, que es la que rompe los algoritmos que suponen que ir y volver cuestan igual. |
| `9-deslizar.test.mjs` | `lib/comun/deslizar.ts` — el gesto de deslizar una fila hacia la izquierda para eliminarla. Fija las tres cosas que en el teléfono se sienten como "la lista está rara": que el eje se decida **una vez** y no en cada movimiento (o un dedo que sube en diagonal va abriendo filas por el camino), que el atajo de eliminar pida bastante más que abrir el panel, y que una fila angosta —o todavía sin medir— no se vuelva un gatillo fácil. |
| `11-form-helpers.test.mjs` | Cómo se leen los números que escribe la gente (formato chileno de miles). Fija la trampa del punto decimal. |
| `12-plus-code.test.mjs` | `lib/geo/plus-code.ts` — Plus Codes ⇄ coordenadas. Es la única pieza que ubica una casa **sin preguntarle a nadie**: sin red, sin API key, sin límite de consultas. En Arica eso importa porque las casas no tienen numeración —de 23 direcciones reales, Mapbox tiene la puerta exacta en 2—. Fija que un código dictado por teléfono ("GMCP+MX, Arica") caiga en Arica y no en otra ciudad, que marcar la casa y releerla no la mueva más de 3 m, y que un código mal escrito devuelva `null` en vez de tumbar la pantalla (la librería lanza un **string**, no un `Error`). Una prueba comprueba que no se consulte la red ni una vez. |
| `13-uuid.test.mjs` | Los ids que genera el teléfono: versión, variante, unicidad y orden temporal. De ahí depende que reenviar no duplique. |
| `14-periodos-facturacion.test.mjs` | Los cortes de facturación: a qué periodo cae cada día, y que ninguno quede en dos. |
| `15-ruteo-ch.test.mjs` | `lib/geo/openrouteservice.ts` — el trazado por calles abierto (grafo de OSM, Jerarquías de Contracción), que usa el servidor MCP y **no** el camino del conductor. Corre contra `fixtures/ruta-ors-arica.json`, capturado de la API real sobre el **mismo** tramo que `tramo-arica.json` usa para Mapbox. Fija el orden `[lng, lat]` del cuerpo que sale —invertirlo no da error, devuelve una ruta por el océano—, que la geometría entre **sin traducir** a `ajustarATrazado()` y `metrosRestantes()` de `lib/geo/trazado.ts`, que la falta de API key **lance** en vez de confundirse con "el servicio está caído", y el máximo de puntos **medido** (70 pasa, 71 devuelve 400). Fija además que ORS diga *"Camina hacia el noroeste"* en perfil `driving-car`: no es un bug nuestro, es su traducción al castellano. |
| `16-mcp.test.mjs` | El contrato del servidor MCP hablado **por el protocolo**: levanta `mcp/servidor.ts` como proceso y le habla con el cliente oficial del SDK. Lo que protege no son las funciones (esas ya están en las dos de arriba) sino el armado — un nombre de tool cambiado, un campo caído del esquema de salida, o un `console.log` suelto que ensucia stdout y tumba la sesión entera. Comprueba también que ninguna salida de ubicación prometa una dirección de texto, y el viaje de ida y vuelta entre `encode_plus_code` y `resolve_plus_code`: marcar la casa y releerla mañana no puede moverla. Mismo criterio que `whatsapp-contract`. |
| `asistencia-local.test.mjs` | Disponibilidad del receptor, resultado entregado o no e idempotencia de las respuestas de WhatsApp. Al final, siete comprobaciones que leen la migración `0003` como texto: son las que impiden que alguien le agregue una columna con datos del receptor sin que nada avise. |
| `asistencia-direcciones.test.mjs` | Normalización de teléfonos chilenos (a quién se le manda el aviso) y de direcciones. Dos casos reales la motivaron: "Los Aromos 120" existe en Arica **y** en Azapa, a nueve kilómetros, y quedarse con el primer resultado mandaba al conductor al lugar equivocado; y "Linderos 3536", donde la calle se llama "Avenida Linderos Poniente" y el número se perdía — ahora se busca en las calles cuyo nombre contiene, **entera**, cada palabra escrita, y si el número existe en dos de ellas elige el conductor. Fija además la **tabla completa de `location_type`** de Google (`ROOFTOP` → exacta, `RANGE_INTERPOLATED` → aproximada, el centro de la calle no entra; spec 019, antes Mapbox: ver abajo). Y el atajo de los **Plus Codes en el campo de dirección**: que un código escrito no consulte a ningún proveedor (cero peticiones, comprobado), que se guarde el código **completo** aunque se haya escrito el corto, y que un código impreciso entre igual pero diciendo cuántos metros cubre. |
| `estampilla-mapa.test.mjs` | La estampilla de mapa que muestra **dónde** quedó una dirección (`components/direccion/estampilla-mapa.ts`, spec 019): la misma esquina es la misma foto y no se vuelve a dibujar. |
| `whatsapp-contract.test.mjs` | El contrato con Meta en las dos direcciones: la plantilla que sale, los tres botones y su orden, los reintentos, y que **no se filtre ningún dato del receptor** al cuerpo que sale ni a los mensajes de error. |
| `rutas-024-pesos.test.mjs` | Spec 024: el orden cobra km y tiempo en plata. Sin tiempos, la matriz de siempre; con la matriz real de un día simulado (`fixtures/matriz-tiempo-arica.json`, puntos al azar pegados a la calle, no direcciones de nadie), menos tiempo y plata sin más de 1 % de km; los bultos miden la tolerancia en km y en costo y siguen viendo los barrios; la recomendada es la más barata; y de punta a punta, que se pide `duration` a ORS y se evita el tramo lento. |
| `ors-cupo.test.mjs` | Spec 024: un 429/403, o un corte con ARES contestando, es cupo de ORS y no «Sin señal»; el HEAD a ARES va sin datos; el contador de consultas del día; y la propuesta lo dice. |
| `asistencia-rutas.test.mjs` | Que los bloques horarios pesen en el orden, que un pedido cerrado no vuelva a proponerse, que se muestre **una** ruta cuando comparar no aporta, y que ofrecer tres no cueste tres veces más en consultas. |
| `asistencia-entrega.test.mjs` | El reparto: entregado o no, el doble toque, la ventana para deshacer y el día sin señal. Usa el reloj controlado (`dobles/reloj.mjs`) para probar plazos sin esperarlos. **Es la que más plata protege.** |
| `asistencia-resumen.test.mjs` | Que el resumen del jefe coincida con el detalle individual (SC-006) y que las no entregas **no muevan ni un peso** del pago. |
| `migracion-v3.test.mjs` | La migración de la base del teléfono a v3 (specs 009 y 011): nada se pierde al abrir con la app nueva. |
| `planificar.test.mjs` · `replanificar.test.mjs` | Llegada estimada y lugar de un pedido con horario; la ruta en curso se reordena con las respuestas. |
| `sw.test.mjs` | `public/sw.js` (spec 015): qué se guarda para abrir sin señal y qué pasa siempre por la red (`/api`, Supabase, los proveedores, POST). |
| `nativo-version.test.mjs` | La APK (spec 015): cuándo avisar que hay una APK nueva. |
| `arquitectura.test.mjs` | Las reglas A1–A10 de `specs/002-reestructuracion-codigo/contracts/estructura-modulos.md`: capas, `server-only`, tamaño, vocabulario y proveedores en `docs/PRIVACIDAD.md`. Una excepción que sobra también falla. |
| `privacidad.test.mjs` | Spec 007: al cerrar el día o la sesión no queda ningún dato de destinatarios en el teléfono (solo el resumen y la cola); ninguna tabla `encomienda_*` tiene columnas de personas; las rutas de API no escriben en el log. Spec 021: `/api/lectura` rechaza la etiqueta antes de mirar la clave. |
| `etiqueta-en-el-telefono.test.mjs` | Spec 021: el `leerFotoEtiqueta` real en una APK simulada (puente de Capacitor que contesta como ML Kit): lee nombre, teléfono y pago con dos lecturas de ML Kit y ninguna consulta de red; si no coinciden, queda por revisar; sin ML Kit no cae a la nube. |
| `idb-version.test.mjs` | La base del teléfono sube de v3 a v6 (stores `dias`, `fotos` y `propuestas`) sin perder pedidos, ruta ni cola. |
| `idb-v6.test.mjs` | La base sube de v5 —la de los teléfonos— a v6 con un día a medias: aparece `propuestas` y no se pierde nada. |
| `propuesta-guardada.test.mjs` | La ruta propuesta sobrevive a cerrar la app: se guarda sin copiar los pedidos, vuelve como estaba (invertida, con el punto corrido a su acceso), deja de valer si un pendiente cambió y se borra al usarla y con el día. |
| `cola-al-abrir.test.mjs` | Al abrir la app sale la entrega que quedó retenida sin plazo (la app se cerró con el «Deshacer» a la vista). |
| `paquete.test.mjs` | Spec 003: la OF (9 dígitos, en grupos de tres), la referencia que se lee como se habla ("Bolsa gris grande · cinta roja", con género), la búsqueda por los últimos dígitos, y que la foto se borra al cerrarse el pedido y con el día. |
| `lectura.test.mjs` | Spec 005: el código de barras de la etiqueta (26 dígitos → OF y bulto) y el texto de la guía (líneas OF + destino limpias, repetidas, faltantes). Textos inventados en `fixtures/lectura/`. |
| `lectura-etiqueta.test.mjs` | Spec 021: el lector de etiquetas, un caso por formato (`fixtures/lectura/etiqueta-*.txt`): zonas (nunca el teléfono del remitente), valores en varios renglones, sin cruzar renglones (el 0 de más), OF impresa que no sale del código, errores de ML Kit en las claves, POR PAGAR nunca $0, sin RUT, remitente ni correo. |
| `anonimizar-etiqueta.test.mjs` | Spec 021: «Copiar anonimizado» no deja palabras ni números de los valores, mantiene la forma y las claves (con sus errores), y el lector le saca lo mismo que al original. |
| `carga.test.mjs` | Spec 005: pedidos desde la guía (sin duplicar), y el escaneo que dice "PARADA n de N", completa el pedido, cuenta bultos y avisa una dirección distinta. |
| `lectura-servidor.test.mjs` | Spec 005: la lectura con IA de la guía contra un doble del `fetch` (no gasta): lo que sale a Claude (modelo, foto, salida estructurada, sin pensamiento, workspace), que no se le piden nombre ni teléfono, y rechazo → foto ilegible. |
| `base.mjs` | El esquema de encomiendas contra lo que el código da por hecho, y la cuenta del pago cruzada contra las cifras guardadas. |
| `esquema.mjs` | Cada campo de cada `interface` de `src/types/db.ts` existe como columna. |
| `ubicar-direcciones.test.mjs` | Spec 016: limpiar la consulta, el catálogo de calles de Arica con tipeo acotado, completar el número en la calle y Google como último recurso. |
| `vision.test.mjs` | Spec 005: Google Cloud Vision lee el texto de la foto en el servidor; sin clave o sin respuesta, el teléfono sigue con lo suyo. |
| `indicadores.test.mjs` | Spec 006: entregas sobre asignado, contactados, rendimiento y margen, y la comparación con el período anterior. |
| `renombrado-conductor.test.mjs` | Spec 002: la migración 0006 renombra todo a "conductor" y lo verifica; la cola vieja del teléfono se sigue leyendo. |
| `listo-para-terreno.test.mjs` | Spec 017, errores del flujo: fecha del día en el teléfono, deshacer solo lo retenido, OF distinta, día que se cierra, envío con un evento rechazado. |
| `rutas-017.test.mjs` | Spec 017, rutas: la matriz de calles por bloques (caché, cupo mensual, par sin camino) y el optimizador con horarios (cumple los bloques, determinista, por partes). |
| `paradas-cercanas.test.mjs` | Spec 023: cuáles salen como cercanas (≤ 300 m, sin las 2 que siguen, hasta 3, las de fuera de la ruta con punto, nunca las cerradas) y que «Hacer ahora» deja una como la próxima sin mover lo cerrado ni la activa, y sin consultar nada. |
| `sumar-a-ruta.test.mjs` | Spec 017, R4: "Dejar como pendiente" donde menos alarga a partir de 30 min, y sumar pedidos tardíos sin mover la parada activa. |
| `direccion-ia.test.mjs` | Spec 018: la conversación con la IA, que las coordenadas salgan de un buscador y nunca de la IA, y que nada se aplique sin que el conductor confirme. |
| `pantalla-conductor.test.mjs` | Spec 002: lo puro de la pantalla del conductor (en qué paso está la parada, las cifras de la lista). Spec 027: el paso del día que decide la cabecera de la hoja (guía, ⚠, ruta, cargar el auto, recorrer, cerrar) y cuándo terminó la carga del auto. |
| `problemas.test.mjs` | Specs 027 y 022: los ⚠ de un pedido (sin ubicar, sin OF solo si vino de la guía, y los guardados con su texto); la OF de otro largo no es ⚠; la dirección en duda entra con su primera opción. |
| `pedidos-con-problemas.test.mjs` | Spec 022: los ⚠ guardados en el pedido sobre el almacén real (entrar con la primera opción, elegir otra sin red, editar sin perderlos, «Va igual» que se conserva al rehacer la ruta, la etiqueta con otra dirección, bultos incompletos) y el aviso dos paradas antes. |
| `panel-resumen.test.mjs` | Spec 002: las cifras del panel de encomiendas (días con sus cifras congeladas, cortes, por conductor, serie del gráfico). |

Los dobles de `dobles/`:

| Doble | Para qué |
| --- | --- |
| `supabase-client.mjs` | El cliente de Supabase: registra los upserts y decide qué contesta el servidor. |
| `next-headers.mjs` | `next/headers`, que solo existe dentro del servidor de Next. |
| `meta-whatsapp.mjs` | La Cloud API de Meta, enganchada en el `fetch` global. Si el adaptador pidiera otro host, lanza en vez de dejar salir la consulta. |
| `reloj.mjs` | Congela `Date.now()` y `new Date()` sin argumentos. Sin él, tres reglas de esta app —la ventana de deshacer, la retención de la cola y los bloques horarios— solo se podían probar esperando de verdad, o no probar. |

El fixture de navegación se capturó una vez de la API real. Para renovarlo hace
falta el token de Mapbox en `.env.local` y volver a pedir el mismo tramo. Los de
`fixtures/geocoding-osm.json`, `fixtures/ruta-ors-arica.json` y
`fixtures/whatsapp.json` también son respuestas reales, recortadas a los campos
que el código lee (y `fixtures/matriz-tiempo-arica.json`, una matriz real de ORS con metros y
segundos, spec 024); `fixtures/geocoding-google.json` sigue el formato de la API
con calles reales y números de prueba (spec 019). Cada uno lleva en su cabecera cuándo se capturó y contra qué.

## Un fixture viejo miente y nada falla

Pasó con Mapbox (antes de la spec 019), y costó la app entera. Mapbox recalibró su `match_code`: dejó de contestar
`confidence: "exact"` para las direcciones de Arica y pasó a contestar `"low"`
en **23 de 23** —incluso con la puerta real encontrada—, porque la consulta no
trae código postal, comuna ni región y esos componentes pesan igual. Además
apareció un valor nuevo, `address_number: "plausible"`, que el código no
contemplaba.

`lib/geo/geocoding` decidía la confianza con `confidence`, así que empezó a
devolver `"baja"` para **todo**: `ubicarDireccion()` dejaba `elegida` en `null`
siempre y **ningún pedido entraba a la ruta**. El conductor veía "confírmala
antes de salir" en cada dirección.

`npm test` estuvo **422/422 en verde** todo ese tiempo. No podía verlo: los
fixtures se habían capturado antes del cambio, así que las pruebas comprobaban
—correctamente— el comportamiento frente a una respuesta que Mapbox ya no
manda.

Lo que quedó de eso:

- `scripts/sondear-proveedores.mjs` (`npm run sondear`) — corre direcciones de
  Arica contra Google, el buscador de ORS y Nominatim y saca una tabla de
  aciertos, latencias y qué contesta cada uno ante una dirección inexistente.
  Gasta 27 consultas de Google: avisar antes. **Corrélo cuando algo del
  geocodificador se sienta raro**; es lo que destapó esto.
- `asistencia-direcciones.test.mjs` fija la tabla de `location_type` de Google:
  si Google agrega o renombra un valor, hay que volver a medir.

La moraleja no es "no uses fixtures": es que un fixture es una foto con fecha, y
lo único que comprueba que la foto sigue siendo la realidad es volver a mirar.

## Por qué `base.mjs` y `esquema.mjs` existen

`tsc`, `eslint` y `next build` pueden estar los tres en verde con el panel entero
roto: ninguno sabe qué columnas tiene la base. Ya pasó — una migración que
agregaba `encomienda_actividad.origen` no se había corrido, todas las consultas
del panel fallaban, y la pantalla mostraba "sin actividad" con los KPI en $0.
**Corré estas dos después de cada migración**, y sobre todo después de importar
los datos del sistema anterior.

`base.mjs` además comprueba dos cosas que solo se pueden ver contra la base viva:

- que la cuenta del pago en SQL y la de `lib/encomiendas/pago.ts` den lo mismo
  sobre los días ya guardados (son dos copias de la misma aritmética);
- que no haya días de trabajo pasados sin cerrar ni días con actividad y sin
  día de trabajo — los dos casos en que un día trabajado **no se paga** y nada avisa.

## Lo que estas pruebas NO cubren

La cuenta del pago que corre de verdad está en Postgres
(`private.encomienda_congelar_dia`), y `npm test` no levanta una base. Lo que se
prueba acá es la copia en TypeScript; que las dos coincidan lo comprueba
`base.mjs` contra los días reales. Si se toca una de las dos, hay que tocar la
otra y correr `test:base`.

Tampoco cubren **nada contra Meta real**: la plantilla aprobada, la firma del
webhook con el secreto de la app y el número de prueba habilitado necesitan
credenciales. Lo que sí se prueba es el adaptador entero contra un doble, con los
cuerpos reales que Meta manda. Lo demás se valida con el número real, en la fase de
WhatsApp (`docs/WHATSAPP.md`).

Y no cubren la pantalla: no hay pruebas de componentes de React en este proyecto (lo puro que salió de la pantalla sí: `pantalla-conductor`, `panel-resumen`).
Lo que se protege es el dominio —el almacén local, la ruta, la cola, los
contratos—, que es donde un error cuesta plata o pierde el trabajo del conductor.
La pantalla se valida a mano con los escenarios del quickstart.
