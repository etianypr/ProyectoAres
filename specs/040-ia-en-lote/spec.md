# 040 · La IA ubica todas las direcciones dudosas de una vez, y tres estados en pantalla

Dueño, 2026-11-18: «muchos tipos confunde al cliente»; «la idea de la IA es que ubique todas las
direcciones aproximadas; si no se encuentra nada, necesitamos ayuda humana»; «que no se vaya pasando
una a una […] pasar como vector todas las direcciones para que haga una consulta ubicando todas a la
vez». Rama `040-ia-en-lote`, encima de `limpieza-codigo-muerto` (91d3272).

## Decisiones del dueño (2026-11-18)
- **En pantalla, tres estados**: «Ubicada», «Aproximada» y «Sin ubicar». «Aproximada» junta la cuadra,
  solo la calle y la calle repetida. El detalle («está en 3 lugares», «sin número») se ve solo al abrir
  el pedido para elegir. Los tipos internos de `ubicarDireccion` (`exacta`, `aproximada`, `ambigua`,
  `solo_calle`, `no_encontrada`) se quedan: sirven para decidir qué va a la IA.
- **A la IA va todo lo que no sea exacto**: sin ubicar, cuadra, solo la calle y calle repetida (antes
  la calle repetida no iba: la IA no sabía dónde andaba la ruta; en el lote ve la zona del día). Lo
  que la IA no resuelve queda para el conductor.
- **Lote con candidatos**: una llamada con la lista entera y lo que ya encontraron los buscadores, en
  vez de una conversación por dirección. La spec 038 lo había descartado porque cambia lo que lee el
  modelo; ahora es a propósito.
- **Dato nuevo**: `Pedido.aproximada?: true`, opcional, sin subir la versión de IndexedDB (autorizado).

## Cómo funciona el lote
1. **Armar** (`entradasDelLote`, `armarLote`, `geo/direccion-ia/cliente.ts`). Por cada dirección: la
   dirección escrita (máx. 200 caracteres), los candidatos de `ubicarDireccion` (de la caché del día:
   no vuelve a pagar Google ni Nominatim; una calle repetida trae cada lugar con su población y
   sector) y hasta 3 nombres parecidos del catálogo. Ids `d1`, `d2`… y `d1c1`, `d1c2`… (hasta 10
   candidatos, el punto con 4 decimales). Más la **zona del día** (`zonaDelDia`): cuántos pedidos con
   punto, fuera del lote, hay en cada sector. El mismo destino va una vez.
2. **Ronda 1.** Una llamada a `/api/direccion-ia` con hasta `LOTE_MAXIMO` (15) direcciones; más van en
   varias llamadas, una tras otra. La IA contesta con la herramienta `resultados` (con `tool_choice`
   `auto`: forzada da 400 en los modelos 5.5, por si se cambia `DIRECCION_MODELO`): por cada
   dirección, el candidato elegido, o un texto corregido para volver a buscar, o nada.
3. **Búsquedas.** Para los textos corregidos, Nominatim y Google (la cadena de siempre, con la caché).
4. **Ronda 2.** Solo con esas, con lo nuevo primero y lo de antes debajo. No hay ronda 3.
5. **Revisar y guardar.** Las reglas de siempre: el candidato tiene que ser de esa dirección (un id
   de otra se descarta), la confianza nunca supera la del candidato, un barrio no sirve, a menos de 60 m
   del punto que ya tenía no cambia nada. Se guarda como `propuestaIA`, sin aplicar: el conductor
   confirma de a una, como antes.

Errores: un 429 se reintenta una vez, a los 3 s; un lote que no llega deja ese y los siguientes
«sin señal», para volver a pedirlo; sin IA en el servidor no se sigue. La ruta declara
`maxDuration = 90` y el SDK espera hasta 40 s por intento (un lote de 15 tarda ~15-20 s).

A Anthropic va lo mismo que antes (direcciones escritas y candidatos de los buscadores) más la zona del
día en sectores; nunca nombre, teléfono, OF ni la ubicación del conductor.

## Instrucciones de la IA (`SISTEMA`, `geo/direccion-ia/servidor.ts`)
- En secciones: lo que recibe, cómo leer una dirección de Arica, cómo elegir, la respuesta y cinco
  **ejemplos resueltos**, sacados de las pruebas (calles reales, números inventados; nunca una
  dirección de un pedido real): el nombre a medias que se busca en la ronda 2 («HUMBERTO ARELLANO»), la
  población antes de la calle en una calle repetida («LINDEROS PROVIDENCI CALLE 2»), el mismo número en
  otra calle («DIEGO PORTALES» y «Palza Corvacho»), el mismo texto en dos lugares que decide la zona
  («LOS AROMOS 120», Arica y Azapa) y solo el barrio.
- Cada candidato lleva ahora su **sector** (Google solo dice «Arica»: sin esto la IA no podía cruzarlo
  con la zona), y en una calle repetida, las **calles que cruzan** el lugar y si **calza con la guía**.
- ~2 600 tokens, iguales en todos los lotes: ahora sí pasan el mínimo de la caché de prompt (1 024 en
  Sonnet 5), así que desde la segunda llamada se leen de la caché. Antes eran ~500 y no se cacheaban.
- `pruebas/040-ia-lote.test.mjs` revisa que cada ejemplo sea un lote válido, que cada respuesta tenga la
  forma del contrato y elija candidatos de su dirección, que el sector de cada punto sea el real y que
  no haya teléfonos ni RUT.

## Tres estados en pantalla
- `estadoUbicacion(pedido)` → `"ubicada" | "aproximada" | "sin_ubicar"` (`encomiendas/problemas.ts`):
  sin punto → sin ubicar; con un ⚠ de lugar (`calle_repetida`, `solo_calle`) o `aproximada` → aproximada;
  lo demás → ubicada.
- `etiquetasDelPedido` da lo que muestran la fila, la tarjeta de la parada y la ruta: «Sin ubicar»,
  «Aproximada» y los demás ⚠. Los ⚠ de lugar se leen «Aproximada» en vez de «Calle en N lugares» o «Sin
  número: va a mitad de cuadra»; el detalle sigue en las opciones para elegir (`opciones-lugar.tsx`).
- La cuadra se ve «Aproximada» pero **no es un ⚠**: no entra a «Por resolver» ni marca «!» en el mapa
  (no hay nada que elegir). De eso sigue encargándose `problemasDelPedido`.
- Las propuestas de la IA muestran una sola etiqueta, «Aproximada», en vez de «Solo la calle», «En la
  cuadra» y «Dudosa».
- `aproximada` lo escriben la carga (`guardarUbicacion`), el reintento al optimizar, la corrección de
  la IA confirmada (en la cuadra o solo la calle) y la dirección de la etiqueta. Cambiar la dirección o
  el punto en el formulario lo borra; mover el punto a la calle de acceso lo conserva.
- **No cubierto:** el formulario del pedido, cuando ubica solo una dirección escrita sin elegir
  sugerencia, no marca `aproximada` (`pedido-form-local.tsx` tiene 505 líneas y A7 obliga a dividirlo
  al tocarlo); el conductor ve igual la advertencia al guardar.

## Lo que salió
La conversación por dirección: `corregirConIA`, `conversacionValida`, `MensajeIA`, las herramientas
`buscar_direccion`, `calles_parecidas` y `proponer`, `MAX_VUELTAS` y el envío de a 2
(`DIRECCIONES_A_LA_VEZ`, spec 038). La prueba dorada `038-ia` y su fixture.

## Medido (PC, sin red, `npm run medir:direcciones`, las mismas latencias simuladas de la 038)
| Fase | 038 (de a 2) | 040 (lote) |
|---|---|---|
| Corrigiendo con IA | 16,9 s | 9,2 s, 2 llamadas |
| Total «Crear 30 pedidos» | 50,3 s | 42,6 s |

## Verificación
- `pruebas/040-ia-lote.test.mjs` (17): el lote y `loteValido`, un candidato de otra dirección, las dos
  rondas, lotes de a 15, el mismo destino una vez, sin conexión / 429 / sin IA, la zona del día, la
  marca `aproximada` y los tres estados. Adaptadas: `direccion-ia`, `huecos-g1`, `guia-telefono` (a la
  IA no le llega un teléfono), `038-api` (el lote en la ruta), `problemas`, `pedidos-con-problemas`.
- `npm test` 1109/1109, lint, `tsc --noUnusedLocals` y build bien.
- **Falta, con gasto (se pregunta antes):** una guía real en la APK de prueba: cuántas direcciones
  quedan para el conductor, cuánto tarda y cuánto cuesta por lote.
