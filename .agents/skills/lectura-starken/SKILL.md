---
name: lectura-starken
description: Úsala cuando vayas a tocar, revisar o proponer algo sobre lo que la app del conductor lee de Starken. Cubre la guía de despacho (fotos de a una, «Leer las fotos juntas», «Pegar el texto de Google Lens», revisar líneas OF + destino, «Crear pedidos») y la etiqueta (escanear, código de barras, OF, bulto, «PARADA n de N», foto de la etiqueta, POR PAGAR, teléfono, tres toques). Archivos: src/lib/encomiendas/lectura/, paquete.ts, local/lectura-cliente.ts, almacen/carga.ts, api/lectura, api/texto, cargar-guia.tsx, escanear-etiqueta.tsx, resultado-escaneo.tsx y lib/nativo (escáner, ML Kit). También para las specs 005 y 021, y antes de sumar IA, Cloud Vision u OCR.
---

# Lectura de la guía y la etiqueta de Starken

Sirve para tocar la carga del día (paso 1 del flujo) y el escaneo al cargar el auto (paso 4) sin
romper lo que ya se aprendió en terreno. Las reglas vienen de `AGENTS.md` y de las specs 005 y
021. Si esta skill no coincide con ellos, valen `AGENTS.md` y la spec, y hay que avisar la diferencia.

## Antes de tocar nada
1. `AGENTS.md`: «El flujo del conductor» (pasos 1 y 4), «OF», «Pedidos con problemas (⚠)» y
   «Escaneo de la etiqueta de Starken».
2. ¿Toca la foto o el texto de la etiqueta? La spec 021 está **definida** (`specs/021-lector-etiquetas/`):
   la etiqueta se va a leer solo en el teléfono, sin IA ni Cloud Vision. Se trabaja en la rama
   `021-lector-etiquetas`. No sumes IA ni proveedores a la etiqueta. Guía: `references/spec-021.md`.
3. Por qué la lectura es como es: `specs/005-carga-rapida-pedidos/tasks.md` (T032–T034) y
   `research.md` (formato del código y de la guía). Para el ⚠ en el pedido: `specs/022-pedidos-con-problemas/spec.md`.
4. El recorrido función por función y botón por botón está en `references/flujo-y-codigo.md`.

## Lo que ya está decidido (no se «corrige»)
- **La OF de la etiqueta sale solo del código de barras o de lo que escribe el conductor**, nunca del
  texto impreso ni de la IA. Es la llave entre la etiqueta, el pedido y la parada, y un dígito mal
  leído le pone a este paquete el nombre y el teléfono de otra persona. La OF impresa (`ofImpresa`)
  solo sirve para **rechazar** una foto o un texto de otra etiqueta y para confirmar la lectura
  (`ofConfirmada`; spec 017, E4). La OF de la *guía* sí sale del texto o de la IA, y por eso el
  conductor revisa cada línea antes de crear los pedidos.
- **Código** (`leerCodigoEtiqueta`): un Code 128 de 26 dígitos que empieza con `92`. La OF va en los
  dígitos 15–23 (`slice(14, 23)`) y el bulto en los 24–26. Prefijos vistos: `9200002256` (normal) y
  `9210002256` (EXPRES). Cualquier otro número es una OF escrita a mano, sin bulto.
- **OF sin regla de largo** (`ofValida`): deja solo los dígitos (acepta espacios, puntos y guiones) y
  les quita los ceros a la izquierda. Devuelve `null` si hay otra cosa o si es todo ceros. Sin los
  ceros, la OF del código (`007000123`) calza con la de la guía (`7000123`).
  - Una OF de 7 dígitos bloqueó la guía (terreno 2026-10-28), y "máximo 9" tampoco era la solución.
  - La de otro largo lleva ⚠ (`ofDistinta`, `LARGO_OF = 9`) y **nunca bloquea**.
  - Solo frena «Crear N pedidos» una línea sin dígitos de OF o sin destino.
- **POR PAGAR nunca se supone $0** (FR-015, SC-006: es plata del conductor). Otra cosa es un «$0»
  impreso en «Total Monto O.F.» sin POR PAGAR: es «no se cobra» (dueño, 2026-11-08; la EXPRES no trae
  CONTADO). `totalImpreso` (0 incluido) y `monto` (nunca 0) están separados en `etiqueta/campos.ts`.
  - `porPagar` es `true` solo si dice POR PAGAR. CONTADO y CTA CTE dan `false`, aunque traigan monto.
  - Sin la palabra de pago queda `null` y se marca como dudoso.
  - El monto sale de «Total Monto O.F.» (también «0.F.», como lo lee ML Kit). Si es 0 o no está, queda
    `null` y la pantalla dice «POR PAGAR · monto por revisar».
- **Solo lo necesario para repartir** (FR-017, constitución V): destinatario, teléfono, dirección, pago,
  monto, bultos y OF impresa. Nunca RUT, remitente, correo ni cuenta corriente.
  - El teléfono va en formato +569 con `normalizarTelefono` (`lib/comun/telefono.ts`). Si vienen 8
    dígitos sueltos, le agrega el 9.
  - La foto queda como foto del paquete (`guardarFoto`), solo en el teléfono.
- **La dirección de la etiqueta no cambia sola**: `direccionDistinta` muestra un aviso y el botón
  «Usar la dirección de la etiqueta» (`cambiarDireccion` + `ubicarDireccion`), y después se rehace la
  ruta. Al comparar no cuentan las tildes, los signos ni «, ARICA…».
- **Lo ya cargado no se pisa**: el nombre y el teléfono se quedan, salvo con una lectura de OF
  confirmada. Ojo, esto no cubre el pago (ver «Huecos»).
- **Escanear dos veces el mismo bulto no lo duplica**: `bultosEscaneados` guarda la lista de números de
  bulto, y la pantalla muestra «Bultos: 1 de 2 · falta 1».
- **OF que no está en el día**: «Este paquete no está en los pedidos de hoy» → «Agregarlo como pedido»,
  que abre el formulario con la OF puesta.
- **Funciona sin señal**: el escáner de Google y el lector de texto (ML Kit) vienen dentro de la APK, y
  los datos van a IndexedDB. No hay lecturas pendientes con reintento (T009 y T023 se descartaron): si
  no sale texto, se pega o se escribe.
- **La guía se fotografía de a una foto con la cámara**. Las fotos se juntan en una bandeja y se leen
  con «Leer las N fotos juntas» en **una** consulta: es ~20 % más barato y la IA junta las filas
  repetidas.
  - Ofrecer solo la galería ya fue un "no me hiciste caso" del dueño (2026-10-27).
  - Caben hasta `MAX_FOTOS_GUIA` = 6 fotos, y se comprimen de a una porque un teléfono barato se
    queda sin memoria (spec 017, E10).
- **Con la IA encendida, en la guía manda la IA (Opus) y el texto del teléfono controla, gratis**
  (T033). Con un lector solo, cada foto daba 14, 6… líneas.
  - Si el teléfono ve una OF de 9 dígitos que la IA no trajo (`faltanEnLaPrimera`), se relee con
    `revisar=1`.
  - Una OF repetida se queda con su mejor lectura, y el MONTO NETO se conserva para compararlo (E11).
- **La guía no trae nombre ni teléfono**, e Infologistic no tiene API (no se vuelve a preguntar). Si
  falta el teléfono, se consulta a mano en Infologistic.
- **En el paquete no se escribe nada**: la parada muestra la OF (con ⚠ si es distinta) y la descripción
  (spec 003).

## Dónde está cada cosa
| Qué | Archivo (en `src/`; `lectura/` y `local/` están en `lib/encomiendas/`) |
|---|---|
| Código de barras → `{ of, bulto }` | `lib/encomiendas/lectura/codigo-barras.ts` |
| OF y paquete: `ofValida`, `ofDistinta`, `formatoOf`, `buscarPorOf`, `nombreVisible`, `textoReferencia` | `lib/encomiendas/paquete.ts` |
| Texto de la guía: `leerGuia`, `armarGuia`, `limpiarDestino`, `guiaDesdeIA`, `faltanEnLaPrimera` | `lectura/guia.ts` |
| Texto de la etiqueta: `leerEtiqueta`, `pagoDe`, `etiquetaCompleta` | `lectura/etiqueta.ts` |
| Contrato y salida de la IA: `LADO_MAXIMO`, `MAX_FOTOS_GUIA`, `BYTES_MAXIMOS_FOTO` · `GuiaIA`, `EtiquetaIA` (zod) | `lectura/contrato.ts`, `lectura/esquemas.ts` |
| Claude (`server-only`): modelos, instrucciones, `leerFotos` | `lectura/servidor.ts` → `app/api/lectura/route.ts` |
| Cloud Vision (`server-only`) | `lectura/vision.ts` → `app/api/texto/route.ts` |
| Qué lector se usa en el teléfono: `leerFotosGuia`, `leerImagen`, `ErrorLectura` | `lib/encomiendas/local/lectura-cliente.ts` (+ `foto.ts`) |
| Almacén: `crearDesdeGuia`, `aplicarLecturaEtiqueta`, `avanceCarga`, `sinEtiquetaEscaneada` | `local/almacen/carga.ts` (`cambiarDireccion` en `pedidos.ts`, `guardarPaquete`/`guardarFoto` en `paquete.ts`) |
| Escáner (`escanearCodigo`) y texto de una foto (`textoDeFoto` → `Telefono.leerTexto`) | `lib/nativo/escaner.ts`, `lib/nativo/telefono.ts`; Java en `android/…/TelefonoPlugin.java` (solo leer) |
| Pantallas de la guía | `_componentes/cargar-guia.tsx`, `fotos-guia.tsx`, `lineas-guia.tsx`, `fin-guia.tsx` |
| Pantallas del escaneo | `escanear-etiqueta.tsx`, `resultado-escaneo.tsx`, `campos-paquete.tsx`, `progreso-carga.tsx`, `aviso-cargar-auto.tsx`, `buscar-of.tsx` |
| Quién las abre · de dónde sale `lecturaIA` | `ventanas-pantalla.tsx` · `conductor/encomiendas/page.tsx` (`lecturaIADisponible()`) |

## Cómo hacer los cambios típicos
- **Una variante nueva en la etiqueta o la guía** (un formato distinto o un error del lector):
  1. Copia el texto tal como lo lee ML Kit o Lens, con datos inventados, en
     `pruebas/fixtures/lectura/`.
  2. Escribe una prueba que falle en `pruebas/lectura.test.mjs`.
  3. Ajusta la regex de `leerEtiqueta` o `leerGuia`. Se tolera el error en la palabra clave
     (`[O0]F`), nunca se "corrige" el valor.
  4. Con la 021 hecha, un formato nuevo se suma solo en `lectura/etiqueta/formatos.ts`.
- **Una pantalla de carga o de escaneo**: botón renombrado → también en `_componentes/ayuda.tsx`;
  `cargar-guia.tsx` (362 líneas) y `resultado-escaneo.tsx` (316) se dividen si pasan de ~400. Se
  recorre con `recorrer-conductor`; el escáner y ML Kit solo existen en la APK (`apk-local`).
- **Implementar la 021**: sigue `tasks.md` en orden. En `references/spec-021.md` está qué se borra,
  quién lo usa y las trampas.
- **Un dato nuevo de la etiqueta en el pedido**: cambia el formato de datos, así que se pregunta
  antes.
  - Se toca `Pedido` (`almacen/tipos.ts`), `alDia` (`almacen/migrar.ts`), `crearDesdeGuia`,
    `aplicarLecturaEtiqueta` y `docs/CLASES.md` §1.
  - Usa las skills `base-local-idb` y `privacidad-destinatarios`. Nada de esto sube al servidor.
- **Ubicar las direcciones de la guía** (después de «Crear») ya es otro tema: skill `direcciones-arica`.

## Plata y cupos
- **Anthropic** (`lecturaIA` = hay `ANTHROPIC_API_KEY` en el servidor):
  - Guía: Opus, ~US$0,03 por foto (~US$3 al mes). Releer es otra consulta.
  - Etiqueta: US$0 desde la 021 (rama `021-lector-etiquetas`, 2026-11-07): ya no va a la IA. En
    `main`, hasta el merge, se sigue mandando cada una a Haiku (~US$5–9 al mes).
  - Además, después de crear los pedidos, «corregir con IA» (spec 018) también gasta.
- **El modo prueba no apaga la IA.** Con la clave en `.env.local`, recorrer con fotos gasta. Antes de
  hacerlo, pregunta y di cuántas fotos son y cuánto cuestan. Sin gastar: deja la clave vacía o usa
  «Pegar el texto de Google Lens» con un texto inventado.
- **Cloud Vision**: ~US$1,50 cada 1.000 fotos (1.000 gratis al mes). `AGENTS.md` dice que está apagada
  en la clave, pero el código igual llama a `/api/texto` (ver «Huecos»).
- **ML Kit** (el texto y el escáner) no cuesta nada y no usa la red. Las pruebas reemplazan el `fetch`:
  no gastan.

## Pruebas
- Siempre: `npm test`, `npm run lint` y `npm run build`.
- Las de este tema corren sin red en ~10 s (65 pruebas el 2026-11-05):
  `node --import ./pruebas/registrar.mjs --test pruebas/lectura.test.mjs pruebas/lectura-servidor.test.mjs pruebas/etiqueta-en-el-telefono.test.mjs pruebas/carga.test.mjs pruebas/paquete.test.mjs pruebas/vision.test.mjs pruebas/listo-para-terreno.test.mjs`
- Los cambios de lectura, pago o privacidad llevan una prueba enfocada nueva (constitución III). Cómo
  escribirla, sus patrones y los fixtures: `references/pruebas.md`.
- Datos inventados (`+56912345678`, OF `200000002`, calles reales con números inventados). Una
  etiqueta real (los ejemplos del dueño, 021 T002) se revisa una por una antes de entrar al repo.
- La pantalla no tiene pruebas de React: se recorre con `recorrer-conductor`.

## Pendientes
- **021** (en curso): US1 hecha en la rama (2026-11-07: la etiqueta solo con ML Kit, `/api/lectura`
  solo la guía). Falta el lector especializado, que espera los ejemplos del dueño (T002), y
  Diagnóstico → «Probar etiqueta» (US3).
- **028** (borrador): el escáner en vivo y continuo al cargar el auto. Toca `android/`.
- **005**: probar con ≥ 50 etiquetas reales (T030, junto con la T012 de la 021) y correr el quickstart
  (T031).
- **022** (borrador): el ⚠ en el pedido y el aviso dos paradas antes. Hoy el ⚠ solo marca la OF
  distinta (`lineas-guia.tsx`, `tarjeta-parada.tsx`, `pedido-form-local.tsx`).

## Huecos del código (verificados; se avisan, no se arreglan sin pedido)
Detalle y cómo reproducirlos: `references/flujo-y-codigo.md` §5.
- `aplicarLecturaEtiqueta` protege el nombre y el teléfono, pero **el pago, el monto, los bultos y la
  descripción los pisa cualquier lectura** que los traiga, aunque no tenga la OF confirmada. Puede
  quedar `porPagar: false` con un `montoPorPagar` viejo.
- Una OF escrita a mano (sin bulto) muestra la parada pero no suma a `bultosEscaneados`. El contador
  x/N no avanza y la OF sigue en «Sin etiqueta escaneada», salvo que después se lea el bulto del texto.
- `leerEtiqueta` toma el primer «Tel.». Si el remitente va antes, toma su teléfono (la 021, US2, lo
  resuelve).
- `/api/texto` se llama en cada foto **de la guía** (la etiqueta ya no, desde la 021) si existe
  `GOOGLE_VISION_KEY` o `GOOGLE_MAPS_KEY`. Si la API está
  apagada, Google rechaza la foto (502) y el teléfono vuelve a intentar con la siguiente, porque solo
  deja de preguntar con un 503. La foto sale del teléfono igual.

## Docs que hoy no calzan con el código
- `docs/ARQUITECTURA.md` §1 («foto que el teléfono no pudo leer»), `docs/CLASES.md` §4 («si no
  alcanza, la IA») y `docs/HOJA-DE-RUTA.md` (fila 005, «solo si el teléfono no pudo leer») dicen
  otra cosa: en el código la IA lee toda guía y toda etiqueta cuando está encendida. `CLASES.md` §4
  tampoco nombra `vision.ts` ni `/api/texto`.
- `docs/PRIVACIDAD.md` §3 pone Cloud Vision «en uso», y `AGENTS.md` dice que está apagada en la clave.
- Spec 005: FR-008 y US2.3 (OF impresa con confirmación; hoy se escribe la OF), `BarcodeDetector`
  en los supuestos (no existe), `data-model.md` con `lecturasPendientes` (descartado) y un origen
  `etiqueta` que nunca se asigna («Agregarlo como pedido» crea `manual`), y `lib/whatsapp/telefono.ts`
  en T021 (hoy es `lib/comun/telefono.ts`).
- `pruebas/paquete.test.mjs`: la prueba se llama «exige 9 dígitos», pero comprueba lo contrario.
- `ayuda.tsx` nombra «Leer las fotos juntas» y «Crear pedidos». Los botones dicen «Leer las N fotos
  juntas» y «Crear N pedidos».
