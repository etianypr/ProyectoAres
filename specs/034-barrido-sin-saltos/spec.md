# 034 · Barrer la nómina sin saltarse un encargo

Estado: en curso (rama `034-barrido-sin-saltos`; hecha en la web y en `android/` y medida
con una nómina real: 15 de 15; falta probar el guardado y la velocidad de los cuadros) · paso 1 del flujo («Cargar la guía» → «Barrer la nómina»,
spec 029) · dueño, 2026-11-14/15.

## Qué y por qué
- Terreno, 2026-11-14: al barrer la nómina el conductor no supo qué parte ya estaba leída y tuvo que
  recorrerla entera de nuevo para encontrar la OF que se saltó.
- En un día normal se mueven el celular y la boleta: la lectura tiene que aguantar eso (dueño,
  2026-11-15: «el escáner tiene que quedar pulido al máximo»).
- Si el celular se bloquea o Android cierra ARES a mitad del barrido, lo barrido no se pierde y se
  sigue la misma lectura.
- Todo corre en el barrido en vivo, en el teléfono, sin red ni proveedores (la nómina trae el nombre).

## Lo decidido (dueño)
- **Verde que se queda** (reemplaza «verde 2 s y línea fina» del 2026-11-11): el encargo leído (número
  firme y con dirección) va relleno en verde con ✓ cada vez que vuelve a la cámara. Lo que no está
  verde es lo que falta. Punteado con «…» lo que se lee y con ⚠ lo a medias.
- **Sin «Ver lista»**: tapaba la cámara. Arriba, bajo la barra, «⚠ Falta confirmar N» y hasta 6 OF,
  sin consejos. Entra solo lo que hay que volver a pasar: el número sin firmar o el encargo a medias.
  La dirección dudosa con el número firme no entra: se confirma en la revisión.
- **A medias** (antes se perdían en silencio): la OF sin su dirección y la vista en un solo cuadro.
  Se cuentan, y al terminar pasan a la revisión como «⚠ Por confirmar» con la dirección vacía
  («Crear N pedidos» espera). «Terminar» con alguna pregunta «Terminar igual / Seguir barriendo».
- **Seguir la misma lectura**: se guarda todo, también lo a medias. La linterna arranca apagada.
- Se autorizó tocar `android/` (APK nueva). Descartados: solape entre fotos, linterna automática y
  semáforo de calidad.

## Cómo quedó
### Lectura (`lectura/nomina.ts`, `barrido-nomina.ts`, `bloques-nomina.ts`)
- La regla de la OF no cambia: encargo entero en el cuadro, dígito por dígito, `VOTOS_PARA_FIRME = 3`,
  2 de cada 3, `CONFIANZA_MINIMA`.
- **Piezas apagadas** (medido el 2026-11-15, nómina de 15 OF, 724 cuadros): contar también la OF que
  entra al cuadro sin su dirección (`piezasNomina`: OF suelta, encargo abierto) dio 14 firmes y 3 por
  confirmar; los encargos enteros solos, 15 y 1. Las piezas se leen en el borde del cuadro, con más
  dígitos mal (68 lecturas corregidas contra 38). Quedan en el código con `{ piezas: true }` y
  Diagnóstico las sigue midiendo («Con piezas»); no se prenden sin una medición que las respalde.
- **La misma fila leída de dos formas** (`revisarParecidas`; dueño: «estar constantemente
  preguntándose si una OF que no es igual a las demás era un fallo de lectura»). Casi todo el ruido
  eran números a 1 dígito de una OF ya firme. Dos números parecidos (≤ 2 dígitos; ≤ 3 si se leyó en
  1 o 2 cuadros) son la misma fila si nunca salieron en el mismo cuadro y uno se leyó mientras el
  otro estaba a la vista (± 20 cuadros):
  - la más débil (sin firmar y con menos cuadros, o firme con un tercio o menos) se bota y, si
    vuelve a salir, se marca con el número bueno;
  - si las dos quedaron firmes con cuadros parecidos, quedan las dos por confirmar con el papel:
    nada se bota a ciegas.
  - Son dos encargos de verdad, y no se tocan, si salieron juntos en un cuadro o si las dos
    direcciones quedaron firmes y distintas, salvo que la de la débil sea la de una fila vecina (el
    cuadro movido toma la dirección de al lado).
- Un número largo sin dirección es una OF solo con la forma de la fila de un encargo o bajo los
  títulos de las columnas (`esFilaDeEncargo`; el RUT del encabezado ya no cuenta), y con menos de 3
  lecturas no se lista (`ruido`).
- **«DD» no es de la dirección** (dueño, 2026-11-15): es el título de la última columna del pie («VALOR $
  FORMA PAGO DD»); con el papel inclinado queda a la altura de la dirección y se le pegaba al final. Se
  quita si va al final de la dirección y, solo en un renglón, la cierra (`nomina.ts`). Con «DD» y sin él
  eran dos direcciones para los votos (no se juntaban ni quedaban firmes) y en la guía ganaba la más larga.
- **El informe en el orden de la hoja** (dueño, 2026-11-15: «el primero de la boleta, primero en el informe»,
  para comparar con el papel). El orden en que se vio cada número no alcanza: un encargo que se saltó y se
  leyó al repasar quedaba al final. En cada cuadro se anota quién está arriba de quién (`VotosNomina.arriba`)
  y un encargo va antes que otro si salió arriba más veces que abajo (`ordenEnLaHoja`); si nunca se vieron
  juntos decide cuál se vio primero. Así salen `lista`, `lineas`, el informe de Diagnóstico y las líneas
  de «Revisar» (`enOrdenDeLaNomina`: las que no son del barrido quedan antes, como estaban).
- De las dos formas de juntar los renglones gana la que armó más encargos enteros (`mejorResultado`):
  antes ganaba la que confirmaba más OF, y eso premiaba a la que traía una repetida (16 de 15).

### Guardado (`_hooks/use-barrido-de-guia.ts`, `use-borrador-guia.ts`, `barrido-a-guia.ts`)
- Los votos del barrido van con el borrador de «Cargar la guía» cada ≥ 3 s y al bloquearse el celular
  (`visibilitychange`, `pagehide`). Al volver, si la cámara no manda cuadros en 2 s se prende de nuevo.
- «Terminar» pasa las líneas a la guía y la lectura sigue: «Barrer la nómina» otra vez continúa, con
  lo leído en verde. Entran solo las OF nuevas y las que pasaron a firmes (`entregadas`): una línea
  borrada o corregida en la revisión no vuelve, y una entregada por confirmar que resultó ser una
  mala lectura se quita (`sobran`).
- La ✕ descarta solo la pasada actual. Crear los pedidos o descartar la guía deja la lectura en cero.
- **Lo que faltaba confirmar no perdura de una pasada a otra** (dueño, 2026-11-15: «las OF falta confirmar
  perduran si salgo del barrido y vuelvo a entrar»). Al empezar a barrer de nuevo, de la lectura guardada
  sigue solo lo ya leído (número firme y con dirección, en verde); lo que estaba por confirmar o a medias
  parte de cero (`votosDeLoLeido`, llamado en `iniciar`). Ajusta la decisión anterior («se guarda todo,
  también lo a medias»): eso vale mientras dura la pasada (bloqueo del celular); al reabrir tras un
  cierre, lo pendiente se vuelve a barrer. Una línea ya entregada a la guía por confirmar **no** se quita
  por esto: `sobran` son solo las que ahora son parte de otra OF.

### Nativo (`EscanerVivoPlugin.java`; opciones de `iniciar` que una APK anterior ignora)
- `codigos: false`: al barrer no se buscan códigos de barras (la nómina no trae).
- El resultado de cada cuadro se arma en el hilo del análisis, no en el de la pantalla: con la
  pantalla cambiando, la lectura bajaba a 3 cuadros por segundo (319 ms; antes ~123 ms). No lo
  recuperó (3,5 por segundo): ver «Falta».
- `exposicion`: `corta` (los cuadros por segundo fijos, hasta 30: ningún cuadro se expone más de
  1/30 s), `cortaOscura` (además un punto menos) o `auto`. Por defecto `corta`; se cambia en
  Diagnóstico para comparar con la misma nómina.

### La entrada: el pie de «Cargar la guía» (`_componentes/visor-guia.tsx`; dueño, 2026-11-15)
Como la cámara del teléfono: las categorías «Foto» y «Nóminas físicas» se cambian deslizando o
tocándolas; el botón redondo dispara la elegida (la foto o el barrido); la galería va a su izquierda
(con la última foto y cuántas van) y «Pegar» a su derecha. Con fotos, «Leer direcciones» arriba. Se
fue «Otra forma». Sin el barrido (fuera de la APK) queda solo «Foto», sin categorías.

### La cámara en vivo del paso 1 (`_hooks/use-visor-vivo.ts`; dueño, 2026-11-15)
- En la APK, el recuadro del paso 1 es la cámara de ARES (un hueco transparente: la cámara queda
  debajo de la pantalla) y el botón redondo saca la foto sin salir a la cámara del teléfono. La foto
  se recorta a lo que se ve en el recuadro. El recuadro no dispara al tocarlo; lleva la linterna.
- Reemplaza la decisión del 2026-11-13 (visor sin cámara en vivo, por la traba de la 028). Va como
  el barrido, que no se traba: la pantalla del día se quita del todo (`camara-sola`) y la cámara no
  lee cada cuadro. **Falta medirlo** (abajo); si se traba, no queda.
- Nativo: `iniciar({ visor: true })` (vista previa + foto, sin análisis, con la ventana de la
  pantalla para que la foto traiga su recorte) y `capturar({ leer: false, recorte })`. Sin esas
  opciones el plugin hace lo de siempre (etiqueta 028, barrido).
- El barrido usa la misma cámara: al tocar el botón redondo en «Nóminas físicas» primero se apaga el
  visor y después prende el barrido; al terminar, el visor vuelve solo.
- Sin la cámara en vivo (navegador, APK anterior, sin permiso, la cámara no abre) sigue la cámara del
  teléfono. Salida: Diagnóstico → «Sacar las fotos de la guía con la cámara del teléfono».
- La Ayuda lleva `capa-camara`: con la cámara prendida, lo que no la lleva queda oculto.
- **El recuadro no cambia de tamaño al sacar fotos** (dueño, 2026-11-15: «se achica el espacio de la
  cámara haciendo que la referencia sea incorrecta»; pasaba de 962 a 688 px): se fue la tira de
  miniaturas y el botón ancho. Las fotos sacadas se abren tocando el recuadro de la galería (✕ quita
  una, «Galería» suma) y «Leer direcciones» toma el lugar de «Pegar» cuando hay fotos.

### El barrido dentro del recuadro (solo pantalla; dueño, 2026-11-15)
- «Lo de Foto llevado a Nóminas físicas»: la nómina se barre en el mismo recuadro de «Cargar la
  guía», con el mismo pie, en vez de la capa a pantalla completa. **Sin tocar la lógica** (condición
  del dueño): los hooks, `lib/` y `android/` quedan igual; cambian solo `camara-barrido.tsx`,
  `visor-guia.tsx`, `pie-guia.tsx`, `cargar-guia.tsx` y la Ayuda.
- El botón redondo empieza; mientras barre es «Terminar» (un cuadrado), las categorías quedan
  apagadas, no hay galería y a la derecha va «Descartar». Dentro del recuadro: «Falta confirmar»
  arriba, el resumen (estado, conteos, última OF) abajo y la linterna en la esquina; los verdes los
  sigue dibujando Android. Las preguntas («¿Descartar lo barrido?», «N a medias…») van en el pie.
- `FaltanBarrido`, `ResumenBarrido` y `LinternaBarrido` (camara-barrido.tsx) se usan aquí y en
  `CamaraBarrido`, que queda solo para Diagnóstico → «Probar barrido de nómina».
- El traspaso de la cámara es el de antes (se apaga la de Foto y prende la del barrido): ~1 s de
  recuadro en negro al empezar y al terminar.
- La ventana lleva siempre `capa-camara`: una vez, probando, quedó oculta con las clases de la cámara
  puestas y ninguna cámara activa (no se pudo repetir en 6 ciclos); así no puede desaparecer.

### Diagnóstico → «Probar barrido de nómina»
Cifras sin datos («Copiar anonimizado»): cuadros por segundo, piezas leídas, lo que habría dado la
lectura de antes sobre los mismos cuadros («Solo encargos enteros»), ruido y malas lecturas botadas,
y por encargo: estado, cuadros, lecturas y qué tan parecido es al más cercano.

## Datos y sistema
- **Postgres:** sin cambios.
- **IndexedDB:** sin store ni versión nueva (v7). `BorradorGuia` suma el campo opcional
  `barrido?: { porFilas, comoLlegan, entregadas }` (`VotosNomina` × 2 y OF → si se entregó firme;
  `VotosNomina` suma `arriba` y `delUltimo`, opcionales: quién va arriba de quién en la hoja).
  Son OF y direcciones, sin nombres: el cuadro crudo y los números sueltos no se guardan. El store
  está en `STORES_DEL_DIA`.
- **Flujo:** cámara → `EscanerVivoPlugin` (ML Kit, en el teléfono) → `alCuadro`
  (`use-barrido-nomina`) → votos → recuadros (`EscanerVivo.marcar` → `MarcasEscaner.java`) y, una
  vez por segundo, la vista (`camara-barrido.tsx`) → borrador (`borradoresGuia`) → «Terminar» →
  líneas de «Cargar la guía». Nada sale del teléfono.

## Medido en el V2430 (2026-11-15, nómina real de 15 OF, cifras anónimas de Diagnóstico)
- **Con las reglas de arriba: 15 confirmadas, 0 por confirmar, 0 a medias** en 73 s (257 cuadros, 224
  encargos enteros leídos, 3 malas lecturas botadas). El dueño: «ahora sí está bien hecho».
- La otra forma de juntar los renglones («como llegan») dio 14 y 1 sin dirección: elegir por encargos
  enteros tomó la buena.
- Con piezas, sobre los mismos cuadros: también 15 y 0, pero con más dígitos mal (33 lecturas
  corregidas contra 23, 8 % de dígitos con poca confianza contra 5 %). Siguen apagadas.
- Antes de las reglas (mismo día, 724 cuadros): 16 confirmadas, 3 por confirmar y 6 a medias.

## Medido: una OF con dos «8» que no confirmaba (V2430, 2026-11-15, cifras de una sola OF)
- En los votos guardados: el número bien 21 veces y 38 con el 2.º o el 5.º dígito como «6» o «0». Con la
  regla de 2 de cada 3, el 2.º dígito llegó a 47 % y el 5.º a 60 %: quedó «leyendo…» hasta repasarla.
- Con una sonda (solo cifras): su fila mide 32 px de alto y el número 163 px de ancho (~18 px por
  dígito); 17 lecturas exactas de 30. Confianza de ML Kit en el 2.º dígito: 0,66 cuando lee «8» (bien)
  y 0,54 cuando lee «6» (mal); con el umbral de 0,5 casi todas votan igual.
- Los cuadros sí llegan tras el cambio de la cámara de Foto a la del barrido (1080×1920, 4 a 9 por
  segundo): la sospecha del dueño quedó descartada.
- Sin hacer (toca la lectura; se propone antes): pesar cada voto por su confianza, o agrandar la letra
  (acercar la imagen).

## Falta
- [ ] **Cuadros por segundo: 3,5 (278 ms por cuadro)**, contra ~8 (123 ms) medidos en la 029. Sacar el
  resultado del hilo de la pantalla no lo recuperó. Sin causa todavía: medir con la APK firmada (la de
  prueba va con el depurador), con exposición `corta` (los dos barridos fueron con `auto`) y mirar la
  temperatura del teléfono.
- [ ] **Cámara en vivo del paso 1:** vista en el V2430 (2026-11-15): el recuadro muestra la cámara, el
  botón redondo saca la foto (1817×1895, la proporción del recuadro) y el recuadro no cambia de tamaño;
  con 2 fotos, sin trabas de 1–5 s ni ANR (el 1 % más lento, 0,75 s). Falta: comparar la foto con lo que
  se veía (teléfono quieto), volver del barrido, la Ayuda y 6 fotos seguidas (`dumpsys gfxinfo`).
- [ ] **Barrido dentro del recuadro:** visto en el V2430 por botones (empezar, descartar, volver a Foto,
  terminar; 6 ciclos sin trabarse). Falta barrer la nómina real con el teléfono derecho y ver el resumen,
  los verdes dentro del recuadro y el resultado (15 de 15), y la traba que apareció una vez.
- [ ] Probar el guardado: bloquear a mitad del barrido, `force-stop`, borrar una línea y seguir.
- [ ] Otra nómina, con OF de números seguidos de verdad: que no se junten (`revisarParecidas`).
- [ ] APK nueva (tag) y `APK_VERSION_MINIMA` (dueño). Sin ella el barrido sigue leyendo códigos de
  barras y con exposición automática; lo demás llega con el deploy.
- Solo si no alcanza: seguir el orden de los encargos entre cuadros y realzar la imagen por software.
