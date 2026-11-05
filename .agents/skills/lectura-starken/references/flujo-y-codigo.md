# Flujo y código de la lectura (detalle)

Verificado contra el código el 2026-11-05. Las carpetas de pantalla son de
`src/app/(conductor)/conductor/encomiendas/_componentes/`. Los textos entre «» son los de los
botones, tal como aparecen.

## 1. Guía (paso 1 del flujo)
1. **Abrir.** «Cargar la guía» (`cabecera-sin-parada.tsx`, `pedidos-fuera.tsx`) abre `CargarGuia`
   (`cargar-guia.tsx`), que monta `ventanas-pantalla.tsx`.
2. **Fotos.** Con `lecturaIA || esApp()` la pantalla parte en el paso `fotos`:
   - Primero «Sacar foto» y «Galería» (`BotonesGrandes`). Son dos `input`: uno con
     `capture="environment"`, de a una foto, y otro con `multiple`.
   - Cada foto se suma a la bandeja (`useFotosGuia`, `BandejaFotos`) sin leerse. Después se ve
     «Sacar otra foto» / «Galería», y en la bandeja «Leer la foto» o «Leer las N fotos juntas».
   - En el navegador sin IA no hay foto: la pantalla parte en `pegar`.
3. **Texto pegado.** «Pegar el texto de Google Lens» abre «Texto de la guía»; con «Leer la guía»
   pasa por `leerGuia(texto)`.
4. **Leer las fotos.** `leerFotosGuia(archivos, { ia: lecturaIA })` en `local/lectura-cliente.ts`:
   - Comprime de a una a `LADO_MAXIMO.guia` (2000 px). Si entre todas pasan del 90 % de
     `BYTES_MAXIMOS_FOTO` (4 MB), las vuelve a achicar a 1400 px.
   - **Sin IA**, saca el texto de cada foto: primero `/api/texto` (Cloud Vision) y, si no responde,
     `textoDeFoto` (ML Kit). Lo pasa por `leerGuia`. Basta con una línea; si no hay ninguna, lanza
     `ErrorLectura` 422.
   - **Con IA** corren en paralelo `pedirIA("guia", fotos)` (una sola consulta a `/api/lectura`,
     con tope de 60 s) y los textos.
     - Si la IA falla, queda el texto, si alcanza.
     - Si `faltanEnLaPrimera(ia, texto)`, se relee con `revisar=1`.
   - El origen del pedido sale de quién leyó: `fuente` `"ia"` → `guia_ia`, `"texto"` → `guia_foto`, y
     el texto pegado → `guia_pegada`.
5. **Unir.** `armarGuia([...lineasAntes, ...nuevas], folio, total)` junta las OF repetidas con la
   mejor lectura y arma los avisos:
   - «Una OF estaba repetida (fotos superpuestas)…»
   - «Una línea sin OF o sin destino: revísala.»
   - «La guía dice N y se leyeron M…»
   - «No se encontró ninguna línea "OF: … DESTINO: …".»
6. **Revisar** (`lineas-guia.tsx`):
   - Una línea mala aparece con fondo de aviso y ya abierta para editar.
   - Una OF de otro largo lleva el ⚠ «OF distinta».
   - Cada línea tiene lápiz y basurero, y al final está «Agregar una línea».
   - El botón de abajo dice «Primero lee las fotos de arriba», «Corrige N líneas» o «Crear N pedidos».
7. **Crear.** `crearDesdeGuia(lineas, fecha, { folio, origen })` no duplica una OF que ya está en el
   día (`yaEstaban`), y deja el nombre y el teléfono vacíos. Después:
   - `ubicarDireccion` ubica las direcciones una por una (`fijarCoordenadas`).
   - Con IA, `corregirSinUbicar` (spec 018, que también gasta) intenta las que no se ubicaron.
   - `fin-guia.tsx` muestra el avance. Al final el botón es «Escanear los paquetes» si ya hay ruta,
     o «Armar la ruta» si no.

**Lo que reconoce `leerGuia`:**
- Líneas `OF:<dígitos> DESTINO:<texto>` (acepta «0F»). Cada destino corre hasta la próxima OF o
  hasta «SOLO TRASLADO», «Oficio N», «SON:» o «MONTO NETO».
- El folio, de «Nº nnnnn» o «FOLIO».
- El total, de «MONTO NETO» (cada línea vale 1).

`limpiarDestino` saca `&amp;` (también anidado), «CHILE,», «XV REGION DE ARICA (Y PARINACOTA)» y el
número repetido («… 56 NO. 56»).

## 2. Etiqueta (paso 4 y la parada)
1. **Entradas al escaneo:**
   - «Ruta lista. Ahora carga el auto» → «Escanear los N paquetes» (`aviso-cargar-auto.tsx`).
   - La tarjeta «Cargar el auto: escanea cada paquete», con x/N y las OF que faltan
     (`progreso-carga.tsx`). Se ve hasta que se cierra la primera parada.
   - El botón del carril superior (aria «Escanear etiqueta»).
   - «Escanear los paquetes», al terminar la guía.
   - En una parada sin teléfono, «Escanear la etiqueta para llamar» (`parada-activa.tsx`). Tiene
     salida a mano («Teléfono», «Entregado»…; spec 017, E3).
2. **Escáner.** `EscanearEtiqueta` abre `escanearCodigo()` al entrar.
   - Fuera de la APK, o si se cancela, pasa a escribir: campo «OF» → «Buscar esta OF».
   - Si lo leído no tiene dígitos: «Ese código no es de una etiqueta de Starken.»
3. **Enlace.** `aplicarLecturaEtiqueta(fecha, { of, bulto })`:
   - `null` → «Este paquete no está en los pedidos de hoy» + «Agregarlo como pedido».
   - Si no, devuelve `{ pedido, parada, direccionDistinta }`. La parada es la posición en la ruta
     vigente (`pedidosEnOrden`).
4. **Resultado** (`resultado-escaneo.tsx`):
   - «PARADA n de N», o «SIN RUTA TODAVÍA» + «Arma la ruta para saber su parada.».
   - La descripción («Sin descripción» si no hay) y la OF.
   - «Bultos: x de y · falta(n) k», o «· completo».
   - «POR PAGAR $…», o «POR PAGAR · monto por revisar».
   - El nombre y el teléfono, o «Destinatario sin leer» / «Teléfono sin leer».
5. **Completar.**
   - **«Foto de la etiqueta»** (si faltan datos y `lecturaIA || esApp()`; con los datos ya puestos,
     «Leer la etiqueta de nuevo») llama a `leerImagen("etiqueta", foto, { ia })`:
     - Comprime a `LADO_MAXIMO.etiqueta` (1280 px).
     - Sin IA: saca el texto (`/api/texto` y, si no, ML Kit) y lo pasa por `leerEtiqueta`. Cualquier
       texto sirve, aunque esté incompleto; sin texto, 422.
     - Con IA: **siempre** se pregunta a la IA (Haiku), y en paralelo se lee el texto.
       `conDescripcion` decide: si el texto está completo (`etiquetaCompleta`), mandan sus datos y la
       IA solo pone la descripción; si no, manda la IA. Si la IA falla, queda el texto.
     - Si `ofImpresa` es distinta de la OF del código, no se aplica: «La foto es de la OF … no se
       usó». Si es igual, la lectura va con `ofConfirmada`.
     - El bulto es el del código y, si la OF se escribió, el del texto.
     - Si el pedido no tenía foto, esta queda como foto del paquete.
   - **«Completar con el texto de la etiqueta»** abre «Texto de la etiqueta» → «Completar», que
     pasa por `leerEtiqueta`. Un texto de otra OF no se aplica: «El texto pegado es de la OF …»
     (así no queda pegada la etiqueta anterior).
   - **«Describir el paquete (tres toques)»** abre `CamposPaquete` (tipo, tamaño, color, nota de
     hasta 40 caracteres y foto) → «Guardar la descripción» (`guardarPaquete`).
6. El botón de abajo dice «Escanear el siguiente paquete», o «Todos escaneados · escanear otra».

**Lo que reconoce `leerEtiqueta`.** Palabras clave: `DESTINATARIO`, `DIRECCI[OÓ]N`,
`Tel`/`Teléfono`, `POR PAGAR`, `CONTADO`, `CTA CTE`, `Total Monto [O0].F.`, `Bulto N° x/y` y
`[O0].F.` (la OF impresa). Como `\s` incluye el salto de línea, el valor puede venir en el renglón
siguiente, como lo corta ML Kit.

## 3. Qué lector se usa (`lectura-cliente.ts`)
| | APK | Navegador |
|---|---|---|
| IA apagada | foto: texto de Vision (si hay clave) o de ML Kit | guía: solo pegar · etiqueta: sin foto, se pega |
| IA encendida | guía: IA + texto de control · etiqueta: IA siempre + texto | igual, pero el texto sale solo de Vision |

## 4. Servidor
- **`POST /api/lectura`** (multipart: `tipo` = `guia` | `etiqueta`, `imagen` (1 para la etiqueta,
  hasta 6 para la guía), `revisar=1`). Solo el conductor (`conductorDeLaApi`).
  - Respuestas: 401 · 400 · 413 (más de 4 MB entre todas) · 422 ilegible · 503 sin clave o caída.
  - Sin `console.*`: lo vigila `pruebas/privacidad.test.mjs`.
- **Modelos** (`lectura/servidor.ts`):
  - Guía: `claude-opus-5` (`LECTURA_MODELO_GUIA`; al releer, `LECTURA_MODELO_GUIA_ALTA`).
  - Etiqueta: `claude-haiku-4-5` (`LECTURA_MODELO`).
  - Va sin pensamiento. `effort` es `medium` para la guía y `low` para la etiqueta, y **nunca** se
    manda con Haiku (contesta 400).
  - Tope de 25 s con 1 reintento. Un `refusal`, un `max_tokens` o una salida sin forma son 422.
- **`POST /api/texto`** (`imagen`): 401 · 400 · 413 · 503 sin clave · 502 si Google no respondió.
  - La clave es `GOOGLE_VISION_KEY` y, si no está, `GOOGLE_MAPS_KEY`.
  - Con un 503, el teléfono deja de preguntar hasta recargar (`nubeApagada`). Con un 502 sigue
    preguntando.
- **ML Kit** (`TelefonoPlugin.leerTexto`): recibe un JPEG en base64 y devuelve el texto con un
  renglón por línea, usando el modelo latino que viene dentro de la APK. Una APK anterior a esa
  función devuelve `null`.

## 5. Huecos (verificados el 2026-11-05 con una prueba de borrador, sin red)
1. **El pago se pisa.** En `aplicarLecturaEtiqueta`, solo el nombre y el teléfono respetan «lo ya
   cargado». `porPagar`, `montoPorPagar`, `bultos` y `referencia` toman lo que traiga cualquier
   lectura. Con POR PAGAR $1.000 y después una lectura sin confirmar que dice CONTADO, queda
   `porPagar: false` con `montoPorPagar: 1000`.
2. **Una OF escrita a mano no cuenta en la carga.** `{ of, bulto: null }` muestra la parada, pero
   `bultosEscaneados` queda vacío: `avanceCarga` no avanza y la OF sigue en `sinEtiquetaEscaneada`.
   Se arregla solo si después se lee el bulto de la foto o del texto. Pasa justo cuando el escáner
   falla.
3. **El teléfono del remitente.** Con «REMITENTE … Tel. 9 0000 1111» antes de «DESTINATARIO … Tel.
   9 1234 5678», `leerEtiqueta` devuelve `+56900001111`. Es la US2 de la 021.
4. **Una OF de puros ceros.** Un código de 26 dígitos con `92` y la OF en ceros pasa por OF escrita
   a mano y devuelve los 26 dígitos como OF. Es raro, pero no da `null`.
5. **Cloud Vision apagada.** Con `GOOGLE_MAPS_KEY` cargada y la API de Vision apagada, cada foto
   sale a Vercel y a Google, que contesta 403 (la ruta devuelve 502). El teléfono vuelve a intentar
   con la foto siguiente, con un tope de 15 s cada vez. Antes de cambiarlo hay que preguntar: toca
   un proveedor y `docs/PRIVACIDAD.md`.
6. **El origen `etiqueta`** existe en `OrigenCarga` pero nunca se asigna. «Agregarlo como pedido»
   guarda `manual` (`pedidos.ts`), así que ese pedido tampoco cuenta en el contador de carga.
